import { useRef, useState, useEffect, useMemo, useCallback } from 'react';
import FrigateCameraModal from '../components/DashboardV2/FrigateCameraModal';
import ButlerVoiceModal from '../components/DashboardV2/ButlerVoiceModal';
import { canOpenButlerCall, requestButlerMicPermission, runButlerBackgroundSetup } from '../services/butler/openButlerCall';
import { getButlerBackendUrl } from '../utils/butlerBackend';
import { fetchEnrichedLightMappings } from '../utils/lightMappingsClient';
import { CF } from '../utils/typography';

import { MaterialCommunityIcons } from '@expo/vector-icons';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, AppState, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import HeaderV2 from '../components/DashboardV2/HeaderV2';
import AccountSwitcherModal from '../components/DashboardV2/AccountSwitcherModal';
import StatusBadges from '../components/DashboardV2/StatusBadges';
import PersonBadges from '../components/DashboardV2/PersonBadges';
import DevicesToggleModal from '../components/DashboardV2/DevicesToggleModal';
import SettingsView from '../components/DashboardV2/SettingsView';
import { HAService } from '../services/ha';
import { applyHaStateChangedEvent, applyClimateServiceToEntity } from '../utils/haEntityMerge';
import { Stack, useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { ensureAccountsMigrated } from '../services/accounts';
import * as Haptics from 'expo-haptics';
import NetworkModal from '../components/DashboardV2/NetworkModal';
import QuickScenes from '../components/DashboardV2/QuickScenes';
import RoomsList from '../components/DashboardV2/RoomsList';
import HomeCameraStrip from '../components/DashboardV2/HomeCameraStrip';
import DraggableRoomList from '../components/DashboardV2/DraggableRoomList';
import CamerasList from '../components/DashboardV2/CamerasList';
import TabBar from '../components/DashboardV2/TabBar';
import TabletSidebar from '../components/DashboardV2/TabletSidebar';
import useDeviceType from '../hooks/useDeviceType';
import RoomSheet from '../components/DashboardV2/RoomSheet';
import SlideAction from '../components/DashboardV2/SlideAction';
import BrainView from '../components/DashboardV2/BrainView';
import VoiceConversation from '../components/VoiceConversation';
import { LockOpen } from 'lucide-react-native';

import { FrigateService } from '../services/frigate';
import * as SecureStore from 'expo-secure-store';
import { startHeartbeat, stopHeartbeat, updateAppState } from '../services/heartbeat';
import { getRoomEntities, getEntityIdsForAreaIds } from '../utils/roomHelpers';
import { isClimatePoweredOn } from '../utils/acPowerSwitch';
import { isCoverUiOpen } from '../utils/coverWindows';
import {
    collectGroupedLightMemberIds,
    isLightCountableUnit,
    countActiveCountableLights,
} from '../utils/lightCapabilities';
import {
    filterParentRoomsForDashboard,
    getRoomAreaGroup,
    getSelectedAreasForDashboard,
} from '../utils/roomAreas';
import { setRoomPageBootstrap } from '../utils/roomPageBootstrap';
import {
    loadDashboardSnapshot,
    saveDashboardSnapshot,
    applyDashboardSnapshot,
    bootValue,
    peekBootProfile,
    rememberBootProfile,
    startBackgroundBoot,
    toHaHttpUrl,
} from '../utils/dashboardCache';
import { loadHaProfiles, saveHaProfiles } from '../utils/storage';

export default function DashboardV2Tablet() {
    const router = useRouter();
    const { userName: userNameParam, userId: userIdParam } = useLocalSearchParams();
    const userName = Array.isArray(userNameParam) ? userNameParam[0] : userNameParam;
    const userId = Array.isArray(userIdParam) ? userIdParam[0] : userIdParam;
    const { isTablet, isLandscape, columns } = useDeviceType();
    const homeColumns = 4;
    const homeRoomColumns = 6;

    const bootProf = peekBootProfile();

    // Config State
    const [connectionConfig, setConnectionConfig] = useState(() => (
        bootProf
            ? { url: bootProf.url, token: bootProf.token, adminUrl: bootProf.adminUrl, loaded: true }
            : { url: '', token: '', adminUrl: '', loaded: false }
    ));
    const [showAccountSwitcher, setShowAccountSwitcher] = useState(false);

    const service = useRef(null);
    const frigateService = useRef(null); // Frigate Service Ref
    const profileIdRef = useRef(bootProf?.profileId || null);
    const haLiveRef = useRef(false);
    const saveTimerRef = useRef(null);

    const [entities, setEntities] = useState(() => bootValue('entities', []));
    const [cityName, setCityName] = useState(() => bootValue('cityName', 'Home'));
    const [badgeConfig, setBadgeConfig] = useState(() => bootValue('badgeConfig', null));
    const [currentFloor, setCurrentFloor] = useState(null);
    const [activeTab, setActiveTab] = useState('tablet');
    const [frigateCameras, setFrigateCameras] = useState(() => bootValue('frigateCameras', []));
    const [selectedFrigateCamera, setSelectedFrigateCamera] = useState(null);
    const [showFrigateModal, setShowFrigateModal] = useState(false);
    const [frigateInitialView, setFrigateInitialView] = useState('live'); // 'live' or 'history'
    const [showNetworkModal, setShowNetworkModal] = useState(false);
    const [roomTrackingLookup, setRoomTrackingLookup] = useState(() => bootValue('roomTrackingLookup', {}));

    // Settings State
    const [showFamily, setShowFamily] = useState(false);
    const [autoRoomVisit, setAutoRoomVisit] = useState(true);
    const [autoRoomResume, setAutoRoomResume] = useState(true);
    const [showVoiceAssistant, setShowVoiceAssistant] = useState(false);
    const [showButlerCall, setShowButlerCall] = useState(false);
    const [showPreferenceButton, setShowPreferenceButton] = useState(true);


    // Room Reordering State
    const [savedRoomOrder, setSavedRoomOrder] = useState([]);
    const [isReorderMode, setIsReorderMode] = useState(false);

    useEffect(() => {
        SecureStore.getItemAsync('settings_show_family').then(val => {
            if (val !== null) setShowFamily(val === 'true');
        });
        SecureStore.getItemAsync('settings_auto_room_visit').then(val => {
            if (val !== null) setAutoRoomVisit(val === 'true');
        });
        SecureStore.getItemAsync('settings_auto_room_resume').then(val => {
            if (val !== null) setAutoRoomResume(val === 'true');
        });
        SecureStore.getItemAsync('settings_show_voice_assistant').then(val => {
            if (val !== null) setShowVoiceAssistant(val === 'true');
        });
        SecureStore.getItemAsync('settings_show_preference_button').then(val => {
            if (val !== null) setShowPreferenceButton(val === 'true');
        });
        // Load Room Order
        SecureStore.getItemAsync('room_reorder_config').then(val => {
            if (val !== null) {
                try {
                    setSavedRoomOrder(JSON.parse(val));
                } catch (e) {
                    console.log('Error parsing room order:', e);
                }
            }
        });

        void startBackgroundBoot().then(() => loadConnectionConfig());
        void getButlerBackendUrl();
    }, []);

    const loadConnectionConfig = async () => {
        try {
            // 1. Try to load from Profiles first
            const [activeProfileId, profiles] = await Promise.all([
                SecureStore.getItemAsync('ha_active_profile_id'),
                loadHaProfiles(),
            ]);

            if (activeProfileId && profiles.length) {
                const activeProfile = profiles.find(p => p.id === activeProfileId);

                if (activeProfile) {
                    const normalizedHaUrl = activeProfile.haUrl?.replace(/^https?:\/\//i, (m) => m.toLowerCase()) || activeProfile.haUrl;
                    const normalizedAdminUrl = activeProfile.adminUrl?.replace(/^https?:\/\//i, (m) => m.toLowerCase()) || activeProfile.adminUrl;

                    console.log('[Dashboard] Loaded active profile:', activeProfile.name);
                    profileIdRef.current = activeProfileId;
                    rememberBootProfile({
                        profileId: activeProfileId,
                        url: normalizedHaUrl,
                        token: activeProfile.haToken,
                        adminUrl: normalizedAdminUrl,
                    });
                    const snapshot = await loadDashboardSnapshot(activeProfileId);
                    if (snapshot && !haLiveRef.current) {
                        applyDashboardSnapshot(snapshot, {
                            setEntities,
                            setCityName,
                            setRegistryDevices,
                            setRegistryEntities,
                            setRegistryAreas,
                            setRegistryFloors,
                            setBadgeConfig,
                            setAllowedQuickScenes,
                            setLightMappings,
                            setMediaMappings,
                            setSensorMappings,
                            setCoverMappings,
                            setCoverWindows,
                            setClimateMappings,
                            setFrigateCameras,
                            setRoomTrackingLookup,
                            setMusicAssistantEntryIds,
                            setAlertRules,
                            setCachedHomeRooms,
                        });
                    }
                    setConnectionConfig({
                        url: normalizedHaUrl,
                        token: activeProfile.haToken,
                        adminUrl: normalizedAdminUrl,
                        loaded: true
                    });
                    return;
                }
            }

            // If we get here, no valid profile found.
            console.log('[Dashboard] No active profile found. Staying disconnected.');
            setConnectionConfig(prev => ({ ...prev, loaded: true }));
        } catch (e) {
            console.log('Error loading connection config:', e);
            // Fallback
            setConnectionConfig(prev => ({ ...prev, loaded: true }));
        }
    };

    const handleFrigateCameraPress = (camera, mode = 'live') => {
        console.log('[Dashboard] Camera pressed:', camera?.name, 'Mode:', mode);
        setSelectedFrigateCamera(camera);
        setFrigateInitialView(mode);
        setShowFrigateModal(true);
    };

    const handleAccountSwitched = useCallback(async (account) => {
        const nextName = account?.name || '';
        const nextId = account?.userId || '';
        router.setParams({
            userName: nextName,
            userId: nextId,
            switchKey: String(Date.now()),
        });
        setActiveTab('tablet');
        setRoomSheetVisible(false);
        setSelectedRoom(null);
        if (account?.profileId && account.profileId !== profileIdRef.current) {
            haLiveRef.current = false;
            setConnectionConfig({ url: '', token: '', adminUrl: '', loaded: false });
            setTimeout(() => {
                loadConnectionConfig();
            }, 0);
        }
    }, [router]);

    const handleAddAccount = useCallback(() => {
        loadHaProfiles()
            .then((list) => { if (list.length) return saveHaProfiles(list); })
            .catch(() => {});
        router.push({ pathname: '/login', params: { mode: 'addAccount' } });
    }, [router]);

    useFocusEffect(
        useCallback(() => {
            let cancelled = false;
            (async () => {
                try {
                    await ensureAccountsMigrated();
                    const [userJson, activeProfileId] = await Promise.all([
                        SecureStore.getItemAsync('logged_in_user'),
                        SecureStore.getItemAsync('ha_active_profile_id'),
                    ]);
                    if (cancelled || !userJson) return;
                    const user = JSON.parse(userJson);
                    const nextName = user.name || '';
                    const nextId = user.userId || '';
                    if (nextName !== (userName || '') || nextId !== (userId || '')) {
                        router.setParams({
                            userName: nextName,
                            userId: nextId,
                            switchKey: String(Date.now()),
                        });
                    }
                    if (activeProfileId && activeProfileId !== profileIdRef.current) {
                        haLiveRef.current = false;
                        setConnectionConfig({ url: '', token: '', adminUrl: '', loaded: false });
                        setTimeout(() => {
                            loadConnectionConfig();
                        }, 0);
                    }
                } catch (e) {
                    console.log('[Dashboard] Account focus sync failed:', e);
                }
            })();
            return () => {
                cancelled = true;
            };
        }, [router, userName, userId]),
    );

    // Registry Data
    const [registryDevices, setRegistryDevices] = useState(() => bootValue('registryDevices', []));
    const [registryEntities, setRegistryEntities] = useState(() => bootValue('registryEntities', []));
    const [registryAreas, setRegistryAreas] = useState(() => bootValue('registryAreas', []));
    const [registryFloors, setRegistryFloors] = useState(() => bootValue('registryFloors', []));
    const [selectedFloor, setSelectedFloor] = useState(null);
    const [alertRules, setAlertRules] = useState(() => bootValue('alertRules', []));
    const [lightMappings, setLightMappings] = useState(() => bootValue('lightMappings', []));
    const [mediaMappings, setMediaMappings] = useState(() => bootValue('mediaMappings', []));
    const [allowedQuickScenes, setAllowedQuickScenes] = useState(() => bootValue('allowedQuickScenes', []));
    const [sensorMappings, setSensorMappings] = useState(() => bootValue('sensorMappings', []));
    const [coverMappings, setCoverMappings] = useState(() => bootValue('coverMappings', []));
    const [coverWindows, setCoverWindows] = useState(() => bootValue('coverWindows', []));
    const [climateMappings, setClimateMappings] = useState(() => bootValue('climateMappings', []));
    const [musicAssistantEntryIds, setMusicAssistantEntryIds] = useState(() => bootValue('musicAssistantEntryIds', []));
    const [cachedHomeRooms, setCachedHomeRooms] = useState(() => bootValue('rooms', []));

    const mappingsAbortRef = useRef(null);

    const fetchMappings = () => {
        if (!connectionConfig.loaded || !connectionConfig.adminUrl) return;

        // Abort any in-flight mapping requests
        if (mappingsAbortRef.current) mappingsAbortRef.current.abort();
        const controller = new AbortController();
        mappingsAbortRef.current = controller;

        const adminUrl = connectionConfig.adminUrl;
        const baseUrl = adminUrl.endsWith('/') ? adminUrl : `${adminUrl}/`;
        const haToken = connectionConfig.token;
        const authHeaders = haToken ? { Authorization: `Bearer ${haToken}` } : {};
        const fetchWithAuth = (url, opts) => fetch(url, {
            ...opts,
            headers: { ...authHeaders, ...(opts?.headers || {}) },
        });

        // 1. Quick Scenes (New)
        const qsUrl = `${baseUrl}api/quick-scenes?t=${Date.now()}`;
        console.log('[Dashboard] Fetching Quick Scenes...');
        fetch(qsUrl, { signal: controller.signal })
            .then(res => res.json())
            .then(data => {
                if (Array.isArray(data)) {
                    console.log('[Quick Scenes] Loaded:', data.length);
                    setAllowedQuickScenes(data.map(s => s.entity_id));
                }
            })
            .catch(e => { if (e.name !== 'AbortError') console.log("[Quick Scenes] Error:", e); });

        // 2. Lights (+ icon type inference from entity_id)
        console.log('[Dashboard] Fetching light mappings...');
        fetchEnrichedLightMappings(baseUrl, fetchWithAuth, { signal: controller.signal })
            .then(data => {
                if (Array.isArray(data)) {
                    console.log('[Light Mappings] Loaded:', data.length);
                    setLightMappings(data);
                }
            })
            .catch(e => { if (e.name !== 'AbortError') console.log("[Light Mappings] Error:", e); });

        // 3. Media
        const mediaUrl = `${baseUrl}api/monitored-entities?type=media_player&t=${Date.now()}`;
        console.log('[Dashboard] Fetching media mappings...');
        fetch(mediaUrl, { signal: controller.signal })
            .then(res => res.json())
            .then(data => {
                if (Array.isArray(data)) {
                    console.log('[Media Mappings] Loaded:', data.length);
                    setMediaMappings(data);
                }
            })
            .catch(e => { if (e.name !== 'AbortError') console.log("[Media Mappings] Error:", e); });

        // 4. Sensors
        const sensorUrl = `${baseUrl}api/sensors?t=${Date.now()}`;
        console.log('[Dashboard] Fetching sensor mappings...');
        fetch(sensorUrl, { signal: controller.signal })
            .then(res => res.json())
            .then(data => {
                if (data.success && Array.isArray(data.sensors)) {
                    console.log(`[Sensor Mappings] Loaded: ${data.sensors.length}`);
                    setSensorMappings(data.sensors);
                }
            })
            .catch(e => { if (e.name !== 'AbortError') console.log("Sensor Mappings Error", e); });

        // 5. Covers
        const coverUrl = `${baseUrl}api/covers?t=${Date.now()}`;
        console.log('[Dashboard] Fetching cover mappings...');
        fetch(coverUrl, { signal: controller.signal, headers: authHeaders })
            .then(res => res.json())
            .then(data => {
                if (data.success && Array.isArray(data.covers)) {
                    console.log(`[Cover Mappings] Loaded: ${data.covers.length}`);
                    setCoverMappings(data.covers);
                    setCoverWindows(data.windows || []);
                }
            })
            .catch(e => { if (e.name !== 'AbortError') console.log("Cover Mappings Error", e); });

        // 6. Climate damper mappings
        const climateUrl = `${baseUrl}api/climate-mappings?t=${Date.now()}`;
        fetch(climateUrl, { signal: controller.signal, headers: authHeaders })
            .then(res => res.json())
            .then(data => {
                if (data.success && Array.isArray(data.climates)) {
                    const withDamper = data.climates.filter(c => c.damperEntityId);
                    console.log(`[Climate Mappings] Loaded: ${data.climates.length} (${withDamper.length} with damper)`, withDamper);
                    setClimateMappings(data.climates);
                }
            })
            .catch(e => { if (e.name !== 'AbortError') console.log('Climate Mappings Error', e); });
    };

    // ... (rest of useEffects)

    const quickScenesData = useMemo(() => {
        if (!allowedQuickScenes || allowedQuickScenes.length === 0) return [];

        return allowedQuickScenes
            .slice(0, 4)
            .map(id => entities.find(e => e.entity_id === id))
            .filter(e => e) // Filter out undefined if entity not found in HA
            .map(e => ({
                id: e.entity_id,
                label: e.attributes?.friendly_name || e.entity_id,
            }));
    }, [entities, allowedQuickScenes]);

    useEffect(() => {
        fetchMappings();
    }, [connectionConfig.loaded, connectionConfig.adminUrl]);

    // DEBUG: Alert Debugging
    useEffect(() => {
        if (entities.length > 0) {
            const doors = entities.filter(e => e.entity_id.startsWith('sensor.door_'));
            if (doors.length > 0) {
                const debugStr = doors.map(d => `${d.entity_id}: ${d.state}`).join('\n');
                // Alert.alert('Door Debug', debugStr); // Uncomment to see debug
                console.log('Door Debug:\n' + debugStr);
            }
        }
    }, [entities]);

    // Initial Load Logic
    useEffect(() => {
        if (!connectionConfig.loaded) return;

        const { url: haUrl, token: haToken, adminUrl } = connectionConfig;

        // ... (Admin Config Fetch remains) ...
        console.log('DEBUG: Fetching Admin Config from:', adminUrl);

        const configAbort = new AbortController();

        if (adminUrl) {
            // Append /api/config if not present (assuming env var is base URL)
            const configUrl = (adminUrl.endsWith('/') ? `${adminUrl}api/config` : `${adminUrl}/api/config`) + `?t=${Date.now()}`;
            fetch(configUrl, { method: 'GET', headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' }, signal: configAbort.signal })
                .then(res => res.json())
                .then(data => {
                    console.log('DEBUG: Fetched Admin Config Keys:', Object.keys(data));
                    setBadgeConfig(data);
                })
                .catch(err => { if (err.name !== 'AbortError') console.log('DEBUG: Error loading admin config:', err); });

            // Fetch Alert Rules
            const alertUrl = (adminUrl.endsWith('/') ? `${adminUrl}api/alerts` : `${adminUrl}/api/alerts`) + `?t=${Date.now()}`;
            fetch(alertUrl, { signal: configAbort.signal })
                .then(res => res.json())
                .then(data => {
                    if (data.success) setAlertRules(data.rules);
                })
                .catch(e => { if (e.name !== 'AbortError') console.log("Alert Rules Error", e); });

            // Fetch Room Tracking Lookup
            const roomTrackingUrl = (adminUrl.endsWith('/') ? `${adminUrl}api/room-tracking/lookup` : `${adminUrl}/api/room-tracking/lookup`);
            fetch(roomTrackingUrl, { signal: configAbort.signal })
                .then(res => res.json())
                .then(data => {
                    if (data.success) {
                        console.log('[Room Tracking] Loaded lookup map:', data.lookup);
                        setRoomTrackingLookup(data.lookup);
                    }
                })
                .catch(e => { if (e.name !== 'AbortError') console.log("[Room Tracking] Error loading lookup:", e); });

            // Fetch Sensor Mappings
            const sensorUrl = (adminUrl.endsWith('/') ? `${adminUrl}api/sensors` : `${adminUrl}/api/sensors`);
            fetch(sensorUrl, { signal: configAbort.signal })
                .then(res => res.json())
                .then(data => {
                    if (data.success) {
                        console.log(`[Sensors] Loaded ${data.sensors.length} mappings`);
                        setSensorMappings(data.sensors);
                    }
                })
                .catch(e => { if (e.name !== 'AbortError') console.log("Sensor Mappings Error", e); });

            // Fetch Cover Mappings
            const coverUrl = (adminUrl.endsWith('/') ? `${adminUrl}api/covers` : `${adminUrl}/api/covers`);
            fetch(coverUrl, { signal: configAbort.signal })
                .then(res => res.json())
                .then(data => {
                    if (data.success) {
                        console.log(`[Covers] Loaded ${data.covers.length} mappings`);
                        setCoverMappings(data.covers);
                        setCoverWindows(data.windows || []);
                    }
                })
                .catch(e => { if (e.name !== 'AbortError') console.log("Cover Mappings Error", e); });

            // Fetch Climate damper mappings
            const climateUrl = (adminUrl.endsWith('/') ? `${adminUrl}api/climate-mappings` : `${adminUrl}/api/climate-mappings`);
            fetch(climateUrl, { signal: configAbort.signal })
                .then(res => res.json())
                .then(data => {
                    if (data.success && Array.isArray(data.climates)) {
                        setClimateMappings(data.climates);
                    }
                })
                .catch(e => { if (e.name !== 'AbortError') console.log('Climate Mappings Error', e); });

        }

        // 2. Connect to Home Assistant
        if (haUrl && haToken) {
            service.current = new HAService(haUrl, haToken);
            service.current.connect();
            service.current.subscribe(data => {
                if (data.type === 'connected') {
                    service.current.getStates().then(states => {
                        haLiveRef.current = true;
                        setEntities(states || []);
                    });
                    service.current.getConfig().then(config => {
                        if (config && config.location_name) {
                            setCityName(config.location_name);
                        }
                    });

                    // Fetch Registries
                    service.current.getDeviceRegistry().then(devices => {
                        setRegistryDevices(devices || []);
                    });
                    service.current.getEntityRegistry().then(regs => {
                        setRegistryEntities(regs || []);
                    });
                    service.current.getAreaRegistry().then(areas => {
                        if (areas && areas.length > 0) {
                            console.log('DEBUG: First Area:', JSON.stringify(areas[0]));
                        }
                        setRegistryAreas(areas || []);
                    });
                    service.current.getFloorRegistry().then(floors => {
                        setRegistryFloors(floors || []);
                        if (floors && floors.length > 0) {
                            // Sort floors by level (optional) or just use default order
                            const sorted = floors.sort((a, b) => (a.level || 0) - (b.level || 0));
                            setSelectedFloor(sorted[0].floor_id);
                        }
                    });
                    service.current.getConfigEntries().catch(() => []).then(configEntries => {
                        const maIds = (Array.isArray(configEntries) ? configEntries : [])
                            .filter(e => e?.domain === 'music_assistant' && e?.entry_id)
                            .map(e => e.entry_id);
                        setMusicAssistantEntryIds(maIds);
                    });

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
        }

        // 3. Connect to Frigate (proxied through admin backend)
        frigateService.current = new FrigateService('', null, null, connectionConfig.adminUrl);

        frigateService.current.getConfig().then(config => {
            if (config && config.cameras) {
                const cams = Object.keys(config.cameras).map(key => ({
                    id: key,
                    name: key,
                    ...config.cameras[key]
                }));
                setFrigateCameras(cams);
                console.log('DEBUG: Frigate Cameras Loaded:', cams.length);
            }
        });

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

    const weather = entities.find(e => e.entity_id.startsWith('weather.'));

    const [devicesToggleVisible, setDevicesToggleVisible] = useState(false);
    const [devicesToggleKind, setDevicesToggleKind] = useState('lights');

    // Room Sheet State
    const [roomSheetVisible, setRoomSheetVisible] = useState(false);
    const [selectedRoom, setSelectedRoom] = useState(null);

    const dashboardParentAreaIds = useMemo(() => {
        const selected = getSelectedAreasForDashboard(registryAreas, badgeConfig);
        const parents = filterParentRoomsForDashboard(selected, registryAreas, badgeConfig);
        return new Set(parents.map((p) => p.area_id).filter(Boolean));
    }, [registryAreas, badgeConfig]);

    const dashboardEntityIds = useMemo(
        () => getEntityIdsForAreaIds(dashboardParentAreaIds, registryDevices, registryEntities),
        [dashboardParentAreaIds, registryDevices, registryEntities],
    );

    const handleBadgePress = (type) => {
        if (type === 'lights' || type === 'ac') {
            setDevicesToggleKind(type);
            setDevicesToggleVisible(true);
        }
    };

    // Default floor selection
    useEffect(() => {
        if (!currentFloor) {
            setCurrentFloor('home');
        }
    }, []);

    // -------------------------------------------------------------------------
    // Auto-Room Presentation (User Tracker -> Espresense Match)
    // -------------------------------------------------------------------------
    const lastActiveRoomRef = useRef(null);
    const lastTrackerStateRef = useRef(null);
    const appState = useRef(AppState.currentState);

    // Refactored check logic for re-use
    // isResume: Boolean, true if triggered by App Resume
    const checkPresence = (isResume = false) => {
        // console.log('[Auto-Room] checkPresence called. isResume:', isResume, 'userName:', userName, 'roomsCount:', roomsWithCounts.length);

        if (!roomsWithCounts.length || !userName) {
            // console.log('[Auto-Room] Early exit - no rooms or userName');
            return;
        }

        // Check Settings
        const shouldRun = isResume ? autoRoomResume : autoRoomVisit;
        // console.log('[Auto-Room] Setting check:', isResume ? 'autoRoomResume' : 'autoRoomVisit', '=', shouldRun);
        if (!shouldRun) {
            return;
        }

        // 1. Find User's Tracked Device Sensor
        const safeUserName = userName.toLowerCase().replace(/ /g, '_');

        // First try to find sensor with "room" in the name
        let tracker = entities.find(e =>
            e.entity_id.includes(safeUserName) &&
            e.entity_id.includes('room') &&
            !e.entity_id.includes('geocoded')
        );

        // Fallback to any location sensor (but not geocoded)
        if (!tracker) {
            tracker = entities.find(e =>
                e.entity_id.includes(safeUserName) &&
                e.entity_id.includes('location') &&
                !e.entity_id.includes('geocoded')
            );
        }

        if (!tracker || !tracker.state) {
            return;
        }

        const currentState = tracker.state.toLowerCase();

        // Optimization: Prevent infinite loops if state hasn't changed
        if (!isResume && lastTrackerStateRef.current === currentState) {
            return;
        }
        lastTrackerStateRef.current = currentState;

        console.log('[Auto-Room] New Tracker State:', currentState);

        // Ignore generic states
        if (['home', 'not_home', 'unknown', 'unavailable', 'away', 'none'].includes(currentState)) {
            if (lastActiveRoomRef.current) {
                lastActiveRoomRef.current = null;
            }
            return;
        }

        // 2. Find Room using Lookup Map from Backend
        console.log('[Auto-Room] Using lookup map for state:', currentState);

        // Direct lookup from database mapping
        const mappedAreaId = roomTrackingLookup[currentState];
        console.log('[Auto-Room] Mapped area_id:', mappedAreaId);

        let foundRoom = null;
        if (mappedAreaId) {
            foundRoom = roomsWithCounts.find(r => r.area_id === mappedAreaId);
            console.log('[Auto-Room] ✓ Found room via lookup:', foundRoom?.name);
        } else {
            console.log('[Auto-Room] ✗ No mapping found for state:', currentState);
        }

        if (foundRoom) {
            // Trigger if room changed OR if we just forced a check (e.g. app resume) and want to show it
            if (lastActiveRoomRef.current !== foundRoom.area_id) {
                // Don't open if sheet is already visible and animating
                if (roomSheetVisible && !isResume) {
                    console.log('[Auto-Room] Sheet already visible, skipping');
                } else {
                    console.log(`[Auto-Room] ✅ Opening room sheet: ${foundRoom.name}. Resume: ${isResume}`);
                    lastActiveRoomRef.current = foundRoom.area_id;

                    setSelectedRoom(foundRoom);
                    setRoomSheetVisible(true);
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                }
            } else {
                console.log('[Auto-Room] Already in this room, not re-opening');
            }
        } else {
            console.log('[Auto-Room] ❌ No room found for state:', currentState);
            console.log('[Auto-Room] Available lookup states:', Object.keys(roomTrackingLookup).join(', '));
            if (lastActiveRoomRef.current !== null) {
                lastActiveRoomRef.current = null;
            }
        }
    };

    // Run check on Entity Change
    useEffect(() => {
        checkPresence(false);
    }, [entities, roomsWithCounts, userName, autoRoomVisit]); // Check whenever relevant data updates

    // Run check on App Resume
    const snapshotRef = useRef(null);
    snapshotRef.current = {
        entities,
        cityName,
        registryDevices,
        registryEntities,
        registryAreas,
        registryFloors,
        badgeConfig,
        allowedQuickScenes,
        lightMappings,
        mediaMappings,
        sensorMappings,
        coverMappings,
        coverWindows,
        climateMappings,
        frigateCameras,
        roomTrackingLookup,
        musicAssistantEntryIds,
        alertRules,
    };

    useEffect(() => {
        if (!haLiveRef.current || !profileIdRef.current) return undefined;
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        saveTimerRef.current = setTimeout(() => {
            saveDashboardSnapshot(profileIdRef.current, snapshotRef.current);
        }, 2500);
        return () => {
            if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        };
    }, [
        entities,
        cityName,
        registryDevices,
        registryEntities,
        registryAreas,
        registryFloors,
        badgeConfig,
        allowedQuickScenes,
        lightMappings,
        mediaMappings,
        sensorMappings,
        coverMappings,
        coverWindows,
        climateMappings,
        frigateCameras,
        roomTrackingLookup,
        musicAssistantEntryIds,
        alertRules,
    ]);

    useEffect(() => {
        const subscription = AppState.addEventListener('change', nextAppState => {
            if (nextAppState.match(/inactive|background/)) {
                if (haLiveRef.current) {
                    saveDashboardSnapshot(profileIdRef.current, snapshotRef.current);
                }
            }
            if (
                appState.current.match(/inactive|background/) &&
                nextAppState === 'active'
            ) {
                if (autoRoomResume) {
                    console.log('[Dashboard] App Resumed: Re-checking Presence...');
                    // Reset ref to force re-open if user is still in the same room
                    lastActiveRoomRef.current = null;
                    checkPresence(true);
                }

                // Always refresh config on resume
                fetchMappings();
            }
            appState.current = nextAppState;

            // Update heartbeat app state
            updateAppState(nextAppState === 'active' ? 'foreground' : 'background');
        });

        return () => {
            subscription.remove();
        };
    }, [entities, roomsWithCounts, userName, autoRoomResume]);

    // Heartbeat for user session tracking
    useEffect(() => {
        if (connectionConfig.loaded && connectionConfig.adminUrl && userId) {
            startHeartbeat(connectionConfig.adminUrl, userId, userName);
        }
        return () => stopHeartbeat();
    }, [connectionConfig.loaded, connectionConfig.adminUrl, userId, userName]);

    const callService = (domain, serviceName, serviceData) => {
        if (service.current) {
            const entityId = serviceData?.entity_id;
            if (domain === 'climate' && entityId) {
                setEntities((prev) =>
                    prev.map((e) =>
                        e.entity_id === entityId
                            ? applyClimateServiceToEntity(e, serviceName, serviceData)
                            : e,
                    ),
                );
            }
            return service.current.callService(domain, serviceName, serviceData)
                .then(result => {
                    console.log('[callService] OK', domain, serviceName, serviceData, result ?? null);
                    return result;
                })
                .catch(err => {
                console.warn('[callService] Failed:', domain, serviceName, err?.message ?? err);
                return Promise.reject(err);
            });
        }
        return Promise.reject(new Error('Home Assistant service not connected'));
    };

    const handleScenePress = (sceneId) => {
        console.log('Scene pressed:', sceneId);
        const domain = sceneId.split('.')[0];
        callService(domain, 'turn_on', { entity_id: sceneId });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    };



    const handleVoiceCommand = async (command) => {
        console.log('[Dashboard] Voice command:', command);
        if (command.action === 'call_service') {
            await callService(command.domain, command.service, command.service_data);
        }
    };

    const handleRoomPress = (room) => {
        if (activeTab === 'rooms') {
            setRoomPageBootstrap(room.area_id, room.name, {
                picture: room.picture,
                badgeConfig,
                entities,
                registryAreas,
                registryDevices,
                registryEntities,
                musicAssistantEntryIds,
                lightMappings,
                sensorMappings,
                coverMappings,
                coverWindows,
                mediaMappings,
                climateMappings,
                haUrl: connectionConfig.url,
                haToken: connectionConfig.token,
                adminUrl: connectionConfig.adminUrl,
            });
            router.push({
                pathname: '/room',
                params: {
                    area_id: room.area_id,
                    name: room.name,
                    picture: room.picture
                }
            });
        } else {
            setSelectedRoom(room);
            setRoomSheetVisible(true);
        }
    };

    const handleTabPress = (tabId) => {
        if (tabId === 'home') {
            router.push('/dashboard-v2');
        } else if (tabId === 'butler') {
            setActiveTab('ai');
        } else {
            setActiveTab(tabId);
        }
    };

    const getRoomsWithCounts = () => {
        const sourceAreas = getSelectedAreasForDashboard(registryAreas, badgeConfig);

        if (!sourceAreas || sourceAreas.length === 0) return [];

        // Helper: Resolve the best display name for an area
        // HA area registry confirmed returns proper friendly names (e.g. "Master Bedroom" for area_id "bedroom")
        const resolveDisplayName = (areaId, currentName) => {
            // 1. Check HA registry for the canonical friendly name
            const regArea = registryAreas.find(ra => ra.area_id === areaId);
            if (regArea?.name) return regArea.name;
            // 2. Check config selected_areas for a user-defined friendly name
            const configArea = badgeConfig?.selected_areas?.find(sa => sa.area_id === areaId);
            if (configArea?.name) return configArea.name;
            // 3. If currentName exists and differs from area_id, use it
            if (currentName && currentName !== areaId) return currentName;
            // 4. Last resort: format the area_id (replace underscores, title case)
            return (areaId || '')
                .replace(/_/g, ' ')
                .replace(/\b\w/g, c => c.toUpperCase());
        };

        const computeRoomStats = (area) => {
            const resolvedArea = {
                ...area,
                name: resolveDisplayName(area.area_id, area.name),
            };

            const areaDevices = registryDevices.filter(d => d.area_id === area.area_id);
            const areaDeviceIds = areaDevices.map(d => d.id);
            const areaRegEntries = registryEntities.filter(re => {
                const directMatch = re.area_id === area.area_id;
                const deviceMatch = re.device_id && areaDeviceIds.includes(re.device_id);
                return directMatch || deviceMatch;
            });

            const roomEntities = getRoomEntities(
                resolvedArea,
                registryDevices,
                registryEntities,
                entities,
                sensorMappings,
                coverMappings,
                mediaMappings,
                musicAssistantEntryIds,
            );

            const activeLights = countActiveCountableLights(roomEntities.lights);

            const activeAC = roomEntities.climates.filter(isClimatePoweredOn).length;

            const activeCovers = roomEntities.covers.filter(c => isCoverUiOpen(c)).length;

            const activeDoors = roomEntities.doors.filter(d => {
                const s = d.stateObj?.state?.toLowerCase();
                if (!s) return false;
                return s === 'open' || s === 'on' || s === 'true' || s === '1';
            }).length;

            const hasPresenceSensor = areaRegEntries.some(re =>
                re.entity_id.startsWith('binary_sensor.espresense_')
            );

            return {
                ...resolvedArea,
                deviceCount: areaRegEntries.length,
                activeLights,
                activeAC,
                activeCovers,
                activeDoors,
                hasPresenceSensor,
                _entities: roomEntities,
            };
        };

        const computedRooms = sourceAreas.map(computeRoomStats);

        const parentRooms = filterParentRoomsForDashboard(computedRooms, registryAreas, badgeConfig).map((room) => {
            const group = getRoomAreaGroup(room, registryAreas, badgeConfig, computedRooms);
            if (group.length <= 1) return room;

            const merged = {
                deviceCount: 0,
                activeLights: 0,
                activeAC: 0,
                activeCovers: 0,
                activeDoors: 0,
                hasPresenceSensor: false,
            };

            for (const area of group) {
                const stats = area.area_id === room.area_id
                    ? room
                    : computeRoomStats(area);
                merged.deviceCount += stats.deviceCount || 0;
                // Lights badge = parent area only (sub-rooms like Toilet keep their own tab counts).
                if (area.area_id === room.area_id) {
                    merged.activeLights += stats.activeLights || 0;
                }
                merged.activeAC += stats.activeAC || 0;
                merged.activeCovers += stats.activeCovers || 0;
                merged.activeDoors += stats.activeDoors || 0;
                if (stats.hasPresenceSensor) merged.hasPresenceSensor = true;
            }

            return { ...room, ...merged };
        });

        if (savedRoomOrder && savedRoomOrder.length > 0) {
            return parentRooms.sort((a, b) => {
                const indexA = savedRoomOrder.indexOf(a.area_id);
                const indexB = savedRoomOrder.indexOf(b.area_id);

                const valA = indexA === -1 ? 9999 : indexA;
                const valB = indexB === -1 ? 9999 : indexB;

                return valA - valB;
            });
        }

        return parentRooms;
    };

    const liveRoomsWithCounts = useMemo(() => getRoomsWithCounts(), [
        badgeConfig,
        registryAreas,
        registryDevices,
        registryEntities,
        entities,
        sensorMappings,
        coverMappings,
        mediaMappings,
        musicAssistantEntryIds,
        savedRoomOrder,
    ]);
    const roomsWithCounts = liveRoomsWithCounts.length > 0 ? liveRoomsWithCounts : cachedHomeRooms;
    if (snapshotRef.current) snapshotRef.current.rooms = roomsWithCounts;

    const roomLightsForModal = useMemo(() => {
        const byId = new Map();
        for (const room of roomsWithCounts) {
            const lights = room._entities?.lights || [];
            const roomGroupedMemberIds = collectGroupedLightMemberIds(lights);
            for (const l of lights) {
                if (!isLightCountableUnit(l, roomGroupedMemberIds)) continue;
                if (byId.has(l.entity_id)) continue;
                const stateObj = l.stateObj || entities.find((e) => e.entity_id === l.entity_id);
                if (!stateObj || stateObj.state === 'unavailable') continue;
                byId.set(l.entity_id, {
                    entity_id: l.entity_id,
                    state: stateObj.state,
                    attributes: {
                        ...(stateObj.attributes || {}),
                        friendly_name: l.displayName
                            || stateObj.attributes?.friendly_name
                            || l.entity_id,
                    },
                    area_id: room.area_id,
                });
            }
        }
        return [...byId.values()];
    }, [roomsWithCounts, entities]);

    const lightsOn = useMemo(
        () => roomsWithCounts.reduce((sum, r) => sum + (r.activeLights || 0), 0),
        [roomsWithCounts],
    );
    const acOn = useMemo(
        () => roomsWithCounts.reduce((sum, r) => sum + (r.activeAC || 0), 0),
        [roomsWithCounts],
    );

    const butlerVoiceContext = useMemo(() => ({
        userName,
        time: new Date().toLocaleTimeString(),
        rooms: roomsWithCounts.map(room => ({
            name: room.name,
            area_id: room.area_id,
        })),
    }), [userName, roomsWithCounts]);

    const handleVoiceAssistantPress = useCallback(async () => {
        const gate = canOpenButlerCall();
        if (!gate.ok) {
            Alert.alert('Voice not available', gate.error ?? 'Butler voice is not supported.');
            return;
        }
        const micOk = await requestButlerMicPermission();
        if (!micOk) {
            Alert.alert('Microphone needed', 'Allow microphone access to talk to Butler.');
            return;
        }
        setShowButlerCall(true);
        runButlerBackgroundSetup({
            haUrl: connectionConfig.url,
            haToken: connectionConfig.token,
        });
    }, [connectionConfig.url, connectionConfig.token]);

    const handleButlerCallClose = useCallback(() => {
        setShowButlerCall(false);
    }, []);

    const handleButlerSwitchToChat = useCallback(() => {
        setShowButlerCall(false);
        setActiveTab('ai');
    }, []);

    const handleRoomReorder = (data) => {
        // IDs of the rooms in their new order
        const reorderedIds = data.map(r => r.area_id);

        // Update Saved Order
        setSavedRoomOrder(prev => {
            // Start with the existing full order or use the current list if none exists
            const currentFullOrder = prev && prev.length > 0 ? [...prev] : registryAreas.map(a => a.area_id);

            // Build a set of IDs from the reordered group for quick lookup
            const reorderedSet = new Set(reorderedIds);

            // Find the active indices in the full list that correspond to the items being reordered
            // We only care about the relative position of the items that were actually visible/draggable
            const indicesToUpdate = [];
            currentFullOrder.forEach((id, index) => {
                if (reorderedSet.has(id)) {
                    indicesToUpdate.push(index);
                }
            });

            // If mismatch (e.g. first time save), just use the reordered IDs + rest
            if (indicesToUpdate.length !== reorderedIds.length) {
                const others = currentFullOrder.filter(id => !reorderedSet.has(id));
                const newOrder = [...reorderedIds, ...others];
                SecureStore.setItemAsync('room_reorder_config', JSON.stringify(newOrder));
                return newOrder;
            }

            // Place the new order into the found slots
            const newOrder = [...currentFullOrder];
            indicesToUpdate.forEach((originalIndex, i) => {
                newOrder[originalIndex] = reorderedIds[i]; // reorderedIds is already in the new visual order
            });

            SecureStore.setItemAsync('room_reorder_config', JSON.stringify(newOrder));
            return newOrder;
        });
    };

    // Sidebar is 80px wide — add a gutter so content isn't flush against it
    const sidebarPadding = isLandscape ? { paddingLeft: 108 } : {};

    const renderContent = () => {
        if (activeTab === 'home' || activeTab === 'tablet') {
            return (
                <ScrollView contentContainerStyle={[styles.content, isLandscape && sidebarPadding]}>
                    <HeaderV2
                        weather={weather}
                        cityName={cityName}
                        userName={userName}
                        onUserPress={() => setShowAccountSwitcher(true)}
                    />
                    <StatusBadges
                        lightsOn={lightsOn}
                        acOn={acOn}
                        onPress={handleBadgePress}
                    />
                    <View style={styles.divider} />

                    {/* Person Status */}
                    {showFamily && <PersonBadges entities={entities} alertRules={alertRules} haUrl={connectionConfig.url} />}

                    <QuickScenes
                        scenes={quickScenesData}
                        onScenePress={handleScenePress}
                        columns={homeColumns}
                    />

                    {/* Voice Conversation */}
                    {showVoiceAssistant && <VoiceConversation
                        onCommand={handleVoiceCommand}
                        context={{
                            userName: userName,
                            time: new Date().toLocaleTimeString(),
                            rooms: roomsWithCounts.map(room => ({
                                name: room.name,
                                area_id: room.area_id,
                                lights: registryEntities
                                    .filter(re => {
                                        const areaDevices = registryDevices.filter(d => d.area_id === room.area_id);
                                        const areaDeviceIds = areaDevices.map(d => d.id);
                                        return (re.area_id === room.area_id || (re.device_id && areaDeviceIds.includes(re.device_id)))
                                            && re.entity_id.startsWith('light.');
                                    })
                                    .map(re => {
                                        const entity = entities.find(e => e.entity_id === re.entity_id);
                                        return {
                                            entity_id: re.entity_id,
                                            friendly_name: entity?.attributes?.friendly_name || re.entity_id,
                                            state: entity?.state || 'unknown'
                                        };
                                    }),
                                climate: registryEntities
                                    .filter(re => {
                                        const areaDevices = registryDevices.filter(d => d.area_id === room.area_id);
                                        const areaDeviceIds = areaDevices.map(d => d.id);
                                        return (re.area_id === room.area_id || (re.device_id && areaDeviceIds.includes(re.device_id)))
                                            && re.entity_id.startsWith('climate.');
                                    })
                                    .map(re => {
                                        const entity = entities.find(e => e.entity_id === re.entity_id);
                                        return {
                                            entity_id: re.entity_id,
                                            friendly_name: entity?.attributes?.friendly_name || re.entity_id,
                                            state: entity?.state || 'unknown',
                                            temperature: entity?.attributes?.current_temperature,
                                            target_temp: entity?.attributes?.temperature
                                        };
                                    }),
                                covers: registryEntities
                                    .filter(re => {
                                        const areaDevices = registryDevices.filter(d => d.area_id === room.area_id);
                                        const areaDeviceIds = areaDevices.map(d => d.id);
                                        return (re.area_id === room.area_id || (re.device_id && areaDeviceIds.includes(re.device_id)))
                                            && re.entity_id.startsWith('cover.');
                                    })
                                    .map(re => {
                                        const entity = entities.find(e => e.entity_id === re.entity_id);
                                        return {
                                            entity_id: re.entity_id,
                                            friendly_name: entity?.attributes?.friendly_name || re.entity_id,
                                            state: entity?.state || 'unknown',
                                            current_position: entity?.attributes?.current_position
                                        };
                                    }),
                                media: registryEntities
                                    .filter(re => {
                                        const areaDevices = registryDevices.filter(d => d.area_id === room.area_id);
                                        const areaDeviceIds = areaDevices.map(d => d.id);
                                        return (re.area_id === room.area_id || (re.device_id && areaDeviceIds.includes(re.device_id)))
                                            && re.entity_id.startsWith('media_player.');
                                    })
                                    .map(re => {
                                        const entity = entities.find(e => e.entity_id === re.entity_id);
                                        return {
                                            entity_id: re.entity_id,
                                            friendly_name: entity?.attributes?.friendly_name || re.entity_id,
                                            state: entity?.state || 'unknown'
                                        };
                                    }),
                                switches: registryEntities
                                    .filter(re => {
                                        const areaDevices = registryDevices.filter(d => d.area_id === room.area_id);
                                        const areaDeviceIds = areaDevices.map(d => d.id);
                                        return (re.area_id === room.area_id || (re.device_id && areaDeviceIds.includes(re.device_id)))
                                            && re.entity_id.startsWith('switch.');
                                    })
                                    .map(re => {
                                        const entity = entities.find(e => e.entity_id === re.entity_id);
                                        return {
                                            entity_id: re.entity_id,
                                            friendly_name: entity?.attributes?.friendly_name || re.entity_id,
                                            state: entity?.state || 'unknown'
                                        };
                                    }),
                                sensors: registryEntities
                                    .filter(re => {
                                        const areaDevices = registryDevices.filter(d => d.area_id === room.area_id);
                                        const areaDeviceIds = areaDevices.map(d => d.id);
                                        return (re.area_id === room.area_id || (re.device_id && areaDeviceIds.includes(re.device_id)))
                                            && re.entity_id.startsWith('sensor.')
                                            && !re.entity_id.includes('signal_strength')
                                            && !re.entity_id.includes('battery');
                                    })
                                    .map(re => {
                                        const entity = entities.find(e => e.entity_id === re.entity_id);
                                        return {
                                            entity_id: re.entity_id,
                                            friendly_name: entity?.attributes?.friendly_name || re.entity_id,
                                            state: entity?.state || 'unknown',
                                            unit: entity?.attributes?.unit_of_measurement
                                        };
                                    }),
                                binary_sensors: registryEntities
                                    .filter(re => {
                                        const areaDevices = registryDevices.filter(d => d.area_id === room.area_id);
                                        const areaDeviceIds = areaDevices.map(d => d.id);
                                        return (re.area_id === room.area_id || (re.device_id && areaDeviceIds.includes(re.device_id)))
                                            && re.entity_id.startsWith('binary_sensor.');
                                    })
                                    .map(re => {
                                        const entity = entities.find(e => e.entity_id === re.entity_id);
                                        return {
                                            entity_id: re.entity_id,
                                            friendly_name: entity?.attributes?.friendly_name || re.entity_id,
                                            state: entity?.state || 'unknown',
                                            device_class: entity?.attributes?.device_class
                                        };
                                    })
                            }))
                        }}
                    />}



                    {/* Dynamic Lock Sliders */}
                    {entities.filter(e => {
                        if (!e.entity_id.startsWith('lock.')) return false;
                        const reg = registryEntities.find(re => re.entity_id === e.entity_id);
                        if (!reg) return false;

                        // Only show locks that belong to rooms we are actually displaying
                        const activeRoomIds = roomsWithCounts.map(r => r.area_id);

                        let areaId = reg.area_id;
                        if (!areaId && reg.device_id) {
                            const dev = registryDevices.find(d => d.id === reg.device_id);
                            areaId = dev?.area_id;
                        }

                        return areaId && activeRoomIds.includes(areaId);
                    }).length > 0 && (
                            <View style={styles.sliderRow}>
                                {entities
                                    .filter(e => {
                                        if (!e.entity_id.startsWith('lock.')) return false;
                                        const reg = registryEntities.find(re => re.entity_id === e.entity_id);
                                        if (!reg) return false;

                                        const activeRoomIds = roomsWithCounts.map(r => r.area_id);

                                        let areaId = reg.area_id;
                                        if (!areaId && reg.device_id) {
                                            const dev = registryDevices.find(d => d.id === reg.device_id);
                                            areaId = dev?.area_id;
                                        }

                                        return areaId && activeRoomIds.includes(areaId);
                                    })
                                    .map(lock => {
                                        const isUnlocked = lock.state === 'unlocked' || lock.state === 'open';
                                        const name = lock.attributes.friendly_name || lock.entity_id;

                                        return (
                                            <View key={lock.entity_id} style={styles.sliderContainer}>
                                                {isUnlocked ? (
                                                    <TouchableOpacity
                                                        style={[styles.statusCard, { backgroundColor: '#FF7043' }]}
                                                        onPress={() => {
                                                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                                                            callService('lock', 'lock', { entity_id: lock.entity_id });
                                                        }}
                                                    >
                                                        <LockOpen size={24} color="#fff" />
                                                        <Text style={styles.statusText}>Unlocked</Text>
                                                    </TouchableOpacity>
                                                ) : (
                                                    <SlideAction
                                                        label={`Unlock ${name}`}
                                                        icon={LockOpen}
                                                        color="#8947ca"
                                                        onSlide={() => callService('lock', 'unlock', { entity_id: lock.entity_id })}
                                                    />
                                                )}
                                            </View>
                                        );
                                    })}
                            </View>
                        )}

                    <RoomsList
                        rooms={roomsWithCounts}
                        registryEntities={registryEntities}
                        allEntities={entities}
                        onRoomPress={handleRoomPress}
                        layout="tablet-home"
                        columns={homeRoomColumns}
                        tabletPreviewCount={6}
                        haUrl={toHaHttpUrl(connectionConfig.url) || connectionConfig.url}
                        haToken={connectionConfig.token}
                        sensorMappings={sensorMappings}
                    />

                    <HomeCameraStrip
                        frigateCameras={frigateCameras}
                        selectedCameraNames={badgeConfig?.selected_cameras || []}
                        frigateService={frigateService.current}
                        onCameraPress={handleFrigateCameraPress}
                        onAllCamerasPress={() => setActiveTab('cctv')}
                        adminUrl={connectionConfig.adminUrl}
                        onCamerasUpdated={(ids) => setBadgeConfig(prev => ({ ...prev, selected_cameras: ids }))}
                        cameraSensors={badgeConfig?.camera_sensors || {}}
                        haEntities={entities}
                        columns={2}
                    />
                </ScrollView>
            );
        }

        if (activeTab === 'rooms') {
            const availableFloors = registryFloors.sort((a, b) => (a.level || 0) - (b.level || 0));

            // Filter rooms by matching area's floor_id to the selected floor's floor_id
            const filteredRooms = roomsWithCounts.filter(room => {
                const area = registryAreas.find(a => a.area_id === room.area_id);
                if (availableFloors.length === 0) return true;
                if (!selectedFloor) return true;

                const areaFloorId = area ? (area.floor_id || area.floor) : null;
                return areaFloorId === selectedFloor;
            });

            const roomsContent = (
                <>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                        <Text style={styles.sectionTitle}>Rooms</Text>
                        <TouchableOpacity onPress={() => setIsReorderMode(!isReorderMode)}>
                            <Text style={{ color: '#8947ca', fontWeight: 'bold', fontSize: 16 }}>
                                {isReorderMode ? 'Done' : 'Edit'}
                            </Text>
                        </TouchableOpacity>
                    </View>

                    {isReorderMode ? (
                        <View style={{ flex: 1, height: '100%' }}>
                            <DraggableRoomList
                                rooms={filteredRooms}
                                registryEntities={registryEntities}
                                allEntities={entities}
                                onOrderChange={handleRoomReorder}
                            />
                        </View>
                    ) : (
                        <>
                            {availableFloors.length > 0 && (
                                <View style={{ flexDirection: 'row', marginBottom: 20, gap: 10 }}>
                                    {availableFloors.map(floor => (
                                        <TouchableOpacity
                                            key={floor.floor_id}
                                            onPress={() => setSelectedFloor(floor.floor_id)}
                                            style={{
                                                paddingVertical: 8,
                                                paddingHorizontal: 16,
                                                backgroundColor: selectedFloor === floor.floor_id ? '#8947ca' : 'rgba(255,255,255,0.1)',
                                                borderRadius: 20
                                            }}
                                        >
                                            <Text style={{
                                                color: selectedFloor === floor.floor_id ? 'white' : 'rgba(255,255,255,0.6)',
                                                fontWeight: '600'
                                            }}>
                                                {floor.name ? floor.name.toUpperCase() : floor.floor_id.toUpperCase()}
                                            </Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            )}

                            <RoomsList
                                rooms={filteredRooms}
                                registryEntities={registryEntities}
                                allEntities={entities}
                                onRoomPress={handleRoomPress}
                                layout="grid"
                                columns={columns}
                                haUrl={connectionConfig.url}
                                haToken={connectionConfig.token}
                                sensorMappings={sensorMappings}
                            />
                        </>
                    )}
                </>
            );

            return (
                <View style={[styles.content, { paddingHorizontal: 20, marginTop: 60, paddingBottom: 100, flex: 1 }, isLandscape && sidebarPadding]}>
                    {roomsContent}
                </View>
            );
        }

        if (activeTab === 'cctv') {
            return (
                <ScrollView contentContainerStyle={[styles.content, isLandscape && sidebarPadding]}>
                    <View style={{ marginTop: 60 }}>
                        <Text style={styles.sectionTitle}>Surveillance</Text>
                        {frigateCameras.length === 0 ? (
                            <>
                                <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 16, marginTop: 8 }}>
                                    No cameras yet
                                </Text>
                                <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, marginTop: 6, lineHeight: 18 }}>
                                    Cameras are optional. Add Frigate or Home Assistant cameras when you have them.
                                </Text>
                            </>
                        ) : (
                            <CamerasList
                                frigateCameras={frigateCameras}
                                service={frigateService.current}
                                onCameraPress={handleFrigateCameraPress}
                                columns={columns}
                            />
                        )}
                    </View>
                </ScrollView>
            );
        }

        if (activeTab === 'ai') {
            return (
                <View style={[{ flex: 1 }, isLandscape && sidebarPadding]}>
                    <BrainView
                        entities={entities}
                        callService={callService}
                        registryDevices={registryDevices}
                        registryEntities={registryEntities}
                        registryAreas={registryAreas}
                        onExit={() => setActiveTab('home')}
                        onStartVoiceCall={handleVoiceAssistantPress}
                        haUrl={connectionConfig.url}
                        haToken={connectionConfig.token}
                    />
                </View>
            );
        }

        if (activeTab === 'settings') {
            return (
                <View style={[{ flex: 1 }, isLandscape && sidebarPadding]}>
                    <SettingsView
                        areas={getSelectedAreasForDashboard(registryAreas, badgeConfig)}
                        registryAreas={registryAreas}
                        entities={entities}
                        registryDevices={registryDevices}
                        registryEntities={registryEntities}
                        showFamily={showFamily}
                        autoRoomVisit={autoRoomVisit}
                        autoRoomResume={autoRoomResume}
                        showVoiceAssistant={showVoiceAssistant}
                        showPreferenceButton={showPreferenceButton}
                        adminUrl={connectionConfig.adminUrl}
                        userName={userName}
                        onSettingChange={(key, val) => {
                            if (key === 'showFamily') setShowFamily(val);
                            if (key === 'autoRoomVisit') setAutoRoomVisit(val);
                            if (key === 'autoRoomResume') setAutoRoomResume(val);
                            if (key === 'showVoiceAssistant') setShowVoiceAssistant(val);
                            if (key === 'showPreferenceButton') setShowPreferenceButton(val);
                        }}
                        onNetwork={() => setShowNetworkModal(true)}
                    />
                </View>
            );
        }

        return null;
    };

    return (
        <View style={styles.container}>
            <Stack.Screen options={{ headerShown: false }} />
            <LinearGradient
                colors={['#1a1b2e', '#16161e', '#000000']}
                style={styles.background}
            />
            <StatusBar style="light" />

            <AccountSwitcherModal
                visible={showAccountSwitcher}
                onClose={() => setShowAccountSwitcher(false)}
                onSwitched={handleAccountSwitched}
                onAddAccount={handleAddAccount}
            />

            {devicesToggleVisible && (
                <DevicesToggleModal
                    visible={devicesToggleVisible}
                    kind={devicesToggleKind}
                    devices={
                        devicesToggleKind === 'lights'
                            ? roomLightsForModal
                            : entities.filter(
                                (e) => e.entity_id.startsWith('climate.') && dashboardEntityIds.has(e.entity_id),
                            )
                    }
                    rooms={roomsWithCounts}
                    registryAreas={registryAreas}
                    registryDevices={registryDevices}
                    registryEntities={registryEntities}
                    onClose={() => setDevicesToggleVisible(false)}
                    onToggle={callService}
                />
            )}

            {showFrigateModal && (
                <FrigateCameraModal
                    visible={showFrigateModal}
                    camera={selectedFrigateCamera}
                    service={frigateService.current}
                    initialView={frigateInitialView}
                    onClose={() => setShowFrigateModal(false)}
                />
            )}

            {showNetworkModal && (
                <NetworkModal
                    visible={showNetworkModal}
                    onClose={() => setShowNetworkModal(false)}
                    config={badgeConfig}
                    entities={entities}
                    onToggle={callService}
                />
            )}

            {showButlerCall ? (
                <ButlerVoiceModal
                    visible={showButlerCall}
                    onClose={handleButlerCallClose}
                    onSwitchToChat={handleButlerSwitchToChat}
                    context={butlerVoiceContext}
                />
            ) : null}

            {renderContent()}

            {isLandscape ? (
                <TabletSidebar activeTab={activeTab} onTabPress={handleTabPress} />
            ) : (
                activeTab !== 'ai' && (
                    <View style={{ ...StyleSheet.absoluteFillObject, zIndex: 10000, elevation: 10000 }} pointerEvents="box-none">
                        <TabBar
                            activeTab={activeTab}
                            onTabPress={handleTabPress}
                            butlerActive={showButlerCall}
                        />
                    </View>
                )
            )}

            {roomSheetVisible && selectedRoom && (
                <RoomSheet
                    visible={roomSheetVisible}
                    onClose={() => {
                        setRoomSheetVisible(false);
                        setSelectedRoom(null);
                    }}
                    room={selectedRoom}
                    registryAreas={registryAreas}
                    registryDevices={registryDevices}
                    registryEntities={registryEntities}
                    allEntities={entities}
                    onToggle={callService}
                    lightMappings={lightMappings}
                    mediaMappings={mediaMappings}
                    adminUrl={connectionConfig.adminUrl}
                    haUrl={connectionConfig.url}
                    haToken={connectionConfig.token}
                    showPreferenceButton={showPreferenceButton}
                    sensorMappings={sensorMappings}
                    coverMappings={coverMappings}
                    coverWindows={coverWindows}
                    climateMappings={climateMappings}
                    musicAssistantEntryIds={musicAssistantEntryIds}
                    browseMedia={(entityId, mediaContentType, mediaContentId) =>
                        service.current?.browseMedia?.(entityId, mediaContentType, mediaContentId)
                    }
                    callServiceWithResponse={(domain, serviceName, serviceData) =>
                        service.current?.callService?.(domain, serviceName, serviceData, { returnResponse: true })
                    }
                    badgeConfig={badgeConfig}
                />
            )}
        </View >
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    background: {
        position: 'absolute',
        left: 0,
        right: 0,
        top: 0,
        height: '100%',
    },
    content: {
        paddingTop: 10,
        paddingHorizontal: 20,
        paddingBottom: 120, // Space for TabBar
    },
    divider: {
        height: 1,
        backgroundColor: 'rgba(255,255,255,0.1)',
        marginHorizontal: 20,
        marginBottom: 15,
        marginTop: 5
    },
    sectionTitle: {
        color: 'white',
        fontSize: 24,
        fontFamily: CF.bold,
        marginBottom: 20,
    },
    centerContent: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    sliderRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        marginBottom: 20,
        gap: 12
    },
    sliderContainer: {
        width: '48%',
        flexGrow: 1
    },
    statusCard: {
        height: 56,
        borderRadius: 28,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        shadowColor: "#000",
        shadowOffset: {
            width: 0,
            height: 2,
        },
        shadowOpacity: 0.25,
        shadowRadius: 3.84,
        elevation: 5,
    },
    statusText: {
        color: '#fff',
        fontFamily: CF.bold,
        fontSize: 16
    }
});
