import { useRef, useState, useEffect } from 'react';
import { HAService } from '../services/ha';
import { FrigateService } from '../services/frigate';
import { authFetch } from '../utils/authFetch';
import { fetchEnrichedLightMappings } from '../utils/lightMappingsClient';
import { applyHaStateChangedEvent, applyClimateServiceToEntity } from '../utils/haEntityMerge';
import { HA_STATUS, ADMIN_STATUS } from '../utils/haEntityHealth';
import { useHaSystemHealth } from './useHaSystemHealth';
import * as SecureStore from 'expo-secure-store';

/**
 * Reusable hook that manages the full HA WebSocket lifecycle:
 *   loadProfile → connect → subscribe → fetch registries → cleanup
 *
 * Returns everything a dashboard page needs to render HA data.
 */
export default function useHAConnection() {
    // Connection config
    const [connectionConfig, setConnectionConfig] = useState({
        url: '',
        token: '',
        adminUrl: '',
        loaded: false,
    });

    const service = useRef(null);
    const frigateService = useRef(null);

    // Core HA state
    const [entities, setEntities] = useState([]);
    const [cityName, setCityName] = useState('Home');
    const [loading, setLoading] = useState(true);

    // Registries
    const [registryDevices, setRegistryDevices] = useState([]);
    const [registryEntities, setRegistryEntities] = useState([]);
    const [registryAreas, setRegistryAreas] = useState([]);
    const [registryFloors, setRegistryFloors] = useState([]);

    // Admin config
    const [badgeConfig, setBadgeConfig] = useState(null);
    const [lightMappings, setLightMappings] = useState([]);
    const [mediaMappings, setMediaMappings] = useState([]);
    const [alertRules, setAlertRules] = useState([]);

    // Frigate
    const [frigateCameras, setFrigateCameras] = useState([]);

    const [haStatus, setHaStatus] = useState(HA_STATUS.LOADING);
    const [adminStatus, setAdminStatus] = useState(ADMIN_STATUS.UNKNOWN);

    // Abort controller for fetch requests
    const mappingsAbortRef = useRef(null);

    // ─── Load Profile from SecureStore ───────────────────────────
    useEffect(() => {
        loadConnectionConfig();
    }, []);

    const loadConnectionConfig = async () => {
        try {
            const activeProfileId = await SecureStore.getItemAsync('ha_active_profile_id');
            const profilesJson = await SecureStore.getItemAsync('ha_profiles');

            if (activeProfileId && profilesJson) {
                const profiles = JSON.parse(profilesJson);
                const activeProfile = profiles.find(p => p.id === activeProfileId);

                if (activeProfile) {
                    setConnectionConfig({
                        url: activeProfile.haUrl,
                        token: activeProfile.haToken,
                        adminUrl: activeProfile.adminUrl,
                        loaded: true,
                    });
                    return;
                }
            }

            setConnectionConfig(prev => ({ ...prev, loaded: true }));
            setHaStatus(HA_STATUS.NOT_CONFIGURED);
        } catch (e) {
            console.log('[useHAConnection] Error loading config:', e);
            setConnectionConfig(prev => ({ ...prev, loaded: true }));
            setHaStatus(HA_STATUS.NOT_CONFIGURED);
        }
    };

    // ─── Fetch admin mappings ────────────────────────────────────
    const fetchMappings = () => {
        if (!connectionConfig.loaded || !connectionConfig.adminUrl) return;

        if (mappingsAbortRef.current) mappingsAbortRef.current.abort();
        const controller = new AbortController();
        mappingsAbortRef.current = controller;

        const adminUrl = connectionConfig.adminUrl;
        const baseUrl = adminUrl.endsWith('/') ? adminUrl : `${adminUrl}/`;

        // Light mappings (+ icon type inference from entity_id)
        fetchEnrichedLightMappings(baseUrl, authFetch, { signal: controller.signal })
            .then(data => { if (Array.isArray(data)) setLightMappings(data); })
            .catch(e => { if (e.name !== 'AbortError') console.log('[useHAConnection] Light mappings error:', e); });

        // Media mappings
    authFetch(`${baseUrl}api/monitored-entities?type=media_player&t=${Date.now()}`, { signal: controller.signal })
            .then(res => res.json())
            .then(data => { if (Array.isArray(data)) setMediaMappings(data); })
            .catch(e => { if (e.name !== 'AbortError') console.log('[useHAConnection] Media mappings error:', e); });
    };

    useEffect(() => {
        fetchMappings();
    }, [connectionConfig.loaded, connectionConfig.adminUrl]);

    // ─── Connect to HA + Frigate ─────────────────────────────────
    useEffect(() => {
        if (!connectionConfig.loaded) return;

        const { url: haUrl, token: haToken, adminUrl } = connectionConfig;
        const configAbort = new AbortController();

        // Fetch admin config
        if (adminUrl) {
            const baseUrl = adminUrl.endsWith('/') ? adminUrl : `${adminUrl}/`;

            authFetch(`${baseUrl}api/config?t=${Date.now()}`, {
                method: 'GET',
                headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' },
                signal: configAbort.signal,
            }, haToken)
                .then(res => res.json())
                .then(data => {
                    console.log('[useHAConnection] Raw config from backend:', JSON.stringify(data, null, 2));
                    setBadgeConfig(data);
                    setAdminStatus(ADMIN_STATUS.OK);

                    // Use frigate_url from config to initialize FrigateService
                    const frigateUrl = data?.frigate_url;
                    console.log('[useHAConnection] Frigate base URL:', frigateUrl ?? 'NOT FOUND in config');
                    if (frigateUrl) {
                        frigateService.current = new FrigateService(frigateUrl, null, null, adminUrl, haToken);
                        frigateService.current.getConfig().then(config => {
                            if (config?.cameras) {
                                const cams = Object.keys(config.cameras).map(key => ({
                                    id: key,
                                    name: key,
                                    ...config.cameras[key],
                                }));
                                setFrigateCameras(cams);
                                console.log('[useHAConnection] Frigate cameras loaded:', cams.length);
                            }
                        });
                    }
                })
                .catch(err => {
                    if (err.name !== 'AbortError') {
                        console.log('[useHAConnection] Config error:', err);
                        setAdminStatus(ADMIN_STATUS.ERROR);
                    }
                });

            // Alert rules
            authFetch(`${baseUrl}api/alerts?t=${Date.now()}`, { signal: configAbort.signal }, haToken)
                .then(res => res.json())
                .then(data => { if (data.success) setAlertRules(data.rules); })
                .catch(e => { if (e.name !== 'AbortError') console.log('[useHAConnection] Alert rules error:', e); });
        }

        // Connect to Home Assistant WebSocket
        if (haUrl && haToken) {
            setHaStatus(HA_STATUS.LOADING);
            service.current = new HAService(haUrl, haToken);
            service.current.connect();
            service.current.subscribe(data => {
                if (data.type === 'connected') {
                    setHaStatus(HA_STATUS.CONNECTED);
                    service.current.getStates().then(states => {
                        setEntities(states || []);
                        setLoading(false);
                    }).catch(() => {
                        setHaStatus(HA_STATUS.DISCONNECTED);
                        setLoading(false);
                    });
                    service.current.getConfig().then(config => {
                        if (config?.location_name) setCityName(config.location_name);
                    });

                    // Fetch registries
                    service.current.getDeviceRegistry().then(d => setRegistryDevices(d || []));
                    service.current.getEntityRegistry().then(r => setRegistryEntities(r || []));
                    service.current.getAreaRegistry().then(a => setRegistryAreas(a || []));
                    service.current.getFloorRegistry().then(f => setRegistryFloors(f || []));
                } else if (data.type === 'auth_failed') {
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
        } else {
            setHaStatus(HA_STATUS.NOT_CONFIGURED);
            setLoading(false);
        }

        return () => {
            configAbort.abort();
            if (mappingsAbortRef.current) mappingsAbortRef.current.abort();
            if (service.current) {
                if (service.current.disconnect) {
                    service.current.disconnect();
                } else {
                    service.current.socket?.close();
                }
            }
        };
    }, [connectionConfig.loaded]);

    // ─── Convenience wrappers ────────────────────────────────────
    const systemHealth = useHaSystemHealth({ entities, haStatus, adminStatus });

    const callService = (domain, serviceName, serviceData) => {
        if (!systemHealth.canControlHa) {
            return Promise.reject(new Error('Home Assistant is not connected'));
        }
        if (service.current) {
            return service.current.callService(domain, serviceName, serviceData);
        }
        return Promise.reject(new Error('HA service not connected'));
    };

    const sendMessage = (msg) => {
        if (service.current) {
            return service.current.sendMessage(msg);
        }
        return Promise.reject(new Error('HA service not connected'));
    };

    return {
        // Service refs
        service: service.current,
        frigateService: frigateService.current,

        // Connection
        connectionConfig,
        haStatus,
        adminStatus,
        systemHealth,
        loading,
        cityName,

        // Entities
        entities,

        // Registries
        registryDevices,
        registryEntities,
        registryAreas,
        registryFloors,

        // Admin
        badgeConfig,
        lightMappings,
        mediaMappings,
        alertRules,

        // Frigate
        frigateCameras,

        // Actions
        callService,
        sendMessage,
        fetchMappings,
    };
}
