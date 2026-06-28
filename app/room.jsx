import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { View, Text, ActivityIndicator } from 'react-native';
import { useState, useEffect, useRef } from 'react';
import { HAService } from '../services/ha';
import RoomDetailView from '../components/DashboardV2/RoomDetailView';
import { peekRoomPageBootstrap } from '../utils/roomPageBootstrap';
import { useRoomAreaEntities } from '../hooks/useRoomAreaEntities';
import { applyHaStateChangedEvent, applyClimateServiceToEntity } from '../utils/haEntityMerge';
import { HA_STATUS, ADMIN_STATUS } from '../utils/haEntityHealth';
import { useHaSystemHealth } from '../hooks/useHaSystemHealth';
import { fetchEnrichedLightMappings } from '../utils/lightMappingsClient';
import { StatusBar } from 'expo-status-bar';

/** Expo Router may pass repeated query keys as string[]. Normalize for area matching. */
const paramString = (v) => {
    if (v == null) return '';
    return Array.isArray(v) ? (v[0] ?? '') : String(v);
};

export default function RoomPage() {
    const params = useLocalSearchParams();
    const router = useRouter();
    const area_id = paramString(params.area_id);
    const name = paramString(params.name);
    const picture = paramString(params.picture);

    // Dashboard (rooms tab) stashes live HA data in roomPageBootstrap before navigating here
    // so we match the modal path: show the room immediately, then keep HAService in sync.
    const [initialPayload] = useState(() => peekRoomPageBootstrap(area_id, name));

    const [entities, setEntities] = useState(() => initialPayload?.entities ?? []);
    const [musicAssistantEntryIds, setMusicAssistantEntryIds] = useState(
        () => initialPayload?.musicAssistantEntryIds ?? []
    );
    const [badgeConfig, setBadgeConfig] = useState(() => initialPayload?.badgeConfig ?? null);
    const [registryAreas, setRegistryAreas] = useState(() => initialPayload?.registryAreas ?? []);
    const [registryDevices, setRegistryDevices] = useState(() => initialPayload?.registryDevices ?? []);
    const [registryEntities, setRegistryEntities] = useState(() => initialPayload?.registryEntities ?? []);
    const [lightMappings, setLightMappings] = useState(() => initialPayload?.lightMappings ?? []);
    const [sensorMappings] = useState(() => initialPayload?.sensorMappings ?? []);
    const [coverMappings] = useState(() => initialPayload?.coverMappings ?? []);
    const [coverWindows] = useState(() => initialPayload?.coverWindows ?? []);
    const [mediaMappings] = useState(() => initialPayload?.mediaMappings ?? []);
    const [showPreferenceButton, setShowPreferenceButton] = useState(true);
    const [loading, setLoading] = useState(() => !initialPayload);
    const [haStatus, setHaStatus] = useState(
        () => (initialPayload ? HA_STATUS.CONNECTED : HA_STATUS.LOADING),
    );

    const service = useRef(null);
    const [connectionConfig, setConnectionConfig] = useState(() =>
        initialPayload
            ? {
                url: initialPayload.haUrl || '',
                token: initialPayload.haToken || '',
                adminUrl: initialPayload.adminUrl || '',
                loaded: true,
            }
            : { url: '', token: '', adminUrl: '', loaded: false }
    );

    useEffect(() => {
        loadConnectionConfig();
        SecureStore.getItemAsync('settings_show_preference_button').then(val => {
            if (val !== null) setShowPreferenceButton(val === 'true');
        });
    }, []);

    const loadConnectionConfig = async () => {
        try {
            // 1. Try active profile first
            const activeProfileId = await SecureStore.getItemAsync('ha_active_profile_id');
            const profilesJson = await SecureStore.getItemAsync('ha_profiles');

            if (activeProfileId && profilesJson) {
                const profiles = JSON.parse(profilesJson);
                const activeProfile = profiles.find(p => p.id === activeProfileId);
                if (activeProfile) {
                    setConnectionConfig({
                        url: activeProfile.haUrl,
                        token: activeProfile.haToken,
                        adminUrl: activeProfile.adminUrl || '',
                        loaded: true
                    });
                    return;
                }
            }

            setConnectionConfig(prev => ({
                url: prev.url || '',
                token: prev.token || '',
                adminUrl: prev.adminUrl || '',
                loaded: true,
            }));
        } catch (e) {
            console.log('Error loading connection config:', e);
            setConnectionConfig(prev => ({ ...prev, loaded: true }));
        }
    };

    useEffect(() => {
        if (!connectionConfig.loaded) return;
        const { url, token } = connectionConfig;

        if (!url || !token) {
            setHaStatus(HA_STATUS.NOT_CONFIGURED);
            setLoading(false);
            return;
        }

        setHaStatus(HA_STATUS.LOADING);
        service.current = new HAService(url, token);
        service.current.connect();

        service.current.subscribe(data => {
            if (data.type === 'connected') {
                setHaStatus(HA_STATUS.CONNECTED);
                Promise.all([
                    service.current.getStates(),
                    service.current.getAreaRegistry(),
                    service.current.getDeviceRegistry(),
                    service.current.getEntityRegistry(),
                    service.current.getConfigEntries().catch(() => []),
                ]).then(([states, areas, devices, regs, configEntries]) => {
                    setEntities(states || []);
                    setRegistryAreas(areas || []);
                    setRegistryDevices(devices || []);
                    setRegistryEntities(regs || []);
                    const maIds = (Array.isArray(configEntries) ? configEntries : [])
                        .filter(e => e?.domain === 'music_assistant' && e?.entry_id)
                        .map(e => e.entry_id);
                    setMusicAssistantEntryIds(maIds);
                    setLoading(false);
                }).catch((e) => {
                    console.log('[RoomPage] Failed to load states/registries:', e);
                    setHaStatus(HA_STATUS.DISCONNECTED);
                    setLoading(false);
                });
            } else if (data.type === 'auth_failed') {
                console.log('[RoomPage] HA auth failed:', data.message);
                setHaStatus(HA_STATUS.AUTH_FAILED);
                setLoading(false);
            } else if (data.type === 'disconnected') {
                setHaStatus(HA_STATUS.DISCONNECTED);
            } else if (data.type === 'state_changed' && data.event?.data) {
                const eventData = data.event.data;
                const newState = eventData.new_state;
                if (!newState) return;
                setEntities((prev) => {
                    const index = prev.findIndex((e) => e.entity_id === newState.entity_id);
                    if (index !== -1) {
                        const next = [...prev];
                        next[index] = applyHaStateChangedEvent(prev[index], eventData);
                        return next;
                    }
                    return [...prev, newState];
                });
            }
        });

        return () => {
            if (service.current) {
                if (service.current.disconnect) {
                    service.current.disconnect();
                } else {
                    service.current.socket?.close();
                }
            }
        };
    }, [connectionConfig.loaded, connectionConfig.url, connectionConfig.token]);

    useEffect(() => {
        if (!connectionConfig.loaded || !connectionConfig.adminUrl || badgeConfig) return;

        const adminUrl = connectionConfig.adminUrl;
        const configUrl = (adminUrl.endsWith('/') ? `${adminUrl}api/config` : `${adminUrl}/api/config`) + `?t=${Date.now()}`;

        fetch(configUrl, { headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' } })
            .then(res => res.json())
            .then(data => setBadgeConfig(data))
            .catch(e => console.log('[RoomPage] Error loading admin config:', e));
    }, [connectionConfig.loaded, connectionConfig.adminUrl, badgeConfig]);

    useEffect(() => {
        if (!connectionConfig.loaded || !connectionConfig.adminUrl) return;

        const adminUrl = connectionConfig.adminUrl;
        const baseUrl = adminUrl.endsWith('/') ? adminUrl : `${adminUrl}/`;

        fetchEnrichedLightMappings(baseUrl, fetch)
            .then(data => {
                if (Array.isArray(data)) {
                    setLightMappings(data);
                }
            })
            .catch(e => console.log('[RoomPage] Error loading light mappings:', e));
    }, [connectionConfig.loaded, connectionConfig.adminUrl]);

    const systemHealth = useHaSystemHealth({
        entities,
        haStatus,
        adminStatus: connectionConfig.adminUrl ? ADMIN_STATUS.OK : ADMIN_STATUS.UNKNOWN,
    });

    const handleToggle = (domain, serviceName, data) => {
        if (!systemHealth.canControlHa) {
            return Promise.reject(new Error('Home Assistant is not connected'));
        }
        if (domain === 'climate' && data?.entity_id) {
            setEntities((prev) =>
                prev.map((e) =>
                    e.entity_id === data.entity_id
                        ? applyClimateServiceToEntity(e, serviceName, data)
                        : e,
                ),
            );
        }
        return service.current?.callService(domain, serviceName, data);
    };

    const room = { area_id, name, picture };

    const {
        areaTabs,
        activeAreaKey,
        setActiveAreaKey,
        lights,
        fans,
        climates,
        covers,
        medias,
        musicMedias,
        cameras,
        sensors,
        doors,
        switches,
        automations,
        scripts,
    } = useRoomAreaEntities({
        room,
        registryAreas,
        registryDevices,
        registryEntities,
        allEntities: entities,
        sensorMappings,
        coverMappings,
        mediaMappings,
        musicAssistantEntryIds,
        badgeConfig,
    });

    if (loading) {
        return (
            <View style={{ flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' }}>
                <ActivityIndicator size="large" color="#8947ca" />
            </View>
        );
    }

    return (
        <View style={{ flex: 1, backgroundColor: '#000' }}>
            <Stack.Screen options={{ headerShown: false }} />
            <StatusBar style="light" />
            <RoomDetailView
                room={room}
                areaTabs={areaTabs}
                activeAreaKey={activeAreaKey}
                onSelectArea={setActiveAreaKey}
                lights={lights}
                fans={fans}
                covers={covers}
                climates={climates}
                medias={medias}
                musicMedias={musicMedias}
                cameras={cameras}
                sensors={sensors}
                doors={doors}
                switches={switches}
                automations={automations}
                scripts={scripts}
                allEntities={entities}
                onToggle={handleToggle}
                onClose={() => router.back()}
                isModal={false}
                lightMappings={lightMappings}
                mediaMappings={mediaMappings}
                adminUrl={connectionConfig.adminUrl}
                haUrl={connectionConfig.url}
                haToken={connectionConfig.token}
                showPreferenceButton={showPreferenceButton}
                coverWindows={coverWindows}
                musicAssistantEntryIds={musicAssistantEntryIds}
                browseMedia={(entityId, mediaContentType, mediaContentId) =>
                    service.current?.browseMedia?.(entityId, mediaContentType, mediaContentId)
                }
                callServiceWithResponse={(domain, serviceName, serviceData) =>
                    service.current?.callService?.(domain, serviceName, serviceData, { returnResponse: true })
                }
                systemHealthBanner={systemHealth.banner}
                canControlHa={systemHealth.canControlHa}
            />
        </View>
    );
}
