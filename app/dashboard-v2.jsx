import { useRef, useState, useEffect, useMemo } from 'react';
import FrigateCameraModal from '../components/DashboardV2/FrigateCameraModal';
import SecurityControlModal from '../components/DashboardV2/SecurityControlModal';

import { MaterialCommunityIcons } from '@expo/vector-icons';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, AppState } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import HeaderV2 from '../components/DashboardV2/HeaderV2';
import StatusBadges from '../components/DashboardV2/StatusBadges';
import PersonBadges from '../components/DashboardV2/PersonBadges';
import ActiveDevicesModal from '../components/DashboardV2/ActiveDevicesModal';
import SettingsView from '../components/DashboardV2/SettingsView';
import { HAService } from '../services/ha';
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import NetworkModal from '../components/DashboardV2/NetworkModal';
import QuickScenes from '../components/DashboardV2/QuickScenes';
import YouTubeLauncherModal from '../components/DashboardV2/YouTubeLauncherModal';
import AppleTVRemoteModal from '../components/DashboardV2/AppleTVRemoteModal';
import RoomsList from '../components/DashboardV2/RoomsList';
import DraggableRoomList from '../components/DashboardV2/DraggableRoomList';
import CamerasList from '../components/DashboardV2/CamerasList';
import HACamerasList from '../components/DashboardV2/HACamerasList';
import TabBar from '../components/DashboardV2/TabBar';
import TabletSidebar from '../components/DashboardV2/TabletSidebar';
import useDeviceType from '../hooks/useDeviceType';
import RoomSheet from '../components/DashboardV2/RoomSheet';
import OpacitySettingsModal from '../components/DashboardV2/OpacitySettingsModal';
import SlideAction from '../components/DashboardV2/SlideAction';
import BrainView from '../components/DashboardV2/BrainView';
import VoiceConversation from '../components/VoiceConversation';
import { LockOpen } from 'lucide-react-native';

import { FrigateService } from '../services/frigate';
import * as SecureStore from 'expo-secure-store';
import { startHeartbeat, stopHeartbeat, updateAppState } from '../services/heartbeat';
import { getRoomEntities } from '../utils/roomHelpers';

export default function DashboardV2() {
    const router = useRouter();
    const { userName, userId } = useLocalSearchParams();
    const { isTablet, isLandscape, columns } = useDeviceType();

    // Config State
    const [connectionConfig, setConnectionConfig] = useState({
        url: '',
        token: '',
        adminUrl: '',
        loaded: false
    });

    const service = useRef(null);
    const frigateService = useRef(null); // Frigate Service Ref

    const [entities, setEntities] = useState([]);
    const [cityName, setCityName] = useState('Home');
    const [badgeConfig, setBadgeConfig] = useState(null);
    const [currentFloor, setCurrentFloor] = useState(null);
    const [activeTab, setActiveTab] = useState('home');
    const [frigateCameras, setFrigateCameras] = useState([]); // Frigate State
    const [selectedFrigateCamera, setSelectedFrigateCamera] = useState(null);
    const [showFrigateModal, setShowFrigateModal] = useState(false);
    const [frigateInitialView, setFrigateInitialView] = useState('live'); // 'live' or 'history'
    const [showYoutubeLauncher, setShowYoutubeLauncher] = useState(false);
    const [showAppleTVRemote, setShowAppleTVRemote] = useState(false);
    const [showNetworkModal, setShowNetworkModal] = useState(false);
    const [roomTrackingLookup, setRoomTrackingLookup] = useState({}); // Tracking state -> area_id mapping

    // Settings State
    const [showFamily, setShowFamily] = useState(false);
    const [autoRoomVisit, setAutoRoomVisit] = useState(true);
    const [autoRoomResume, setAutoRoomResume] = useState(true);
    const [showVoiceAssistant, setShowVoiceAssistant] = useState(false);
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

        loadConnectionConfig();
    }, []);

    const loadConnectionConfig = async () => {
        try {
            // 1. Try to load from Profiles first
            const activeProfileId = await SecureStore.getItemAsync('ha_active_profile_id');
            const profilesJson = await SecureStore.getItemAsync('ha_profiles');

            if (activeProfileId && profilesJson) {
                const profiles = JSON.parse(profilesJson);
                const activeProfile = profiles.find(p => p.id === activeProfileId);

                if (activeProfile) {
                    console.log('[Dashboard] Loaded active profile:', activeProfile.name);
                    setConnectionConfig({
                        url: activeProfile.haUrl,
                        token: activeProfile.haToken,
                        adminUrl: activeProfile.adminUrl,
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

    // Registry Data
    const [registryDevices, setRegistryDevices] = useState([]);
    const [registryEntities, setRegistryEntities] = useState([]);
    const [registryAreas, setRegistryAreas] = useState([]);
    const [registryCategories, setRegistryCategories] = useState([]);
    const [registryFloors, setRegistryFloors] = useState([]);
    const [selectedFloor, setSelectedFloor] = useState(null);
    const [alertRules, setAlertRules] = useState([]);
    const [lightMappings, setLightMappings] = useState([]);
    const [mediaMappings, setMediaMappings] = useState([]);
    const [allowedQuickScenes, setAllowedQuickScenes] = useState([]);
    const [sensorMappings, setSensorMappings] = useState([]);

    const mappingsAbortRef = useRef(null);

    const fetchMappings = () => {
        if (!connectionConfig.loaded || !connectionConfig.adminUrl) return;

        // Abort any in-flight mapping requests
        if (mappingsAbortRef.current) mappingsAbortRef.current.abort();
        const controller = new AbortController();
        mappingsAbortRef.current = controller;

        const adminUrl = connectionConfig.adminUrl;
        const baseUrl = adminUrl.endsWith('/') ? adminUrl : `${adminUrl}/`;

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

        // 2. Lights
        const lightsUrl = `${baseUrl}api/monitored-entities?type=light&t=${Date.now()}`;
        console.log('[Dashboard] Fetching light mappings...');
        fetch(lightsUrl, { signal: controller.signal })
            .then(res => res.json())
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
    };

    // ... (rest of useEffects)

    const quickScenesData = useMemo(() => {
        if (!allowedQuickScenes || allowedQuickScenes.length === 0) return [];

        return allowedQuickScenes
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

        }

        // 2. Connect to Home Assistant
        if (haUrl && haToken) {
            service.current = new HAService(haUrl, haToken);
            service.current.connect();
            service.current.subscribe(data => {
                if (data.type === 'connected') {
                    service.current.getStates().then(states => {
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
                    service.current.getCategoryRegistry().then(cats => {
                        console.log('[Dashboard] Loaded Categories:', cats ? cats.length : 0);
                        setRegistryCategories(cats || []);
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

                } else if (data.type === 'state_changed' && data.event && data.event.data) {
                    const newEvent = data.event.data.new_state;
                    if (!newEvent) return; // Ignore deletions or null states

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

    // Active Devices Modal State
    const [modalVisible, setModalVisible] = useState(false);
    const [securityModalVisible, setSecurityModalVisible] = useState(false);

    const [activeBadgeType, setActiveBadgeType] = useState(null); // 'lights', 'ac', 'doors'

    // Room Sheet State
    const [roomSheetVisible, setRoomSheetVisible] = useState(false);
    const [selectedRoom, setSelectedRoom] = useState(null);

    // Opacity Settings State
    const [cardOpacity, setCardOpacity] = useState(0.4);
    const [cardColor, setCardColor] = useState('#000000');
    const [settingsModalVisible, setSettingsModalVisible] = useState(false);

    // Derived Logic for Badges
    const getAllActiveDevices = (type) => {
        if (!registryAreas.length) return [];

        const grouped = [];

        registryAreas.forEach(area => {
            // Find all entities associated with this area (directly or via device)
            const areaDevices = registryDevices.filter(d => d.area_id === area.area_id);
            const areaDeviceIds = areaDevices.map(d => d.id);

            const activeInRoom = registryEntities.filter(re => {
                const directMatch = re.area_id === area.area_id;
                const deviceMatch = re.device_id && areaDeviceIds.includes(re.device_id);
                return directMatch || deviceMatch;
            }).map(re => entities.find(e => e.entity_id === re.entity_id))
                .filter(e => {
                    if (!e) return false;
                    if (type === 'lights') return e.entity_id.startsWith('light.') && e.state === 'on';
                    if (type === 'ac') return e.entity_id.startsWith('climate.') && e.state !== 'off' && e.state !== 'unavailable';
                    if (type === 'doors') {
                        // Use explicit mapping only
                        const mapping = sensorMappings.find(m => m.entity_id === e.entity_id);
                        if (mapping && mapping.sensorType === 'door') {
                            // in the modal, we want ALL doors, not just open ones
                            return true;
                        }
                        return false;
                    }
                    return false;
                });

            if (activeInRoom.length > 0) {
                grouped.push({
                    title: area.name,
                    data: activeInRoom
                });
            }
        });

        return grouped;
    };

    const getModalData = () => {
        if (!activeBadgeType) return { title: '', devices: [] };

        let title = '';
        if (activeBadgeType === 'lights') title = 'Active Lights';
        if (activeBadgeType === 'ac') title = 'Active ACs';
        if (activeBadgeType === 'doors') title = 'All Doors';

        return {
            title,
            devices: getAllActiveDevices(activeBadgeType)
        };
    };

    const { title: modalTitle, devices: modalDevices } = getModalData();

    const handleBadgePress = (type) => {
        if (type === 'security') {
            setSecurityModalVisible(true);
        } else {
            setActiveBadgeType(type);
            setModalVisible(true);
        }
    };

    // Calculate Counts from Grouped Data
    const activeLightsGrouped = getAllActiveDevices('lights');
    const lightsOn = activeLightsGrouped.reduce((sum, group) => sum + group.data.length, 0);

    const activeACGrouped = getAllActiveDevices('ac');
    const acOn = activeACGrouped.reduce((sum, group) => sum + group.data.length, 0);

    // Count OPEN doors specifically for the badge number
    const doorsOpen = entities.filter(e => {
        const mapping = sensorMappings.find(m => m.entity_id === e.entity_id);
        if (mapping && mapping.sensorType === 'door') {
            const s = e.state.toLowerCase();
            return s === 'open' || s === 'on' || s === 'true' || s === '1';
        }
        return false;
    }).length;

    // Power and Security still single entities for now
    let power = null;
    let securityState = 'Unknown';
    if (badgeConfig) {
        const pEntity = entities.find(e => e.entity_id === badgeConfig.power_entity);
        power = pEntity ? pEntity.state : '--';
        const sEntity = entities.find(e => e.entity_id === badgeConfig.security_entity);
        securityState = sEntity ? sEntity.state : 'Unknown';
    } else {
        const pEntity = entities.find(e => e.entity_id.includes('power'));
        power = pEntity ? pEntity.state : null;
        const sEntity = entities.find(e => e.entity_id.startsWith('alarm_control_panel.'));
        securityState = sEntity ? sEntity.state : 'Unknown';
        if (sEntity) {
            console.log('[Security Debug] Entity:', sEntity.entity_id, 'Attributes:', JSON.stringify(sEntity.attributes, null, 2));
        }
    }

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
    useEffect(() => {
        const subscription = AppState.addEventListener('change', nextAppState => {
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
            return service.current.callService(domain, serviceName, serviceData);
        }
        return Promise.reject(new Error("Home Assistant service not connected"));
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
            // Rooms tab: Navigate to room page
            router.push({
                pathname: '/room',
                params: {
                    area_id: room.area_id,
                    name: room.name,
                    picture: room.picture
                }
            });
        } else {
            // Home tab: Show Modal Popup
            setSelectedRoom(room);
            setRoomSheetVisible(true);
        }
    };

    const handleHeaderRoomPress = () => {
        // Find the current user's person entity
        const personEntity = entities.find(e =>
            e.entity_id.startsWith('person.') &&
            (e.attributes?.friendly_name?.toLowerCase() === userName?.toLowerCase() ||
                e.entity_id.includes(userName?.toLowerCase()))
        );

        const currentLocation = personEntity?.state;

        // If at home or no location, don't open sheet
        if (!currentLocation || currentLocation === 'home' || currentLocation === 'not_home') {
            return;
        }

        // Find the room that matches the current location
        const currentRoom = registryAreas.find(area =>
            area.name?.toLowerCase() === currentLocation.toLowerCase() ||
            area.area_id?.toLowerCase() === currentLocation.toLowerCase()
        );

        if (currentRoom) {
            setSelectedRoom(currentRoom);
            setRoomSheetVisible(true);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
    };



    const handleTabPress = (tabId) => {
        setActiveTab(tabId);
    };

    const getRoomsWithCounts = () => {
        // Fallback to registryAreas if badgeConfig is missing or has no selected_areas
        const sourceAreas = (badgeConfig?.selected_areas && badgeConfig.selected_areas.length > 0)
            ? badgeConfig.selected_areas.filter(sa => registryAreas.some(ra => ra.area_id === sa.area_id))
            : registryAreas;

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

        const computedRooms = sourceAreas.map(area => {
            // Restore areaRegEntries for device count and raw access
            const areaDevices = registryDevices.filter(d => d.area_id === area.area_id);
            const areaDeviceIds = areaDevices.map(d => d.id);
            const areaRegEntries = registryEntities.filter(re => {
                const directMatch = re.area_id === area.area_id;
                const deviceMatch = re.device_id && areaDeviceIds.includes(re.device_id);
                return directMatch || deviceMatch;
            });

            // Use the sophisticated helper with Sensor Mappings
            const roomEntities = getRoomEntities(area, registryDevices, registryEntities, entities, sensorMappings);

            // Active Counts using processed entities
            const activeLights = roomEntities.lights.filter(l => l.stateObj.state === 'on').length;

            const activeAC = roomEntities.climates.filter(c => {
                const s = c.stateObj?.state;
                return s && s !== 'off' && s !== 'unavailable';
            }).length;

            const activeCovers = roomEntities.covers.filter(c => {
                const s = c.stateObj?.state;
                const pos = c.stateObj?.attributes?.current_position;
                return s && (s === 'open' || (pos && pos > 0));
            }).length;

            // Doors now respect sensorType from getRoomEntities
            const activeDoors = roomEntities.doors.filter(d => {
                const s = d.stateObj?.state?.toLowerCase();
                if (!s) return false;
                return s === 'open' || s === 'on' || s === 'true' || s === '1';
            }).length;

            const hasPresenceSensor = areaRegEntries.some(re =>
                re.entity_id.startsWith('binary_sensor.espresense_')
            );

            return {
                ...area,
                name: resolveDisplayName(area.area_id, area.name),
                deviceCount: areaRegEntries.length,
                activeLights,
                activeAC,
                activeCovers,
                activeDoors,
                hasPresenceSensor,
                _entities: roomEntities // Optional: cache if needed
            };
        });

        // Apply Sorting if savedRoomOrder exists
        if (savedRoomOrder && savedRoomOrder.length > 0) {
            return computedRooms.sort((a, b) => {
                const indexA = savedRoomOrder.indexOf(a.area_id);
                const indexB = savedRoomOrder.indexOf(b.area_id);

                const valA = indexA === -1 ? 9999 : indexA;
                const valB = indexB === -1 ? 9999 : indexB;

                return valA - valB;
            });
        }

        return computedRooms;
    };

    const roomsWithCounts = useMemo(() => getRoomsWithCounts(), [
        badgeConfig,
        registryAreas,
        registryDevices,
        registryEntities,
        entities,
        sensorMappings,
        savedRoomOrder
    ]);

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

    const sidebarPadding = isLandscape ? { paddingLeft: 80 } : {};

    const renderContent = () => {
        if (activeTab === 'home') {
            return (
                <ScrollView contentContainerStyle={[styles.content, isLandscape && sidebarPadding]}>
                    <HeaderV2
                        weather={weather}
                        cityName={cityName}
                        userName={userName}
                        entities={entities}
                        config={badgeConfig}
                        onRoomPress={handleHeaderRoomPress}
                    />
                    <StatusBadges
                        securityState={securityState}
                        lightsOn={lightsOn}
                        acOn={acOn}
                        doorsOpen={doorsOpen}
                        power={power}
                        onPress={handleBadgePress}
                    />
                    <View style={styles.divider} />

                    {/* Person Status */}
                    {showFamily && <PersonBadges entities={entities} alertRules={alertRules} haUrl={connectionConfig.url} />}

                    <QuickScenes
                        scenes={quickScenesData}
                        onScenePress={handleScenePress}
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
                        overlayOpacity={cardOpacity}
                        overlayColor={cardColor}
                        onSettingsPress={() => setSettingsModalVisible(true)}
                        layout={isTablet ? 'grid' : 'horizontal'}
                        columns={columns}
                        haUrl={connectionConfig.url}
                        haToken={connectionConfig.token}
                        sensorMappings={sensorMappings}
                    />


                    {/* TEMPORARILY DISABLED — testing if cameras cause crash */}
                    {/* <HACamerasList
                        cameras={entities.filter(e => e.entity_id.startsWith('camera.'))}
                        allEntities={entities}
                        haUrl={connectionConfig.url}
                        haToken={connectionConfig.token}
                        onCameraPress={(cam) => {
                            console.log('HA Camera Pressed:', cam.entity_id);
                        }}
                    /> */}
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
                                overlayOpacity={cardOpacity}
                                overlayColor={cardColor}
                                onSettingsPress={() => setSettingsModalVisible(true)}
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
                        <Text style={styles.sectionTitle}>Security Cameras</Text>
                        <CamerasList
                            frigateCameras={frigateCameras}
                            service={frigateService.current}
                            onCameraPress={handleFrigateCameraPress}
                            columns={columns}
                        />
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
                        areas={(badgeConfig?.selected_areas && badgeConfig.selected_areas.length > 0) ? badgeConfig.selected_areas : registryAreas}
                        entities={entities}
                        registryDevices={registryDevices}
                        registryEntities={registryEntities}
                        showFamily={showFamily}
                        autoRoomVisit={autoRoomVisit}
                        autoRoomResume={autoRoomResume}
                        showVoiceAssistant={showVoiceAssistant}
                        showPreferenceButton={showPreferenceButton}
                        adminUrl={connectionConfig.adminUrl}
                        onSettingChange={(key, val) => {
                            if (key === 'showFamily') setShowFamily(val);
                            if (key === 'autoRoomVisit') setAutoRoomVisit(val);
                            if (key === 'autoRoomResume') setAutoRoomResume(val);
                            if (key === 'showVoiceAssistant') setShowVoiceAssistant(val);
                            if (key === 'showPreferenceButton') setShowPreferenceButton(val);
                        }}
                        onPlayMedia={() => setShowYoutubeLauncher(true)}
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

            {securityModalVisible && (
                <SecurityControlModal
                    visible={securityModalVisible}
                    onClose={() => setSecurityModalVisible(false)}
                    entity={entities.find(e => e.entity_id.startsWith('alarm_control_panel.'))}
                    onCallService={callService}
                />
            )}

            {modalVisible && (
                <ActiveDevicesModal
                    visible={modalVisible}
                    title={modalTitle}
                    devices={modalDevices}
                    onClose={() => {
                        setModalVisible(false);
                        setActiveBadgeType(null);
                    }}
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

            {showYoutubeLauncher && (
                <YouTubeLauncherModal
                    visible={showYoutubeLauncher}
                    onClose={() => setShowYoutubeLauncher(false)}
                    mediaPlayers={entities.filter(e => e.entity_id.startsWith('media_player.'))}
                    callService={callService}
                />
            )}

            {showAppleTVRemote && (
                <AppleTVRemoteModal
                    visible={showAppleTVRemote}
                    onClose={() => setShowAppleTVRemote(false)}
                    remoteEntityId="remote.living_room"
                    callService={callService}
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

            {renderContent()}

            {isLandscape ? (
                <TabletSidebar activeTab={activeTab} onTabPress={handleTabPress} />
            ) : (
                activeTab !== 'ai' && (
                    <TabBar activeTab={activeTab} onTabPress={handleTabPress} />
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
                />
            )}

            {settingsModalVisible && (
                <OpacitySettingsModal
                    visible={settingsModalVisible}
                    onClose={() => setSettingsModalVisible(false)}
                    currentOpacity={cardOpacity}
                    setOpacity={setCardOpacity}
                    currentColor={cardColor}
                    setColor={setCardColor}
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
        fontWeight: 'bold',
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
        fontWeight: 'bold',
        fontSize: 16
    }
});
