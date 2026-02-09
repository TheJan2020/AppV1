import { useRef, useState, useEffect } from 'react';
import FrigateCameraModal from '../components/DashboardV2/FrigateCameraModal';
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
import CamerasList from '../components/DashboardV2/CamerasList';
import HACamerasList from '../components/DashboardV2/HACamerasList';
import TabBar from '../components/DashboardV2/TabBar';
import RoomSheet from '../components/DashboardV2/RoomSheet';
import OpacitySettingsModal from '../components/DashboardV2/OpacitySettingsModal';
import SlideAction from '../components/DashboardV2/SlideAction';
import BrainView from '../components/DashboardV2/BrainView';
import { LockOpen, Warehouse, DoorOpen } from 'lucide-react-native';

import { FrigateService } from '../services/frigate';
import * as SecureStore from 'expo-secure-store';

export default function DashboardV2() {
    const router = useRouter();
    const { userName } = useLocalSearchParams();

    // Config State
    const [connectionConfig, setConnectionConfig] = useState({
        url: process.env.EXPO_PUBLIC_HA_URL,
        token: process.env.EXPO_PUBLIC_HA_TOKEN,
        adminUrl: process.env.EXPO_PUBLIC_ADMIN_URL,
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
    const [showFamily, setShowFamily] = useState(true);
    const [autoRoomVisit, setAutoRoomVisit] = useState(true);
    const [autoRoomResume, setAutoRoomResume] = useState(true);

    useEffect(() => {
        SecureStore.getItemAsync('settings_show_family').then(val => {
            setShowFamily(val === 'false' ? false : true);
        });
        SecureStore.getItemAsync('settings_auto_room_visit').then(val => {
            if (val !== null) setAutoRoomVisit(val === 'true');
        });
        SecureStore.getItemAsync('settings_auto_room_resume').then(val => {
            if (val !== null) setAutoRoomResume(val === 'true');
        });

        loadConnectionConfig();
    }, []);

    const loadConnectionConfig = async () => {
        try {
            const sUrl = await SecureStore.getItemAsync('ha_url');
            const sToken = await SecureStore.getItemAsync('ha_token');
            const sAdmin = await SecureStore.getItemAsync('admin_url');

            setConnectionConfig({
                url: sUrl || process.env.EXPO_PUBLIC_HA_URL,
                token: sToken || process.env.EXPO_PUBLIC_HA_TOKEN,
                adminUrl: sAdmin || process.env.EXPO_PUBLIC_ADMIN_URL,
                loaded: true
            });
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
    const [registryFloors, setRegistryFloors] = useState([]);
    const [selectedFloor, setSelectedFloor] = useState(null);
    const [alertRules, setAlertRules] = useState([]);

    // Initial Load Logic
    useEffect(() => {
        if (!connectionConfig.loaded) return;

        const { url: haUrl, token: haToken, adminUrl } = connectionConfig;

        // ... (Admin Config Fetch remains) ...
        console.log('DEBUG: Fetching Admin Config from:', adminUrl);

        if (adminUrl) {
            // Append /api/config if not present (assuming env var is base URL)
            const configUrl = (adminUrl.endsWith('/') ? `${adminUrl}api/config` : `${adminUrl}/api/config`) + `?t=${Date.now()}`;
            fetch(configUrl, { method: 'GET', headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' } })
                .then(res => res.json())
                .then(data => {
                    console.log('DEBUG: Fetched Admin Config Keys:', Object.keys(data));
                    setBadgeConfig(data);
                })
                .catch(err => console.log('DEBUG: Error loading admin config:', err));

            // Fetch Alert Rules
            const alertUrl = (adminUrl.endsWith('/') ? `${adminUrl}api/alerts` : `${adminUrl}/api/alerts`) + `?t=${Date.now()}`;
            fetch(alertUrl)
                .then(res => res.json())
                .then(data => {
                    if (data.success) setAlertRules(data.rules);
                })
                .catch(e => console.log("Alert Rules Error", e));

            // Fetch Room Tracking Lookup
            const roomTrackingUrl = (adminUrl.endsWith('/') ? `${adminUrl}api/room-tracking/lookup` : `${adminUrl}/api/room-tracking/lookup`);
            fetch(roomTrackingUrl)
                .then(res => res.json())
                .then(data => {
                    if (data.success) {
                        console.log('[Room Tracking] Loaded lookup map:', data.lookup);
                        setRoomTrackingLookup(data.lookup);
                    }
                })
                .catch(e => console.log("[Room Tracking] Error loading lookup:", e));
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

        // 3. Connect to Frigate
        const frigateUrl = process.env.EXPO_PUBLIC_FRIGATE_URL || 'http://192.168.100.18:5000';
        const frigateUser = process.env.EXPO_PUBLIC_FRIGATE_USER || null;
        const frigatePass = process.env.EXPO_PUBLIC_FRIGATE_PASS || null;

        frigateService.current = new FrigateService(frigateUrl, frigateUser, frigatePass);

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

        return () => service.current?.socket?.close();
    }, [connectionConfig.loaded]);

    const weather = entities.find(e => e.entity_id.startsWith('weather.'));

    // Active Devices Modal State
    const [modalVisible, setModalVisible] = useState(false);
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
                        const isBinaryDoor = e.entity_id.startsWith('binary_sensor.') && (
                            e.attributes?.device_class === 'door' ||
                            e.attributes?.device_class === 'garage' ||
                            e.attributes?.device_class === 'window' ||
                            e.attributes?.device_class === 'opening' ||
                            e.entity_id.includes('door')
                        );
                        // Sensor Door: sensor.door_ANYTEXT
                        const isSensorDoor = e.entity_id.startsWith('sensor.door_') && (e.state.toLowerCase() === 'open' || e.state.toLowerCase() === 'on');

                        const isGarageCover = e.entity_id.startsWith('cover.') && e.attributes?.device_class === 'garage' && e.state === 'open';

                        return (isBinaryDoor && e.state === 'on') || isSensorDoor || isGarageCover;
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
        if (activeBadgeType === 'doors') title = 'Open Doors';

        return {
            title,
            devices: getAllActiveDevices(activeBadgeType)
        };
    };

    const { title: modalTitle, devices: modalDevices } = getModalData();

    const handleBadgePress = (type) => {
        setActiveBadgeType(type);
        setModalVisible(true);
    };

    // Calculate Counts from Grouped Data
    const activeLightsGrouped = getAllActiveDevices('lights');
    const lightsOn = activeLightsGrouped.reduce((sum, group) => sum + group.data.length, 0);

    const activeACGrouped = getAllActiveDevices('ac');
    const acOn = activeACGrouped.reduce((sum, group) => sum + group.data.length, 0);

    const activeDoorsGrouped = getAllActiveDevices('doors');
    const doorsOpen = activeDoorsGrouped.reduce((sum, group) => sum + group.data.length, 0);

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
    const appState = useRef(AppState.currentState);

    // Refactored check logic for re-use
    // isResume: Boolean, true if triggered by App Resume
    const checkPresence = (isResume = false) => {
        console.log('[Auto-Room] checkPresence called. isResume:', isResume, 'userName:', userName, 'roomsCount:', roomsWithCounts.length);

        if (!roomsWithCounts.length || !userName) {
            console.log('[Auto-Room] Early exit - no rooms or userName');
            return;
        }

        // Check Settings
        const shouldRun = isResume ? autoRoomResume : autoRoomVisit;
        console.log('[Auto-Room] Setting check:', isResume ? 'autoRoomResume' : 'autoRoomVisit', '=', shouldRun);
        if (!shouldRun) {
            console.log('[Auto-Room] Feature disabled by settings');
            return;
        }

        // 1. Find User's Tracked Device Sensor
        // Look for tracked device sensor that includes the username
        // e.g., sensor.zeyad_iphone_room for userName "Zeyad"
        const safeUserName = userName.toLowerCase().replace(/ /g, '_');
        console.log('[Auto-Room] Looking for sensor matching user:', safeUserName);

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

        console.log('[Auto-Room] Tracker sensor:', tracker?.entity_id, 'state:', tracker?.state);

        if (!tracker) {
            console.log('[Auto-Room] Tracker sensor not found for user:', safeUserName);
            return;
        }

        const currentState = tracker.state.toLowerCase();
        console.log('[Auto-Room] Current state:', currentState);

        // Ignore generic states
        if (['home', 'not_home', 'unknown', 'unavailable', 'away', 'none'].includes(currentState)) {
            console.log('[Auto-Room] State is generic, ignoring');
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
                console.log(`[Auto-Room] ✅ Opening room sheet: ${foundRoom.name}. Resume: ${isResume}`);
                lastActiveRoomRef.current = foundRoom.area_id;

                setSelectedRoom(foundRoom);
                setRoomSheetVisible(true);
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
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
            }
            appState.current = nextAppState;
        });

        return () => {
            subscription.remove();
        };
    }, [entities, roomsWithCounts, userName, autoRoomResume]);


    const callService = (domain, serviceName, serviceData) => {
        if (service.current) {
            return service.current.callService(domain, serviceName, serviceData);
        }
        return Promise.reject(new Error("Home Assistant service not connected"));
    };

    const handleScenePress = (sceneId) => {
        console.log('Scene pressed:', sceneId);
        // TODO: Implement actual scene activation via HAService
    };

    const handleRoomPress = (room) => {
        if (activeTab === 'rooms') {
            // Navigate to new Room Page
            router.push({
                pathname: '/room',
                params: {
                    area_id: room.area_id,
                    name: room.name,
                    picture: room.picture
                }
            });
        } else {
            // Show Modal Popup (Home tab)
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

    // Temporary State for Door/Garage
    const [isDoorUnlocked, setIsDoorUnlocked] = useState(false);
    const [isGarageOpen, setIsGarageOpen] = useState(false);

    const handleUnlockDoor = () => {
        // Trigger Service Immediate
        const lock = entities.find(e => e.entity_id.startsWith('lock.') && (e.entity_id.includes('front') || e.entity_id.includes('door')));
        if (lock) {
            callService('lock', 'unlock', { entity_id: lock.entity_id });
        } else {
            console.log("DEBUG: No front door lock found");
        }

        // Delay visual state change to allow Success Animation (2.5s) to play
        setTimeout(() => {
            setIsDoorUnlocked(true);
            // Revert 5 seconds AFTER the state changes
            setTimeout(() => setIsDoorUnlocked(false), 5000);
        }, 2200);
    };

    const handleOpenGarage = () => {
        // Trigger Service Immediate
        const garage = entities.find(e => e.entity_id.startsWith('cover.') && e.entity_id.includes('garage'));
        if (garage) {
            callService('cover', 'open_cover', { entity_id: garage.entity_id });
        } else {
            console.log("DEBUG: No garage cover found");
        }

        // Delay visual state change to allow Success Animation (2.5s) to play
        setTimeout(() => {
            setIsGarageOpen(true);
            // Revert 5 seconds AFTER the state changes
            setTimeout(() => setIsGarageOpen(false), 5000);
        }, 2200);
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

        return sourceAreas.map(area => {
            const areaDevices = registryDevices.filter(d => d.area_id === area.area_id);
            const areaDeviceIds = areaDevices.map(d => d.id);
            const areaRegEntries = registryEntities.filter(re => {
                const directMatch = re.area_id === area.area_id;
                const deviceMatch = re.device_id && areaDeviceIds.includes(re.device_id);
                return directMatch || deviceMatch;
            });

            // Calculate active states
            const activeLights = areaRegEntries.filter(re => {
                if (!re.entity_id.startsWith('light.')) return false;
                const stateObj = entities.find(e => e.entity_id === re.entity_id);
                return stateObj && stateObj.state === 'on';
            }).length;

            const activeAC = areaRegEntries.filter(re => {
                if (!re.entity_id.startsWith('climate.')) return false;
                const stateObj = entities.find(e => e.entity_id === re.entity_id);
                return stateObj && stateObj.state !== 'off' && stateObj.state !== 'unavailable';
            }).length;

            const activeCovers = areaRegEntries.filter(re => {
                if (!re.entity_id.startsWith('cover.')) return false;
                const stateObj = entities.find(e => e.entity_id === re.entity_id);
                return stateObj && (stateObj.state === 'open' || (stateObj.attributes?.current_position && stateObj.attributes.current_position > 0));
            }).length;

            const activeDoors = areaRegEntries.filter(re => {
                const stateObj = entities.find(e => e.entity_id === re.entity_id);
                if (!stateObj) return false;

                // Check binary sensors for doors/windows
                if (re.entity_id.startsWith('binary_sensor.')) {
                    const isDoor = stateObj?.attributes?.device_class === 'door' ||
                        stateObj?.attributes?.device_class === 'window' ||
                        stateObj?.attributes?.device_class === 'garage' ||
                        stateObj?.attributes?.device_class === 'opening' ||
                        re.entity_id.includes('door') ||
                        re.entity_id.includes('window');

                    return isDoor && stateObj.state === 'on';
                }

                // Check sensor.door_*
                if (re.entity_id.startsWith('sensor.door_')) {
                    const s = stateObj.state.toLowerCase();
                    return s === 'open' || s === 'on';
                }

                return false;
            }).length;

            const hasPresenceSensor = areaRegEntries.some(re =>
                re.entity_id.startsWith('binary_sensor.espresense_')
            );

            return {
                ...area,
                deviceCount: areaRegEntries.length,
                activeLights,
                activeAC,
                activeCovers,
                activeDoors,
                hasPresenceSensor
            };
        });
    };

    const roomsWithCounts = getRoomsWithCounts();

    const renderContent = () => {
        if (activeTab === 'home') {
            return (
                <ScrollView contentContainerStyle={styles.content}>
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
                    {showFamily && <PersonBadges entities={entities} alertRules={alertRules} />}

                    <QuickScenes
                        onScenePress={handleScenePress}
                    />



                    {/* Sliders / Status Indicators */}
                    <View style={styles.sliderRow}>
                        {/* Door Lock */}
                        <View style={styles.sliderContainer}>
                            {/* Logic: Check if door is unlocked. */}
                            {isDoorUnlocked ? (
                                <View style={[styles.statusCard, { backgroundColor: '#EF5350' }]}>
                                    <LockOpen size={24} color="#fff" />
                                    <Text style={styles.statusText}>Unlocked</Text>
                                </View>
                            ) : (
                                <SlideAction
                                    label="Unlock Door"
                                    icon={LockOpen}
                                    color="#8947ca"
                                    onSlide={handleUnlockDoor}
                                />
                            )}
                        </View>

                        {/* Garage Door */}
                        <View style={styles.sliderContainer}>
                            {/* Logic: Check if garage is open. */}
                            {isGarageOpen ? (
                                <View style={[styles.statusCard, { backgroundColor: '#EF5350' }]}>
                                    <MaterialCommunityIcons name="garage-open-variant" size={24} color="#fff" />
                                    <Text style={styles.statusText}>Garage Open</Text>
                                </View>
                            ) : (
                                <SlideAction
                                    label="Open Garage"
                                    icon={Warehouse}
                                    color="#8947ca"
                                    onSlide={handleOpenGarage}
                                />
                            )}
                        </View>
                    </View>

                    <RoomsList
                        rooms={roomsWithCounts}
                        registryEntities={registryEntities}
                        allEntities={entities}
                        onRoomPress={handleRoomPress}
                        overlayOpacity={cardOpacity}
                        overlayColor={cardColor}
                        onSettingsPress={() => setSettingsModalVisible(true)}
                    />


                    {/* Standard HA Cameras for Home Tab */}
                    <HACamerasList
                        cameras={entities.filter(e => e.entity_id.startsWith('camera.'))}
                        allEntities={entities}
                        haUrl={connectionConfig.url}
                        haToken={connectionConfig.token}
                        onCameraPress={(cam) => {
                            // Can add a modal for HA cameras here later if needed
                            console.log('HA Camera Pressed:', cam.entity_id);
                        }}
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

                // Allow matching by direct floor_id or alias if needed, but registry uses floor_id
                const areaFloorId = area ? (area.floor_id || area.floor) : null;
                return areaFloorId === selectedFloor;
            });

            return (
                <View style={[styles.content, { paddingHorizontal: 20, marginTop: 60, paddingBottom: 100 }]}>
                    <Text style={styles.sectionTitle}>Rooms</Text>

                    {/* Floor Selector */}
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
                    />
                </View>
            );
        }

        if (activeTab === 'cctv') {
            return (
                <ScrollView contentContainerStyle={styles.content}>
                    <View style={{ marginTop: 60 }}>
                        <Text style={styles.sectionTitle}>Security Cameras</Text>
                        <CamerasList
                            frigateCameras={frigateCameras}
                            service={frigateService.current}
                            onCameraPress={handleFrigateCameraPress}
                        />
                    </View>
                </ScrollView>
            );
        }

        if (activeTab === 'ai') {
            return (
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
            );
        }

        if (activeTab === 'settings') {
            return (
                <SettingsView
                    areas={(badgeConfig?.selected_areas && badgeConfig.selected_areas.length > 0) ? badgeConfig.selected_areas : registryAreas}
                    entities={entities}
                    registryDevices={registryDevices}
                    registryEntities={registryEntities}
                    showFamily={showFamily}
                    autoRoomVisit={autoRoomVisit}
                    autoRoomResume={autoRoomResume}
                    onSettingChange={(key, val) => {
                        if (key === 'showFamily') setShowFamily(val);
                        if (key === 'autoRoomVisit') setAutoRoomVisit(val);
                        if (key === 'autoRoomResume') setAutoRoomResume(val);
                    }}
                    onPlayMedia={() => setShowYoutubeLauncher(true)}
                    onNetwork={() => setShowNetworkModal(true)}
                />
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

            <FrigateCameraModal
                visible={showFrigateModal}
                camera={selectedFrigateCamera}
                service={frigateService.current}
                initialView={frigateInitialView}
                onClose={() => setShowFrigateModal(false)}
            />

            <YouTubeLauncherModal
                visible={showYoutubeLauncher}
                onClose={() => setShowYoutubeLauncher(false)}
                mediaPlayers={entities.filter(e => e.entity_id.startsWith('media_player.'))}
                callService={callService}
            />

            <AppleTVRemoteModal
                visible={showAppleTVRemote}
                onClose={() => setShowAppleTVRemote(false)}
                remoteEntityId="remote.living_room"
                callService={callService}
            />

            <NetworkModal
                visible={showNetworkModal}
                onClose={() => setShowNetworkModal(false)}
                config={badgeConfig}
                entities={entities}
                onToggle={callService}
            />

            {renderContent()}

            {activeTab !== 'ai' && (
                <TabBar activeTab={activeTab} onTabPress={handleTabPress} />
            )}

            <RoomSheet
                visible={roomSheetVisible}
                onClose={() => setRoomSheetVisible(false)}
                room={selectedRoom}
                registryDevices={registryDevices}
                registryEntities={registryEntities}
                allEntities={entities}
                onToggle={callService}
            />

            <OpacitySettingsModal
                visible={settingsModalVisible}
                onClose={() => setSettingsModalVisible(false)}
                currentOpacity={cardOpacity}
                setOpacity={setCardOpacity}
                currentColor={cardColor}
                setColor={setCardColor}
            />
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
        marginBottom: 20,
        gap: 12
    },
    sliderContainer: {
        flex: 1
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
