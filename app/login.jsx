import { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, Modal, FlatList, KeyboardAvoidingView, Platform, ScrollView, Keyboard, TouchableWithoutFeedback, Linking, Dimensions } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { Colors } from '../constants/Colors';
import { Scan, Lock, User, ChevronDown, Check, Settings, Fingerprint, X, Plus, Trash2, Edit2, Shield, Link2, Wifi, Home } from 'lucide-react-native';
import { scanNetwork } from '../utils/discovery';
import { HAService } from '../services/ha';
import { validateCredentials, fetchHaLoginUsernames, usernameForPerson, mergePersonsWithAuthUsers } from '../services/auth';
import { registerForPushNotificationsAsync } from '../services/notifications';
import { upsertAccountAndActivate, listAccounts, normalizeHaUrl, normalizeUsername } from '../services/accounts';
import { beginHomeSession, peekBootProfile } from '../utils/dashboardCache';
import { bootstrapHomeFromDashboard } from '../services/homeBootstrap';
import { allowLocalUrlFallback } from '../services/connectionEndpoints';
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
                username: p.username || '',
                picture: p.attributes?.entity_picture || p.picture,
            };
        })
        .filter(Boolean);
}

function describeUsersFetchError(err, extra = {}) {
    if (extra.missingUrl) {
        return 'This profile has no Home Assistant URL. Edit the profile and add it.';
    }
    if (extra.missingToken) {
        return 'This profile has no access token. Edit the profile and paste a long-lived token.';
    }
    if (extra.authFailed) {
        return 'The access token was rejected. Edit the profile and paste a valid long-lived token.';
    }
    if (extra.empty) {
        return 'Home Assistant returned no person users. Add people in Home Assistant, then retry.';
    }
    const msg = String(err?.message || err || '');
    const lower = msg.toLowerCase();
    if (err?.name === 'AbortError' || lower.includes('abort') || lower.includes('timeout')) {
        return 'Timed out reaching Home Assistant. Check the URL and your network, then retry.';
    }
    if (lower.includes('network request failed') || lower.includes('failed to fetch') || lower.includes('network')) {
        return 'Could not reach Home Assistant. Check the URL, token, and that the server is online.';
    }
    if (lower.includes('http 401') || lower.includes('http 403')) {
        return 'Home Assistant refused the token. Update the long-lived access token in the profile.';
    }
    if (lower.includes('http 404')) {
        return 'Home Assistant URL looks wrong (not found). Check the URL in the profile.';
    }
    const http = msg.match(/HTTP\s+(\d+)/i);
    if (http) {
        return `Home Assistant returned HTTP ${http[1]}. Check the URL and token, then retry.`;
    }
    if (msg) return `Could not load users: ${msg}`;
    return 'Could not load users from Home Assistant. Check the URL and token, then retry.';
}

async function fetchJson(url, options, timeoutMs) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(url, {
            ...options,
            signal: controller.signal,
            headers: {
                Accept: 'application/json',
                'User-Agent': 'HomeAssistant/2024.1 (AppV1; React Native)',
                ...(options?.headers || {}),
            },
        });
        const text = await res.text();
        let data = null;
        try { data = text ? JSON.parse(text) : null; } catch { data = text; }
        return { ok: res.ok, status: res.status, data };
    } catch (e) {
        const err = new Error(`${e?.message || e} (${url})`);
        err.name = e?.name || 'FetchError';
        throw err;
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
        } else if (tpl.status === 401 || tpl.status === 403) {
            throw new Error(`HA template HTTP ${tpl.status}`);
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
    const insets = useSafeAreaInsets();
    const params = useLocalSearchParams();
    const modeParam = Array.isArray(params?.mode) ? params.mode[0] : params?.mode;
    const isAddAccount = modeParam === 'addAccount';
    const isEditHome = modeParam === 'editHome';
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
    const [usersError, setUsersError] = useState('');

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
    const originalProfileIdRef = useRef(null);
    const loginSucceededRef = useRef(false);
    const editHomeOpenedRef = useRef(false);
    const haUrlRef = useRef('');
    const haTokenRef = useRef('');

    // Profile Editing State
    const [editingProfile, setEditingProfile] = useState(null); // If null, showing list. If object, showing form.
    const [savingProfile, setSavingProfile] = useState(false);

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
                setHaUrl(normalizeHaUrl(profile.haUrl || ''));
                setHaToken(profile.haToken || '');
                setAdminUrl(normalizeHaUrl(profile.adminUrl || '') || profile.adminUrl || '');
            }
        } else if (profiles.length === 0) {
            setHaUrl('');
            setHaToken('');
            setAdminUrl('');
        }
    }, [activeProfileId, profiles]);

    useEffect(() => {
        haUrlRef.current = haUrl;
        haTokenRef.current = haToken;
    }, [haUrl, haToken]);

    useEffect(() => {
        if (isAddAccount && pickingProfile) return;
        if (haUrl && haToken) {
            fetchUsersFromHa(haUrl, haToken);
        } else {
            setUsers([]);
            setSelectedUser(null);
            setUsersError('');
            setLoadingUsers(false);
        }
    }, [haUrl, haToken, isAddAccount, pickingProfile]);

    useEffect(() => {
        if (!isAddAccount) return;
        setPassword('');
        if (profilesReady && profiles.length > 0 && !pickedProfileRef.current) {
            setPickingProfile(true);
        }
    }, [isAddAccount, profilesReady, profiles.length]);

    useEffect(() => {
        if (!isEditHome || !profilesReady || editHomeOpenedRef.current) return;
        const active = profiles.find((p) => p.id === activeProfileId) || profiles[0];
        if (!active) return;
        editHomeOpenedRef.current = true;
        setShowSettings(true);
        setEditingProfile({
            ...active,
            dashboardUrl: active.dashboardUrl || active.adminUrlLive || active.adminUrl || '',
            dashboardUrlLocal: active.dashboardUrlLocal || active.adminUrlLocal || '',
        });
    }, [isEditHome, profilesReady, profiles, activeProfileId]);

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
            loadedProfiles = loadedProfiles.map((p) => ({
                ...p,
                haUrl: normalizeHaUrl(p.haUrl || ''),
                adminUrl: p.adminUrl ? normalizeHaUrl(p.adminUrl) : (p.adminUrl || ''),
            }));
            const savedActiveId = await SecureStore.getItemAsync(SETTINGS_KEY_ACTIVE_PROFILE);
            originalProfileIdRef.current = savedActiveId || null;
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
        const dashboardLive = String(
            editingProfile.dashboardUrl || editingProfile.adminUrl || '',
        ).trim();
        const dashboardLocal = String(editingProfile.dashboardUrlLocal || '').trim();
        if (!String(editingProfile.name || '').trim()) {
            Alert.alert('Error', 'Profile name is required');
            return;
        }
        if (!dashboardLive) {
            Alert.alert('Error', 'Dashboard URL is required. Local URL is optional.');
            return;
        }

        setSavingProfile(true);
        try {
            const boot = await bootstrapHomeFromDashboard(dashboardLive, dashboardLocal);
            const keepLocal = allowLocalUrlFallback(dashboardLive, dashboardLocal);
            const cleanedProfile = {
                ...editingProfile,
                dashboardUrl: dashboardLive,
                dashboardUrlLocal: keepLocal ? dashboardLocal : '',
                haUrl: boot.haUrl,
                haUrlLive: boot.haUrlLive,
                haUrlLocal: boot.haUrlLocal,
                adminUrl: boot.adminUrl,
                adminUrlLive: boot.adminUrlLive || dashboardLive,
                adminUrlLocal: boot.adminUrlLocal || (keepLocal ? dashboardLocal : ''),
                haToken: boot.haToken,
            };

            let newProfiles = [...profiles];
            let createdId = null;
            const incomingAdmin = normalizeHaUrl(boot.adminUrl);
            const incomingHa = normalizeHaUrl(boot.haUrl);

            if (editingProfile.id) {
                const index = newProfiles.findIndex(p => p.id === editingProfile.id);
                if (index !== -1) {
                    newProfiles[index] = { ...cleanedProfile };
                }
            } else {
                const existingHome = newProfiles.find((p) => {
                    const admin = normalizeHaUrl(p.adminUrl || '');
                    const ha = normalizeHaUrl(p.haUrl || '');
                    return (incomingAdmin && admin === incomingAdmin) || (incomingHa && ha === incomingHa);
                });
                if (existingHome) {
                    Alert.alert(
                        'Home already saved',
                        'This dashboard is already in your profiles. Opening it so you can sign in.',
                    );
                    setEditingProfile(null);
                    setShowSettings(false);
                    activeProfileIdRef.current = existingHome.id;
                    setActiveProfileId(existingHome.id);
                    if (!isAddAccount) {
                        await SecureStore.setItemAsync(SETTINGS_KEY_ACTIVE_PROFILE, existingHome.id);
                    }
                    setHaUrl(existingHome.haUrl || '');
                    setHaToken(existingHome.haToken || '');
                    setAdminUrl(existingHome.adminUrl || '');
                    haUrlRef.current = existingHome.haUrl || '';
                    haTokenRef.current = existingHome.haToken || '';
                    setUsers([]);
                    setSelectedUser(null);
                    setUsername('');
                    setPassword('');
                    pickedProfileRef.current = true;
                    setPickingProfile(false);
                    return;
                }
                const newProfile = {
                    ...cleanedProfile,
                    id: generateId()
                };
                newProfiles.push(newProfile);
                createdId = newProfile.id;
            }

            await saveProfilesToStorage(newProfiles);

            const nextProfile = createdId
                ? newProfiles.find((p) => p.id === createdId)
                : newProfiles.find((p) => p.id === editingProfile.id) || cleanedProfile;
            const shouldActivate = !!createdId || nextProfile?.id === activeProfileIdRef.current || nextProfile?.id === activeProfileId;

            if (shouldActivate && nextProfile?.id) {
                activeProfileIdRef.current = nextProfile.id;
                setActiveProfileId(nextProfile.id);
                if (!isAddAccount) {
                    await SecureStore.setItemAsync(SETTINGS_KEY_ACTIVE_PROFILE, nextProfile.id);
                }

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
                haUrlRef.current = nextProfile.haUrl || '';
                haTokenRef.current = nextProfile.haToken || '';
            }

            setEditingProfile(null);
            setShowSettings(false);
            if (isEditHome) {
                router.back();
                return;
            }
            if (createdId && isAddAccount) {
                pickedProfileRef.current = true;
                setPickingProfile(false);
            }
        } catch (e) {
            const msg = String(e?.message || e || 'Could not reach the dashboard.');
            const needsHaConfig = /no Home Assistant token|not configured/i.test(msg);
            Alert.alert(
                'Could not connect',
                needsHaConfig
                    ? `${msg}\n\nIn the admin dashboard, open Home Assistant and save the live HTTPS URL, local HTTP URL, and token.`
                    : msg,
            );
        } finally {
            setSavingProfile(false);
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

    const cancelAddAccount = async () => {
        if (!loginSucceededRef.current && originalProfileIdRef.current) {
            try {
                await SecureStore.setItemAsync(SETTINGS_KEY_ACTIVE_PROFILE, originalProfileIdRef.current);
            } catch {
                // ignore
            }
        }
        router.back();
    };

    useEffect(() => {
        if (!isAddAccount) return undefined;
        return () => {
            if (loginSucceededRef.current || !originalProfileIdRef.current) return;
            SecureStore.setItemAsync(SETTINGS_KEY_ACTIVE_PROFILE, originalProfileIdRef.current).catch(() => {});
        };
    }, [isAddAccount]);

    const handleSelectProfile = async (profileId) => {
        if (!isAddAccount) {
            HAService.disconnectAll();
        } else if (service.current?.disconnect) {
            service.current.disconnect();
            service.current = null;
        }

        const profile = profiles.find((p) => p.id === profileId);
        setActiveProfileId(profileId);
        activeProfileIdRef.current = profileId;
        if (!isAddAccount) {
            await SecureStore.setItemAsync(SETTINGS_KEY_ACTIVE_PROFILE, profileId);
        }
        const nextUrl = normalizeHaUrl(profile?.haUrl || '');
        const nextToken = (profile?.haToken || '').trim();
        setHaUrl(nextUrl);
        setHaToken(nextToken);
        setAdminUrl(normalizeHaUrl(profile?.adminUrl || '') || profile?.adminUrl || '');
        haUrlRef.current = nextUrl;
        haTokenRef.current = nextToken;
        setUsers([]);
        setSelectedUser(null);
        setUsername('');
        setPassword('');
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

    const applyFetchedUsers = async (mappedUsers, errorMessage = '') => {
        let list = Array.isArray(mappedUsers) ? mappedUsers : [];
        const url = haUrlRef.current || haUrl;
        const token = haTokenRef.current || haToken;
        if (url && token) {
            try {
                const authUsers = await fetchHaLoginUsernames(url, token);
                if (authUsers.length) {
                    list = mergePersonsWithAuthUsers(list, authUsers);
                }
            } catch (e) {
                console.log('[Login] Auth user list skipped:', e?.message || e);
            }
        }
        setUsers(list);
        setUsersError(list.length > 0 ? '' : (errorMessage || describeUsersFetchError(null, { empty: true })));
        if (list.length === 0) {
            setSelectedUser(null);
            return;
        }
        let accounts = [];
        try { accounts = await listAccounts(); } catch { accounts = []; }
        const currentHome = normalizeHaUrl(haUrlRef.current || haUrl);
        const isTaken = (uname) => accounts.some((a) => {
            if (normalizeUsername(a.username) !== normalizeUsername(uname)) return false;
            const aHome = normalizeHaUrl(a.haUrl);
            if (aHome && currentHome) return aHome === currentHome;
            return !!(a.profileId && a.profileId === (activeProfileIdRef.current || activeProfileId));
        });
        setSavedAccounts(accounts);
        const pick = isAddAccount
            ? (list.find((u) => !isTaken(u.username || u.id.replace(/^person\./, ''))) || list[0])
            : list[0];
        setSelectedUser(pick);
        if (pick) {
            setUsername(usernameForPerson(pick) || pick.username || pick.id.replace(/^person\./, ''));
        }
    };

    const fetchUsersFromHa = async (urlOverride, tokenOverride) => {
        const url = urlOverride || haUrlRef.current || haUrl;
        const token = tokenOverride || haTokenRef.current || haToken;
        if (!url || !token) {
            setUsers([]);
            setSelectedUser(null);
            setUsersError(describeUsersFetchError(null, {
                missingUrl: !url,
                missingToken: !!url && !token,
            }));
            setLoadingUsers(false);
            return;
        }
        const fetchId = ++usersFetchIdRef.current;
        setUsersError('');
        setLoadingUsers(true);
        const stillCurrent = () => fetchId === usersFetchIdRef.current;
        let lastErr = null;

        try {
            let mapped = [];
            for (let attempt = 0; attempt < 4 && stillCurrent(); attempt++) {
                try {
                    mapped = await fetchPersonsFromHaRest(url, token);
                    lastErr = null;
                    break;
                } catch (e) {
                    lastErr = e;
                    console.log(`[Login] Person REST attempt ${attempt + 1} failed:`, e?.message || e);
                    if (attempt < 3) await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
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
            lastErr = restErr;
            console.log('[Login] REST user fetch failed, trying WebSocket:', restErr?.message || restErr);
        }

        if (stillCurrent()) connectAndFetchUsers(fetchId, url, token, lastErr);
    };

    const connectAndFetchUsers = (fetchId = usersFetchIdRef.current, urlOverride, tokenOverride, priorErr = null) => {
        const url = urlOverride || haUrlRef.current || haUrl;
        const token = tokenOverride || haTokenRef.current || haToken;
        if (!url || !token) {
            setUsersError(describeUsersFetchError(null, {
                missingUrl: !url,
                missingToken: !!url && !token,
            }));
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

            service.current = new HAService(url, token);
            service.current.connect();

            const safetyTimer = setTimeout(() => {
                if (!stillCurrent()) return;
                setLoadingUsers((prev) => {
                    if (prev) {
                        console.log('[Login] WebSocket user fetch timed out');
                        applyFetchedUsers([], describeUsersFetchError(priorErr || new Error('Timed out connecting to Home Assistant')));
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
                        applyFetchedUsers([], describeUsersFetchError(e));
                        setLoadingUsers(false);
                    });
                } else if (data.type === 'auth_failed' || data.type === 'auth_invalid') {
                    clearTimeout(safetyTimer);
                    if (!stillCurrent()) return;
                    applyFetchedUsers([], describeUsersFetchError(null, { authFailed: true }));
                    setLoadingUsers(false);
                }
            });
        } catch (e) {
            console.log('Connection error:', e);
            applyFetchedUsers([], describeUsersFetchError(priorErr || e));
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
        if (!username) {
            Alert.alert('Error', 'Please enter a username');
            return;
        }

        if (password.length === 0) {
            Alert.alert('Error', 'Please enter password');
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
            const authResult = await validateCredentials(normalizedUrl, username, password);
            const isValid = authResult === true || authResult?.ok === true;

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
                        name: selectedUser?.name || username,
                        userId: selectedUser?.user_id || selectedUser?.userId || '',
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

                HAService.disconnectAll();
                await beginHomeSession({
                    profileId: profileIdToSave,
                    haUrl: normalizedUrl,
                    token: resolvedProfile?.haToken,
                    adminUrl: resolvedProfile?.adminUrl,
                    haUrlLive: resolvedProfile?.haUrlLive,
                    haUrlLocal: resolvedProfile?.haUrlLocal,
                    adminUrlLive: resolvedProfile?.adminUrlLive || resolvedProfile?.dashboardUrl,
                    adminUrlLocal: resolvedProfile?.adminUrlLocal || resolvedProfile?.dashboardUrlLocal,
                    clearCache: true,
                });

                loginSucceededRef.current = true;
                if (isAddAccount) {
                    // Reveal the dashboard underneath so both accounts stay signed in.
                    // The dashboard reloads rooms/cameras for the newly activated home.
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
                const reason = authResult?.reason;
                if (reason === 'invalid_auth') {
                    Alert.alert(
                        'Login Failed',
                        'Home Assistant rejected this username and password. A 200 response only means the server answered — it is not a successful sign-in.\n\nUse the Home Assistant login name (Settings → People), not only the person display name.',
                    );
                } else if (reason === 'network') {
                    Alert.alert('Error', 'Could not connect to Home Assistant to verify credentials.');
                } else {
                    Alert.alert('Login Failed', 'Invalid username or password.');
                }
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

            if (!((await validateCredentials(normalizedUrl, savedUser, savedPass))?.ok)) {
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

            HAService.disconnectAll();
            const bioProfile = profiles.find((p) => p.id === activeProfileId);
            await beginHomeSession({
                profileId: activeProfileId,
                haUrl: normalizedUrl,
                token: bioProfile?.haToken,
                adminUrl: bioProfile?.adminUrl,
                haUrlLive: bioProfile?.haUrlLive,
                haUrlLocal: bioProfile?.haUrlLocal,
                adminUrlLive: bioProfile?.adminUrlLive || bioProfile?.dashboardUrl,
                adminUrlLocal: bioProfile?.adminUrlLocal || bioProfile?.dashboardUrlLocal,
                clearCache: true,
            });

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
                    onPress={() => setEditingProfile({ name: '', dashboardUrl: '', dashboardUrlLocal: '', haUrl: '', adminUrl: '', haToken: '' })}
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
                            <Text style={styles.profileUrl} numberOfLines={1}>{item.adminUrl || item.dashboardUrl || item.haUrl}</Text>
                        </View>

                        <View style={styles.profileActions}>
                            <TouchableOpacity
                                style={styles.actionBtn}
                                onPress={() => setEditingProfile({
                                    ...item,
                                    dashboardUrl: item.dashboardUrl || item.adminUrlLive || item.adminUrl || '',
                                    dashboardUrlLocal: item.dashboardUrlLocal || item.adminUrlLocal || '',
                                })}
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

    const renderProfileForm = (inline = false, options = {}) => {
        const hideBack = !!options.hideBack;
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
            {!hideBack ? (
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
            ) : null}

            <View style={inline ? styles.profileCreateCard : null}>
                <View style={styles.formGroup}>
                    <Text style={styles.label}>Profile name</Text>
                    <View style={styles.fieldRow}>
                        <Home size={18} color={Colors.textDim} style={styles.fieldIcon} />
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
                </View>

                <View style={styles.formGroup}>
                    <Text style={styles.label}>Dashboard URL</Text>
                    <View style={styles.fieldRow}>
                        <Link2 size={18} color={Colors.textDim} style={styles.fieldIcon} />
                        <TextInput
                            style={styles.settingsInput}
                            value={editingProfile.dashboardUrl ?? editingProfile.adminUrl ?? ''}
                            onChangeText={text => setEditingProfile({ ...editingProfile, dashboardUrl: text })}
                            placeholder="https://app-backend.example.com"
                            placeholderTextColor={Colors.textDim}
                            autoCapitalize="none"
                            autoCorrect={false}
                            keyboardType="url"
                            returnKeyType="next"
                            onFocus={() => scrollFormFieldIntoView(80)}
                        />
                    </View>
                    <Text style={styles.fieldHint}>
                        Cloudflare HTTPS URL of this admin backend. Required.
                    </Text>
                </View>

                <View style={[styles.formGroup, { marginBottom: inline ? 0 : 15 }]}>
                    <Text style={styles.label}>Local URL (optional)</Text>
                    <View style={styles.fieldRow}>
                        <Wifi size={18} color={Colors.textDim} style={styles.fieldIcon} />
                        <TextInput
                            style={styles.settingsInput}
                            value={editingProfile.dashboardUrlLocal ?? ''}
                            onChangeText={text => setEditingProfile({ ...editingProfile, dashboardUrlLocal: text })}
                            placeholder="http://192.168.1.10:3000"
                            placeholderTextColor={Colors.textDim}
                            autoCapitalize="none"
                            autoCorrect={false}
                            keyboardType="url"
                            returnKeyType="done"
                            onFocus={() => scrollFormFieldIntoView(160)}
                        />
                    </View>
                    <Text style={styles.fieldHint}>
                        Optional. Add a Wi-Fi HTTP address (same as Dashboard URL, but local IP) if you do not have it yet — you can edit this later. Used when HTTPS is down.
                    </Text>
                </View>
            </View>

            <TouchableOpacity
                style={[
                    inline ? styles.button : styles.saveButton,
                    { marginTop: inline ? 22 : 16, marginBottom: 8, opacity: savingProfile ? 0.7 : 1 },
                ]}
                onPress={handleSaveProfile}
                disabled={savingProfile}
            >
                {savingProfile ? (
                    <ActivityIndicator color="#fff" />
                ) : (
                    <Text style={inline ? styles.buttonText : styles.saveButtonText}>Save profile</Text>
                )}
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
                <View style={[
                    styles.container,
                    {
                        paddingTop: Math.max(insets.top, 12) + 12,
                        paddingBottom: Math.max(insets.bottom, 16),
                    },
                ]}>
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
                                <View style={styles.profileCreateScreen}>
                                    <TouchableOpacity
                                        style={styles.profileCreateBack}
                                        onPress={() => {
                                            Keyboard.dismiss();
                                            setEditingProfile(null);
                                        }}
                                    >
                                        <ChevronDown size={20} color={Colors.text} style={{ transform: [{ rotate: '90deg' }] }} />
                                        <Text style={styles.profileCreateBackText}>Back</Text>
                                    </TouchableOpacity>
                                    <Text style={styles.profileCreateTitle}>
                                        {editingProfile.id ? 'Edit profile' : 'Create profile'}
                                    </Text>
                                    <Text style={styles.profileCreateSub}>
                                        Save this home, then sign in as a user.
                                    </Text>
                                    {renderProfileForm(true, { hideBack: true })}
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
                                            onPress={cancelAddAccount}
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
                                                    {item.adminUrl || item.dashboardUrl || item.haUrl}
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
                                            setEditingProfile({ name: '', dashboardUrl: '', dashboardUrlLocal: '', haUrl: '', adminUrl: '', haToken: '' });
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
                                            setEditingProfile({ name: 'My Home', dashboardUrl: '', dashboardUrlLocal: '', haUrl: '', adminUrl: '', haToken: '' });
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
                                                onPress={cancelAddAccount}
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

                                    <TouchableOpacity
                                        style={styles.inputContainer}
                                        onPress={() => setShowUserModal(true)}
                                    >
                                        <User size={20} color={Colors.textDim} style={styles.inputIcon} />
                                        <View style={{ flex: 1 }}>
                                            <Text
                                                style={[
                                                    styles.input,
                                                    { lineHeight: 60, color: selectedUser ? Colors.text : Colors.textDim },
                                                ]}
                                                numberOfLines={1}
                                            >
                                                {loadingUsers && !selectedUser
                                                    ? 'Loading users…'
                                                    : selectedUser
                                                        ? selectedUser.name
                                                        : (users.length ? 'Select User' : (usersError ? 'Could not load users' : 'Select User'))}
                                            </Text>
                                        </View>
                                        {loadingUsers && !selectedUser ? (
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
                                    <FlatList
                                        data={users}
                                        keyExtractor={(item) => item.id}
                                        renderItem={({ item }) => (
                                            <TouchableOpacity
                                                style={styles.userItem}
                                                onPress={() => {
                                                    setSelectedUser(item);
                                                    if (item.id !== 'manual') {
                                                        setUsername(item.username || usernameForPerson(item) || item.id.replace(/^person\./, ''));
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
                                                        {item.username && item.username !== item.name ? (
                                                            <Text style={styles.alreadyAddedText}>Login: {item.username}</Text>
                                                        ) : null}
                                                    </View>
                                                </View>
                                                {selectedUser?.id === item.id && <Check size={20} color="#8947ca" />}
                                            </TouchableOpacity>
                                        )}
                                        ListEmptyComponent={
                                            <View style={{ paddingVertical: 24, alignItems: 'center' }}>
                                                {loadingUsers ? (
                                                    <ActivityIndicator color={Colors.primary} />
                                                ) : (
                                                    <Text style={styles.emptyStateText}>
                                                        {usersError || 'No users loaded yet'}
                                                    </Text>
                                                )}
                                            </View>
                                        }
                                    />
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
                            onRequestClose={() => {
                                setShowSettings(false);
                                if (isEditHome) router.back();
                            }}
                        >
                            <View style={styles.modalOverlay}>
                                <ModalBackdrop onPress={() => {
                                    Keyboard.dismiss();
                                    setShowSettings(false);
                                    if (isEditHome) router.back();
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
                                            if (isEditHome) router.back();
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
        paddingHorizontal: 22,
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
    usersErrorHint: {
        color: '#ef9a9a',
        fontSize: 13,
        lineHeight: 18,
        marginTop: -8,
        paddingHorizontal: 8,
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
        fontSize: 14,
        textAlign: 'center',
        paddingHorizontal: 12,
        lineHeight: 20,
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
        flex: 1,
        backgroundColor: 'transparent',
        borderRadius: 0,
        paddingHorizontal: 0,
        paddingVertical: 0,
        color: '#fff',
        fontSize: 16,
        borderWidth: 0,
        minHeight: 52,
    },
    fieldRow: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#13132A',
        borderRadius: 22,
        paddingHorizontal: 16,
        minHeight: 56,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.10)',
    },
    fieldIcon: {
        marginRight: 12,
    },
    fieldHint: {
        color: 'rgba(255,255,255,0.45)',
        fontSize: 13,
        marginTop: 10,
        lineHeight: 18,
    },
    profileCreateScreen: {
        width: '100%',
        paddingBottom: 24,
    },
    profileCreateBack: {
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        marginBottom: 18,
        paddingVertical: 4,
        marginLeft: -4,
    },
    profileCreateBackText: {
        color: Colors.text,
        marginLeft: 6,
        fontSize: 16,
        fontWeight: '600',
    },
    profileCreateTitle: {
        color: '#fff',
        fontSize: 28,
        fontWeight: '700',
        letterSpacing: -0.4,
        marginBottom: 6,
    },
    profileCreateSub: {
        color: 'rgba(255,255,255,0.55)',
        fontSize: 15,
        lineHeight: 21,
        marginBottom: 22,
    },
    profileCreateCard: {
        width: '100%',
        backgroundColor: 'rgba(255,255,255,0.04)',
        borderRadius: 24,
        padding: 18,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
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
