import { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, Image, Modal, FlatList, KeyboardAvoidingView, Platform, ScrollView, Keyboard, TouchableWithoutFeedback } from 'react-native';
import { useRouter } from 'expo-router';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { Colors } from '../constants/Colors';
import { Scan, Lock, User, Server, ChevronDown, Check, Settings, Fingerprint, X, Plus, Trash2, Edit2, Shield } from 'lucide-react-native';
import { scanNetwork } from '../utils/discovery';
import { HAService } from '../services/ha';
import { validateCredentials } from '../services/auth';

const SETTINGS_KEY_PROFILES = 'ha_profiles';
const SETTINGS_KEY_ACTIVE_PROFILE = 'ha_active_profile_id';
const SETTINGS_KEY_MIGRATION_COMPLETED = 'ha_migration_completed_v1';

// Helper to generate simple ID
const generateId = () => Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

export default function Login() {
    const router = useRouter();
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

    // Profile Management State
    const [showSettings, setShowSettings] = useState(false);
    const [profiles, setProfiles] = useState([]);
    const [activeProfileId, setActiveProfileId] = useState(null);

    // Profile Editing State
    const [editingProfile, setEditingProfile] = useState(null); // If null, showing list. If object, showing form.

    useEffect(() => {
        checkBiometrics();
        loadSettings();
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
        if (haUrl && haToken && users.length === 0) {
            connectAndFetchUsers();
        }
    }, [haUrl, haToken, users.length]);

    const checkBiometrics = async () => {
        const compatible = await LocalAuthentication.hasHardwareAsync();
        const enrolled = await LocalAuthentication.isEnrolledAsync();
        setIsBiometricSupported(compatible && enrolled);
    };

    const loadSettings = async () => {
        try {
            // Load FaceID setting
            const savedFaceId = await SecureStore.getItemAsync('face_id_enabled');
            if (savedFaceId === 'true') setFaceIdEnabled(true);

            // Load Profiles
            const profilesJson = await SecureStore.getItemAsync(SETTINGS_KEY_PROFILES);
            const savedActiveId = await SecureStore.getItemAsync(SETTINGS_KEY_ACTIVE_PROFILE);

            let loadedProfiles = [];
            if (profilesJson) {
                try {
                    loadedProfiles = JSON.parse(profilesJson);
                } catch (e) {
                    console.log('Error parsing profiles:', e);
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
                    setActiveProfileId(savedActiveId);
                } else if (loadedProfiles.length > 0) {
                    // Fallback to first if active not found
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

        } catch (e) {
            console.log('Error loading settings:', e);
        }
    };

    const saveProfilesToStorage = async (newProfiles) => {
        try {
            await SecureStore.setItemAsync(SETTINGS_KEY_PROFILES, JSON.stringify(newProfiles));
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

        if (editingProfile.id) {
            // Update existing
            const index = newProfiles.findIndex(p => p.id === editingProfile.id);
            if (index !== -1) {
                newProfiles[index] = { ...editingProfile };
            }
        } else {
            // Create new
            const newProfile = {
                ...editingProfile,
                id: generateId()
            };
            newProfiles.push(newProfile);

            // If this is the first profile, make it active
            if (newProfiles.length === 1) {
                setActiveProfileId(newProfile.id);
                await SecureStore.setItemAsync(SETTINGS_KEY_ACTIVE_PROFILE, newProfile.id);
            }
        }

        await saveProfilesToStorage(newProfiles);

        // If we just edited the active profile, clear users to force re-fetch/re-connect
        if (editingProfile.id === activeProfileId || newProfiles.length === 1) {
            // FORCE DISCONNECT ALL instances to prevent zombies
            HAService.disconnectAll();

            setUsers([]);
            setSelectedUser(null);
            setUsername('');
            setPassword('');
            setHaUrl(editingProfile.haUrl);
            setHaToken(editingProfile.haToken);
            setAdminUrl(editingProfile.adminUrl || '');
        }

        setEditingProfile(null); // Return to list
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
        // FORCE DISCONNECT ALL when switching profiles
        HAService.disconnectAll();

        setActiveProfileId(profileId);
        await SecureStore.setItemAsync(SETTINGS_KEY_ACTIVE_PROFILE, profileId);
        // Clear users when switching profiles to force re-fetch
        setUsers([]);
        setSelectedUser(null);
        setUsername('');
    };

    const handleSaveFaceId = async () => {
        try {
            await SecureStore.setItemAsync('face_id_enabled', faceIdEnabled.toString());
            // We don't close the modal here, it's just a toggle
        } catch (e) {
            console.log('Error saving FaceID setting:', e);
        }
    };

    // Monitor FaceID toggle to save immediately (optional UX choice)
    useEffect(() => {
        handleSaveFaceId();
    }, [faceIdEnabled]);


    const connectAndFetchUsers = () => {
        if (!haUrl || !haToken) return;
        setLoadingUsers(true);

        try {
            // Close existing connection if any
            if (service.current) {
                console.log('Closing existing socket before reconnecting...');
                if (service.current.disconnect) {
                    service.current.disconnect();
                } else if (service.current.socket) {
                    service.current.socket.close();
                }
                service.current = null;
            }

            service.current = new HAService(haUrl, haToken);
            service.current.connect();
            service.current.subscribe(data => {
                if (data.type === 'connected') {
                    // Fetch States (safer than Registry for permissions)
                    service.current.getStates().then(states => {
                        console.log('DEBUG: Loaded States:', states?.length);
                        const personEntities = (states || []).filter(e => e.entity_id.startsWith('person.'));

                        console.log('DEBUG: Found Persons:', personEntities.length);

                        // Map to a standard format
                        const mappedUsers = personEntities.map(p => ({
                            id: p.entity_id,
                            name: p.attributes.friendly_name || p.entity_id,
                            user_id: p.attributes.user_id,
                            picture: p.attributes.entity_picture
                        }));

                        setUsers(mappedUsers);
                        if (mappedUsers.length > 0) {
                            setSelectedUser(mappedUsers[0]);
                            // Auto-guess for first user
                            setUsername(mappedUsers[0].id.replace('person.', ''));
                        }
                        setLoadingUsers(false);
                    }).catch(e => {
                        console.log('Error fetching states:', e);
                        setLoadingUsers(false);
                    });
                } else if (data.type === 'auth_invalid') {
                    Alert.alert('Error', 'Invalid HA Token');
                    setLoadingUsers(false);
                }
            });
        } catch (e) {
            console.log('Connection error:', e);
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

        setIsLoggingIn(true);

        try {
            let authenticated = false;

            if (username) {
                console.log('Trying auth with entered username:', username);
                const isValid = await validateCredentials(haUrl.replace(/^https?:\/\//i, (m) => m.toLowerCase()), username, password);
                if (isValid) {
                    authenticated = true;
                }
            } else {
                Alert.alert('Error', 'Please enter a username');
                setIsLoggingIn(false);
                return;
            }

            if (authenticated) {
                if (faceIdEnabled) {
                    await SecureStore.setItemAsync('saved_username', username);
                    await SecureStore.setItemAsync('saved_password', password);
                }

                router.replace({
                    pathname: route,
                    params: { userName: selectedUser.name, userId: selectedUser.user_id || '' }
                });
            } else {
                Alert.alert('Login Failed', 'Invalid password or could not verify user.');
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
            const hasCreds = await SecureStore.getItemAsync('saved_password');
            if (!hasCreds) {
                Alert.alert('FaceID', 'Please login with password first to enable FaceID.');
                return;
            }

            const result = await LocalAuthentication.authenticateAsync({
                promptMessage: 'Login to Home Assistant',
                fallbackLabel: 'Use Password'
            });

            if (result.success) {
                const savedUser = await SecureStore.getItemAsync('saved_username');
                const savedPass = await SecureStore.getItemAsync('saved_password');

                if (savedUser && savedPass) {
                    setIsLoggingIn(true);
                    setUsername(savedUser); // Update UI
                    // Validate
                    if (await validateCredentials(haUrl, savedUser, savedPass)) {
                        console.log('Biometric login success');
                        // Find the user object to pass correctly
                        const userObj = users.find(u => {
                            // Try to match standard guessing logic
                            const guess = u.id.replace('person.', '');
                            return guess === savedUser || u.name.toLowerCase().replace(/\s+/g, '_') === savedUser;
                        }) || { name: 'User' }; // Fallback

                        router.replace({
                            pathname: '/dashboard-v2',
                            params: { userName: userObj.name, userId: userObj.user_id || '' }
                        });
                    } else {
                        Alert.alert('Error', 'Saved credentials are no longer valid.');
                        setIsLoggingIn(false);
                    }
                }
            }
        } catch (e) {
            console.log('Biometric error:', e);
            Alert.alert('Error', 'Biometric authentication failed');
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
                        onPress={() => handleSelectProfile(item.id)}
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
                        onPress={() => setFaceIdEnabled(!faceIdEnabled)}
                    >
                        <View style={[styles.switchThumb, faceIdEnabled && styles.switchThumbActive]} />
                    </TouchableOpacity>
                </View>
            </View>
        </View>
    );

    const renderProfileForm = () => (
        <ScrollView>
            <TouchableOpacity
                style={styles.backButton}
                onPress={() => setEditingProfile(null)}
            >
                <ChevronDown size={24} color={Colors.text} style={{ transform: [{ rotate: '90deg' }] }} />
                <Text style={styles.backButtonText}>Back to Profiles</Text>
            </TouchableOpacity>

            <Text style={styles.modalTitle}>{editingProfile.id ? 'Edit Profile' : 'New Profile'}</Text>

            <View style={styles.formGroup}>
                <Text style={styles.label}>Profile Name</Text>
                <TextInput
                    style={styles.settingsInput}
                    value={editingProfile.name}
                    onChangeText={text => setEditingProfile({ ...editingProfile, name: text })}
                    placeholder="e.g. Home, Office, Cabin"
                    placeholderTextColor={Colors.textDim}
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
                    />
                    <TouchableOpacity
                        style={styles.scanBtn}
                        onPress={async () => {
                            // Inner scan for form
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
                />
            </View>

            <View style={styles.formGroup}>
                <Text style={styles.label}>Long-Lived Access Token</Text>
                <TextInput
                    style={[styles.settingsInput, { height: 100, textAlignVertical: 'top', paddingTop: 10 }]}
                    value={editingProfile.haToken}
                    onChangeText={text => setEditingProfile({ ...editingProfile, haToken: text })}
                    placeholder="Paste your token here..."
                    placeholderTextColor={Colors.textDim}
                    multiline
                />
            </View>

            <TouchableOpacity
                style={styles.saveButton}
                onPress={handleSaveProfile}
            >
                <Text style={styles.saveButtonText}>Save Profile</Text>
            </TouchableOpacity>
        </ScrollView>
    );

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={{ flex: 1 }}
        >
            <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
                <View style={styles.container}>
                    <ScrollView
                        ref={scrollViewRef}
                        style={{ flex: 1 }}
                        contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}
                        keyboardShouldPersistTaps="handled"
                        showsVerticalScrollIndicator={false}
                    >
                        <View style={styles.header}>
                            <Image
                                source={require('../assets/login-logo.png')}
                                style={styles.logo}
                                resizeMode="contain"
                            />
                            <TouchableOpacity
                                style={styles.settingsBtn}
                                onPress={() => {
                                    setEditingProfile(null);
                                    setShowSettings(true);
                                }}
                            >
                                <Settings size={24} color={Colors.textDim} />
                            </TouchableOpacity>
                        </View>

                        <View style={styles.form}>
                            {profiles.length === 0 ? (
                                <View style={styles.noProfileWarning}>
                                    <Shield size={40} color={Colors.primary} style={{ marginBottom: 10 }} />
                                    <Text style={styles.warningText}>No Connection Profiles</Text>
                                    <Text style={styles.warningSubText}>Please add a Home Assistant connection profile in settings to continue.</Text>
                                    <TouchableOpacity
                                        style={styles.createProfileBtn}
                                        onPress={() => {
                                            setEditingProfile({ name: 'My Home', haUrl: '', adminUrl: '', haToken: '' });
                                            setShowSettings(true);
                                        }}
                                    >
                                        <Text style={styles.createProfileBtnText}>Create Profile</Text>
                                    </TouchableOpacity>
                                </View>
                            ) : (
                                <>
                                    <View style={styles.inputContainer}>
                                        <View style={{ flex: 1 }}>
                                            <Text style={styles.inputLabel}>Connected to</Text>
                                            <Text style={styles.connectedProfileName}>
                                                {profiles.find(p => p.id === activeProfileId)?.name || 'Unknown Profile'}
                                            </Text>
                                        </View>
                                        <TouchableOpacity onPress={handleScan} disabled={isScanning}>
                                            {isScanning ? <ActivityIndicator size="small" color={Colors.primary} /> : <Scan size={20} color={Colors.primary} />}
                                        </TouchableOpacity>
                                    </View>

                                    {/* User Dropdown */}
                                    <TouchableOpacity
                                        style={styles.inputContainer}
                                        onPress={() => setShowUserModal(true)}
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



                                    {faceIdEnabled && isBiometricSupported && (
                                        <TouchableOpacity
                                            style={[styles.bioButton, { opacity: username ? 1 : 0.5 }]}
                                            onPress={handleBiometricLogin}
                                            disabled={!username}
                                        >
                                            <Fingerprint size={28} color={Colors.primary} />
                                            <Text style={styles.bioText}>Use FaceID</Text>
                                        </TouchableOpacity>
                                    )}
                                </>
                            )}
                        </View>



                        {/* User Selection Modal */}
                        <Modal
                            visible={showUserModal}
                            transparent={true}
                            animationType="slide"
                            onRequestClose={() => setShowUserModal(false)}
                        >
                            <View style={styles.modalOverlay}>
                                <View style={styles.modalContent}>
                                    <Text style={styles.modalTitle}>Select User</Text>
                                    <FlatList
                                        data={users}
                                        keyExtractor={item => item.id}
                                        renderItem={({ item }) => (
                                            <TouchableOpacity
                                                style={styles.userItem}
                                                onPress={() => {
                                                    setSelectedUser(item);
                                                    // Auto-guess username
                                                    const guessed = item.id.replace('person.', '');
                                                    setUsername(guessed);
                                                    setShowUserModal(false);
                                                }}
                                            >
                                                <View style={styles.userRow}>
                                                    <View style={styles.userAvatar}>
                                                        <Text style={styles.userInitials}>{item.name.substring(0, 2).toUpperCase()}</Text>
                                                    </View>
                                                    <Text style={[styles.userItemText, selectedUser?.id === item.id && { color: '#8947ca', fontWeight: 'bold' }]}>
                                                        {item.name}
                                                    </Text>
                                                </View>
                                                {selectedUser?.id === item.id && <Check size={20} color="#8947ca" />}
                                            </TouchableOpacity>
                                        )}
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
                            onRequestClose={() => setShowSettings(false)}
                        >
                            <View style={styles.modalOverlay}>
                                <View style={[styles.modalContent, { maxHeight: '90%' }]}>
                                    <View style={styles.modalHeader}>
                                        <Text style={styles.modalTitle}>Settings</Text>
                                        <TouchableOpacity onPress={() => setShowSettings(false)}>
                                            <X size={24} color={Colors.textDim} />
                                        </TouchableOpacity>
                                    </View>

                                    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
                                        {editingProfile ? renderProfileForm() : renderProfileList()}
                                    </KeyboardAvoidingView>
                                </View>
                            </View>
                        </Modal>
                    </ScrollView>

                    {/* Sticky Footer for Login Button */}
                    <View style={{ paddingTop: 10, paddingBottom: 20, backgroundColor: Colors.background }}>
                        <TouchableOpacity
                            style={[styles.button, { backgroundColor: '#8947ca', opacity: (isLoggingIn || !username) ? 0.7 : 1, marginTop: 0 }]}
                            onPress={() => handleLogin('/dashboard-v2')}
                            disabled={isLoggingIn || !username}
                        >
                            {isLoggingIn ? (
                                <ActivityIndicator color="#fff" />
                            ) : (
                                <Text style={styles.buttonText}>Login</Text>
                            )}
                        </TouchableOpacity>
                    </View>
                </View>
            </TouchableWithoutFeedback >
        </KeyboardAvoidingView >
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.background,
        padding: 20,
        justifyContent: 'center',
    },
    header: {
        marginBottom: 20,
        alignItems: 'center',
        position: 'relative'
    },
    settingsBtn: {
        position: 'absolute',
        right: 0,
        top: 20,
        padding: 10
    },
    logo: {
        width: 280,
        height: 120,
        marginBottom: 40,
        marginTop: 40,
    },
    form: {
        gap: 20,
    },
    inputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: Colors.surface,
        borderRadius: 12,
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
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: 10,
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
        height: '85%',
        maxHeight: '90%'
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
        backgroundColor: 'rgba(255,255,255,0.08)',
        borderRadius: 8,
        padding: 12,
        color: '#fff',
        fontSize: 16,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        minHeight: 50
    },
    scanBtn: {
        width: 50,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.08)',
        borderRadius: 8,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
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
