import { useRef, useState, useEffect, useMemo, useCallback, useContext } from 'react';
import * as Notifications from 'expo-notifications';
import FrigateCameraModal from '../components/DashboardV2/FrigateCameraModal';
import SecurityControlModal from '../components/DashboardV2/SecurityControlModal';
import NotificationModal from '../components/DashboardV2/NotificationModal';
import AlertNotificationModal from '../components/DashboardV2/AlertNotificationModal';
import SecurityAlertModal from '../components/DashboardV2/SecurityAlertModal';

import { MaterialCommunityIcons } from '@expo/vector-icons';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, AppState, ActivityIndicator, Image } from 'react-native';
import HomeCameraStrip from '../components/DashboardV2/HomeCameraStrip';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import HeaderV2 from '../components/DashboardV2/HeaderV2';
import StatusBadges from '../components/DashboardV2/StatusBadges';
import PersonBadges from '../components/DashboardV2/PersonBadges';
import ActiveDevicesModal from '../components/DashboardV2/ActiveDevicesModal';
import LocksModal from '../components/DashboardV2/LocksModal';
import SettingsView from '../components/DashboardV2/SettingsView';
import { HAService } from '../services/ha';
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import NetworkModal from '../components/DashboardV2/NetworkModal';
import QuickScenes from '../components/DashboardV2/QuickScenes';
import AppleTVRemoteModal from '../components/DashboardV2/AppleTVRemoteModal';
import DraggableRoomList from '../components/DashboardV2/DraggableRoomList';
import RoomsList from '../components/DashboardV2/RoomsList';
import CamerasList from '../components/DashboardV2/CamerasList';
import FrigateEventsFeed from '../components/DashboardV2/FrigateEventsFeed';
import HACamerasList from '../components/DashboardV2/HACamerasList';
import { buildEntityMap } from '../components/DashboardV2/CameraSensorOverlay';
import TabBar from '../components/DashboardV2/TabBar';
import TabletSidebar from '../components/DashboardV2/TabletSidebar';
import useDeviceType from '../hooks/useDeviceType';
import useNotifications from '../hooks/useNotifications';
import RoomSheet from '../components/DashboardV2/RoomSheet';
import OpacitySettingsModal from '../components/DashboardV2/OpacitySettingsModal';
import HomeAccess from '../components/DashboardV2/HomeAccess';
import BrainView from '../components/DashboardV2/BrainView';
import DashboardSkeleton, {
    HeaderSkeleton,
    ScenesSkeleton,
    HomeAccessSkeleton,
    RoomsSkeleton,
    CamerasSkeleton,
} from '../components/DashboardV2/DashboardSkeleton';
import VoiceConversation from '../components/VoiceConversation';

import { FrigateService } from '../services/frigate';
import * as SecureStore from 'expo-secure-store';
import { startHeartbeat, stopHeartbeat, updateAppState } from '../services/heartbeat';
import { getRoomEntities } from '../utils/roomHelpers';
import { NotifContext } from '../services/NotifContext';

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
    const [cctvView, setCctvView] = useState('cameras'); // 'cameras' | 'events'
    const [frigateCameras, setFrigateCameras] = useState([]); // Frigate State
    const [selectedFrigateCamera, setSelectedFrigateCamera] = useState(null);
    const [showFrigateModal, setShowFrigateModal] = useState(false);
    const [frigateInitialView, setFrigateInitialView] = useState('live'); // 'live' or 'history'
    const [showAppleTVRemote, setShowAppleTVRemote] = useState(false);
    const [showNetworkModal, setShowNetworkModal] = useState(false);
    const [roomTrackingLookup, setRoomTrackingLookup] = useState({}); // Tracking state -> area_id mapping

    // Settings State
    const [showFamily, setShowFamily] = useState(false);
    const [autoRoomVisit, setAutoRoomVisit] = useState(true);
    const [autoRoomResume, setAutoRoomResume] = useState(true);
    const [showVoiceAssistant, setShowVoiceAssistant] = useState(false);
    const [showPreferenceButton, setShowPreferenceButton] = useState(true);

    const haHttpUrl = useMemo(() => {
        if (!connectionConfig.url) return '';
        return connectionConfig.url
            .replace(/^ws:\/\//i, 'http://')
            .replace(/^wss:\/\//i, 'https://')
            .replace(/\/api\/websocket\/?$/i, '');
    }, [connectionConfig.url]);


    // Room Reordering State
    const [savedRoomOrder, setSavedRoomOrder] = useState([]);
    const [isReorderMode, setIsReorderMode] = useState(false);
    const [aiTabVisited, setAiTabVisited] = useState(false);

    // Track when AI tab is first visited (keeps it mounted after)
    useEffect(() => {
        if (activeTab === 'ai' && !aiTabVisited) setAiTabVisited(true);
    }, [activeTab]);

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
                    const normalizedHaUrl = activeProfile.haUrl?.replace(/^https?:\/\//i, (m) => m.toLowerCase()) || activeProfile.haUrl;
                    const normalizedAdminUrl = activeProfile.adminUrl?.replace(/^https?:\/\//i, (m) => m.toLowerCase()) || activeProfile.adminUrl;

                    console.log('[Dashboard] Loaded active profile:', activeProfile.name);
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

    const handleFrigateCameraPress = useCallback((camera, mode = 'live') => {
        console.log('[Dashboard] Camera pressed:', camera?.name, 'Mode:', mode);
        setSelectedFrigateCamera(camera);
        setFrigateInitialView(mode);
        setShowFrigateModal(true);
    }, []);

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
    const [coverMappings, setCoverMappings] = useState([]);
    /** `entry_id`s from HA config_entries where domain is music_assistant — ties entities → MA without relying on state attrs */
    const [musicAssistantEntryIds, setMusicAssistantEntryIds] = useState([]);
    // null = never configured (show all), [] = none selected, [...] = selected ids
    const [selectedLockIds, setSelectedLockIds] = useState(null);
    const [selectedCoverIds, setSelectedCoverIds] = useState(null);
    const [lockPassageConfigs, setLockPassageConfigs] = useState({}); // { [entity_id]: { enabled, passage_entity_id } }

    // ── Progressive reveal ────────────────────────────────────────────────────
    // All API calls fire in parallel (fastest possible). Once BOTH entities have
    // arrived from HA AND all API flags are done, sections are revealed one by one
    // with a 180ms gap so the user sees a clear top-to-bottom cascade.
    //
    //  revealStep:  0 = nothing shown (skeleton everywhere)
    //               1 = Header visible
    //               2 = Scenes visible
    //               3 = HomeAccess visible
    //               4 = Rooms visible
    //               5 = Cameras visible
    const [scenesFetched, setScenesFetched] = useState(false);
    const [homeAccessFetched, setHomeAccessFetched] = useState(false);
    const [frigateFetched, setFrigateFetched] = useState(false);
    const [revealStep, setRevealStep] = useState(0);
    const revealRef = useRef(null);

    // Cascade starts as soon as entities arrive.
    // Each step only waits for the data ITS section needs before advancing.
    useEffect(() => {
        // If an alert modal is pending, skip straight to fully revealed so the
        // dashboard loads behind the modal — even if resetReveal() was called
        // after the alertNotif was set (e.g. connectionConfig load with
        // fetchMappings({ resetRevealCascade: true })).
        if (alertNotif) {
            clearTimeout(revealRef.current);
            setRevealStep(5);
            return;
        }

        if (entities.length === 0) return;   // nothing to show yet
        if (revealStep >= 5) return;          // fully revealed

        // Pause at step 1 until scenes API is done
        if (revealStep === 1 && !scenesFetched) return;
        // Pause at step 2 until home-access API is done
        if (revealStep === 2 && !homeAccessFetched) return;
        // Pause at step 4 until frigate API is done
        if (revealStep === 4 && !frigateFetched) return;

        revealRef.current = setTimeout(() => {
            setRevealStep(s => Math.min(s + 1, 5));
        }, 180);
        return () => clearTimeout(revealRef.current);
    }, [entities.length, scenesFetched, homeAccessFetched, frigateFetched, revealStep, alertNotif]);

    // Reset on config change so cascade re-runs on profile switch
    const resetReveal = () => {
        clearTimeout(revealRef.current);
        setRevealStep(0);
        setScenesFetched(false);
        setHomeAccessFetched(false);
        setFrigateFetched(false);
    };

    const mappingsAbortRef = useRef(null);

    /** @param {{ resetRevealCascade?: boolean }} [opts] — set false when refreshing after edits / resume so skeletons do not re-run */
    const fetchMappings = (opts = {}) => {
        const { resetRevealCascade = true } = opts;
        // Config not ready yet — wait, don't touch any flags
        if (!connectionConfig.loaded) return;

        // Loaded but no admin URL — nothing to fetch, mark all API flags done immediately
        if (!connectionConfig.adminUrl) {
            setScenesFetched(true);
            setHomeAccessFetched(true);
            // frigate is set in the useEffect for initial load
            return;
        }

        // Only reset the progressive-reveal cascade on initial / connection change loads
        if (resetRevealCascade) resetReveal();

        // Abort any in-flight mapping requests
        if (mappingsAbortRef.current) mappingsAbortRef.current.abort();
        const controller = new AbortController();
        mappingsAbortRef.current = controller;

    const adminUrl = connectionConfig.adminUrl;
        const haToken = connectionConfig.token;
        const baseUrl = adminUrl.endsWith('/') ? adminUrl : `${adminUrl}/`;
        const authHeaders = {
            'Authorization': `Bearer ${haToken}`,
            'Content-Type': 'application/json',
        };

        // 1. Quick Scenes
        const qsUrl = `${baseUrl}api/quick-scenes?t=${Date.now()}`;
        fetch(qsUrl, { signal: controller.signal, headers: authHeaders })
            .then(res => res.json())
            .then(data => {
                if (Array.isArray(data)) setAllowedQuickScenes(data.map(s => s.entity_id));
                setScenesFetched(true);
            })
            .catch(e => {
                if (e.name !== 'AbortError') console.error('[Mappings] Quick Scenes error:', e);
                setScenesFetched(true);
            });

        // 2. Lights
        const lightsUrl = `${baseUrl}api/monitored-entities?type=light&t=${Date.now()}`;
        fetch(lightsUrl, { signal: controller.signal, headers: authHeaders })
            .then(res => res.json())
            .then(data => {
                if (Array.isArray(data)) setLightMappings(data);
            })
            .catch(e => { if (e.name !== 'AbortError') console.error('[Mappings] Light error:', e); });

        // 3. Media
        const mediaUrl = `${baseUrl}api/monitored-entities?type=media_player&t=${Date.now()}`;
        fetch(mediaUrl, { signal: controller.signal, headers: authHeaders })
            .then(res => res.json())
            .then(data => {
                if (Array.isArray(data)) setMediaMappings(data);
            })
            .catch(e => { if (e.name !== 'AbortError') console.error('[Mappings] Media error:', e); });

        // 4. Sensors
        const sensorUrl = `${baseUrl}api/sensors?t=${Date.now()}`;
        fetch(sensorUrl, { signal: controller.signal, headers: authHeaders })
            .then(res => res.json())
            .then(data => {
                if (data.success && Array.isArray(data.sensors)) setSensorMappings(data.sensors);
            })
            .catch(e => { if (e.name !== 'AbortError') console.error('[Mappings] Sensor error:', e); });

        // 5. Covers
        const coverUrl = `${baseUrl}api/covers?t=${Date.now()}`;
        fetch(coverUrl, { signal: controller.signal, headers: authHeaders })
            .then(res => res.json())
            .then(data => {
                if (data.success && Array.isArray(data.covers)) setCoverMappings(data.covers);
            })
            .catch(e => { if (e.name !== 'AbortError') console.error('[Mappings] Cover error:', e); });

        // 6. Home Access — selected locks + covers
        const haUrl2 = `${baseUrl}api/home-access?t=${Date.now()}`;
        fetch(haUrl2, { signal: controller.signal, headers: authHeaders })
            .then(res => { if (!res.ok) throw new Error(`home-access ${res.status}`); return res.json(); })
            .then(data => {
                if (data.success) {
                    setSelectedLockIds(data.locks);
                    setSelectedCoverIds(data.covers);
                }
                setHomeAccessFetched(true);
            })
            .catch(e => {
                if (e.name !== 'AbortError') console.error('[Mappings] HomeAccess error:', e);
                setHomeAccessFetched(true);
            });

        // 7. Lock passage configs
        const lockPassageUrl = `${baseUrl}api/lock-passage?t=${Date.now()}`;
        fetch(lockPassageUrl, { signal: controller.signal, headers: authHeaders })
            .then(res => { if (!res.ok) return {}; return res.json(); })
            .then(data => {
                if (data.configs) {
                    setLockPassageConfigs(data.configs);
                    // Build sensor → lock map for socket handler
                    const sensorMap = {};
                    Object.entries(data.configs).forEach(([lockId, pc]) => {
                        if (pc.sensor_entity_id) sensorMap[pc.sensor_entity_id] = lockId;
                    });
                    lockSensorMapRef.current = sensorMap;
                }
            })
            .catch(() => {});
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

    // Initial Load Logic
    useEffect(() => {
        if (!connectionConfig.loaded) return;

        // Reset frigate skeleton for this load cycle
        setFrigateFetched(false);

        const { url: haUrl, token: haToken } = connectionConfig;
    const adminUrl = connectionConfig.adminUrl;
        const adminAuthHeaders = {
            'Authorization': `Bearer ${haToken}`,
            'Content-Type': 'application/json',
        };

        // ... (Admin Config Fetch remains) ...
        const configAbort = new AbortController();

        if (adminUrl) {
            // Append /api/config if not present (assuming env var is base URL)
            const configUrl = (adminUrl.endsWith('/') ? `${adminUrl}api/config` : `${adminUrl}/api/config`) + `?t=${Date.now()}`;
            fetch(configUrl, { method: 'GET', headers: { ...adminAuthHeaders, 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' }, signal: configAbort.signal })
                .then(res => res.json())
                .then(data => {
                    setBadgeConfig(data);
                    locksArmedRef.current = !!data?.locks_armed;
                })
                .catch(err => { if (err.name !== 'AbortError') console.error('[Config] Error loading admin config:', err); });

            // Fetch Alert Rules
            const alertUrl = (adminUrl.endsWith('/') ? `${adminUrl}api/alerts` : `${adminUrl}/api/alerts`) + `?t=${Date.now()}`;
            fetch(alertUrl, { signal: configAbort.signal, headers: adminAuthHeaders })
                .then(res => res.json())
                .then(data => {
                    if (data.success) {
                        setAlertRules(data.rules);
                        alertRulesRef.current = data.rules; // keep ref in sync for socket closure
                    }
                })
                .catch(e => { if (e.name !== 'AbortError') console.log("Alert Rules Error", e); });

            // Fetch monitored+ignored entities list from /api/entities and cache in refs
            const entitiesUrl = (adminUrl.endsWith('/') ? `${adminUrl}api/entities` : `${adminUrl}/api/entities`);
            fetch(entitiesUrl, { signal: configAbort.signal, headers: adminAuthHeaders })
                .then(res => res.json())
                .then(data => {
                    if (data.success && Array.isArray(data.entities)) {
                        // All entities in the MonitoredEntity table
                        monitoredEntitiesRef.current = new Set(data.entities.map(e => e.entity_id));
                        // Subset that the user has muted (ignored=1)
                        ignoredEntitiesRef.current = new Set(
                            data.entities.filter(e => e.ignored).map(e => e.entity_id)
                        );
                        console.log(`[Notifications] Monitored: ${monitoredEntitiesRef.current.size}, Ignored: ${ignoredEntitiesRef.current.size}`);
                    }
                })
                .catch(e => { if (e.name !== 'AbortError') console.log('[Notifications] Entities fetch error:', e); });

            // Fetch Room Tracking Lookup
            const roomTrackingUrl = (adminUrl.endsWith('/') ? `${adminUrl}api/room-tracking/lookup` : `${adminUrl}/api/room-tracking/lookup`);
            fetch(roomTrackingUrl, { signal: configAbort.signal, headers: adminAuthHeaders })
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
            fetch(sensorUrl, { signal: configAbort.signal, headers: adminAuthHeaders })
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
            fetch(coverUrl, { signal: configAbort.signal, headers: adminAuthHeaders })
                .then(res => res.json())
                .then(data => {
                    if (data.success) {
                        console.log(`[Covers] Loaded ${data.covers.length} mappings`);
                        setCoverMappings(data.covers);
                    }
                })
                .catch(e => { if (e.name !== 'AbortError') console.log("Cover Mappings Error", e); });

        }

        // 2. Connect to Home Assistant
        if (haUrl && haToken) {
            service.current = new HAService(haUrl, haToken);
            service.current.connect();
            service.current.subscribe(data => {
                if (data.type === 'connected') {
                    // Fire ALL registry + state calls simultaneously — one round-trip each,
                    // then batch all setStates at once so rooms render in a single pass.
                    Promise.all([
                        service.current.getStates(),
                        service.current.getConfig(),
                        service.current.getDeviceRegistry(),
                        service.current.getEntityRegistry(),
                        service.current.getCategoryRegistry(),
                        service.current.getAreaRegistry(),
                        service.current.getFloorRegistry(),
                        service.current.getConfigEntries().catch(() => []),
                    ]).then(([states, config, devices, regs, cats, areas, floors, configEntries]) => {
                        // Batch all state updates — React 18 batches these automatically
                        setEntities(states || []);
                        if (config?.location_name) setCityName(config.location_name);
                        setRegistryDevices(devices || []);
                        setRegistryEntities(regs || []);
                        setRegistryCategories(cats || []);
                        setRegistryAreas(areas || []);
                        if (floors && floors.length > 0) {
                            const sorted = [...floors].sort((a, b) => (a.level || 0) - (b.level || 0));
                            setRegistryFloors(sorted);
                            setSelectedFloor(sorted[0].floor_id);
                        } else {
                            setRegistryFloors(floors || []);
                        }
                        const maIds = (Array.isArray(configEntries) ? configEntries : [])
                            .filter(e => e?.domain === 'music_assistant' && e?.entry_id)
                            .map(e => e.entry_id);
                        setMusicAssistantEntryIds(maIds);
                        console.log(`[Dashboard] Loaded: ${(states||[]).length} states, ${(areas||[]).length} areas, ${(floors||[]).length} floors, Music Assistant config entries: ${maIds.length}`);
                    }).catch(e => console.log('[Dashboard] Initial load error:', e.message));

                } else if (data.type === 'state_changed' && data.event && data.event.data) {
                    const newState = data.event.data.new_state;
                    const oldState = data.event.data.old_state;
                    if (!newState) return; // Ignore deletions or null states

                    const entityId = newState.entity_id;
                    const newVal   = newState.state;
                    const oldVal   = oldState?.state;
                    const attrs    = newState.attributes || {};
                    const name     = attrs.friendly_name || entityId.replace(/_/g, ' ');
                    const domain   = entityId.split('.')[0];

                    // ── Notification from socket event (real-time, has old→new) ──
                    // Rule:
                    //   1. Entity must be in MonitoredEntity table (monitoredEntitiesRef)
                    //   2. Entity must NOT be ignored (ignoredEntitiesRef)
                    //   3. State must have actually changed
                    //   4. Skip unavailable transitions (device reconnect noise)
                    const isMonitored = monitoredEntitiesRef.current.has(entityId);
                    const isIgnored   = ignoredEntitiesRef.current.has(entityId);

                    // ── Lock / garage / lock-sensor notifications ────────────────
                    // These are handled exclusively by the backend ha-notifier.js,
                    // which reads locks_armed from config.json and sends push to ALL
                    // registered devices. The app never fires these locally so that
                    // arm/disarm set on one device takes effect for every device.
                    //
                    // All other domain notifications (lights, climate, sensors, etc.)
                    // are handled below through the isMonitored / isIgnored path.

                    if (isMonitored && !isIgnored &&
                        newVal !== oldVal &&
                        newVal !== 'unavailable' && oldVal !== 'unavailable') {

                        // Format a nice message — no domain filtering, just presentation
                        let notifTitle = `${name} → ${newVal}`;
                        let notifBody  = `Changed from ${oldVal} to ${newVal}`;
                        let notifCat   = 'default';

                        // ── Lock / garage-cover / lock-sensor — handled by backend only ──
                        // The backend ha-notifier.js sends push to ALL devices based on
                        // locks_armed in config.json. Never fire these locally.
                        const isLockSensorHere = !!lockSensorMapRef.current[entityId];
                        const isCoverGarage    = domain === 'cover' &&
                            (attrs.device_class === 'garage');
                        let skipNotif = false;

                        if (domain === 'lock' || isCoverGarage || isLockSensorHere) {
                            // backend-only — skip local notification
                            skipNotif = true;
                        } else if (domain === 'alarm_control_panel') {
                            notifCat = 'security';
                            const labelMap = {
                                armed_away: 'Armed Away', armed_home: 'Armed Home',
                                armed_night: 'Armed Night', disarmed: 'Disarmed',
                                triggered: '🚨 TRIGGERED', pending: 'Pending', arming: 'Arming',
                            };
                            notifTitle = `Security: ${labelMap[newVal] || newVal}`;
                            notifBody  = `Alarm: ${oldVal} → ${newVal}`;

                        } else if (domain === 'cover') {
                            notifCat   = 'door';
                            notifTitle = newVal === 'open'   ? `${name} Opened`
                                       : newVal === 'closed' ? `${name} Closed`
                                       : `${name} → ${newVal}`;
                            notifBody  = `Cover: ${oldVal} → ${newVal}`;

                        } else if (domain === 'climate') {
                            notifCat   = 'climate';
                            notifTitle = `AC — ${name}`;
                            notifBody  = newVal === 'off' ? 'Turned off' : `Set to ${newVal}`;

                        } else if (domain === 'binary_sensor') {
                            const dClass = attrs.device_class || '';
                            if (['door', 'window', 'opening'].includes(dClass)) {
                                notifCat   = 'door';
                                const opened = newVal === 'on';
                                notifTitle = `${name} ${opened ? 'Opened' : 'Closed'}`;
                                notifBody  = `${dClass.charAt(0).toUpperCase() + dClass.slice(1)} is now ${opened ? 'open' : 'closed'}`;
                            } else if (dClass === 'smoke') {
                                notifCat   = 'security';
                                notifTitle = `🔥 Smoke — ${name}`;
                                notifBody  = newVal === 'on' ? 'Smoke detected!' : 'Smoke cleared';
                            } else if (dClass === 'motion') {
                                notifCat   = 'camera';
                                notifTitle = `Motion — ${name}`;
                                notifBody  = newVal === 'on' ? 'Movement detected' : 'Motion cleared';
                            }

                        } else if (domain === 'light') {
                            notifCat   = 'light';
                            notifTitle = `${name} ${newVal === 'on' ? 'On' : 'Off'}`;
                            notifBody  = `Light turned ${newVal}`;

                        } else if (domain === 'switch') {
                            notifTitle = `${name} ${newVal === 'on' ? 'On' : 'Off'}`;
                            notifBody  = `Switch turned ${newVal}`;

                        } else if (domain === 'scene') {
                            notifCat   = 'scene';
                            notifTitle = `Scene: ${name}`;
                            notifBody  = 'Scene activated';
                        }

                        if (!skipNotif) {
                            pushNotification(notifTitle, notifBody, notifCat);
                        }
                    }

                    // Immediately apply entity state update — no batching delay
                    setEntities(prev => {
                        const index = prev.findIndex(e => e.entity_id === newState.entity_id);
                        if (index !== -1) {
                            const next = [...prev];
                            next[index] = newState;
                            return next;
                        }
                        return [...prev, newState];
                    });
                }
            });
        }

        // 3. Connect to Frigate (proxied through admin backend)
    frigateService.current = new FrigateService('', null, null, connectionConfig.adminUrl, haToken);

        frigateService.current.getConfig().then(config => {
            if (config && config.cameras) {
                const cams = Object.keys(config.cameras).map(key => ({
                    id: key,
                    name: key,
                    ...config.cameras[key]
                }));
                setFrigateCameras(cams);
            }
            setFrigateFetched(true);
        }).catch(() => {
            setFrigateFetched(true);
        });

        // 4. Fetch HA camera entities from admin backend as fallback/supplement
        // These are used when Frigate is unreachable (local IP not accessible remotely)
        if (adminUrl) {
            const camUrl = (adminUrl.endsWith('/') ? `${adminUrl}api/cameras` : `${adminUrl}/api/cameras`) + `?t=${Date.now()}`;
            fetch(camUrl, { headers: adminAuthHeaders })
                .then(res => res.json())
                .then(data => {
                    if (data && Array.isArray(data.cameras) && data.cameras.length > 0) {
                        // Only use HA cameras if Frigate didn't already load cameras
                        setFrigateCameras(prev => {
                            if (prev.length > 0) return prev; // Frigate already loaded, keep it
                            // Map HA camera entities → same shape as Frigate cameras
                            return data.cameras.map(c => ({
                                id: c.entity_id,
                                name: c.entity_id.replace('camera.', ''),
                                friendly_name: c.name,
                                entity_id: c.entity_id,   // marks this as HA camera for snapshot routing
                            }));
                        });
                    }
                })
                .catch(e => console.error('[Cameras] HA cameras fetch error:', e));
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

    const weather = useMemo(() => entities.find(e => e.entity_id.startsWith('weather.')), [entities]);

    // Humidity: from weather entity attributes, or from a dedicated humidity sensor
    const humidity = useMemo(() => {
        const fromWeather = weather?.attributes?.humidity;
        if (fromWeather != null) return Math.round(fromWeather);
        const sensor = entities.find(e =>
            e.entity_id.includes('humidity') && e.entity_id.startsWith('sensor.')
        );
        return sensor ? Math.round(parseFloat(sensor.state)) : null;
    }, [weather, entities]);

    // Indoor temperature: look for a sensor tagged as indoor/room temperature
    const indoorTemp = useMemo(() => {
        const sensor = entities.find(e =>
            e.entity_id.startsWith('sensor.') &&
            (e.entity_id.includes('indoor') || e.entity_id.includes('room')) &&
            (e.entity_id.includes('temperature') || e.entity_id.includes('temp'))
        );
        if (sensor) return Math.round(parseFloat(sensor.state));
        // Fallback: first climate entity's current_temperature
        const climate = entities.find(e => e.entity_id.startsWith('climate.') && e.attributes?.current_temperature);
        return climate ? Math.round(climate.attributes.current_temperature) : null;
    }, [entities]);

    // Security zones for SecurityControlModal dot display
    const securityZones = useMemo(() => {
        const alarmEntity = entities.find(e => e.entity_id.startsWith('alarm_control_panel.'));
        if (!alarmEntity) return [];
        const isArmed = alarmEntity.state !== 'disarmed';
        // Try to find sub-zone binary sensors; fall back to empty so modal uses defaults
        const zoneSensors = entities.filter(e =>
            e.entity_id.startsWith('binary_sensor.') &&
            (e.attributes?.device_class === 'door' || e.attributes?.device_class === 'window' ||
             e.attributes?.device_class === 'motion' || e.entity_id.includes('zone'))
        );
        if (zoneSensors.length > 0) {
            return zoneSensors.slice(0, 6).map(z => ({
                id: z.entity_id,
                name: z.attributes?.friendly_name || z.entity_id.replace(/_/g, ' '),
                detail: z.state === 'on' ? 'Active' : 'Inactive',
                armed: isArmed && z.state !== 'unavailable',
            }));
        }
        return []; // let the modal use its DEFAULT_ZONES
    }, [entities]);

    // ── Security Alert: open locks / garage-shutter covers while armed ──────
    // Resolves the room name for an entity using registryEntities + registryDevices + registryAreas
    const resolveRoomName = useCallback((entityId) => {
        const re = registryEntities.find(r => r.entity_id === entityId);
        const areaId = re?.area_id
            || (re?.device_id ? registryDevices.find(d => d.id === re.device_id)?.area_id : null);
        return registryAreas.find(a => a.area_id === areaId)?.name ?? null;
    }, [registryEntities, registryDevices, registryAreas]);

    const securityAlertItems = useMemo(() => {
        const alarm = entities.find(e => e.entity_id.startsWith('alarm_control_panel.'));
        if (!alarm || alarm.state === 'disarmed') return [];

        const items = [];

        // Open locks
        entities
            .filter(e => e.entity_id.startsWith('lock.') && e.state === 'unlocked')
            .forEach(e => {
                items.push({
                    type: 'lock',
                    name: e.attributes?.friendly_name || e.entity_id.replace('lock.', '').replace(/_/g, ' '),
                    room: resolveRoomName(e.entity_id),
                });
            });

        // Open garage doors / shutters
        entities
            .filter(e => {
                if (!e.entity_id.startsWith('cover.')) return false;
                const dc = e.attributes?.device_class;
                return (dc === 'garage' || dc === 'shutter') && e.state === 'open';
            })
            .forEach(e => {
                items.push({
                    type: 'cover',
                    name: e.attributes?.friendly_name || e.entity_id.replace('cover.', '').replace(/_/g, ' '),
                    room: resolveRoomName(e.entity_id),
                });
            });

        return items;
    }, [entities, resolveRoomName]);

    const [securityAlertDismissed, setSecurityAlertDismissed] = useState(false);
    const [securityAlertVisible, setSecurityAlertVisible] = useState(false);
    const prevAlarmStateRef = useRef(null);

    useEffect(() => {
        const alarm = entities.find(e => e.entity_id.startsWith('alarm_control_panel.'));
        const currentState = alarm?.state ?? null;

        // Reset dismissed flag when alarm transitions to a new armed state
        if (currentState && currentState !== 'disarmed' && currentState !== prevAlarmStateRef.current) {
            setSecurityAlertDismissed(false);
        }
        prevAlarmStateRef.current = currentState;

        if (securityAlertItems.length > 0 && !securityAlertDismissed) {
            setSecurityAlertVisible(true);
        } else {
            setSecurityAlertVisible(false);
        }
    }, [securityAlertItems, securityAlertDismissed, entities]);

    const alarmState = useMemo(() =>
        entities.find(e => e.entity_id.startsWith('alarm_control_panel.'))?.state ?? null,
    [entities]);

    // Active Devices Modal State
    const [modalVisible, setModalVisible] = useState(false);
    const [securityModalVisible, setSecurityModalVisible] = useState(false);
    const [locksModalVisible, setLocksModalVisible] = useState(false);

    const [activeBadgeType, setActiveBadgeType] = useState(null); // 'lights', 'ac', 'doors'

    // Room Sheet State
    const [roomSheetVisible, setRoomSheetVisible] = useState(false);
    const [selectedRoom, setSelectedRoom] = useState(null);

    // Opacity Settings State
    const [cardOpacity, setCardOpacity] = useState(0.4);
    const [cardColor, setCardColor] = useState('#000000');
    const [settingsModalVisible, setSettingsModalVisible] = useState(false);

    // ── Notifications ───────────────────────────────────────────────────────
    const {
        notifications,
        unreadCount:   notifUnread,
        addNotification,
        markAllRead,
        clearAll:      clearAllNotifications,
        refresh:       refreshNotifications,
    } = useNotifications(connectionConfig.adminUrl, connectionConfig.token);
    const [showNotifications, setShowNotifications] = useState(false);
    // Alert modal shown when user taps a push notification
    const [alertNotif, setAlertNotif] = useState(null); // { title, body, category, timestamp }

    // Read the pending notification from context (_layout.jsx captures it via
    // both getLastNotificationResponseAsync [cold start] and the tap listener
    // [background/foreground]). Context is always populated before this screen
    // mounts, so there is no race condition.
    const { pendingNotif, clearNotif } = useContext(NotifContext);
    const handledNotifRef = useRef(false);

    useEffect(() => {
        console.log('[Dashboard] pendingNotif from context:', pendingNotif);
        if (pendingNotif && !handledNotifRef.current) {
            handledNotifRef.current = true;
            console.log('[Dashboard] ✅ Showing alert modal for:', pendingNotif.title);
            setAlertNotif(pendingNotif);
            clearNotif();
        }
    }, [pendingNotif]);

    // When an alert modal is pending, skip the loading cascade so the full
    // dashboard renders behind the modal immediately — no frozen skeleton.
    useEffect(() => {
        if (alertNotif) {
            clearTimeout(revealRef.current);
            setRevealStep(5);
        }
    }, [!!alertNotif]);
    // All entity_ids present in MonitoredEntity table (regardless of ignored flag)
    const monitoredEntitiesRef = useRef(new Set());
    // Entity_ids where ignored=1 (user has muted them)
    const ignoredEntitiesRef = useRef(new Set());
    // Mirror of alertRules in a ref so the socket closure always reads the latest
    const alertRulesRef = useRef([]);
    // Dedup map: `${entity_id}:${state}` → timestamp — suppresses duplicate events
    // within 10 seconds (HA sometimes fires the same event twice in rapid succession)
    const recentNotifsRef = useRef(new Map());
    // Tracks whether lock-alert arm mode is on — kept as a ref so the HA socket
    // callback closure always reads the latest value without needing re-registration.
    const locksArmedRef = useRef(false);
    // Map of sensor_entity_id → lock_entity_id for fast lookup in socket handler
    const lockSensorMapRef = useRef({}); // { "binary_sensor.front_door": "lock.front_door" }

    // Re-fetch /api/entities and update both refs immediately.
    // Called after the user saves changes in MonitoredEntitiesModal so the
    // notification filter is live without needing an app restart.
    const refreshEntityRefs = useCallback(() => {
        const adminUrl = connectionConfig.adminUrl;
        const haToken  = connectionConfig.token;
        if (!adminUrl || !haToken) return;
        const url     = (adminUrl.endsWith('/') ? `${adminUrl}api/entities` : `${adminUrl}/api/entities`);
        const headers = { 'Authorization': `Bearer ${haToken}`, 'Content-Type': 'application/json' };
        fetch(url, { headers })
            .then(res => res.json())
            .then(data => {
                if (data.success && Array.isArray(data.entities)) {
                    monitoredEntitiesRef.current = new Set(data.entities.map(e => e.entity_id));
                    ignoredEntitiesRef.current   = new Set(data.entities.filter(e => e.ignored).map(e => e.entity_id));
                    console.log(`[Notifications] Refs refreshed — Monitored: ${monitoredEntitiesRef.current.size}, Ignored: ${ignoredEntitiesRef.current.size}`);
                }
            })
            .catch(e => console.warn('[Notifications] refreshEntityRefs error:', e));
    }, [connectionConfig.adminUrl, connectionConfig.token]);

    // Derived Logic for Badges
    const getAllActiveDevices = useCallback((type) => {
        if (!registryAreas.length) return [];

        const grouped = [];

        registryAreas.forEach(area => {
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
                        const mapping = sensorMappings.find(m => m.entity_id === e.entity_id);
                        if (mapping && mapping.sensorType === 'door') return true;
                        return false;
                    }
                    return false;
                });

            if (activeInRoom.length > 0) {
                grouped.push({ title: area.name, data: activeInRoom });
            }
        });

        return grouped;
    }, [registryAreas, registryDevices, registryEntities, entities, sensorMappings]);

    const { title: modalTitle, devices: modalDevices } = useMemo(() => {
        if (!activeBadgeType) return { title: '', devices: [] };
        let title = '';
        if (activeBadgeType === 'lights') title = 'Active Lights';
        if (activeBadgeType === 'ac') title = 'Active ACs';
        if (activeBadgeType === 'doors') title = 'All Doors';
        return { title, devices: getAllActiveDevices(activeBadgeType) };
    }, [activeBadgeType, getAllActiveDevices]);

    const handleBadgePress = useCallback((type) => {
        if (type === 'security') {
            setSecurityModalVisible(true);
        } else if (type === 'locks') {
            setLocksModalVisible(true);
        } else {
            setActiveBadgeType(type);
            setModalVisible(true);
        }
    }, []);

    // Save locks_armed to backend config + update local state + ref
    const handleLockArmToggle = useCallback(async (newArmed) => {
        const updatedConfig = { ...badgeConfig, locks_armed: newArmed };
        setBadgeConfig(updatedConfig);
        locksArmedRef.current = newArmed;
        const adminUrl = connectionConfig.adminUrl;
        if (!adminUrl) return;
        const configUrl = adminUrl.endsWith('/') ? `${adminUrl}api/config` : `${adminUrl}/api/config`;
        try {
            await fetch(configUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${connectionConfig.token}` },
                body: JSON.stringify(updatedConfig),
            });
        } catch (e) {
            console.warn('[LockArm] Failed to save to backend:', e.message);
        }
    }, [badgeConfig, connectionConfig]);

    // Calculate Counts from Grouped Data (memoized — these are O(n*m) operations)
    const activeLightsGrouped = useMemo(() => getAllActiveDevices('lights'), [getAllActiveDevices]);
    const lightsOn = activeLightsGrouped.reduce((sum, group) => sum + group.data.length, 0);

    const activeACGrouped = useMemo(() => getAllActiveDevices('ac'), [getAllActiveDevices]);
    const acOn = activeACGrouped.reduce((sum, group) => sum + group.data.length, 0);

    const doorsOpen = useMemo(() => entities.filter(e => {
        const mapping = sensorMappings.find(m => m.entity_id === e.entity_id);
        if (mapping && mapping.sensorType === 'door') {
            const s = e.state.toLowerCase();
            return s === 'open' || s === 'on' || s === 'true' || s === '1';
        }
        return false;
    }).length, [entities, sensorMappings]);

    const { power, securityState } = useMemo(() => {
        let pw = null;
        let sec = 'Unknown';
        if (badgeConfig) {
            const pEntity = entities.find(e => e.entity_id === badgeConfig.power_entity);
            pw = pEntity ? pEntity.state : '--';
            const sEntity = entities.find(e => e.entity_id === badgeConfig.security_entity);
            sec = sEntity ? sEntity.state : 'Unknown';
        } else {
            const pEntity = entities.find(e => e.entity_id.includes('power'));
            pw = pEntity ? pEntity.state : null;
            const sEntity = entities.find(e => e.entity_id.startsWith('alarm_control_panel.'));
            sec = sEntity ? sEntity.state : 'Unknown';
        }
        return { power: pw, securityState: sec };
    }, [entities, badgeConfig]);

    // Fast entity map for sensor overlays on camera cards
    const haEntityMap = useMemo(() => buildEntityMap(entities), [entities]);

    // ── Notification generation from HA state_changed events ────────────────
    // All notifications are fired directly in the socket subscriber (real-time,
    // with old→new state). No useEffect watchers needed — they would duplicate.
    const pushNotification = useCallback((title, body, category) => {
        // Dedup: suppress if same title+body already fired within 10 seconds
        const dedupKey = `${title}::${body}`;
        const now = Date.now();
        const last = recentNotifsRef.current.get(dedupKey);
        if (last && (now - last) < 10_000) return; // duplicate — skip
        recentNotifsRef.current.set(dedupKey, now);
        // Prune stale entries to prevent memory leak
        if (recentNotifsRef.current.size > 50) {
            for (const [k, t] of recentNotifsRef.current) {
                if (now - t > 10_000) recentNotifsRef.current.delete(k);
            }
        }

        // Add to in-memory store (survives background, cleared on full kill)
        addNotification(title, body, category);

        // Fire real OS notification — shows on lock screen, notification centre,
        // and as a banner when the app is backgrounded or the screen is off.
        Notifications.scheduleNotificationAsync({
            content: {
                title,
                body,
                sound: true,
                data: { category, entity_notification: true },
            },
            trigger: null,
        }).catch(() => {});
    }, [addNotification]);

    const handleBellPress = useCallback(() => {
        setShowNotifications(true);
        markAllRead();
    }, [markAllRead]);

    const handleClearNotifications = useCallback(() => {
        clearAllNotifications();
    }, [clearAllNotifications]);

    // Default floor selection
    useEffect(() => {
        if (!currentFloor) {
            setCurrentFloor('home');
        }
    }, []);

    // ── Cold-start tap handled eagerly above (alertReadRef) ───────────────────

    // -------------------------------------------------------------------------
    // -------------------------------------------------------------------------
    // Auto-Room Presentation (User Tracker -> Espresense Match)
    // Optimized: cache tracker entity_id, derive state cheaply, only react to
    // tracker state changes instead of every entity update.
    // -------------------------------------------------------------------------
    const lastActiveRoomRef = useRef(null);
    const lastTrackerStateRef = useRef(null);
    const appState = useRef(AppState.currentState);
    const trackerEntityIdRef = useRef(null);

    // Find tracker entity_id once (stable — doesn't change after initial discovery)
    const trackerEntityId = useMemo(() => {
        if (!userName || entities.length === 0) return trackerEntityIdRef.current;
        // Return cached value if already found
        if (trackerEntityIdRef.current) return trackerEntityIdRef.current;

        const safeUserName = userName.toLowerCase().replace(/ /g, '_');
        let tracker = entities.find(e =>
            e.entity_id.includes(safeUserName) &&
            e.entity_id.includes('room') &&
            !e.entity_id.includes('geocoded')
        );
        if (!tracker) {
            tracker = entities.find(e =>
                e.entity_id.includes(safeUserName) &&
                e.entity_id.includes('location') &&
                !e.entity_id.includes('geocoded')
            );
        }
        if (tracker) trackerEntityIdRef.current = tracker.entity_id;
        return trackerEntityIdRef.current;
    }, [userName, entities.length > 0]);

    // Derive tracker state cheaply — single direct lookup instead of two .includes() scans
    const trackerState = useMemo(() => {
        if (!trackerEntityId) return null;
        const entity = entities.find(e => e.entity_id === trackerEntityId);
        return entity?.state?.toLowerCase() || null;
    }, [entities, trackerEntityId]);

    // Presence navigation logic — only runs when trackerState actually changes
    const navigateToPresenceRoom = useCallback((isResume = false) => {
        if (!roomsWithCounts.length || !userName) return;
        const shouldRun = isResume ? autoRoomResume : autoRoomVisit;
        if (!shouldRun) return;
        if (!trackerState) return;

        if (!isResume && lastTrackerStateRef.current === trackerState) return;
        lastTrackerStateRef.current = trackerState;

        // Ignore generic states
        if (['home', 'not_home', 'unknown', 'unavailable', 'away', 'none'].includes(trackerState)) {
            if (lastActiveRoomRef.current) lastActiveRoomRef.current = null;
            return;
        }

        const mappedAreaId = roomTrackingLookup[trackerState];
        let foundRoom = mappedAreaId ? roomsWithCounts.find(r => r.area_id === mappedAreaId) : null;

        if (foundRoom) {
            if (lastActiveRoomRef.current !== foundRoom.area_id) {
                if (roomSheetVisible && !isResume) {
                    // Sheet already visible, skip
                } else {
                    console.log(`[Auto-Room] Opening room: ${foundRoom.name}`);
                    lastActiveRoomRef.current = foundRoom.area_id;
                    setSelectedRoom(foundRoom);
                    setRoomSheetVisible(true);
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                }
            }
        } else {
            if (lastActiveRoomRef.current !== null) lastActiveRoomRef.current = null;
        }
    }, [trackerState, roomsWithCounts, userName, autoRoomVisit, autoRoomResume, roomTrackingLookup, roomSheetVisible]);

    // Run check only when tracker state changes (not every entity update)
    useEffect(() => {
        navigateToPresenceRoom(false);
    }, [trackerState, navigateToPresenceRoom]);

    // App resume listener — set up ONCE, uses refs for latest values
    const navigateToPresenceRoomRef = useRef(navigateToPresenceRoom);
    navigateToPresenceRoomRef.current = navigateToPresenceRoom;
    const refreshNotificationsRef = useRef(refreshNotifications);
    refreshNotificationsRef.current = refreshNotifications;

    useEffect(() => {
        const subscription = AppState.addEventListener('change', nextAppState => {
            if (
                appState.current.match(/inactive|background/) &&
                nextAppState === 'active'
            ) {
                // Re-check presence on resume
                lastActiveRoomRef.current = null;
                navigateToPresenceRoomRef.current(true);
                // Refresh config
                fetchMappings({ resetRevealCascade: false });

                // Note: notification tap modal (alertNotif) is handled automatically
                // by useLastNotificationResponse() — no SecureStore polling needed here.
            }
            appState.current = nextAppState;
            updateAppState(nextAppState === 'active' ? 'foreground' : 'background');
        });

        return () => { subscription.remove(); };
    }, []); // Empty deps — listener set up once, reads latest via refs

    // Heartbeat for user session tracking
    useEffect(() => {
        if (connectionConfig.loaded && connectionConfig.adminUrl && userId) {
            startHeartbeat(connectionConfig.adminUrl, userId, userName);
        }
        return () => stopHeartbeat();
    }, [connectionConfig.loaded, connectionConfig.adminUrl, userId, userName]);

    const callService = useCallback((domain, serviceName, serviceData) => {
        if (service.current) {
            // ── Optimistic update ────────────────────────────────────────────
            // For light/switch/fan toggles, instantly flip the UI state so the
            // user sees the change immediately without waiting for the HA event.
            const entityId = serviceData?.entity_id;
            if (entityId && typeof entityId === 'string') {
                const optimisticState =
                    serviceName === 'turn_on'  ? 'on'  :
                    serviceName === 'turn_off' ? 'off' :
                    serviceName === 'toggle'   ? null  : // handled below
                    null;

                setEntities(prev => {
                    const index = prev.findIndex(e => e.entity_id === entityId);
                    if (index === -1) return prev;

                    const current = prev[index];
                    const nextState =
                        optimisticState !== null ? optimisticState :
                        (current.state === 'on' ? 'off' : 'on'); // toggle

                    const next = [...prev];
                    next[index] = { ...current, state: nextState };
                    return next;
                });
            }
            // ────────────────────────────────────────────────────────────────

            return service.current.callService(domain, serviceName, serviceData)
                .catch((err) => {
                    console.warn('[callService] Failed:', domain, serviceName, err?.message ?? err);
                    // Revert optimistic update on failure by re-fetching states
                    service.current?.getStates?.()?.then(states => {
                        if (states) setEntities(states);
                    });
                });
        }
        console.warn('[callService] HA service not connected');
        return Promise.resolve();
    }, []);

    const handleScenePress = useCallback((sceneId) => {
        console.log('Scene pressed:', sceneId);
        const domain = sceneId.split('.')[0];
        callService(domain, 'turn_on', { entity_id: sceneId });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }, [callService]);



    const handleVoiceCommand = async (command) => {
        console.log('[Dashboard] Voice command:', command);
        if (command.action === 'call_service') {
            await callService(command.domain, command.service, command.service_data);
        }
    };

    const handleRoomPress = useCallback((room) => {
        if (activeTab === 'rooms') {
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
    }, [activeTab]);

    const handleHeaderRoomPress = useCallback(() => {
        const personEntity = entities.find(e =>
            e.entity_id.startsWith('person.') &&
            (e.attributes?.friendly_name?.toLowerCase() === userName?.toLowerCase() ||
                e.entity_id.includes(userName?.toLowerCase()))
        );

        const currentLocation = personEntity?.state;
        if (!currentLocation || currentLocation === 'home' || currentLocation === 'not_home') return;

        const currentRoom = registryAreas.find(area =>
            area.name?.toLowerCase() === currentLocation.toLowerCase() ||
            area.area_id?.toLowerCase() === currentLocation.toLowerCase()
        );

        if (currentRoom) {
            setSelectedRoom(currentRoom);
            setRoomSheetVisible(true);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
    }, [entities, userName, registryAreas]);



    const handleTabPress = useCallback((tabId) => {
        if (tabId === 'tablet') {
            router.push('/dashboard-v2-tablet');
        } else {
            setActiveTab(tabId);
        }
    }, []);

    const handleSettingChange = useCallback((key, val) => {
        if (key === 'showFamily') setShowFamily(val);
        if (key === 'autoRoomVisit') setAutoRoomVisit(val);
        if (key === 'autoRoomResume') setAutoRoomResume(val);
        if (key === 'showVoiceAssistant') setShowVoiceAssistant(val);
        if (key === 'showPreferenceButton') setShowPreferenceButton(val);
    }, []);

    const handleNetworkPress = useCallback(() => setShowNetworkModal(true), []);
    const handleAiExit = useCallback(() => setActiveTab('home'), []);
    const handleOpenOpacitySettings = useCallback(() => setSettingsModalVisible(true), []);

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
            const roomEntities = getRoomEntities(area, registryDevices, registryEntities, entities, sensorMappings, coverMappings, mediaMappings, musicAssistantEntryIds);

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
        coverMappings,
        mediaMappings,
        musicAssistantEntryIds,
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

    const LoadingSpinner = () => (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <ActivityIndicator size="large" color="#8947ca" />
        </View>
    );

    const availableFloors = useMemo(() =>
        registryFloors.sort((a, b) => (a.level || 0) - (b.level || 0)),
        [registryFloors]
    );

    const filteredRooms = useMemo(() =>
        roomsWithCounts.filter(room => {
            const area = registryAreas.find(a => a.area_id === room.area_id);
            if (availableFloors.length === 0) return true;
            if (!selectedFloor) return true;
            const areaFloorId = area ? (area.floor_id || area.floor) : null;
            return areaFloorId === selectedFloor;
        }),
        [roomsWithCounts, registryAreas, availableFloors, selectedFloor]
    );

    const homeLocks = useMemo(() => entities.filter(e => {
        if (!e.entity_id.startsWith('lock.')) return false;
        // If selected_locks is configured, use it; otherwise fall back to area-based
        if (selectedLockIds && selectedLockIds.length > 0) {
            return selectedLockIds.includes(e.entity_id);
        }
        if (selectedLockIds !== null) return false; // configured but empty → hide all
        const reg = registryEntities.find(re => re.entity_id === e.entity_id);
        if (!reg) return false;
        const activeRoomIds = roomsWithCounts.map(r => r.area_id);
        let areaId = reg.area_id;
        if (!areaId && reg.device_id) {
            const dev = registryDevices.find(d => d.id === reg.device_id);
            areaId = dev?.area_id;
        }
        return areaId && activeRoomIds.includes(areaId);
    }), [entities, selectedLockIds, registryEntities, registryDevices, roomsWithCounts]);

    // Garage-only covers for the edit modal (shutters now live in room curtains)
    const allHomeAccessCovers = useMemo(() => {
        return coverMappings
            .filter(m => m.coverType === 'garage')
            .map(m => ({
                entity_id: m.entity_id,
                coverType: m.coverType,
                name: entities.find(e => e.entity_id === m.entity_id)?.attributes?.friendly_name || m.entity_id,
            }));
    }, [coverMappings, entities]);

    // Garage door covers for home screen (global, not per-room) — shutters now live inside room curtains
    const homeCovers = useMemo(() => {
        const garageOnly = ['garage'];
        return coverMappings
            .filter(m => {
                if (!garageOnly.includes(m.coverType)) return false;
                // If selectedCoverIds is configured, filter by it; null = show all
                if (selectedCoverIds !== null) return selectedCoverIds.includes(m.entity_id);
                return true;
            })
            .map(m => {
                const stateObj = entities.find(e => e.entity_id === m.entity_id);
                if (!stateObj) return null;
                const position = stateObj.attributes?.current_position ?? null;
                // Use position if available (more reliable than state string)
                // < 5% open  → treat as closed  (nearly fully closed)
                // >= 5% open → treat as open
                // Fall back to state string if position not reported
                let isOpen;
                if (position !== null) {
                    isOpen = position >= 5;
                } else {
                    isOpen = stateObj.state === 'open' || stateObj.state === 'opening';
                }
                return {
                    entity_id: m.entity_id,
                    coverType: m.coverType,
                    name: stateObj.attributes?.friendly_name || m.entity_id,
                    state: stateObj.state,
                    position,
                    isOpen,
                    isOpening: stateObj.state === 'opening',
                    isClosing: stateObj.state === 'closing',
                    garageDurationMs: m.garageDuration ? m.garageDuration * 1000 : 20000,
                };
            })
            .filter(Boolean);
    }, [coverMappings, entities, selectedCoverIds]);

    return (
        <View style={styles.container}>
            <Stack.Screen options={{ headerShown: false }} />
            <LinearGradient
                colors={['#09091A', '#09091A', '#09091A']}
                style={styles.background}
            />
            <StatusBar style="light" />

            {securityModalVisible && (
                <SecurityControlModal
                    visible={securityModalVisible}
                    onClose={() => setSecurityModalVisible(false)}
                    entity={entities.find(e => e.entity_id.startsWith('alarm_control_panel.'))}
                    onCallService={callService}
                    zones={securityZones}
                />
            )}

            <NotificationModal
                visible={showNotifications}
                notifications={notifications}
                onClose={() => setShowNotifications(false)}
                onClearAll={handleClearNotifications}
                onOpen={refreshNotifications}
            />

            {/* Alert modal — shown when user taps a push notification */}
            <AlertNotificationModal
                visible={!!alertNotif}
                title={alertNotif?.title}
                body={alertNotif?.body}
                category={alertNotif?.category}
                timestamp={alertNotif?.timestamp}
                onDismiss={() => setAlertNotif(null)}
                onViewAll={() => { setAlertNotif(null); setShowNotifications(true); }}
            />

            {/* Security alert — shown when home is armed and a lock/cover is open */}
            <SecurityAlertModal
                visible={securityAlertVisible}
                items={securityAlertItems}
                armedState={alarmState}
                onDismiss={() => { setSecurityAlertDismissed(true); setSecurityAlertVisible(false); }}
            />

            {locksModalVisible && (
                <LocksModal
                    visible={locksModalVisible}
                    locks={entities.filter(e => e.entity_id.startsWith('lock.'))}
                    lockPassageConfigs={lockPassageConfigs}
                    entities={entities}
                    onClose={() => setLocksModalVisible(false)}
                    isArmed={!!badgeConfig?.locks_armed}
                    onArmToggle={handleLockArmToggle}
                    adminUrl={connectionConfig.adminUrl}
                    haToken={connectionConfig.token}
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
                    cameraSensors={badgeConfig?.camera_sensors || {}}
                    haEntities={entities}
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

            {/* ===== HOME TAB ===== */}
            <View style={[{ flex: 1 }, activeTab !== 'home' && { display: 'none' }]}>
                {!connectionConfig.loaded ? <DashboardSkeleton /> : (
                    <ScrollView contentContainerStyle={[styles.content, isLandscape && sidebarPadding]}>

                        {/* ── Header + Locks ── step 1 */}
                        {revealStep < 1 ? <HeaderSkeleton /> : (
                            <>
                                <HeaderV2
                                    weather={weather}
                                    cityName={cityName}
                                    userName={userName}
                                    entities={entities}
                                    config={badgeConfig}
                                    humidity={humidity}
                                    indoorTemp={indoorTemp}
                                    onRoomPress={handleHeaderRoomPress}
                                    onBellPress={handleBellPress}
                                    unreadCount={notifUnread}
                                />
                                <StatusBadges
                                    securityState={securityState}
                                    lightsOn={lightsOn}
                                    acOn={acOn}
                                    doorsOpen={doorsOpen}
                                    power={power}
                                    onPress={handleBadgePress}
                                    zones={securityZones}
                                    locks={entities.filter(e => e.entity_id.startsWith('lock.'))}
                                    lockPassageConfigs={lockPassageConfigs}
                                    entities={entities}
                                />
                                <View style={styles.divider} />
                                {showFamily && <PersonBadges entities={entities} alertRules={alertRules} haUrl={haHttpUrl} />}
                            </>
                        )}

                        {/* ── Scenes ── step 2 */}
                        {revealStep < 2 ? <ScenesSkeleton /> : (
                            <QuickScenes
                                scenes={quickScenesData}
                                onScenePress={handleScenePress}
                                adminUrl={connectionConfig?.adminUrl}
                                onScenesUpdated={(ids) => setAllowedQuickScenes(ids)}
                            />
                        )}

                        {/* Voice assistant — only shown once entities are ready */}
                        {showVoiceAssistant && entities.length > 0 && <VoiceConversation
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

                        {/* ── Home Access ── step 3 */}
                        {revealStep < 3 ? <HomeAccessSkeleton /> : (
                            <HomeAccess
                                isHomeActive={activeTab === 'home'}
                                locks={homeLocks}
                                covers={homeCovers}
                                allLockEntities={entities.filter(e => e.entity_id.startsWith('lock.'))}
                                haEntities={entities}
                                lockPassageConfigs={lockPassageConfigs}
                                adminUrl={connectionConfig.adminUrl}
                                haToken={connectionConfig.token}
                                onConfigSaved={() => fetchMappings({ resetRevealCascade: false })}
                                onToggleLock={(entityId, state) => {
                                    const isUnlocked = state === 'unlocked' || state === 'open';
                                    callService('lock', isUnlocked ? 'lock' : 'unlock', { entity_id: entityId });
                                }}
                                onControlCover={(entityId, action) => {
                                    callService('cover', action, { entity_id: entityId });
                                }}
                            />
                        )}

                        {/* ── Rooms ── step 4 */}
                        {revealStep < 4 ? <RoomsSkeleton /> : (
                            <RoomsList
                                rooms={roomsWithCounts}
                                registryEntities={registryEntities}
                                allEntities={entities}
                                onRoomPress={handleRoomPress}
                                overlayOpacity={cardOpacity}
                                overlayColor={cardColor}
                                onSettingsPress={handleOpenOpacitySettings}
                                onAllRoomsPress={() => setActiveTab('rooms')}
                                layout={isTablet ? 'grid' : 'horizontal'}
                                columns={columns}
                                haUrl={haHttpUrl}
                                haToken={connectionConfig.token}
                                sensorMappings={sensorMappings}
                            />
                        )}

                        {/* ── Cameras ── step 5 */}
                        {revealStep < 5 ? <CamerasSkeleton /> : (
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
                            />
                        )}

                    </ScrollView>
                )}
            </View>

            {/* ===== ROOMS TAB ===== */}
            <View style={[{ flex: 1 }, activeTab !== 'rooms' && { display: 'none' }]}>
                {entities.length === 0 ? <DashboardSkeleton /> : (
                    <ScrollView
                        style={{ flex: 1 }}
                        contentContainerStyle={[styles.content, { paddingHorizontal: 20, marginTop: 60, paddingBottom: 120 }, isLandscape && sidebarPadding]}
                        showsVerticalScrollIndicator={false}
                        keyboardShouldPersistTaps="handled"
                    >
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
                                    onSettingsPress={handleOpenOpacitySettings}
                                    layout="grid"
                                    columns={columns}
                                    haUrl={haHttpUrl}
                                    haToken={connectionConfig.token}
                                    sensorMappings={sensorMappings}
                                />
                            </>
                        )}
                    </ScrollView>
                )}
            </View>

            {/* ===== CCTV TAB — WebViews only rendered when active (too heavy to keep in background) ===== */}
            <View style={[{ flex: 1 }, activeTab !== 'cctv' && { display: 'none' }]}>
                {activeTab === 'cctv' ? (
                    frigateCameras.length === 0 ? <DashboardSkeleton /> : (
                        <View style={{ flex: 1, marginTop: 60 }}>
                            {/* Cameras / Events toggle */}
                            <View style={styles.cctvToggleRow}>
                                <Text style={styles.sectionTitle}>Security Cameras</Text>
                                <View style={styles.cctvToggle}>
                                    <TouchableOpacity
                                        style={[styles.cctvToggleBtn, cctvView === 'cameras' && styles.cctvToggleBtnActive]}
                                        onPress={() => setCctvView('cameras')}
                                        activeOpacity={0.7}
                                    >
                                        <Text style={[styles.cctvToggleText, cctvView === 'cameras' && styles.cctvToggleTextActive]}>
                                            Cameras
                                        </Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={[styles.cctvToggleBtn, cctvView === 'events' && styles.cctvToggleBtnActive]}
                                        onPress={() => setCctvView('events')}
                                        activeOpacity={0.7}
                                    >
                                        <Text style={[styles.cctvToggleText, cctvView === 'events' && styles.cctvToggleTextActive]}>
                                            Events
                                        </Text>
                                    </TouchableOpacity>
                                </View>
                            </View>

                            {cctvView === 'cameras' ? (
                                <ScrollView contentContainerStyle={[styles.content, isLandscape && sidebarPadding]}>
                                    <CamerasList
                                        frigateCameras={frigateCameras}
                                        service={frigateService.current}
                                        onCameraPress={handleFrigateCameraPress}
                                        columns={columns}
                                        cameraSensors={badgeConfig?.camera_sensors || {}}
                                        entityMap={haEntityMap}
                                    />
                                </ScrollView>
                            ) : (
                                <FrigateEventsFeed
                                    adminUrl={connectionConfig.adminUrl}
                                    authHeaders={{ Authorization: `Bearer ${connectionConfig.token}` }}
                                    frigateService={frigateService.current}
                                    frigateCameras={frigateCameras}
                                    onEventPress={(event) => {
                                        // Open camera modal on the camera that detected the event
                                        const cam = frigateCameras.find(c => (c.name || c.id) === event.camera);
                                        if (cam) handleFrigateCameraPress(cam);
                                    }}
                                />
                            )}
                        </View>
                    )
                ) : null}
            </View>

            {/* ===== AI TAB — mounts on first visit, stays mounted (preserves conversation) ===== */}
            <View style={[{ flex: 1 }, activeTab !== 'ai' && { display: 'none' }]}>
                {aiTabVisited ? (
                    <BrainView
                        entities={entities}
                        callService={callService}
                        registryDevices={registryDevices}
                        registryEntities={registryEntities}
                        registryAreas={registryAreas}
                        onExit={handleAiExit}
                        haUrl={haHttpUrl}
                        haToken={connectionConfig.token}
                    />
                ) : null}
            </View>

            {/* ===== SETTINGS TAB — unmount when hidden (rarely visited, no state to preserve) ===== */}
            <View style={[{ flex: 1 }, activeTab !== 'settings' && { display: 'none' }]}>
                {activeTab === 'settings' ? <SettingsView
                    areas={(badgeConfig?.selected_areas && badgeConfig.selected_areas.length > 0) ? badgeConfig.selected_areas : registryAreas}
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
                    onSettingChange={handleSettingChange}
                    onNetwork={handleNetworkPress}
                    onEntitiesChanged={refreshEntityRefs}
                    musicAssistantEntryIds={musicAssistantEntryIds}
                /> : null}
            </View>

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
                    haUrl={haHttpUrl}
                    haToken={connectionConfig.token}
                    showPreferenceButton={showPreferenceButton}
                    sensorMappings={sensorMappings}
                    coverMappings={coverMappings}
                    musicAssistantEntryIds={musicAssistantEntryIds}
                    browseMedia={(entityId, mediaContentType, mediaContentId) =>
                        service.current?.browseMedia?.(entityId, mediaContentType, mediaContentId)
                    }
                    callServiceWithResponse={(domain, serviceName, serviceData) =>
                        service.current?.callService?.(domain, serviceName, serviceData, { returnResponse: true })
                    }
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
    topShadow: {
        position: 'absolute',
        top: 42.82,
        width: 521.82,
        height: 462.37,
        alignSelf: 'center',
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
    cctvToggleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        marginBottom: 4,
    },
    cctvToggle: {
        flexDirection: 'row',
        backgroundColor: 'rgba(255,255,255,0.06)',
        borderRadius: 22,
        padding: 3,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    cctvToggleBtn: {
        paddingHorizontal: 16,
        paddingVertical: 6,
        borderRadius: 18,
    },
    cctvToggleBtnActive: {
        backgroundColor: 'rgba(137,71,202,0.3)',
    },
    cctvToggleText: {
        color: 'rgba(255,255,255,0.4)',
        fontSize: 13,
        fontWeight: '500',
    },
    cctvToggleTextActive: {
        color: '#c49ef0',
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
