import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { View, Text, ActivityIndicator } from 'react-native';
import { useState, useEffect, useRef } from 'react';
import { HAService } from '../services/ha';
import RoomDetailView from '../components/DashboardV2/RoomDetailView';
import { getRoomEntities } from '../utils/roomHelpers';
import { StatusBar } from 'expo-status-bar';

export default function RoomPage() {
    const params = useLocalSearchParams();
    const router = useRouter();
    const { area_id, name, picture } = params;

    // We need to re-fetch state here or pass it?
    // Passing large state via params is bad. Better to re-subscribe or use a global store.
    // Given the architecture, we'll re-connect HAService briefly or ideally context.
    // For now, let's spin up a service instance to ensure live data.

    // NOTE: In a real app, use Context or Redux/Zustand. 
    // Here we duplicate the HAService logic for isolation as requested by "new page".

    const [entities, setEntities] = useState([]);
    const [registryDevices, setRegistryDevices] = useState([]);
    const [registryEntities, setRegistryEntities] = useState([]);
    const [lightMappings, setLightMappings] = useState([]);
    const [loading, setLoading] = useState(true);

    const service = useRef(null);
    const [connectionConfig, setConnectionConfig] = useState({
        url: '',
        token: '',
        loaded: false
    });

    useEffect(() => {
        loadConnectionConfig();
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
                        adminUrl: activeProfile.adminUrl || process.env.EXPO_PUBLIC_ADMIN_URL,
                        loaded: true
                    });
                    return;
                }
            }

            setConnectionConfig({
                url: '',
                token: '',
                adminUrl: process.env.EXPO_PUBLIC_ADMIN_URL,
                loaded: true
            });
        } catch (e) {
            console.log('Error loading connection config:', e);
            setConnectionConfig(prev => ({ ...prev, loaded: true }));
        }
    };

    useEffect(() => {
        if (!connectionConfig.loaded) return;
        const { url, token } = connectionConfig;
        if (!url || !token) return;

        service.current = new HAService(url, token);
        service.current.connect();

        service.current.subscribe(data => {
            if (data.type === 'connected') {
                Promise.all([
                    service.current.getStates(),
                    service.current.getDeviceRegistry(),
                    service.current.getEntityRegistry()
                ]).then(([states, devices, regs]) => {
                    setEntities(states || []);
                    setRegistryDevices(devices || []);
                    setRegistryEntities(regs || []);
                    setLoading(false);
                });
            } else if (data.type === 'state_changed' && data.event) {
                const newEvent = data.event.data.new_state;
                setEntities(prev => {
                    const index = prev.findIndex(e => e.entity_id === newEvent.entity_id);
                    if (index !== -1) {
                        const newEntities = [...prev];
                        newEntities[index] = newEvent;
                        return newEntities;
                    }
                    return [...prev, newEvent];
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
    }, [connectionConfig.loaded]);

    // Fetch Light Mappings
    useEffect(() => {
        if (!connectionConfig.loaded || !connectionConfig.adminUrl) return;

        const adminUrl = connectionConfig.adminUrl;
        const lightsUrl = (adminUrl.endsWith('/') ? `${adminUrl}api/monitored-entities?type=light` : `${adminUrl}/api/monitored-entities?type=light`);

        fetch(lightsUrl)
            .then(res => res.json())
            .then(data => {
                if (Array.isArray(data)) {
                    setLightMappings(data);
                }
            })
            .catch(e => console.log("[RoomPage] Error loading light mappings:", e));
    }, [connectionConfig.loaded, connectionConfig.adminUrl]);

    const handleToggle = (domain, serviceName, data) => {
        service.current?.callService(domain, serviceName, data);
    };

    if (loading) {
        return (
            <View style={{ flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' }}>
                <ActivityIndicator size="large" color="#8947ca" />
            </View>
        );
    }

    const room = { area_id, name, picture };
    const { lights, fans, climates, covers, medias, cameras, sensors, doors } = getRoomEntities(room, registryDevices, registryEntities, entities);

    return (
        <View style={{ flex: 1, backgroundColor: '#000' }}>
            <Stack.Screen options={{ headerShown: false }} />
            <StatusBar style="light" />
            <RoomDetailView
                room={room}
                lights={lights}
                fans={fans}
                covers={covers}
                climates={climates}
                medias={medias}
                cameras={cameras}
                sensors={sensors}
                doors={doors}
                allEntities={entities}
                onToggle={handleToggle}
                onClose={() => router.back()}
                isModal={false}
                lightMappings={lightMappings}
                adminUrl={connectionConfig.adminUrl}
            />
        </View>
    );
}
