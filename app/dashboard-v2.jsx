import { useRef, useState, useEffect, useMemo, useCallback, useContext } from 'react';
import FrigateCameraModal from '../components/DashboardV2/FrigateCameraModal';
import NotificationModal from '../components/DashboardV2/NotificationModal';
import ButlerVoiceModal from '../components/DashboardV2/ButlerVoiceModal';
import { canOpenButlerCall, requestButlerMicPermission, runButlerBackgroundSetup } from '../services/butler/openButlerCall';
import { getButlerBackendUrl } from '../utils/butlerBackend';
import { fetchEnrichedLightMappings } from '../utils/lightMappingsClient';
import { CF } from '../utils/typography';
import AlertNotificationModal from '../components/DashboardV2/AlertNotificationModal';
import SecurityAlertModal from '../components/DashboardV2/SecurityAlertModal';

import { MaterialCommunityIcons } from '@expo/vector-icons';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, AppState, Alert, InteractionManager } from 'react-native';
import HomeCameraStrip from '../components/DashboardV2/HomeCameraStrip';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import HeaderV2 from '../components/DashboardV2/HeaderV2';
import AccountSwitcherModal from '../components/DashboardV2/AccountSwitcherModal';
import StatusBadges from '../components/DashboardV2/StatusBadges';
import PersonBadges from '../components/DashboardV2/PersonBadges';
import LocksModal from '../components/DashboardV2/LocksModal';
import DevicesToggleModal from '../components/DashboardV2/DevicesToggleModal';
import SettingsView from '../components/DashboardV2/SettingsView';
import { HAService } from '../services/ha';
import { Stack, useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { ensureAccountsMigrated } from '../services/accounts';
import * as Haptics from 'expo-haptics';
import NetworkModal from '../components/DashboardV2/NetworkModal';
import QuickScenes from '../components/DashboardV2/QuickScenes';
import DraggableRoomList from '../components/DashboardV2/DraggableRoomList';
import RoomsList from '../components/DashboardV2/RoomsList';
import CamerasList from '../components/DashboardV2/CamerasList';
import FrigateEventsFeed from '../components/DashboardV2/FrigateEventsFeed';
import { buildEntityMap } from '../components/DashboardV2/CameraSensorOverlay';
import TabBar from '../components/DashboardV2/TabBar';
import TabletSidebar from '../components/DashboardV2/TabletSidebar';
import useDeviceType from '../hooks/useDeviceType';
import useNotifications from '../hooks/useNotifications';
import RoomSheet from '../components/DashboardV2/RoomSheet';
import HomeAccess from '../components/DashboardV2/HomeAccess';
import BrainView from '../components/DashboardV2/BrainView';

import { FrigateService } from '../services/frigate';
import * as SecureStore from 'expo-secure-store';
import { startHeartbeat, stopHeartbeat, updateAppState } from '../services/heartbeat';
import { getRoomEntities, getEntityIdsForAreaIds } from '../utils/roomHelpers';
import { isClimatePoweredOn } from '../utils/acPowerSwitch';
import { isCoverUiOpen } from '../utils/coverWindows';
import {
    collectGroupedLightMemberIds,
    isLightCountableUnit,
} from '../utils/lightCapabilities';
import {
    filterParentRoomsForDashboard,
    getRoomAreaGroup,
    getSelectedAreasForDashboard,
    cachedRoomsForHome,
} from '../utils/roomAreas';
import { filterHomeLocks, readHomeAccessFromConfig } from '../utils/homeAccess';
import {
    fetchAppRole,
    fetchRoleCameras,
    canShowScreen,
    roleCanSeeCameras,
    filterHomeCameraIds,
    filterCamerasForRole,
    filterRoomsForRole,
    areaAllowedForRole,
    areaVisibleForRole,
    selectedCameraIdsForRole,
    camerasForRoleDisplay,
    PENDING_APP_ROLE,
    hasAppUserIdentity,
} from '../services/appRole';
import { fetchBackendHaSnapshot, applyBackendHaSnapshot, fetchLockStates, mergeEntitySlice } from '../services/haBackendCache';
import { setRoomPageBootstrap, clearRoomPageBootstrap } from '../utils/roomPageBootstrap';
import { applyHaStateChangedEvent, applyClimateServiceToEntity } from '../utils/haEntityMerge';
import { HA_STATUS, ADMIN_STATUS, isBadEntityState } from '../utils/haEntityHealth';
import { useHaSystemHealth } from '../hooks/useHaSystemHealth';
import HaSystemBanner from '../components/DashboardV2/HaSystemBanner';
import { NotifContext } from '../services/NotifContext';
import { logOperationalIssue } from '../utils/devLog';
import {
    loadDashboardSnapshot,
    saveDashboardSnapshot,
    applyDashboardSnapshot,
    bootValue,
    peekBootProfile,
    peekDashboardSnapshot,
    rememberBootProfile,
    resetHomeDashboardState,
    startBackgroundBoot,
    toHaHttpUrl,
} from '../utils/dashboardCache';
import { loadHaProfiles, saveHaProfiles, mergeActiveProfileUrls } from '../utils/storage';
import {
    connectionConfigFromProfile,
    connectionConfigFromBoot,
    withFailoverUrls,
} from '../services/connectionEndpoints';
import { probeDashboard, applyBootstrapHaToConfig } from '../services/homeBootstrap';

export default function DashboardV2() {
    const router = useRouter();
    const { userName: userNameParam, userId: userIdParam, switchKey: switchKeyParam } = useLocalSearchParams();
    const userName = Array.isArray(userNameParam) ? userNameParam[0] : userNameParam;
    const userId = Array.isArray(userIdParam) ? userIdParam[0] : userIdParam;
    const switchKey = Array.isArray(switchKeyParam) ? switchKeyParam[0] : switchKeyParam;
    const { isTablet, isLandscape, columns } = useDeviceType();
    const homeColumns = isTablet ? 4 : 2;
    const homeRoomColumns = isTablet ? 6 : 2;

    const bootProf = peekBootProfile();
    const [bootReady, setBootReady] = useState(() => !!(peekDashboardSnapshot() || bootProf));
    const [showCameras, setShowCameras] = useState(false);

    // Config State
    const [connectionConfig, setConnectionConfig] = useState(() => connectionConfigFromBoot(bootProf));
    const [haStatus, setHaStatus] = useState(HA_STATUS.LOADING);
    const [adminStatus, setAdminStatus] = useState(ADMIN_STATUS.UNKNOWN);

    const service = useRef(null);
    const frigateService = useRef(null); // Frigate Service Ref
    const profileIdRef = useRef(bootProf?.profileId || null);
    const homeKeyRef = useRef(`${bootProf?.profileId || ''}::${toHaHttpUrl(bootProf?.url || '').replace(/\/+$/, '').toLowerCase()}`);
    const haLiveRef = useRef(false);
    const saveTimerRef = useRef(null);

    const [entities, setEntities] = useState(() => bootValue('entities', []));
    const [cityName, setCityName] = useState(() => bootValue('cityName', 'Home'));
    const [badgeConfig, setBadgeConfig] = useState(() => bootValue('badgeConfig', null));
    const [currentFloor, setCurrentFloor] = useState(null);
    const [activeTab, setActiveTab] = useState('home');
    const [cctvView, setCctvView] = useState('cameras'); // 'cameras' | 'events'
    const [allowedScreens, setAllowedScreens] = useState(null);
    const [appRole, setAppRole] = useState(null);
    const [frigateCameras, setFrigateCameras] = useState(() => bootValue('frigateCameras', []));
    const [haCameras, setHaCameras] = useState([]);
    const [backendCameras, setBackendCameras] = useState(null);
    const [userHomeCameras, setUserHomeCameras] = useState(null);
    /** First Frigate config fetch finished (success or fail) — camera strip uses skeleton until then to avoid a blank gap. */
    const [frigateConfigResolved, setFrigateConfigResolved] = useState(false);
    const [selectedFrigateCamera, setSelectedFrigateCamera] = useState(null);
    const [showFrigateModal, setShowFrigateModal] = useState(false);
    const [frigateInitialView, setFrigateInitialView] = useState('live'); // 'live' or 'history'
    const [showNetworkModal, setShowNetworkModal] = useState(false);
    const [showAccountSwitcher, setShowAccountSwitcher] = useState(false);
    const [roomTrackingLookup, setRoomTrackingLookup] = useState(() => bootValue('roomTrackingLookup', {}));

    // Settings State
    const [showFamily, setShowFamily] = useState(false);
    const [autoRoomVisit, setAutoRoomVisit] = useState(true);
    const [autoRoomResume, setAutoRoomResume] = useState(true);
    const [showPreferenceButton, setShowPreferenceButton] = useState(true);

    const haHttpUrl = useMemo(() => {
        if (connectionConfig.url) return toHaHttpUrl(connectionConfig.url);
        return bootValue('haHttpUrl', '');
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
        (async () => {
            try {
                const [
                    showFamilyVal,
                    autoVisitVal,
                    autoResumeVal,
                    prefBtnVal,
                    roomOrderVal,
                ] = await Promise.all([
                    SecureStore.getItemAsync('settings_show_family'),
                    SecureStore.getItemAsync('settings_auto_room_visit'),
                    SecureStore.getItemAsync('settings_auto_room_resume'),
                    SecureStore.getItemAsync('settings_show_preference_button'),
                    SecureStore.getItemAsync('room_reorder_config'),
                ]);
                if (showFamilyVal !== null) setShowFamily(showFamilyVal === 'true');
                if (autoVisitVal !== null) setAutoRoomVisit(autoVisitVal === 'true');
                if (autoResumeVal !== null) setAutoRoomResume(autoResumeVal === 'true');
                if (prefBtnVal !== null) setShowPreferenceButton(prefBtnVal === 'true');
                if (roomOrderVal !== null) {
                    try {
                        setSavedRoomOrder(JSON.parse(roomOrderVal));
                    } catch (e) {
                        console.log('Error parsing room order:', e);
                    }
                }
            } catch (e) {
                console.log('[Dashboard] Settings load error:', e);
            }
        })();

        void (async () => {
            await startBackgroundBoot();
            await loadConnectionConfig();
            setBootReady(true);
            void getButlerBackendUrl();
        })();
    }, []);

    useEffect(() => {
        const id = requestAnimationFrame(() => {
            requestAnimationFrame(() => setShowCameras(true));
        });
        return () => cancelAnimationFrame(id);
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
                    const cfg = connectionConfigFromProfile(activeProfile);
                    const nextHomeKey = `${activeProfileId}::${toHaHttpUrl(cfg.url).replace(/\/+$/, '').toLowerCase()}`;
                    const homeChanged = homeKeyRef.current !== nextHomeKey;
                    const dashboardUiSetters = {
                        setEntities,
                        setCityName,
                        setRegistryDevices,
                        setRegistryEntities,
                        setRegistryAreas,
                        setRegistryFloors,
                        setBadgeConfig,
                        setAllowedQuickScenes,
                        setSelectedLockIds,
                        setSelectedCoverIds,
                        setLockPassageConfigs,
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
                    };

                    console.log('[Dashboard] Loaded active profile:', activeProfile.name);
                    if (homeChanged) {
                        haLiveRef.current = false;
                        if (saveTimerRef.current) {
                            clearTimeout(saveTimerRef.current);
                            saveTimerRef.current = null;
                        }
                        HAService.disconnectAll();
                        resetHomeDashboardState(dashboardUiSetters);
                        setAppRole(null);
                        setAllowedScreens(null);
                        setSavedRoomOrder([]);
                        setFrigateConfigResolved(false);
                        setHaCameras([]);
                        setBackendCameras(null);
                        setUserHomeCameras(null);
                        clearRoomPageBootstrap();
                        try {
                            await SecureStore.deleteItemAsync('room_reorder_config');
                        } catch {
                            // ignore
                        }
                    }
                    homeKeyRef.current = nextHomeKey;
                    profileIdRef.current = activeProfileId;
                    rememberBootProfile({
                        profileId: activeProfileId,
                        url: cfg.url,
                        token: cfg.token,
                        adminUrl: cfg.adminUrl,
                        haUrlLive: cfg.haUrlLive,
                        haUrlLocal: cfg.haUrlLocal,
                        adminUrlLive: cfg.adminUrlLive,
                        adminUrlLocal: cfg.adminUrlLocal,
                    });
                    const snapshot = await loadDashboardSnapshot(activeProfileId, { haUrl: cfg.url });
                    if (snapshot && !haLiveRef.current) {
                        applyDashboardSnapshot(snapshot, dashboardUiSetters);
                    }
                    setConnectionConfig(cfg);
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

    const handleAccountSwitched = useCallback(async (account) => {
        const nextName = account?.name || '';
        const nextId = account?.userId || '';
        router.setParams({
            userName: nextName,
            userId: nextId,
            switchKey: String(Date.now()),
        });
        setActiveTab('home');
        setRoomSheetVisible(false);
        setSelectedRoom(null);
        setAppRole(null);
        setAllowedScreens(null);
        haLiveRef.current = false;
        if (account?.profileId && account.profileId !== profileIdRef.current) {
            setConnectionConfig({ url: '', token: '', adminUrl: '', loaded: false });
        }
        setTimeout(() => {
            loadConnectionConfig();
        }, 0);
    }, [router]);

    const handleAddAccount = useCallback(() => {
        loadHaProfiles()
            .then((list) => { if (list.length) return saveHaProfiles(list); })
            .catch(() => {});
        router.push({ pathname: '/login', params: { mode: 'addAccount' } });
    }, [router]);

    const handleEditHome = useCallback(() => {
        router.push({ pathname: '/login', params: { mode: 'editHome' } });
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
                    let user = {};
                    try {
                        user = JSON.parse(userJson);
                    } catch {
                        return;
                    }
                    const nextName = user.name || '';
                    const nextId = user.userId || '';
                    if (nextName !== (userName || '') || nextId !== (userId || '')) {
                        router.setParams({
                            userName: nextName,
                            userId: nextId,
                            switchKey: String(Date.now()),
                        });
                    }
                    let nextHomeKey = homeKeyRef.current;
                    if (activeProfileId) {
                        const profiles = await loadHaProfiles();
                        const activeProfile = profiles.find((p) => p.id === activeProfileId);
                        const cfg = activeProfile ? connectionConfigFromProfile(activeProfile) : null;
                        nextHomeKey = `${activeProfileId}::${toHaHttpUrl(cfg?.url || activeProfile?.haUrl || '').replace(/\/+$/, '').toLowerCase()}`;
                        if (cfg && nextHomeKey === homeKeyRef.current) {
                            setConnectionConfig(cfg);
                        }
                    }
                    if (activeProfileId && nextHomeKey !== homeKeyRef.current) {
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

    useEffect(() => {
        if (!switchKey) return;
        haLiveRef.current = false;
        loadConnectionConfig();
    }, [switchKey]);

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
    /** `entry_id`s from HA config_entries where domain is music_assistant — ties entities → MA without relying on state attrs */
    const [musicAssistantEntryIds, setMusicAssistantEntryIds] = useState(() => bootValue('musicAssistantEntryIds', []));
    // null = never configured (show all), [] = none selected, [...] = selected ids
    const [selectedLockIds, setSelectedLockIds] = useState(() => {
        const fromConfig = readHomeAccessFromConfig(bootValue('badgeConfig', null)).locks;
        if (fromConfig !== undefined) return fromConfig;
        return bootValue('selectedLockIds', null);
    });
    const [selectedCoverIds, setSelectedCoverIds] = useState(() => {
        const fromConfig = readHomeAccessFromConfig(bootValue('badgeConfig', null)).covers;
        if (fromConfig !== undefined) return fromConfig;
        return bootValue('selectedCoverIds', null);
    });
    const [lockPassageConfigs, setLockPassageConfigs] = useState(() => {
        const fromConfig = readHomeAccessFromConfig(bootValue('badgeConfig', null)).passage;
        if (fromConfig) return fromConfig;
        return bootValue('lockPassageConfigs', {});
    });
    const [cachedHomeRooms, setCachedHomeRooms] = useState(() => bootValue('rooms', []));

    const mappingsAbortRef = useRef(null);

    const fetchMappings = () => {
        if (!connectionConfig.loaded) return;
        if (!connectionConfig.adminUrl) return;

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
            })
            .catch(e => {
                if (e.name !== 'AbortError') logOperationalIssue('Mappings Quick Scenes', e);
            });

        // 2. Lights (+ icon type inference from entity_id)
        const fetchWithAuth = (url, opts) => fetch(url, { ...opts, headers: authHeaders });
        fetchEnrichedLightMappings(baseUrl, fetchWithAuth, { signal: controller.signal })
            .then(data => {
                if (Array.isArray(data)) setLightMappings(data);
            })
            .catch(e => { if (e.name !== 'AbortError') logOperationalIssue('Mappings Light', e); });

        // 3. Media
        const mediaUrl = `${baseUrl}api/monitored-entities?type=media_player&t=${Date.now()}`;
        fetch(mediaUrl, { signal: controller.signal, headers: authHeaders })
            .then(res => res.json())
            .then(data => {
                if (Array.isArray(data)) setMediaMappings(data);
            })
            .catch(e => { if (e.name !== 'AbortError') logOperationalIssue('Mappings Media', e); });

        // 4. Covers (garage pills on Home)
        const coverUrl = `${baseUrl}api/covers?t=${Date.now()}`;
        fetch(coverUrl, { signal: controller.signal, headers: authHeaders })
            .then(res => res.json())
            .then(data => {
                if (data.success && Array.isArray(data.covers)) setCoverMappings(data.covers);
            })
            .catch(e => { if (e.name !== 'AbortError') logOperationalIssue('Mappings Cover', e); });

        // 6. Climate damper mappings
        const climateUrl = `${baseUrl}api/climate-mappings?t=${Date.now()}`;
        fetch(climateUrl, { signal: controller.signal, headers: authHeaders })
            .then(res => res.json())
            .then(data => {
                if (data.success && Array.isArray(data.climates)) setClimateMappings(data.climates);
            })
            .catch(e => { if (e.name !== 'AbortError') logOperationalIssue('Mappings Climate', e); });

        // 6. Home Access — selected locks + covers
        const haUrl2 = `${baseUrl}api/home-access?t=${Date.now()}`;
        fetch(haUrl2, { signal: controller.signal, headers: authHeaders })
            .then(res => { if (!res.ok) throw new Error(`home-access ${res.status}`); return res.json(); })
            .then(data => {
                if (data.success) {
                    setSelectedLockIds(data.locks);
                    setSelectedCoverIds(data.covers);
                }
            })
            .catch(e => {
                if (e.name !== 'AbortError') logOperationalIssue('Mappings HomeAccess', e);
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

    // Initial Load Logic
    useEffect(() => {
        if (!connectionConfig.loaded) return;

        const { url: haUrl, token: haToken } = connectionConfig;
    const adminUrl = connectionConfig.adminUrl;
        const adminAuthHeaders = {
            'Authorization': `Bearer ${haToken}`,
            'Content-Type': 'application/json',
        };

        // ... (Admin Config Fetch remains) ...
        const configAbort = new AbortController();

        void probeDashboard(
            connectionConfig.adminUrlLive || adminUrl,
            connectionConfig.adminUrlLocal,
        ).then((boot) => {
            if (configAbort.signal.aborted || !boot) return;
            setConnectionConfig((prev) => {
                const next = applyBootstrapHaToConfig(prev, boot);
                if (next !== prev && service.current?.setFallbackUrl && next.haUrlLocal) {
                    service.current.setFallbackUrl(next.haUrlLocal);
                }
                return next;
            });
            mergeActiveProfileUrls({
                haUrlLive: boot.haUrlLive,
                haUrlLocal: boot.haUrlLocal,
                haToken: boot.haToken,
                haUrl: boot.haUrlLive || boot.haUrlLocal,
            });
        }).catch(() => {});

        if (adminUrl) {
            // Append /api/config if not present (assuming env var is base URL)
            const configUrl = (adminUrl.endsWith('/') ? `${adminUrl}api/config` : `${adminUrl}/api/config`) + `?t=${Date.now()}`;
            fetch(configUrl, { method: 'GET', headers: { ...adminAuthHeaders, 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' }, signal: configAbort.signal })
                .then(res => res.json())
                .then(data => {
                    setBadgeConfig(data);
                    locksArmedRef.current = !!data?.locks_armed;
                    const homeAccess = readHomeAccessFromConfig(data);
                    if (homeAccess.locks !== undefined) setSelectedLockIds(homeAccess.locks);
                    if (homeAccess.covers !== undefined) setSelectedCoverIds(homeAccess.covers);
                    if (homeAccess.passage) {
                        setLockPassageConfigs(homeAccess.passage);
                        const sensorMap = {};
                        Object.entries(homeAccess.passage).forEach(([lockId, pc]) => {
                            if (pc?.sensor_entity_id) sensorMap[pc.sensor_entity_id] = lockId;
                        });
                        lockSensorMapRef.current = sensorMap;
                    }
                    setAdminStatus(ADMIN_STATUS.OK);
                })
                .catch(err => {
                    if (err.name === 'AbortError') return;
                    logOperationalIssue('Config', err);
                    const localAdmin = connectionConfig.adminUrlLocal;
                    if (localAdmin && localAdmin !== adminUrl) {
                        setConnectionConfig((prev) => (
                            prev.adminUrl === localAdmin
                                ? prev
                                : { ...prev, adminUrl: localAdmin }
                        ));
                    } else {
                        setAdminStatus(ADMIN_STATUS.ERROR);
                    }
                });

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

            fetchLockStates(adminUrl, haToken, configAbort.signal)
                .then((locks) => {
                    if (!locks.length || haLiveRef.current) return;
                    setEntities((prev) => mergeEntitySlice(prev, locks));
                })
                .catch((e) => {
                    if (e?.name !== 'AbortError') console.log('[Dashboard] Lock states skipped:', e?.message || e);
                });

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

            fetchBackendHaSnapshot(adminUrl, haToken, configAbort.signal)
                .then((snapshot) => {
                    applyBackendHaSnapshot(snapshot, {
                        haLiveRef,
                        setEntities,
                        setRegistryAreas,
                        setRegistryFloors,
                    });
                })
                .catch((e) => {
                    if (e?.name !== 'AbortError') console.log('[Dashboard] Backend HA cache skipped:', e?.message || e);
                });

            // Fetch Cover Mappings
            const coverUrl = (adminUrl.endsWith('/') ? `${adminUrl}api/covers` : `${adminUrl}/api/covers`);
            fetch(coverUrl, { signal: configAbort.signal, headers: adminAuthHeaders })
                .then(res => res.json())
                .then(data => {
                    if (data.success) {
                        console.log(`[Covers] Loaded ${data.covers.length} mappings`);
                        setCoverMappings(data.covers);
                        setCoverWindows(data.windows || []);
                    }
                })
                .catch(e => { if (e.name !== 'AbortError') console.log("Cover Mappings Error", e); });

        }

        // 2. Connect to Home Assistant
        if (haUrl && haToken) {
            const cachedCount = peekDashboardSnapshot()?.entities?.length
                || (Array.isArray(entities) ? entities.length : 0);
            if (!cachedCount) setHaStatus(HA_STATUS.LOADING);
            service.current = new HAService(connectionConfig.haUrlLive || haUrl, haToken, {
                fallbackUrl: connectionConfig.haUrlLocal,
            });
            service.current.connect();
            service.current.subscribe(data => {
                if (data.type === 'endpoint_switched') {
                    setConnectionConfig((prev) => withFailoverUrls(prev, data));
                    return;
                }
                if (data.type === 'connected') {
                    setHaStatus(HA_STATUS.CONNECTED);
                    // Apply current states immediately. Registries can land after —
                    // waiting for all seven WS calls made Home feel stuck on a large house.
                    service.current.getStates()
                        .then((states) => {
                            haLiveRef.current = true;
                            setEntities(states || []);
                            saveDashboardSnapshot(profileIdRef.current, { entities: states || [] });
                        })
                        .catch((e) => console.log('[Dashboard] getStates error:', e.message));

                    Promise.all([
                        service.current.getConfig(),
                        service.current.getDeviceRegistry(),
                        service.current.getEntityRegistry(),
                        service.current.getAreaRegistry(),
                        service.current.getFloorRegistry(),
                        service.current.getConfigEntries().catch(() => []),
                    ]).then(([config, devices, regs, areas, floors, configEntries]) => {
                        haLiveRef.current = true;
                        if (config?.location_name) setCityName(config.location_name);
                        setRegistryDevices(devices || []);
                        setRegistryEntities(regs || []);
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
                        saveDashboardSnapshot(profileIdRef.current, {
                            cityName: config?.location_name || 'Home',
                            registryDevices: devices || [],
                            registryEntities: regs || [],
                            registryAreas: areas || [],
                            registryFloors: floors || [],
                            musicAssistantEntryIds: maIds,
                            badgeConfig,
                            allowedQuickScenes,
                            selectedLockIds,
                            selectedCoverIds,
                            lockPassageConfigs,
                            lightMappings,
                            mediaMappings,
                            sensorMappings,
                            coverMappings,
                            coverWindows,
                            climateMappings,
                            frigateCameras,
                            roomTrackingLookup,
                            alertRules,
                        });
                    }).catch((e) => {
                        console.log('[Dashboard] Registry load error:', e.message);
                    });

                } else if (data.type === 'auth_failed') {
                    setHaStatus(HA_STATUS.AUTH_FAILED);
                } else if (data.type === 'disconnected') {
                    setHaStatus(HA_STATUS.DISCONNECTED);
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
                            const prevEntity = prev[index];
                            next[index] = applyHaStateChangedEvent(prevEntity, data.event.data);
                            return next;
                        }
                        return [...prev, newState];
                    });
                }
            });
        } else {
            // No HA connection available - user needs to log out and reconfigure
            console.log('[Dashboard] No HA URL/Token - redirecting to login');
            setHaStatus(HA_STATUS.NOT_CONFIGURED);
            Alert.alert(
                'Connection Required',
                'Your Home Assistant connection is not configured. Please log in again.',
                [
                    {
                        text: 'Go to Login',
                        onPress: async () => {
                            await SecureStore.deleteItemAsync('is_logged_in');
                            await SecureStore.deleteItemAsync('logged_in_user');
                            router.replace('/login');
                        }
                    }
                ]
            );
        }

        // 3. Connect to Frigate (proxied through admin backend)
    frigateService.current = new FrigateService('', null, null, connectionConfig.adminUrl, haToken);

        frigateService.current.getConfig().catch(() => {}).finally(() => {
            if (!adminUrl) setFrigateConfigResolved(true);
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
    }, [connectionConfig.loaded, connectionConfig.token, connectionConfig.haUrlLive, connectionConfig.haUrlLocal]);

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

    const [locksModalVisible, setLocksModalVisible] = useState(false);
    const [devicesToggleVisible, setDevicesToggleVisible] = useState(false);
    const [devicesToggleKind, setDevicesToggleKind] = useState('lights'); // 'lights' | 'ac'

    // Room Sheet State
    const [roomSheetVisible, setRoomSheetVisible] = useState(false);
    const [selectedRoom, setSelectedRoom] = useState(null);

    // ── Notifications ───────────────────────────────────────────────────────
    const [showNotifications, setShowNotifications] = useState(false);
    const {
        notifications,
        unreadCount:   notifUnread,
        addNotification,
        markAllRead,
        clearAll:      clearAllNotifications,
        refresh:       refreshNotifications,
    } = useNotifications(connectionConfig.adminUrl, connectionConfig.token, {
        enabled: showNotifications,
    });
    const [showButlerCall, setShowButlerCall] = useState(false);
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

    // All entity_ids present in MonitoredEntity table (regardless of ignored flag)
    const monitoredEntitiesRef = useRef(new Set());
    // Entity_ids where ignored=1 (user has muted them)
    const ignoredEntitiesRef = useRef(new Set());

    const sensorsRequestedRef = useRef(false);
    const ensureSensorMappings = useCallback(() => {
        if (sensorsRequestedRef.current) return;
        const adminUrl = connectionConfig.adminUrl;
        const haToken = connectionConfig.token;
        if (!adminUrl || !haToken) return;
        sensorsRequestedRef.current = true;
        const base = adminUrl.endsWith('/') ? adminUrl : `${adminUrl}/`;
        fetch(`${base}api/sensors`, {
            headers: { Authorization: `Bearer ${haToken}`, Accept: 'application/json' },
        })
            .then((res) => res.json())
            .then((data) => {
                if (data.success && Array.isArray(data.sensors)) setSensorMappings(data.sensors);
            })
            .catch(() => { sensorsRequestedRef.current = false; });
    }, [connectionConfig.adminUrl, connectionConfig.token]);

    useEffect(() => {
        if (!connectionConfig.loaded || !connectionConfig.adminUrl) return undefined;
        const adminUrl = connectionConfig.adminUrl;
        const haToken = connectionConfig.token;
        const headers = {
            Authorization: `Bearer ${haToken}`,
            Accept: 'application/json',
            'Content-Type': 'application/json',
        };
        const base = adminUrl.endsWith('/') ? adminUrl : `${adminUrl}/`;
        let cancelled = false;
        const task = InteractionManager.runAfterInteractions(() => {
            setTimeout(() => {
                if (cancelled) return;
                ensureSensorMappings();
                fetch(`${base}api/entities`, { headers })
                    .then((res) => res.json())
                    .then((data) => {
                        if (cancelled || !data.success || !Array.isArray(data.entities)) return;
                        monitoredEntitiesRef.current = new Set(data.entities.map((e) => e.entity_id));
                        ignoredEntitiesRef.current = new Set(
                            data.entities.filter((e) => e.ignored).map((e) => e.entity_id),
                        );
                    })
                    .catch(() => {});
            }, 4000);
        });
        return () => {
            cancelled = true;
            task?.cancel?.();
        };
    }, [connectionConfig.loaded, connectionConfig.adminUrl, connectionConfig.token, ensureSensorMappings]);
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

    // Derived Logic for Badges — same room scope as room cards (selected parents only)
    const dashboardParentAreaIds = useMemo(() => {
        const selected = filterRoomsForRole(
            getSelectedAreasForDashboard(registryAreas, badgeConfig),
            appRole,
            badgeConfig,
        );
        const parents = filterParentRoomsForDashboard(selected, registryAreas, badgeConfig);
        return new Set(parents.map((p) => p.area_id).filter(Boolean));
    }, [registryAreas, badgeConfig, appRole]);

    const dashboardEntityIds = useMemo(
        () => getEntityIdsForAreaIds(dashboardParentAreaIds, registryDevices, registryEntities),
        [dashboardParentAreaIds, registryDevices, registryEntities],
    );

    const groupedLightMemberIds = useMemo(
        () => collectGroupedLightMemberIds(
            entities.filter((e) => e?.entity_id?.startsWith('light.')),
        ),
        [entities],
    );

    const handleBadgePress = useCallback((type) => {
        if (type === 'locks') {
            setLocksModalVisible(true);
        } else if (type === 'lights' || type === 'ac') {
            setDevicesToggleKind(type);
            setDevicesToggleVisible(true);
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

        // NOTE: Do NOT call Notifications.scheduleNotificationAsync here.
        // The backend (ha-notifier.js) already sends a push notification via
        // Expo Push API for every HA state_changed event. Scheduling a local
        // OS notification here as well causes every alert to appear TWICE on
        // the device — once from the server push and once from this local call.
    }, [addNotification]);

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
        setAiTabVisited(true);
        setActiveTab('ai');
    }, []);

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
        selectedLockIds,
        selectedCoverIds,
        lockPassageConfigs,
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
        haHttpUrl,
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
        selectedLockIds,
        selectedCoverIds,
        lockPassageConfigs,
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
                // Re-check presence on resume
                lastActiveRoomRef.current = null;
                navigateToPresenceRoomRef.current(true);
                // Refresh config
                fetchMappings();
                refreshAppRoleRef.current?.();

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

    const refreshAppRole = useCallback(() => {
        if (!connectionConfig.loaded || !connectionConfig.adminUrl) return;
        if (!hasAppUserIdentity(userId, userName)) {
            setAppRole(PENDING_APP_ROLE);
            setAllowedScreens(PENDING_APP_ROLE.screens);
            return;
        }
        fetchAppRole({
            adminUrl: connectionConfig.adminUrl,
            token: connectionConfig.token,
            userId,
            username: userName,
        }).then((role) => {
            setAppRole(role || PENDING_APP_ROLE);
            setAllowedScreens(Array.isArray(role?.screens) ? role.screens : PENDING_APP_ROLE.screens);
        }).catch(() => {
            setAppRole(PENDING_APP_ROLE);
            setAllowedScreens(PENDING_APP_ROLE.screens);
        });
    }, [connectionConfig.loaded, connectionConfig.adminUrl, connectionConfig.token, userId, userName]);

    const refreshAppRoleRef = useRef(refreshAppRole);
    refreshAppRoleRef.current = refreshAppRole;

    useEffect(() => {
        refreshAppRole();
    }, [refreshAppRole]);

    useEffect(() => {
        if (!connectionConfig.loaded || !connectionConfig.adminUrl) {
            if (connectionConfig.loaded) setFrigateConfigResolved(true);
            return undefined;
        }
        if (!hasAppUserIdentity(userId, userName)) {
            setBackendCameras(null);
            setUserHomeCameras(null);
            return undefined;
        }
        let cancelled = false;
        fetchRoleCameras({
            adminUrl: connectionConfig.adminUrl,
            token: connectionConfig.token,
            userId,
            username: userName,
        })
            .then((result) => {
                if (cancelled) return;
                setBackendCameras(result.cameras);
                setFrigateCameras(result.cameras);
                setHaCameras([]);
                setUserHomeCameras(Array.isArray(result.homeCameras) ? result.homeCameras : []);
            })
            .catch((e) => logOperationalIssue('Cameras', e))
            .finally(() => {
                if (!cancelled) setFrigateConfigResolved(true);
            });
        return () => { cancelled = true; };
    }, [connectionConfig.loaded, connectionConfig.adminUrl, connectionConfig.token, userId, userName]);

    useEffect(() => {
        if (!Array.isArray(allowedScreens)) return;
        const current = activeTab === 'ai' ? 'butler' : activeTab;
        if (current !== 'home' && current !== 'settings' && !canShowScreen(allowedScreens, current)) {
            setActiveTab('home');
        }
    }, [allowedScreens, activeTab]);

    const systemHealth = useHaSystemHealth({ entities, haStatus, adminStatus });

    const callService = useCallback((domain, serviceName, serviceData) => {
        if (!systemHealth.canControlHa) {
            return Promise.reject(new Error('Home Assistant is not connected'));
        }
        if (service.current) {
            // ── Optimistic update ────────────────────────────────────────────
            // For light/switch/fan toggles, instantly flip the UI state so the
            // user sees the change immediately without waiting for the HA event.
            const entityId = serviceData?.entity_id;
            if (entityId && typeof entityId === 'string') {
                if (domain === 'climate') {
                    setEntities((prev) =>
                        prev.map((e) =>
                            e.entity_id === entityId
                                ? applyClimateServiceToEntity(e, serviceName, serviceData)
                                : e,
                        ),
                    );
                } else {
                    // Only optimistically change state for services that actually mean a new entity state.
                    // volume_*/remote.send_command/etc. must NOT fall through to on↔off toggle —
                    // that was flipping Samsung TV "on"→"off" when adjusting volume and breaking play/pause.
                    setEntities((prev) => {
                        const index = prev.findIndex((e) => e.entity_id === entityId);
                        if (index === -1) return prev;

                        const current = prev[index];
                        let nextState = null;

                        if (serviceName === 'turn_on') nextState = 'on';
                        else if (serviceName === 'turn_off') nextState = 'off';
                        else if (serviceName === 'toggle') {
                            nextState = current.state === 'on' ? 'off' : 'on';
                        } else if (serviceName === 'media_pause') {
                            // Samsung often stays "on" — don't fake "paused" or the UI gets stuck.
                            if (current.state === 'playing' || current.state === 'buffering') {
                                nextState = 'paused';
                            }
                        } else if (serviceName === 'media_play') {
                            if (current.state === 'paused' || current.state === 'idle') {
                                nextState = 'playing';
                            }
                        }

                        if (nextState == null || nextState === current.state) return prev;

                        const next = [...prev];
                        next[index] = { ...current, state: nextState };
                        return next;
                    });
                }
            }
            // ────────────────────────────────────────────────────────────────

            return service.current.callService(domain, serviceName, serviceData)
                .then((result) => {
                    console.log('[callService] OK', domain, serviceName, serviceData, result ?? null);
                    return result;
                })
                .catch((err) => {
                    console.warn('[callService] Failed:', domain, serviceName, err?.message ?? err);
                    // Revert optimistic update on failure by re-fetching states
                    service.current?.getStates?.()?.then(states => {
                        if (states) setEntities(states);
                    });
                    return Promise.reject(err);
                });
        }
        console.warn('[callService] HA service not connected');
        return Promise.resolve();
    }, [systemHealth.canControlHa]);

    const handleScenePress = useCallback((sceneId) => {
        console.log('Scene pressed:', sceneId);
        const domain = sceneId.split('.')[0];
        callService(domain, 'turn_on', { entity_id: sceneId });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }, [callService]);



    const handleRoomPress = useCallback((room) => {
        ensureSensorMappings();
        if (!areaVisibleForRole(room?.area_id, appRole, badgeConfig)) return;
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
                appRole,
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
    }, [
        activeTab,
        entities,
        badgeConfig,
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
        connectionConfig.url,
        connectionConfig.token,
        connectionConfig.adminUrl,
        appRole,
        router,
        ensureSensorMappings,
    ]);

    const handleTabPress = useCallback((tabId) => {
        const permissionId = tabId === 'ai' ? 'butler' : tabId;
        if (permissionId !== 'home' && permissionId !== 'settings' && !canShowScreen(allowedScreens, permissionId)) {
            return;
        }
        if (tabId === 'tablet') {
            router.push('/dashboard-v2-tablet');
        } else if (tabId === 'butler') {
            setAiTabVisited(true);
            setActiveTab('ai');
        } else {
            setActiveTab(tabId);
        }
    }, [allowedScreens, router]);

    const handleSettingChange = useCallback((key, val) => {
        if (key === 'showFamily') setShowFamily(val);
        if (key === 'autoRoomVisit') setAutoRoomVisit(val);
        if (key === 'autoRoomResume') setAutoRoomResume(val);
        if (key === 'showPreferenceButton') setShowPreferenceButton(val);
    }, []);

    const handleNetworkPress = useCallback(() => setShowNetworkModal(true), []);
    const handleAiExit = useCallback(() => {
        setActiveTab('home');
        setAiTabVisited(false); // unmount BrainView → resets chat history + WS session
    }, []);

    const getRoomsWithCounts = () => {
        const sourceAreas = filterRoomsForRole(
            getSelectedAreasForDashboard(registryAreas, badgeConfig),
            appRole,
            badgeConfig,
        );

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

            const activeLights = roomEntities.lights.filter(
                (l) => l.stateObj?.state === 'on' && isLightCountableUnit(l, groupedLightMemberIds)
            ).length;

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
            const group = getRoomAreaGroup(room, registryAreas, badgeConfig, computedRooms)
                .filter((area) => areaAllowedForRole(area.area_id, appRole, badgeConfig));
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
        groupedLightMemberIds,
        appRole,
    ]);
    const roomsWithCounts = liveRoomsWithCounts.length > 0
        ? liveRoomsWithCounts
        : filterRoomsForRole(cachedRoomsForHome(cachedHomeRooms, badgeConfig), appRole, badgeConfig);
    if (snapshotRef.current) snapshotRef.current.rooms = roomsWithCounts;

    const displayCameras = useMemo(() => {
        if (!appRole || appRole.roleId === 'pending') return [];
        if (!roleCanSeeCameras(appRole, allowedScreens)) return [];
        if (Array.isArray(backendCameras) && backendCameras.length > 0) return backendCameras;
        return camerasForRoleDisplay(
            frigateCameras,
            haCameras,
            appRole,
            badgeConfig?.selected_cameras,
        );
    }, [backendCameras, frigateCameras, haCameras, appRole, allowedScreens, badgeConfig?.selected_cameras]);

    const homeCameraIds = useMemo(() => {
        if (!appRole || appRole.roleId === 'pending') return [];
        if (!roleCanSeeCameras(appRole, allowedScreens)) return [];
        if (!Array.isArray(userHomeCameras) || userHomeCameras.length === 0) return [];
        return filterHomeCameraIds(userHomeCameras, displayCameras);
    }, [displayCameras, userHomeCameras, appRole, allowedScreens]);

    /**
     * Lights for the modal — exact same entities each room card uses for badges.
     * (Avoids registry/area mismatches that made the header count disagree with rooms.)
     */
    const roomLightsForModal = useMemo(() => {
        const byId = new Map();
        for (const room of roomsWithCounts) {
            const lights = room._entities?.lights || [];
            for (const l of lights) {
                if (!isLightCountableUnit(l, groupedLightMemberIds)) continue;
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
    }, [roomsWithCounts, groupedLightMemberIds, entities]);

    // Header quantity = sum of room card badges (always matches rooms)
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

    const handleRoomReorder = (data) => {
        // IDs of the rooms in their new order
        const reorderedIds = data.map(r => r.area_id);

        // Update Saved Order
        setSavedRoomOrder(prev => {
            // Start with the existing full order or use the current list if none exists
            const currentFullOrder = prev && prev.length > 0 ? [...prev] : roomsWithCounts.map(a => a.area_id);

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

    const homeLocks = useMemo(() => filterHomeLocks(entities, {
        selectedLockIds,
        registryEntities,
        registryDevices,
        selectedAreaIds: (badgeConfig?.selected_areas || []).map((a) => a?.area_id).filter(Boolean),
    }), [entities, selectedLockIds, registryEntities, registryDevices, badgeConfig?.selected_areas]);

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

    if (!bootReady) {
        return (
            <View style={styles.container}>
                <Stack.Screen options={{ headerShown: false }} />
                <LinearGradient
                    colors={['#09091A', '#09091A', '#09091A']}
                    style={styles.background}
                />
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <Stack.Screen options={{ headerShown: false }} />
            <LinearGradient
                colors={['#09091A', '#09091A', '#09091A']}
                style={styles.background}
            />
            <StatusBar style="light" />

            <NotificationModal
                visible={showNotifications}
                notifications={notifications}
                onClose={() => setShowNotifications(false)}
                onClearAll={handleClearNotifications}
                onOpen={refreshNotifications}
            />

            {showButlerCall ? (
                <ButlerVoiceModal
                    visible={showButlerCall}
                    onClose={handleButlerCallClose}
                    onSwitchToChat={handleButlerSwitchToChat}
                    context={butlerVoiceContext}
                />
            ) : null}

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
                    cameraSensors={badgeConfig?.camera_sensors || {}}
                    haEntities={entities}
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

            <AccountSwitcherModal
                visible={showAccountSwitcher}
                onClose={() => setShowAccountSwitcher(false)}
                onSwitched={handleAccountSwitched}
                onAddAccount={handleAddAccount}
                onEditHome={handleEditHome}
            />

            {/* ===== HOME TAB ===== */}
            <View style={[{ flex: 1 }, activeTab !== 'home' && activeTab !== 'ai' && { display: 'none' }]}>
                <ScrollView contentContainerStyle={[styles.content, isLandscape && sidebarPadding]}>
                    <HeaderV2
                        weather={weather}
                        cityName={cityName}
                        userName={userName}
                        humidity={humidity}
                        indoorTemp={indoorTemp}
                        onBellPress={handleBellPress}
                        unreadCount={notifUnread}
                        onUserPress={() => setShowAccountSwitcher(true)}
                    />
                    <StatusBadges
                        lightsOn={lightsOn}
                        acOn={acOn}
                        onPress={handleBadgePress}
                        locks={entities.filter(e => e.entity_id.startsWith('lock.'))}
                        lockPassageConfigs={lockPassageConfigs}
                        entities={entities}
                    />
                    {showFamily && <PersonBadges entities={entities} alertRules={alertRules} haUrl={haHttpUrl} />}
                    <HaSystemBanner banner={systemHealth.banner} />

                    <QuickScenes
                        scenes={quickScenesData}
                        onScenePress={handleScenePress}
                        adminUrl={connectionConfig?.adminUrl}
                        onScenesUpdated={(ids) => setAllowedQuickScenes(ids)}
                        columns={homeColumns}
                    />

                    <HomeAccess
                        isHomeActive={activeTab === 'home'}
                        locks={homeLocks}
                        covers={homeCovers}
                        columns={homeColumns}
                        allLockEntities={entities.filter(e => e.entity_id.startsWith('lock.'))}
                        haEntities={entities}
                        lockPassageConfigs={lockPassageConfigs}
                        adminUrl={connectionConfig.adminUrl}
                        haToken={connectionConfig.token}
                        onConfigSaved={fetchMappings}
                        onToggleLock={(entityId, state) => {
                            const isUnlocked = state === 'unlocked' || state === 'open';
                            callService('lock', isUnlocked ? 'lock' : 'unlock', { entity_id: entityId });
                        }}
                        onControlCover={(entityId, action) => {
                            callService('cover', action, { entity_id: entityId });
                        }}
                    />

                    <RoomsList
                        rooms={roomsWithCounts}
                        registryEntities={registryEntities}
                        allEntities={entities}
                        onRoomPress={handleRoomPress}
                        onAllRoomsPress={() => setActiveTab('rooms')}
                        layout={isTablet ? 'tablet-home' : 'horizontal'}
                        columns={homeRoomColumns}
                        tabletPreviewCount={6}
                        haUrl={haHttpUrl}
                        haToken={connectionConfig.token}
                        sensorMappings={sensorMappings}
                    />

                    {showCameras && roleCanSeeCameras(appRole, allowedScreens) ? (
                    <HomeCameraStrip
                        frigateCameras={displayCameras}
                        selectedCameraNames={homeCameraIds}
                        frigateService={frigateService.current}
                        onCameraPress={handleFrigateCameraPress}
                        onAllCamerasPress={() => setActiveTab('cctv')}
                        adminUrl={connectionConfig.adminUrl}
                        canEdit
                        availableCameras={displayCameras}
                        persistToServer={!!connectionConfig.adminUrl}
                        userId={userId}
                        username={userName}
                        selectionStorageKey={`home_cameras:${profileIdRef.current || ''}:${userId || userName || 'user'}`}
                        onCamerasUpdated={(ids) => {
                            setUserHomeCameras(Array.isArray(ids) ? ids : []);
                        }}
                        cameraSensors={badgeConfig?.camera_sensors || {}}
                        haEntities={entities}
                        columns={isTablet ? 2 : 2}
                    />
                    ) : null}
                </ScrollView>
            </View>

            {/* ===== ROOMS TAB ===== */}
            <View style={[{ flex: 1 }, activeTab !== 'rooms' && { display: 'none' }]}>
                <ScrollView
                        style={{ flex: 1 }}
                        contentContainerStyle={[styles.content, { marginTop: 60, paddingBottom: 120 }, isLandscape && sidebarPadding]}
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
                                    <ScrollView 
                                        horizontal 
                                        showsHorizontalScrollIndicator={false}
                                        style={{ marginBottom: 20 }}
                                        contentContainerStyle={{ gap: 10, paddingRight: 10 }}
                                    >
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
                                    </ScrollView>
                                )}

                                <RoomsList
                                    rooms={filteredRooms}
                                    registryEntities={registryEntities}
                                    allEntities={entities}
                                    onRoomPress={handleRoomPress}
                                    layout="grid"
                                    columns={columns}
                                    haUrl={haHttpUrl}
                                    haToken={connectionConfig.token}
                                    sensorMappings={sensorMappings}
                                />
                            </>
                        )}
                    </ScrollView>
            </View>

            {/* ===== CCTV TAB — WebViews only rendered when active (too heavy to keep in background) ===== */}
            <View style={[{ flex: 1 }, activeTab !== 'cctv' && { display: 'none' }]}>
                {frigateConfigResolved && displayCameras.length === 0 ? (
                    <View style={{ flex: 1, marginTop: 60, paddingHorizontal: 20 }}>
                        <View style={[styles.cctvToggleRow, { paddingHorizontal: 0 }]}>
                            <Text style={styles.cctvSectionTitle}>Surveillance</Text>
                        </View>
                        <Text style={styles.cctvEmptyText}>No cameras yet</Text>
                        <Text style={styles.cctvEmptyHint}>
                            Cameras are optional. Add Frigate or Home Assistant cameras when you have them.
                        </Text>
                    </View>
                ) : (
                    <View style={{ flex: 1, marginTop: 60 }}>
                        <View style={styles.cctvToggleRow}>
                            <Text style={styles.cctvSectionTitle} numberOfLines={1}>Surveillance</Text>
                            <View style={styles.cctvToggleWrap}>
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
                        </View>

                        <View style={[{ flex: 1 }, (cctvView !== 'cameras') && { display: 'none' }]}>
                            <ScrollView contentContainerStyle={[styles.content, isLandscape && sidebarPadding]}>
                                <CamerasList
                                    frigateCameras={displayCameras}
                                    service={frigateService.current}
                                    onCameraPress={handleFrigateCameraPress}
                                    columns={columns}
                                    cameraSensors={badgeConfig?.camera_sensors || {}}
                                    entityMap={haEntityMap}
                                    active={activeTab === 'cctv' && cctvView === 'cameras'}
                                />
                            </ScrollView>
                        </View>
                        {activeTab === 'cctv' && cctvView === 'events' ? (
                            <FrigateEventsFeed
                                adminUrl={connectionConfig.adminUrl}
                                authHeaders={{ Authorization: `Bearer ${connectionConfig.token}` }}
                                frigateCameras={displayCameras}
                            />
                        ) : null}
                    </View>
                )}
            </View>

            {/* ===== SETTINGS TAB — unmount when hidden (rarely visited, no state to preserve) ===== */}
            <View style={[{ flex: 1 }, activeTab !== 'settings' && { display: 'none' }]}>
                {activeTab === 'settings' ? <SettingsView
                    areas={filterRoomsForRole(getSelectedAreasForDashboard(registryAreas, badgeConfig), appRole, badgeConfig)}
                    registryAreas={registryAreas}
                    entities={entities}
                    registryDevices={registryDevices}
                    registryEntities={registryEntities}
                    showFamily={showFamily}
                    autoRoomVisit={autoRoomVisit}
                    autoRoomResume={autoRoomResume}
                    showPreferenceButton={showPreferenceButton}
                    adminUrl={connectionConfig.adminUrl}
                    userName={userName}
                    roleName={appRole?.roleName}
                    settingsAllowed={canShowScreen(allowedScreens, 'settings')}
                    onSettingChange={handleSettingChange}
                    onNetwork={handleNetworkPress}
                    onEditHome={handleEditHome}
                    onEntitiesChanged={refreshEntityRefs}
                /> : null}
            </View>

            {isLandscape ? (
                <TabletSidebar activeTab={activeTab} onTabPress={handleTabPress} allowedTabs={allowedScreens} />
            ) : (
                <TabBar
                    activeTab={activeTab}
                    onTabPress={handleTabPress}
                    butlerActive={showButlerCall}
                    allowedTabs={allowedScreens}
                />
            )}

            {activeTab === 'ai' ? (
                <View
                    style={[StyleSheet.absoluteFill, styles.butlerOverlay]}
                    pointerEvents="auto"
                >
                    <BrainView
                        entities={entities}
                        callService={callService}
                        registryDevices={registryDevices}
                        registryEntities={registryEntities}
                        registryAreas={registryAreas}
                        onExit={handleAiExit}
                        onStartVoiceCall={handleVoiceAssistantPress}
                        haUrl={haHttpUrl}
                        haToken={connectionConfig.token}
                    />
                </View>
            ) : null}

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
                    haUrl={haHttpUrl}
                    haToken={connectionConfig.token}
                    showPreferenceButton={showPreferenceButton}
                    sensorMappings={sensorMappings}
                    coverMappings={coverMappings}
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
                    badgeConfig={badgeConfig}
                    appRole={appRole}
                />
            )}
        </View >
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    butlerOverlay: {
        zIndex: 10050,
        elevation: 10050,
        overflow: 'hidden',
        backgroundColor: 'transparent',
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
        marginBottom: 15,
        marginTop: 5
    },
    sectionTitle: {
        color: 'white',
        fontSize: 24,
        fontFamily: CF.bold,
        marginBottom: 20,
    },
    cctvToggleRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        marginBottom: 12,
        minHeight: 40,
        gap: 12,
    },
    cctvSectionTitle: {
        color: 'white',
        fontSize: 24,
        fontFamily: CF.bold,
        textAlign: 'left',
        flex: 1,
        flexShrink: 1,
    },
    cctvToggleWrap: {
        flexShrink: 0,
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
    cctvEmptyText: {
        color: 'rgba(255,255,255,0.7)',
        fontSize: 16,
        fontFamily: CF.medium,
        marginTop: 8,
    },
    cctvEmptyHint: {
        color: 'rgba(255,255,255,0.4)',
        fontSize: 13,
        marginTop: 6,
        lineHeight: 18,
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
