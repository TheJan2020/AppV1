import { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, Modal, FlatList, KeyboardAvoidingView, Platform, ScrollView, Keyboard, TouchableWithoutFeedback, Linking, Dimensions } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { Colors } from '../constants/Colors';
import { Scan, Lock, User, ChevronDown, Check, Settings, Fingerprint, X, Plus, Trash2, Edit2, Shield } from 'lucide-react-native';
import { scanNetwork } from '../utils/discovery';
import { HAService } from '../services/ha';
import { validateCredentials } from '../services/auth';
import { registerForPushNotificationsAsync } from '../services/notifications';
import { upsertAccountAndActivate, listAccounts, normalizeHaUrl, normalizeUsername } from '../services/accounts';
import { preloadDashboardSnapshot, peekBootProfile } from '../utils/dashboardCache';
import { loadHaProfiles, saveHaProfiles, peekHaProfiles } from '../utils/storage';
import ModalBackdrop from '../components/ModalBackdrop';

const SETTINGS_KEY_ACTIVE_PROFILE = 'ha_active_profile_id';
const SETTINGS_KEY_MIGRATION_COMPLETED = 'ha_migration_completed_v1';

// Helper to generate simple ID
const generateId = () => Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

function toHaHttpBase(url) {
    return normalizeHaUrl(url);
}

function mapPersonRecords(records) {
    return (Array.isArray(records) ? records : [])
        .map((p) => {
            const id = p.entity_id || p.id;
            if (!id) return null;
            return {
                id,
                name: p.attributes?.friendly_name || p.name || id.replace(/^person\./, ''),
                user_id: p.attributes?.user_id || p.user_id || '',
                picture: p.attributes?.entity_picture || p.picture,
            };
        })
        .filter(Boolean);
}

async function fetchJson(url, options, timeoutMs) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(url, { ...options, signal: controller.signal });
        const text = await res.text();
        let data = null;
        try { data = text ? JSON.parse(text) : null; } catch { data = text; }
        return { ok: res.ok, status: res.status, data };
    } finally {
        clearTimeout(timeout);
    }
}

/** Light person list first (template), then full /api/states. */
async function fetchPersonsFromHaRest(haUrl, haToken) {
    const baseUrl = toHaHttpBase(haUrl);
    const headers = {
        Authorization: `Bearer ${haToken}`,
        'Content-Type': 'application/json',
    };

    const template = `[{% for s in states.person %}{"entity_id":{{ s.entity_id | tojson }},"name":{{ s.name | tojson }},"user_id":{{ s.attributes.user_id | default('') | tojson }}}{% if not loop.last %},{% endif %}{% endfor %}]`;

    try {
        const tpl = await fetchJson(`${baseUrl}/api/template`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ template }),
        }, 12000);
        if (tpl.ok && tpl.data != null) {
            let parsed = tpl.data;
            if (typeof parsed === 'string') {
                try { parsed = JSON.parse(parsed); } catch { parsed = []; }
            }
            const mapped = mapPersonRecords(parsed);
            if (mapped.length > 0) return mapped;
        }
    } catch (e) {
        console.log('[Login] Template person fetch failed:', e?.message || e);
    }

    const statesRes = await fetchJson(`${baseUrl}/api/states`, {
        method: 'GET',
        headers,
    }, 20000);
    if (!statesRes.ok) {
        throw new Error(`HA states HTTP ${statesRes.status}`);
    }
    const states = Array.isArray(statesRes.data) ? statesRes.data : [];
    return mapPersonRecords(states.filter((e) => e.entity_id?.startsWith('person.')));
}

export default function Login() {
    const router = useRouter();
    const params = useLocalSearchParams();
    const modeParam = Array.isArray(params?.mode) ? params.mode[0] : params?.mode;
    const isAddAccount = modeParam === 'addAccount';
    const service = useRef(null);
    const passwordInputRef = useRef(null);
    const scrollViewRef = useRef(null);

    // Login Form State
    const [password, setPassword] = useState('');
    const [username, setUsername] = useState('');

    // ... (rest of state)

    const scrollToInput = () => {
        // slight delay to allow keyboard to show
        setTimeout(() => {
            scrollViewRef.current?.scrollToEnd({ animated: true });
        }, 300);
    };

    // Connection State (derived from active profile)
    const [haUrl, setHaUrl] = useState('');
    const [haToken, setHaToken] = useState('');
    const [adminUrl, setAdminUrl] = useState('');

    // User Management State
    const [users, setUsers] = useState([]);
    const [selectedUser, setSelectedUser] = useState(null);
    const [showUserModal, setShowUserModal] = useState(false);
    const [loadingUsers, setLoadingUsers] = useState(false);

    // UI/Auth State
    const [isScanning, setIsScanning] = useState(false);
    const [isLoggingIn, setIsLoggingIn] = useState(false);
    const [isBiometricSupported, setIsBiometricSupported] = useState(false);
    const [faceIdEnabled, setFaceIdEnabled] = useState(false);
    const [faceIdReady, setFaceIdReady] = useState(false); // don't persist until loaded
    const [hasSavedBiometricCreds, setHasSavedBiometricCreds] = useState(false);
    const [isReturningUser, setIsReturningUser] = useState(false);

    // Profile Management State
    const [showSettings, setShowSettings] = useState(false);
    const [profiles, setProfiles] = useState([]);
    const [activeProfileId, setActiveProfileId] = useState(null);
    const [savedAccounts, setSavedAccounts] = useState([]);
    const usersFetchIdRef = useRef(0);
    const [profilesReady, setProfilesReady] = useState(false);
    const [pickingProfile, setPickingProfile] = useState(false);
    const pickedProfileRef = useRef(false);
    const activeProfileIdRef = useRef(null);

    // Profile Editing State
    const [editingProfile, setEditingProfile] = useState(null); // If null, showing list. If object, showing form.

    useEffect(() => {
        checkBiometrics();
        loadSettings();
        listAccounts()
            .then((list) => {
                setSavedAccounts(Array.isArray(list) ? list : []);
            })
            .catch(() => {});
        return () => {
            usersFetchIdRef.current += 1;
            if (service.current?.disconnect) {
                service.current.disconnect();
                service.current = null;
            }
        };
    }, []);

    // Sync active profile to connection state
    useEffect(() => {
        if (activeProfileId && profiles.length > 0) {
            const profile = profiles.find(p => p.id === activeProfileId);
            if (profile) {
                setHaUrl(profile.haUrl || '');
                setHaToken(profile.haToken || '');
                setAdminUrl(profile.adminUrl || '');
            }
        } else if (profiles.length === 0) {
            // No profiles, clear connection state
            setHaUrl('');
            setHaToken('');
            setAdminUrl('');
        }
    }, [activeProfileId, profiles]);

    // Auto-connect when connection details change
    useEffect(() => {
        if (haUrl && haToken) {
            fetchUsersFromHa();
        } else if (haUrl && !haToken) {
            setUsers([{ id: 'manual', name: 'Manual Login' }]);
            setSelectedUser({ id: 'manual', name: 'Manual Login' });
            setLoadingUsers(false);
        }
    }, [haUrl, haToken, isAddAccount]);

    useEffect(() => {
        if (!isAddAccount) return;
        setPassword('');
        if (profilesReady && profiles.length > 0 && !pickedProfileRef.current) {
            setPickingProfile(true);
        }
    }, [isAddAccount, profilesReady, profiles.length]);

    useEffect(() => {
        if (!showUserModal) return;
        listAccounts()
            .then((list) => {
                setSavedAccounts(Array.isArray(list) ? list : []);
            })
            .catch(() => setSavedAccounts([]));
    }, [showUserModal]);

    const checkBiometrics = async () => {
        const compatible = await LocalAuthentication.hasHardwareAsync();
        const enrolled = await LocalAuthentication.isEnrolledAsync();
        setIsBiometricSupported(compatible && enrolled);
    };

    const loadSettings = async () => {
        try {
            // Load FaceID setting BEFORE any write — mount must not overwrite with false
            const savedFaceId = await SecureStore.getItemAsync('face_id_enabled');
            const enabled = savedFaceId === 'true';
            setFaceIdEnabled(enabled);
            setFaceIdReady(true);

            const savedPass = await SecureStore.getItemAsync('saved_password');
            const savedUser = await SecureStore.getItemAsync('saved_username');
            setHasSavedBiometricCreds(!!(savedPass && savedUser));

            // Prefill username for returning Face ID users (button no longer requires typing)
            if (savedUser && !isAddAccount) setUsername(savedUser);

            // Check if returning user
            const hasLoggedInBefore = await SecureStore.getItemAsync('has_logged_in_before');
            if (hasLoggedInBefore === 'true') setIsReturningUser(true);

            // Load Profiles (AsyncStorage + SecureStore + in-memory from Home)
            let loadedProfiles = await loadHaProfiles();
            const savedActiveId = await SecureStore.getItemAsync(SETTINGS_KEY_ACTIVE_PROFILE);
            let recoveredFromMemory = false;

            if (loadedProfiles.length === 0) {
                const mem = peekHaProfiles();
                const boot = peekBootProfile();
                if (mem.length > 0) {
                    loadedProfiles = mem;
                    recoveredFromMemory = true;
                } else if (boot?.profileId) {
                    loadedProfiles = [{
                        id: boot.profileId,
                        name: 'Current Home',
                        haUrl: boot.url || '',
                        haToken: boot.token || '',
                        adminUrl: boot.adminUrl || '',
                    }];
                    recoveredFromMemory = true;
                }
            }

            // MIGRATION: If no profiles AND migration not done
            const migrationDone = await SecureStore.getItemAsync(SETTINGS_KEY_MIGRATION_COMPLETED);

            if (loadedProfiles.length === 0 && !migrationDone) {
                const legacyUrl = await SecureStore.getItemAsync('ha_url');
                const legacyToken = await SecureStore.getItemAsync('ha_token');
                const legacyAdmin = await SecureStore.getItemAsync('admin_url');

                if (legacyUrl) {
                    console.log('Migrating legacy settings to default profile...');
                    const defaultProfile = {
                        id: generateId(),
                        name: 'Default Home',
                        haUrl: legacyUrl,
                        haToken: legacyToken || '',
                        adminUrl: legacyAdmin || ''
                    };
                    loadedProfiles = [defaultProfile];
                    await saveProfilesToStorage(loadedProfiles);
                    activeProfileIdRef.current = defaultProfile.id;
                    await SecureStore.setItemAsync(SETTINGS_KEY_ACTIVE_PROFILE, defaultProfile.id);
                    await SecureStore.setItemAsync(SETTINGS_KEY_MIGRATION_COMPLETED, 'true');
                    setActiveProfileId(defaultProfile.id);
                } else {
                    // No legacy URL, just mark migration as done so we don't check again
                    await SecureStore.setItemAsync(SETTINGS_KEY_MIGRATION_COMPLETED, 'true');
                }
            } else {
                setProfiles(loadedProfiles);
                // Set active profile
                if (savedActiveId && loadedProfiles.find(p => p.id === savedActiveId)) {
                    activeProfileIdRef.current = savedActiveId;
                    setActiveProfileId(savedActiveId);
                } else if (loadedProfiles.length > 0) {
                    // Fallback to first if active not found
                    activeProfileIdRef.current = loadedProfiles[0].id;
                    setActiveProfileId(loadedProfiles[0].id);
                    await SecureStore.setItemAsync(SETTINGS_KEY_ACTIVE_PROFILE, loadedProfiles[0].id);
                }

                // Ensure migration flag is set if we have profiles, to prevent future backfill
                if (loadedProfiles.length > 0) {
                    await SecureStore.setItemAsync(SETTINGS_KEY_MIGRATION_COMPLETED, 'true');
                }
            }

            // CLEANUP: If we have profiles, ensure legacy keys are GONE so they don't haunt us
            if (loadedProfiles.length > 0) {
                await SecureStore.deleteItemAsync('ha_url');
                await SecureStore.deleteItemAsync('ha_token');
                await SecureStore.deleteItemAsync('admin_url');
            }

            if (recoveredFromMemory && loadedProfiles.length > 0) {
                await saveHaProfiles(loadedProfiles);
            }

            if (isAddAccount && loadedProfiles.length > 0) {
                setEditingProfile(null);
                setPickingProfile(true);
            } else {
                setPickingProfile(false);
            }

        } catch (e) {
            console.log('Error loading settings:', e);
            setFaceIdReady(true);
        } finally {
            setProfilesReady(true);
        }
    };

    const saveProfilesToStorage = async (newProfiles) => {
        try {
            await saveHaProfiles(newProfiles);
            setProfiles(newProfiles);
        } catch (e) {
            console.log('Error saving profiles:', e);
            Alert.alert('Error', 'Failed to save profiles');
        }
    };

    const handleSaveProfile = async () => {
        if (!editingProfile.name || !editingProfile.haUrl) {
            Alert.alert('Error', 'Name and Home Assistant URL are required');
            return;
        }

        let newProfiles = [...profiles];
        let createdId = null;
        const incomingUrl = normalizeHaUrl(editingProfile.haUrl);
        const incomingToken = String(editingProfile.haToken || '').trim();

        if (editingProfile.id) {
            const index = newProfiles.findIndex(p => p.id === editingProfile.id);
            if (index !== -1) {
                newProfiles[index] = { ...editingProfile };
            }
        } else {
            const existingHome = newProfiles.find((p) => {
                if (normalizeHaUrl(p.haUrl) !== incomingUrl) return false;
                const token = String(p.haToken || '').trim();
                if (incomingToken && token) return token === incomingToken;
                return true;
            });
            if (existingHome) {
                Alert.alert(
                    'Home already saved',
                    'This Home Assistant is already in your profiles. Opening it so you can sign in.',
                );
                setEditingProfile(null);
                setShowSettings(false);
                activeProfileIdRef.current = existingHome.id;
                setActiveProfileId(existingHome.id);
                await SecureStore.setItemAsync(SETTINGS_KEY_ACTIVE_PROFILE, existingHome.id);
                setHaUrl(existingHome.haUrl || '');
                setHaToken(existingHome.haToken || '');
                setAdminUrl(existingHome.adminUrl || '');
                setUsers([]);
                setSelectedUser(null);
                setUsername('');
                setPassword('');
                pickedProfileRef.current = true;
                setPickingProfile(false);
                return;
            }
            const newProfile = {
                ...editingProfile,
                id: generateId()
            };
            newProfiles.push(newProfile);
            createdId = newProfile.id;
        }

        await saveProfilesToStorage(newProfiles);

        const nextProfile = createdId
            ? newProfiles.find((p) => p.id === createdId)
            : newProfiles.find((p) => p.id === editingProfile.id) || editingProfile;
        const shouldActivate = !!createdId || nextProfile?.id === activeProfileIdRef.current || nextProfile?.id === activeProfileId;

        if (shouldActivate && nextProfile?.id) {
            activeProfileIdRef.current = nextProfile.id;
            setActiveProfileId(nextProfile.id);
            await SecureStore.setItemAsync(SETTINGS_KEY_ACTIVE_PROFILE, nextProfile.id);

            if (!isAddAccount) {
                HAService.disconnectAll();
            } else if (service.current?.disconnect) {
                service.current.disconnect();
                service.current = null;
            }

            setUsers([]);
            setSelectedUser(null);
            setUsername('');
            setPassword('');
            setHaUrl(nextProfile.haUrl || '');
            setHaToken(nextProfile.haToken || '');
            setAdminUrl(nextProfile.adminUrl || '');
        }

        setEditingProfile(null);
        setShowSettings(false);
        if (createdId && isAddAccount) {
            pickedProfileRef.current = true;
            setPickingProfile(false);
        }
    };

    const handleDeleteProfile = async (profileId) => {
        Alert.alert(
            'Delete Profile',
            'Are you sure you want to delete this profile?',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                        const newProfiles = profiles.filter(p => p.id !== profileId);
                        await saveProfilesToStorage(newProfiles);

                        // If we deleted the active profile, switch to another or clear
                        if (profileId === activeProfileId) {
                            // FORCE DISCONNECT ALL
                            HAService.disconnectAll();

                            if (newProfiles.length > 0) {
                                setActiveProfileId(newProfiles[0].id);
                                await SecureStore.setItemAsync(SETTINGS_KEY_ACTIVE_PROFILE, newProfiles[0].id);
                            } else {
                                setActiveProfileId(null);
                                await SecureStore.deleteItemAsync(SETTINGS_KEY_ACTIVE_PROFILE);
                            }
                        }
                    }
                }
            ]
        );
    };

    const handleSelectProfile = async (profileId) => {
        if (!isAddAccount) {
            HAService.disconnectAll();
        } else if (service.current?.disconnect) {
            service.current.disconnect();
            service.current = null;
        }

        setActiveProfileId(profileId);
        activeProfileIdRef.current = profileId;
        await SecureStore.setItemAsync(SETTINGS_KEY_ACTIVE_PROFILE, profileId);
        setUsers([]);
        setSelectedUser(null);
        setUsername('');
        setPassword('');
        setLoadingUsers(true);
        if (isAddAccount) {
            pickedProfileRef.current = true;
            setPickingProfile(false);
        }
    };

    const handleSaveFaceId = async (enabled) => {
        try {
            await SecureStore.setItemAsync('face_id_enabled', enabled ? 'true' : 'false');
            if (!enabled) {
                // Turning off Face ID clears stored credentials
                await SecureStore.deleteItemAsync('saved_password');
                await SecureStore.deleteItemAsync('saved_username');
                setHasSavedBiometricCreds(false);
            }
        } catch (e) {
            console.log('Error saving FaceID setting:', e);
        }
    };

    const onToggleFaceId = (next) => {
        setFaceIdEnabled(next);
        if (faceIdReady) handleSaveFaceId(next);
    };

    const applyFetchedUsers = async (mappedUsers) => {
        const list = mappedUsers.length > 0
            ? mappedUsers
            : [{ id: 'manual', name: 'Manual Login' }];
        setUsers(list);
        let accounts = [];
        try { accounts = await listAccounts(); } catch { accounts = []; }
        const currentHome = normalizeHaUrl(haUrl);
        const isTaken = (uname) => accounts.some((a) => {
            if (normalizeUsername(a.username) !== normalizeUsername(uname)) return false;
            const aHome = normalizeHaUrl(a.haUrl);
            if (aHome && currentHome) return aHome === currentHome;
            return !!(a.profileId && a.profileId === (activeProfileIdRef.current || activeProfileId));
        });
        setSavedAccounts(accounts);
        const pick = isAddAccount
            ? (list.find((u) => u.id !== 'manual' && !isTaken(u.id.replace(/^person\./, ''))) || list[0])
            : list[0];
        setSelectedUser(pick);
        if (pick?.id && pick.id !== 'manual') {
            setUsername(pick.id.replace(/^person\./, ''));
        }
    };

    const fetchUsersFromHa = async () => {
        if (!haUrl || !haToken) return;
        const fetchId = ++usersFetchIdRef.current;
        setLoadingUsers(true);
        const stillCurrent = () => fetchId === usersFetchIdRef.current;

        try {
            let mapped = [];
            let lastErr = null;
            for (let attempt = 0; attempt < 3 && stillCurrent(); attempt++) {
                try {
                    mapped = await fetchPersonsFromHaRest(haUrl, haToken);
                    lastErr = null;
                    break;
                } catch (e) {
                    lastErr = e;
                    console.log(`[Login] Person REST attempt ${attempt + 1} failed:`, e?.message || e);
                    if (attempt < 2) await new Promise((r) => setTimeout(r, 700 * (attempt + 1)));
                }
            }

            if (!stillCurrent()) return;

            if (mapped.length > 0) {
                console.log('[Login] REST persons:', mapped.length);
                await applyFetchedUsers(mapped);
                setLoadingUsers(false);
                return;
            }
            if (lastErr) {
                console.log('[Login] REST user fetch failed, trying WebSocket:', lastErr?.message || lastErr);
            }
        } catch (restErr) {
            if (!stillCurrent()) return;
            console.log('[Login] REST user fetch failed, trying WebSocket:', restErr?.message || restErr);
        }

        if (stillCurrent()) connectAndFetchUsers(fetchId);
    };

    const connectAndFetchUsers = (fetchId = usersFetchIdRef.current) => {
        if (!haUrl || !haToken) {
            setLoadingUsers(false);
            return;
        }
        const stillCurrent = () => fetchId === usersFetchIdRef.current;
        setLoadingUsers(true);

        try {
            if (service.current) {
                if (service.current.disconnect) service.current.disconnect();
                else service.current.socket?.close();
                service.current = null;
            }

            service.current = new HAService(haUrl, haToken);
            service.current.connect();

            const safetyTimer = setTimeout(() => {
                if (!stillCurrent()) return;
                setLoadingUsers((prev) => {
                    if (prev) {
                        console.log('[Login] WebSocket user fetch timed out');
                        setUsers((u) => (u.length ? u : [{ id: 'manual', name: 'Manual Login' }]));
                        setSelectedUser((s) => s || { id: 'manual', name: 'Manual Login' });
                    }
                    return false;
                });
            }, 12000);

            service.current.subscribe((data) => {
                if (data.type === 'connected') {
                    clearTimeout(safetyTimer);
                    if (!stillCurrent()) return;
                    service.current.getStates().then((states) => {
                        if (!stillCurrent()) return;
                        const mappedUsers = mapPersonRecords(
                            (states || []).filter((e) => e.entity_id?.startsWith('person.')),
                        );
                        console.log('[Login] WS persons:', mappedUsers.length);
                        applyFetchedUsers(mappedUsers);
                        setLoadingUsers(false);
                    }).catch((e) => {
                        if (!stillCurrent()) return;
                        console.log('Error fetching states:', e);
                        applyFetchedUsers([]);
                        setLoadingUsers(false);
                    });
                } else if (data.type === 'auth_failed' || data.type === 'auth_invalid') {
                    clearTimeout(safetyTimer);
                    if (!stillCurrent()) return;
                    Alert.alert('Error', 'Invalid HA Token');
                    applyFetchedUsers([]);
                    setLoadingUsers(false);
                }
            });
        } catch (e) {
            console.log('Connection error:', e);
            applyFetchedUsers([]);
            setLoadingUsers(false);
        }
    };

    const handleScan = async () => {
        // Find existing profile to update, or create a temporary one in editing mode?
        // Since scan is only available in the form now (conceptually), we assume we are editing.
        // Wait, the scan button was on the main login screen too. 
        // If on main screen, we should probably update the ACTIVE profile.

        if (!activeProfileId) {
            Alert.alert('No Profile', 'Please create a profile in settings first.');
            return;
        }

        setIsScanning(true);
        let found = false;
        await scanNetwork(async (url) => {
            if (!found) {
                found = true;
                setIsScanning(false);
                Alert.alert('Instance Found', `Discovered Home Assistant at ${url}`);

                // Update active profile
                const newProfiles = profiles.map(p => {
                    if (p.id === activeProfileId) {
                        return { ...p, haUrl: url };
                    }
                    return p;
                });
                await saveProfilesToStorage(newProfiles);
                // State will auto-update via useEffect
            }
        });
        if (!found) setIsScanning(false);
    };

    const handleLogin = async (route = '/dashboard-v2') => {
        if (!selectedUser) {
            Alert.alert('Error', 'Please select a user');
            return;
        }

        if (password.length === 0) {
            Alert.alert('Error', 'Please enter password');
            return;
        }

        if (!username) {
            Alert.alert('Error', 'Please enter a username');
            return;
        }

        if (!haUrl) {
            Alert.alert('Error', 'No Home Assistant URL configured. Please check your profile settings.');
            return;
        }

        setIsLoggingIn(true);

        try {
            // Normalise URL: ensure it uses http(s) scheme, not ws(s)
            const normalizedUrl = haUrl
                .replace(/^wss:\/\//i, 'https://')
                .replace(/^ws:\/\//i, 'http://')
                .replace(/\/$/, '');

            console.log('Trying auth with username:', username, 'URL:', normalizedUrl);
            const isValid = await validateCredentials(normalizedUrl, username, password);

            if (isValid) {
                const resolvedId = activeProfileIdRef.current || activeProfileId;
                const resolvedProfile = profiles.find((p) => p.id === resolvedId)
                    || profiles.find((p) => toHaHttpBase(p.haUrl) === toHaHttpBase(haUrl));
                const profileName = resolvedProfile?.name || '';
                const profileIdToSave = resolvedProfile?.id || resolvedId || '';

                try {
                    const result = await upsertAccountAndActivate({
                        username,
                        password,
                        name: selectedUser.name,
                        userId: selectedUser.user_id || selectedUser.userId || '',
                        profileId: profileIdToSave,
                        profileName,
                        haUrl: normalizedUrl,
                    });
                    if (isAddAccount && result?.alreadyExisted) {
                        Alert.alert(
                            'Already added',
                            'This user is already signed in for this home. Switching to that account.',
                        );
                    }
                } catch (storeErr) {
                    console.log('[Login] Failed to save account for switching:', storeErr);
                    Alert.alert(
                        'Account not saved',
                        'You are signed in, but this user could not be added to the switch list. Try Add another account again.',
                    );
                }

                if (faceIdEnabled) {
                    setHasSavedBiometricCreds(true);
                }

                // Re-register push token now that adminUrl is in SecureStore.
                // On a fresh install _layout runs before login so getAdminUrl() returned
                // null and the token was never sent to the backend.
                registerForPushNotificationsAsync().catch(() => {});

                await preloadDashboardSnapshot(profileIdToSave);

                if (isAddAccount) {
                    // Keep the existing dashboard underneath so both accounts stay signed in.
                    router.back();
                } else {
                    router.replace({
                        pathname: route,
                        params: {
                            userName: selectedUser.name,
                            userId: selectedUser.user_id || '',
                            switchKey: String(Date.now()),
                        }
                    });
                }
            } else {
                Alert.alert('Login Failed', 'Invalid username or password.');
            }

        } catch (error) {
            console.error('Login error:', error);
            Alert.alert('Error', 'Could not connect to Home Assistant to verify credentials.');
        } finally {
            setIsLoggingIn(false);
        }
    };

    const handleBiometricLogin = async () => {
        try {
            const faceOn = (await SecureStore.getItemAsync('face_id_enabled')) === 'true';
            if (!faceOn) {
                Alert.alert('Face ID', 'Enable Face ID in Settings or Login settings first.');
                return;
            }

            const savedUser = await SecureStore.getItemAsync('saved_username');
            const savedPass = await SecureStore.getItemAsync('saved_password');
            if (!savedUser || !savedPass) {
                Alert.alert(
                    'Face ID',
                    'Please log in once with your password while Face ID is enabled. After that you can use Face ID.',
                );
                return;
            }

            if (!haUrl) {
                Alert.alert('Error', 'No Home Assistant URL configured. Please check your profile settings.');
                return;
            }

            const result = await LocalAuthentication.authenticateAsync({
                promptMessage: 'Login with Face ID',
                fallbackLabel: 'Use Password',
                disableDeviceFallback: false,
            });

            if (!result.success) {
                if (result.error && result.error !== 'user_cancel' && result.error !== 'system_cancel') {
                    Alert.alert('Face ID', result.error === 'not_enrolled'
                        ? 'No Face ID / biometrics enrolled on this device.'
                        : 'Face ID authentication failed.');
                }
                return;
            }

            setIsLoggingIn(true);
            setUsername(savedUser);

            const normalizedUrl = haUrl
                .replace(/^wss:\/\//i, 'https://')
                .replace(/^ws:\/\//i, 'http://')
                .replace(/\/$/, '');

            if (!(await validateCredentials(normalizedUrl, savedUser, savedPass))) {
                Alert.alert('Error', 'Saved credentials are no longer valid. Please log in with your password again.');
                setIsLoggingIn(false);
                return;
            }

            console.log('Biometric login success');

            const userObj = users.find(u => {
                const guess = u.id.replace('person.', '');
                return guess === savedUser || u.name?.toLowerCase().replace(/\s+/g, '_') === savedUser;
            }) || { name: savedUser, user_id: '' };

            const profileName = profiles.find((p) => p.id === activeProfileId)?.name || '';

            await upsertAccountAndActivate({
                username: savedUser,
                password: savedPass,
                name: userObj.name || savedUser,
                userId: userObj.user_id || '',
                profileId: activeProfileId || '',
                profileName,
                haUrl: normalizedUrl,
            });

            registerForPushNotificationsAsync().catch(() => {});

            await preloadDashboardSnapshot(activeProfileId);

            router.replace({
                pathname: '/dashboard-v2',
                params: {
                    userName: userObj.name || savedUser,
                    userId: userObj.user_id || '',
                    switchKey: String(Date.now()),
                },
            });
        } catch (e) {
            console.log('Biometric error:', e);
            Alert.alert('Error', e?.message || 'Biometric authentication failed');
            setIsLoggingIn(false);
        }
    };

    const renderProfileList = () => (
        <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <Text style={styles.sectionTitle}>Profiles</Text>
                <TouchableOpacity
                    style={styles.addProfileBtn}
                    onPress={() => setEditingProfile({ name: '', haUrl: '', adminUrl: '', haToken: '' })}
                >
                    <Plus size={20} color="#fff" />
                    <Text style={styles.addProfileText}>Add Profile</Text>
                </TouchableOpacity>
            </View>

            <FlatList
                data={profiles}
                keyExtractor={item => item.id}
                contentContainerStyle={{ paddingBottom: 20 }}
                renderItem={({ item }) => (
                    <TouchableOpacity
                        style={[
                            styles.profileItem,
                            activeProfileId === item.id && styles.activeProfileItem
                        ]}
                        onPress={() => {
                            handleSelectProfile(item.id);
                            setShowSettings(false);
                        }}
                    >
                        <View style={styles.profileInfo}>
                            <View style={styles.profileHeader}>
                                <Text style={styles.profileName}>{item.name}</Text>
                                {activeProfileId === item.id && (
                                    <View style={styles.activeBadge}>
                                        <Text style={styles.activeBadgeText}>Active</Text>
                                    </View>
                                )}
                            </View>
                            <Text style={styles.profileUrl} numberOfLines={1}>{item.haUrl}</Text>
                        </View>

                        <View style={styles.profileActions}>
                            <TouchableOpacity
                                style={styles.actionBtn}
                                onPress={() => setEditingProfile({ ...item })}
                            >
                                <Edit2 size={18} color={Colors.textDim} />
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={styles.actionBtn}
                                onPress={() => handleDeleteProfile(item.id)}
                            >
                                <Trash2 size={18} color="#ff4444" />
                            </TouchableOpacity>
                        </View>
                    </TouchableOpacity>
                )}
                ListEmptyComponent={
                    <View style={styles.emptyState}>
                        <Text style={styles.emptyStateText}>No profiles found. Create one to get started.</Text>
                    </View>
                }
            />

            <View style={styles.globalSettings}>
                <Text style={styles.sectionTitle}>Global Settings</Text>
                <View style={styles.switchRow}>
                    <Text style={[styles.switchLabel, { color: Colors.text }]}>Enable FaceID Login</Text>
                    <TouchableOpacity
                        style={[styles.switch, faceIdEnabled && styles.switchActive]}
                        onPress={() => onToggleFaceId(!faceIdEnabled)}
                    >
                        <View style={[styles.switchThumb, faceIdEnabled && styles.switchThumbActive]} />
                    </TouchableOpacity>
                </View>
            </View>
        </View>
    );

    const profileFormScrollRef = useRef(null);
    const tokenFieldRef = useRef(null);
    const [settingsKeyboardPad, setSettingsKeyboardPad] = useState(0);

    useEffect(() => {
        if (!showSettings) {
            setSettingsKeyboardPad(0);
            return;
        }
        const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
        const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
        const onShow = (e) => {
            const h = e?.endCoordinates?.height ?? 0;
            setSettingsKeyboardPad(Math.max(0, h));
        };
        const onHide = () => setSettingsKeyboardPad(0);
        const subShow = Keyboard.addListener(showEvt, onShow);
        const subHide = Keyboard.addListener(hideEvt, onHide);
        return () => {
            subShow.remove();
            subHide.remove();
        };
    }, [showSettings]);

    const scrollFormFieldIntoView = (yHint = 0) => {
        setTimeout(() => {
            profileFormScrollRef.current?.scrollTo({
                y: Math.max(0, yHint),
                animated: true,
            });
        }, Platform.OS === 'ios' ? 280 : 120);
    };

    const renderProfileForm = (inline = false) => {
        const FormWrap = inline ? View : ScrollView;
        const wrapProps = inline
            ? { style: { width: '100%' } }
            : {
                ref: profileFormScrollRef,
                style: { flex: 1 },
                contentContainerStyle: {
                    paddingBottom: 24 + (settingsKeyboardPad > 0 ? Math.min(settingsKeyboardPad, 320) : 0),
                    flexGrow: 1,
                },
                keyboardShouldPersistTaps: 'handled',
                keyboardDismissMode: 'on-drag',
                showsVerticalScrollIndicator: false,
                nestedScrollEnabled: true,
            };
        return (
        <FormWrap {...wrapProps}>
            <TouchableOpacity
                style={styles.backButton}
                onPress={() => {
                    Keyboard.dismiss();
                    setEditingProfile(null);
                }}
            >
                <ChevronDown size={24} color={Colors.text} style={{ transform: [{ rotate: '90deg' }] }} />
                <Text style={styles.backButtonText}>Back to Profiles</Text>
            </TouchableOpacity>

            <View style={styles.formGroup}>
                <Text style={styles.label}>Profile Name</Text>
                <TextInput
                    style={styles.settingsInput}
                    value={editingProfile.name}
                    onChangeText={text => setEditingProfile({ ...editingProfile, name: text })}
                    placeholder="e.g. Home, Office, Cabin"
                    placeholderTextColor={Colors.textDim}
                    returnKeyType="next"
                    onFocus={() => scrollFormFieldIntoView(0)}
                />
            </View>

            <View style={styles.formGroup}>
                <Text style={styles.label}>Home Assistant URL</Text>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                    <TextInput
                        style={[styles.settingsInput, { flex: 1 }]}
                        value={editingProfile.haUrl}
                        onChangeText={text => setEditingProfile({ ...editingProfile, haUrl: text })}
                        placeholder="https://homeassistant.local:8123"
                        placeholderTextColor={Colors.textDim}
                        autoCapitalize="none"
                        returnKeyType="next"
                        onFocus={() => scrollFormFieldIntoView(80)}
                    />
                    <TouchableOpacity
                        style={styles.scanBtn}
                        onPress={async () => {
                            let found = false;
                            await scanNetwork((url) => {
                                if (!found) {
                                    found = true;
                                    setEditingProfile(prev => ({ ...prev, haUrl: url }));
                                    Alert.alert('Found', `Discovered: ${url}`);
                                }
                            });
                        }}
                    >
                        <Scan size={20} color={Colors.text} />
                    </TouchableOpacity>
                </View>
            </View>

            <View style={styles.formGroup}>
                <Text style={styles.label}>Admin Backend URL</Text>
                <TextInput
                    style={styles.settingsInput}
                    value={editingProfile.adminUrl}
                    onChangeText={text => setEditingProfile({ ...editingProfile, adminUrl: text })}
                    placeholder="Optional admin backend URL"
                    placeholderTextColor={Colors.textDim}
                    autoCapitalize="none"
                    returnKeyType="next"
                    onFocus={() => scrollFormFieldIntoView(160)}
                />
            </View>

            <View style={styles.formGroup} collapsable={false}>
                <Text style={styles.label}>Long-Lived Access Token</Text>
                <TextInput
                    ref={tokenFieldRef}
                    style={[styles.settingsInput, { height: 100, textAlignVertical: 'top', paddingTop: 10 }]}
                    value={editingProfile.haToken}
                    onChangeText={text => setEditingProfile({ ...editingProfile, haToken: text })}
                    placeholder="Paste your token here..."
                    placeholderTextColor={Colors.textDim}
                    multiline
                    onFocus={() => scrollFormFieldIntoView(240)}
                />
            </View>

            <TouchableOpacity
                style={[styles.saveButton, { marginTop: 16, marginBottom: 8 }]}
                onPress={handleSaveProfile}
            >
                <Text style={styles.saveButtonText}>Save Profile</Text>
            </TouchableOpacity>
        </FormWrap>
        );
    };

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={{ flex: 1 }}
        >
            <TouchableWithoutFeedback
                onPress={Keyboard.dismiss}
                disabled={!!(isAddAccount && editingProfile)}
            >
                <View style={styles.container}>
                    <ScrollView
                        ref={scrollViewRef}
                        style={{ flex: 1 }}
                        contentContainerStyle={{ flexGrow: 1, justifyContent: (isAddAccount && editingProfile) ? 'flex-start' : 'center' }}
                        keyboardShouldPersistTaps="handled"
                        showsVerticalScrollIndicator={false}
                    >
                        <View style={styles.form}>
                            {!profilesReady ? (
                                <ActivityIndicator color={Colors.primary} size="large" />
                            ) : isAddAccount && editingProfile ? (
                                <View style={{ width: '100%', minHeight: 420 }}>
                                    <View style={styles.welcomeBlock}>
                                        <Text style={styles.welcomeText}>
                                            {editingProfile.id ? 'Edit Profile' : 'Create Profile'}
                                        </Text>
                                        <Text style={styles.welcomeSubText}>
                                            Save this home, then sign in as a user
                                        </Text>
                                    </View>
                                    {renderProfileForm(true)}
                                </View>
                            ) : isAddAccount && pickingProfile && profiles.length > 0 ? (
                                <View style={{ width: '100%' }}>
                                    <View style={styles.welcomeBlock}>
                                        <Text style={styles.welcomeText}>Add Account</Text>
                                        <Text style={styles.welcomeSubText}>
                                            Choose a saved home, then sign in. If it is not listed, create a new profile.
                                        </Text>
                                        <TouchableOpacity
                                            style={{ marginTop: 12 }}
                                            onPress={() => router.back()}
                                        >
                                            <Text style={{ color: Colors.primary, fontWeight: '600' }}>Cancel</Text>
                                        </TouchableOpacity>
                                    </View>
                                    {profiles.map((item) => (
                                        <TouchableOpacity
                                            key={item.id}
                                            style={[
                                                styles.profileItem,
                                                activeProfileId === item.id && styles.activeProfileItem,
                                            ]}
                                            onPress={() => handleSelectProfile(item.id)}
                                        >
                                            <View style={styles.profileInfo}>
                                                <View style={styles.profileHeader}>
                                                    <Text style={styles.profileName}>{item.name}</Text>
                                                    {activeProfileId === item.id && (
                                                        <View style={styles.activeBadge}>
                                                            <Text style={styles.activeBadgeText}>Current</Text>
                                                        </View>
                                                    )}
                                                </View>
                                                <Text style={styles.profileUrl} numberOfLines={1}>
                                                    {item.haUrl}
                                                </Text>
                                            </View>
                                            <ChevronDown
                                                size={20}
                                                color={Colors.textDim}
                                                style={{ transform: [{ rotate: '-90deg' }] }}
                                            />
                                        </TouchableOpacity>
                                    ))}
                                    <TouchableOpacity
                                        style={[styles.createProfileBtn, { marginTop: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, alignSelf: 'stretch' }]}
                                        onPress={() => {
                                            setEditingProfile({ name: '', haUrl: '', adminUrl: '', haToken: '' });
                                        }}
                                    >
                                        <Plus size={18} color="#fff" />
                                        <Text style={styles.createProfileBtnText}>Create new profile</Text>
                                    </TouchableOpacity>
                                </View>
                            ) : profiles.length === 0 ? (
                                <View style={styles.noProfileWarning}>
                                    <Shield size={40} color={Colors.primary} style={{ marginBottom: 10 }} />
                                    <Text style={styles.warningText}>No Connection Profiles</Text>
                                    <Text style={styles.warningSubText}>Please add a Home Assistant connection profile in settings to continue.</Text>
                                    <TouchableOpacity
                                        style={styles.createProfileBtn}
                                        onPress={() => {
                                            setEditingProfile({ name: 'My Home', haUrl: '', adminUrl: '', haToken: '' });
                                            if (!isAddAccount) setShowSettings(true);
                                        }}
                                    >
                                        <Text style={styles.createProfileBtnText}>Create Profile</Text>
                                    </TouchableOpacity>
                                </View>
                            ) : (
                                <>
                                    <View style={styles.welcomeBlock}>
                                        <Text style={styles.welcomeText}>
                                            {isAddAccount
                                                ? 'Add Account'
                                                : isReturningUser
                                                    ? 'Welcome Back'
                                                    : 'Welcome'}
                                        </Text>
                                        <Text style={styles.welcomeSubText}>
                                            {isAddAccount
                                                ? 'Sign in with another user — you can switch from the home screen'
                                                : isReturningUser
                                                    ? 'Good to see you again'
                                                    : "Let's get you connected"}
                                        </Text>
                                        {isAddAccount ? (
                                            <TouchableOpacity
                                                style={{ marginTop: 12 }}
                                                onPress={() => router.back()}
                                            >
                                                <Text style={{ color: Colors.primary, fontWeight: '600' }}>Cancel</Text>
                                            </TouchableOpacity>
                                        ) : null}
                                    </View>

                                    <View style={styles.inputContainer}>
                                        <View style={{ flex: 1 }}>
                                            <Text style={styles.inputLabel}>Connected to</Text>
                                            <Text style={styles.connectedProfileName}>
                                                {profiles.find(p => p.id === activeProfileId)?.name || 'Unknown Profile'}
                                            </Text>
                                        </View>
                                        <TouchableOpacity onPress={() => {
                                            if (isAddAccount) {
                                                pickedProfileRef.current = false;
                                                setPickingProfile(true);
                                                return;
                                            }
                                            setEditingProfile(null);
                                            setShowSettings(true);
                                        }}>
                                            <Settings size={20} color={Colors.primary} />
                                        </TouchableOpacity>
                                    </View>

                                    {/* User Dropdown */}
                                    <TouchableOpacity
                                        style={styles.inputContainer}
                                        onPress={() => {
                                            setShowUserModal(true);
                                            if (haUrl && haToken && !loadingUsers && (users.length === 0 || (users.length === 1 && users[0].id === 'manual'))) {
                                                fetchUsersFromHa();
                                            }
                                        }}
                                    >
                                        <User size={20} color={Colors.textDim} style={styles.inputIcon} />
                                        <View style={{ flex: 1 }}>
                                            <Text style={[styles.input, { lineHeight: 60, color: selectedUser ? Colors.text : Colors.textDim }]}>
                                                {selectedUser ? selectedUser.name : (loadingUsers ? "Loading users..." : "Select User")}
                                            </Text>
                                        </View>
                                        {loadingUsers ? (
                                            <ActivityIndicator size="small" color={Colors.primary} />
                                        ) : (
                                            <ChevronDown size={20} color={Colors.textDim} />
                                        )}
                                    </TouchableOpacity>

                                    {/* Username Input */}
                                    <View style={styles.inputContainer}>
                                        <User size={20} color={Colors.textDim} style={styles.inputIcon} />
                                        <TextInput
                                            style={styles.input}
                                            placeholder="Username"
                                            placeholderTextColor={Colors.textDim}
                                            value={username}
                                            onChangeText={setUsername}
                                            autoCapitalize="none"
                                            returnKeyType="next"
                                            onSubmitEditing={() => passwordInputRef.current?.focus()}
                                            blurOnSubmit={false}
                                            onFocus={scrollToInput}
                                        />
                                    </View>

                                    <View style={styles.inputContainer}>
                                        <Lock size={20} color={Colors.textDim} style={styles.inputIcon} />
                                        <TextInput
                                            style={styles.input}
                                            placeholder="Password"
                                            placeholderTextColor={Colors.textDim}
                                            value={password}
                                            onChangeText={setPassword}
                                            secureTextEntry
                                            ref={passwordInputRef}
                                            returnKeyType="go"
                                            onSubmitEditing={() => handleLogin('/dashboard-v2')}
                                            onFocus={scrollToInput}
                                        />
                                    </View>

                                    <TouchableOpacity
                                        style={[styles.button, { backgroundColor: '#8947ca', opacity: (isLoggingIn || !username) ? 0.7 : 1 }]}
                                        onPress={() => handleLogin('/dashboard-v2')}
                                        disabled={isLoggingIn || !username}
                                    >
                                        {isLoggingIn ? (
                                            <ActivityIndicator color="#fff" />
                                        ) : (
                                            <Text style={styles.buttonText}>Login</Text>
                                        )}
                                    </TouchableOpacity>

                                    {faceIdEnabled && isBiometricSupported && !isAddAccount && (
                                        <TouchableOpacity
                                            style={[styles.bioButton, { opacity: (isLoggingIn || !hasSavedBiometricCreds) ? 0.55 : 1 }]}
                                            onPress={handleBiometricLogin}
                                            disabled={isLoggingIn}
                                        >
                                            <Fingerprint size={28} color={Colors.primary} />
                                            <Text style={styles.bioText}>
                                                {hasSavedBiometricCreds ? 'Use Face ID' : 'Log in once to activate Face ID'}
                                            </Text>
                                        </TouchableOpacity>
                                    )}

                                    <Text style={styles.supportText}>
                                        Having trouble signing in? We're here to help —{' '}
                                        <Text
                                            style={styles.supportEmail}
                                            onPress={() => Linking.openURL('mailto:info@primewave.ai')}
                                        >
                                            info@primewave.ai
                                        </Text>
                                    </Text>
                                </>
                            )}
                        </View>
                    </ScrollView>
                </View>
            </TouchableWithoutFeedback>

                        {/* User Selection Modal */}
                        <Modal
                            visible={showUserModal}
                            transparent={true}
                            animationType="slide"
                            onRequestClose={() => setShowUserModal(false)}
                        >
                            <View style={styles.modalOverlay}>
                                <ModalBackdrop onPress={() => setShowUserModal(false)} />
                                <View style={styles.modalContent}>
                                    <Text style={styles.modalTitle}>Select User</Text>
                                    {isAddAccount ? (
                                        <Text style={styles.userModalHint}>
                                            Existing Home Assistant users are listed below. Already added accounts are marked.
                                        </Text>
                                    ) : null}
                                    <FlatList
                                        data={users}
                                        keyExtractor={item => item.id}
                                        renderItem={({ item }) => {
                                            const uname = normalizeUsername(item.id);
                                            const alreadyAdded = savedAccounts.some((a) => {
                                                if (normalizeUsername(a.username) !== uname) return false;
                                                const aHome = normalizeHaUrl(a.haUrl);
                                                const currentHome = normalizeHaUrl(haUrl);
                                                if (aHome && currentHome) return aHome === currentHome;
                                                return !!(a.profileId && a.profileId === (activeProfileIdRef.current || activeProfileId));
                                            });
                                            return (
                                            <TouchableOpacity
                                                style={styles.userItem}
                                                onPress={() => {
                                                    if (alreadyAdded && isAddAccount) {
                                                        Alert.alert(
                                                            'Already added',
                                                            'This user is already signed in for this home. Switch accounts from the home screen.',
                                                        );
                                                        return;
                                                    }
                                                    setSelectedUser(item);
                                                    if (item.id !== 'manual') {
                                                        setUsername(item.id.replace(/^person\./, ''));
                                                    }
                                                    setShowUserModal(false);
                                                }}
                                            >
                                                <View style={styles.userRow}>
                                                    <View style={styles.userAvatar}>
                                                        <Text style={styles.userInitials}>{(item.name || 'U').substring(0, 2).toUpperCase()}</Text>
                                                    </View>
                                                    <View style={{ flex: 1 }}>
                                                        <Text style={[styles.userItemText, selectedUser?.id === item.id && { color: '#8947ca', fontWeight: 'bold' }]}>
                                                            {item.name}
                                                        </Text>
                                                        {alreadyAdded ? (
                                                            <Text style={styles.alreadyAddedText}>Already added</Text>
                                                        ) : null}
                                                    </View>
                                                </View>
                                                {selectedUser?.id === item.id && <Check size={20} color="#8947ca" />}
                                            </TouchableOpacity>
                                            );
                                        }}
                                        ListEmptyComponent={
                                            <View style={{ paddingVertical: 24, alignItems: 'center' }}>
                                                <Text style={styles.emptyStateText}>
                                                    {loadingUsers ? 'Loading users…' : 'No users loaded'}
                                                </Text>
                                                {!loadingUsers ? (
                                                    <TouchableOpacity
                                                        style={[styles.createProfileBtn, { marginTop: 14 }]}
                                                        onPress={() => {
                                                            setShowUserModal(false);
                                                            fetchUsersFromHa();
                                                        }}
                                                    >
                                                        <Text style={styles.createProfileBtnText}>Retry</Text>
                                                    </TouchableOpacity>
                                                ) : (
                                                    <ActivityIndicator color={Colors.primary} style={{ marginTop: 12 }} />
                                                )}
                                            </View>
                                        }
                                    />
                                    <TouchableOpacity
                                        style={styles.retryUsersBtn}
                                        onPress={fetchUsersFromHa}
                                        disabled={loadingUsers}
                                    >
                                        {loadingUsers
                                            ? <ActivityIndicator color={Colors.primary} size="small" />
                                            : <Text style={styles.retryUsersText}>Refresh users</Text>}
                                    </TouchableOpacity>
                                    <TouchableOpacity style={styles.closeButton} onPress={() => setShowUserModal(false)}>
                                        <Text style={styles.closeButtonText}>Cancel</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        </Modal>

                        {/* Settings Modal */}
                        <Modal
                            visible={showSettings}
                            transparent={true}
                            animationType="slide"
                            onRequestClose={() => setShowSettings(false)}
                        >
                            <View style={styles.modalOverlay}>
                                <ModalBackdrop onPress={() => {
                                    Keyboard.dismiss();
                                    setShowSettings(false);
                                }} />
                                <View
                                    style={[
                                        styles.modalContent,
                                        (() => {
                                            const winH = Dimensions.get('window').height;
                                            const winW = Dimensions.get('window').width;
                                            const isTabletLandscape = winW > winH && winW >= 900;
                                            // Android app.json uses softwareKeyboardLayoutMode: "pan".
                                            // Shrinking the sheet by keyboard height double-adjusts and
                                            // collapses the form (only Save stays visible). Pad scroll
                                            // content instead; only lift the sheet on iOS.
                                            if (Platform.OS === 'ios' && settingsKeyboardPad > 0) {
                                                const available = winH - settingsKeyboardPad - 12;
                                                return {
                                                    height: Math.min(available, winH * 0.92),
                                                    maxHeight: available,
                                                    marginBottom: settingsKeyboardPad,
                                                    paddingBottom: 12,
                                                };
                                            }
                                            if (editingProfile || isTabletLandscape) {
                                                return {
                                                    height: winH * (isTabletLandscape ? 0.92 : 0.9),
                                                    maxHeight: '94%',
                                                    marginBottom: 0,
                                                };
                                            }
                                            return {
                                                height: winH * 0.85,
                                                maxHeight: '90%',
                                                marginBottom: 0,
                                            };
                                        })(),
                                    ]}
                                >
                                    <View style={styles.modalHeader}>
                                        <Text style={styles.modalTitle}>
                                            {editingProfile
                                                ? (editingProfile.id ? 'Edit Profile' : 'Create Profile')
                                                : 'Settings'}
                                        </Text>
                                        <TouchableOpacity onPress={() => {
                                            Keyboard.dismiss();
                                            setEditingProfile(null);
                                            setShowSettings(false);
                                        }}>
                                            <X size={24} color={Colors.textDim} />
                                        </TouchableOpacity>
                                    </View>

                                    <View style={{ flex: 1, minHeight: 280 }}>
                                        {editingProfile ? renderProfileForm() : renderProfileList()}
                                    </View>
                                </View>
                            </View>
                        </Modal>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.background,
        padding: 20,
        justifyContent: 'center',
    },
    welcomeBlock: {
        width: '100%',
        alignItems: 'flex-start',
        marginBottom: 4,
    },
    welcomeText: {
        color: '#fff',
        fontSize: 26,
        fontWeight: 'bold',
        textAlign: 'left',
        marginBottom: 4,
    },
    welcomeSubText: {
        color: Colors.textDim,
        fontSize: 14,
        textAlign: 'left',
        marginBottom: 0,
    },
    form: {
        gap: 20,
    },
    inputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#13132A',
        borderRadius: 30,
        paddingHorizontal: 15,
        height: 60,
    },
    inputIcon: {
        marginRight: 10,
    },
    input: {
        flex: 1,
        color: Colors.text,
        fontSize: 16,
        height: '100%'
    },
    inputLabel: {
        color: Colors.textDim,
        fontSize: 12,
        marginBottom: 2
    },
    connectedProfileName: {
        color: Colors.primary,
        fontSize: 16,
        fontWeight: 'bold'
    },
    button: {
        backgroundColor: Colors.primary,
        height: 60,
        borderRadius: 30,
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: 0,
        shadowColor: Colors.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 5,
    },
    buttonText: {
        color: '#fff',
        fontSize: 18,
        fontWeight: 'bold',
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'flex-end'
    },
    modalContent: {
        backgroundColor: '#1e1e2d',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        padding: 24,
        width: '100%',
        height: '85%',
        maxHeight: '90%',
    },
    modalTitle: {
        color: 'white',
        fontSize: 20,
        fontWeight: 'bold',
        textAlign: 'center'
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20
    },
    // User Item Styles
    userItem: {
        paddingVertical: 15,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.1)',
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center'
    },
    userRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 15
    },
    userAvatar: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#8947ca',
        justifyContent: 'center',
        alignItems: 'center'
    },
    userInitials: {
        color: 'white',
        fontWeight: 'bold'
    },
    userItemText: {
        color: 'white',
        fontSize: 16,
    },
    closeButton: {
        marginTop: 20,
        padding: 15,
        backgroundColor: 'rgba(255,255,255,0.1)',
        borderRadius: 12,
        alignItems: 'center'
    },
    closeButtonText: {
        color: 'white',
        fontWeight: '600'
    },
    userModalHint: {
        color: Colors.textDim,
        fontSize: 13,
        marginBottom: 12,
        lineHeight: 18,
    },
    alreadyAddedText: {
        color: Colors.primary,
        fontSize: 11,
        marginTop: 2,
    },
    retryUsersBtn: {
        marginTop: 8,
        paddingVertical: 12,
        alignItems: 'center',
    },
    retryUsersText: {
        color: Colors.primary,
        fontWeight: '600',
        fontSize: 14,
    },
    // FaceID
    bioButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        padding: 15,
        marginTop: 20
    },
    bioText: {
        color: Colors.primary,
        fontSize: 16,
        fontWeight: '600'
    },
    supportText: {
        color: Colors.textDim,
        fontSize: 13,
        textAlign: 'center',
        marginTop: 8,
    },
    supportEmail: {
        color: Colors.primary,
        textDecorationLine: 'underline',
    },
    // Settings & Profiles
    sectionTitle: {
        color: Colors.textDim,
        fontSize: 14,
        fontWeight: 'bold',
        textTransform: 'uppercase'
    },
    profileItem: {
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 12,
        padding: 15,
        marginBottom: 10,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'transparent'
    },
    activeProfileItem: {
        borderColor: Colors.primary,
        backgroundColor: 'rgba(137, 71, 202, 0.1)'
    },
    profileInfo: {
        flex: 1,
        marginRight: 10
    },
    profileHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 4,
        gap: 8
    },
    profileName: {
        color: Colors.text,
        fontSize: 16,
        fontWeight: 'bold'
    },
    profileUrl: {
        color: Colors.textDim,
        fontSize: 12
    },
    activeBadge: {
        backgroundColor: Colors.primary,
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 4
    },
    activeBadgeText: {
        color: '#fff',
        fontSize: 10,
        fontWeight: 'bold'
    },
    profileActions: {
        flexDirection: 'row',
        gap: 15
    },
    actionBtn: {
        padding: 5
    },
    addProfileBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: Colors.primary,
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 16,
        gap: 4
    },
    addProfileText: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '600'
    },
    emptyState: {
        padding: 20,
        alignItems: 'center',
        justifyContent: 'center',
        borderStyle: 'dashed',
        borderWidth: 1,
        borderColor: Colors.textDim,
        borderRadius: 12,
        marginBottom: 20
    },
    emptyStateText: {
        color: Colors.textDim,
        fontSize: 14
    },
    // Form Styles
    formGroup: {
        marginBottom: 15
    },
    label: {
        color: Colors.textDim,
        marginBottom: 8,
        fontSize: 14,
        fontWeight: '600'
    },
    settingsInput: {
        backgroundColor: '#13132A',
        borderRadius: 30,
        paddingHorizontal: 18,
        paddingVertical: 14,
        color: '#fff',
        fontSize: 16,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.07)',
        minHeight: 54,
    },
    scanBtn: {
        width: 54,
        height: 54,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#13132A',
        borderRadius: 27,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.07)',
    },
    saveButton: {
        backgroundColor: Colors.primary,
        padding: 15,
        borderRadius: 12,
        alignItems: 'center',
        marginTop: 10
    },
    saveButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: 'bold'
    },
    backButton: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 20,
        paddingVertical: 10
    },
    backButtonText: {
        color: Colors.text,
        marginLeft: 10,
        fontSize: 16
    },
    noProfileWarning: {
        alignItems: 'center',
        justifyContent: 'center',
        padding: 30,
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 16
    },
    warningText: {
        color: Colors.text,
        fontSize: 18,
        fontWeight: 'bold',
        marginBottom: 5
    },
    warningSubText: {
        color: Colors.textDim,
        textAlign: 'center',
        marginBottom: 20,
        lineHeight: 20
    },
    createProfileBtn: {
        backgroundColor: Colors.primary,
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderRadius: 24
    },
    createProfileBtnText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: 'bold'
    },
    switchRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: 10,
        paddingVertical: 15,
        borderTopWidth: 1,
        borderTopColor: 'rgba(255,255,255,0.1)'
    },
    switchLabel: {
        fontSize: 16,
        fontWeight: '500'
    },
    switch: {
        width: 50,
        height: 30,
        backgroundColor: '#333',
        borderRadius: 15,
        padding: 2
    },
    switchActive: {
        backgroundColor: Colors.primary
    },
    switchThumb: {
        width: 26,
        height: 26,
        backgroundColor: '#fff',
        borderRadius: 13
    },
    switchThumbActive: {
        transform: [{ translateX: 20 }]
    },
    globalSettings: {
        marginTop: 20
    }
});
