import { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, Image, Modal, FlatList, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { Colors } from '../constants/Colors';
import { Scan, Lock, User, Server, ChevronDown, Check, Settings, Fingerprint, X } from 'lucide-react-native';
import { scanNetwork } from '../utils/discovery';
import { HAService } from '../services/ha';
import { validateCredentials } from '../services/auth';

export default function Login() {
    const router = useRouter();
    const service = useRef(null);

    const [password, setPassword] = useState('');
    const [username, setUsername] = useState('');
    const [haUrl, setHaUrl] = useState(process.env.EXPO_PUBLIC_HA_URL || '');
    const [haToken, setHaToken] = useState(process.env.EXPO_PUBLIC_HA_TOKEN || '');

    // User Management
    const [users, setUsers] = useState([]);
    const [selectedUser, setSelectedUser] = useState(null);
    const [showUserModal, setShowUserModal] = useState(false);
    const [loadingUsers, setLoadingUsers] = useState(false);

    const [isScanning, setIsScanning] = useState(false);
    const [isLoggingIn, setIsLoggingIn] = useState(false);
    const [isBiometricSupported, setIsBiometricSupported] = useState(false);

    // Settings
    const [showSettings, setShowSettings] = useState(false);
    const [adminUrl, setAdminUrl] = useState(process.env.EXPO_PUBLIC_ADMIN_URL || '');
    const [faceIdEnabled, setFaceIdEnabled] = useState(false);

    useEffect(() => {
        checkBiometrics();
        loadSettings();
    }, []);

    const checkBiometrics = async () => {
        const compatible = await LocalAuthentication.hasHardwareAsync();
        const enrolled = await LocalAuthentication.isEnrolledAsync();
        setIsBiometricSupported(compatible && enrolled);
    };

    const loadSettings = async () => {
        try {
            const savedUrl = await SecureStore.getItemAsync('ha_url');
            const savedToken = await SecureStore.getItemAsync('ha_token');
            const savedAdminUrl = await SecureStore.getItemAsync('admin_url');
            const savedFaceId = await SecureStore.getItemAsync('face_id_enabled');

            if (savedUrl) setHaUrl(savedUrl);
            if (savedToken) setHaToken(savedToken);
            if (savedAdminUrl) setAdminUrl(savedAdminUrl);
            if (savedFaceId === 'true') setFaceIdEnabled(true);

            // If we have URL/Token, fetch users
            if ((savedUrl || haUrl) && (savedToken || haToken)) {
                // We need to ensure state is updated before calling fetch, but for now
                // relies on the next render effect or we call it explicitly with vals
                // Actually the existing useEffect[haUrl, haToken] might not trigger if we set them inside a promise?
                // It surely triggers re-render.
            }
        } catch (e) {
            console.log('Error loading settings:', e);
        }
    };

    const handleSaveSettings = async () => {
        try {
            await SecureStore.setItemAsync('ha_url', haUrl);
            await SecureStore.setItemAsync('ha_token', haToken);
            await SecureStore.setItemAsync('admin_url', adminUrl);
            await SecureStore.setItemAsync('face_id_enabled', faceIdEnabled.toString());

            Alert.alert('Success', 'Settings saved');
            setShowSettings(false);
            connectAndFetchUsers();
        } catch (e) {
            Alert.alert('Error', 'Failed to save settings');
        }
    };

    useEffect(() => {
        // Auto-connect to fetch users if URL/Token available (and not already fetching)
        if (haUrl && haToken && !loadingUsers && users.length === 0) {
            connectAndFetchUsers();
        }
    }, [haUrl, haToken]);

    const connectAndFetchUsers = () => {
        if (!haUrl || !haToken) return;
        setLoadingUsers(true);

        try {
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
        setIsScanning(true);
        let found = false;
        await scanNetwork((url) => {
            if (!found) {
                found = true;
                setHaUrl(url);
                setIsScanning(false);
                Alert.alert('Instance Found', `Discovered Home Assistant at ${url}`);
                // Try to fetch users after scan if token exists
                if (haToken) connectAndFetchUsers();
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
            // Attempt to derive username from selected user
            // 1. Try entity_id suffix (person.zeyad -> zeyad)
            // 2. Try friendly_name            
            // If user manually entered a username, use that. 
            // Otherwise if they cleared it, maybe we should warn, but let's just try.

            let authenticated = false;

            // Use entered username
            if (username) {
                console.log('Trying auth with entered username:', username);
                const isValid = await validateCredentials(haUrl, username, password);
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
                    params: { userName: selectedUser.name }
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
                            params: { userName: userObj.name }
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

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <Image
                    source={require('../assets/login-logo.png')}
                    style={styles.logo}
                    resizeMode="contain"
                />
                <TouchableOpacity
                    style={styles.settingsBtn}
                    onPress={() => setShowSettings(true)}
                >
                    <Settings size={24} color={Colors.textDim} />
                </TouchableOpacity>
            </View>

            <View style={styles.form}>
                <View style={styles.inputContainer}>
                    <Server size={20} color={Colors.textDim} style={styles.inputIcon} />
                    <TextInput
                        style={styles.input}
                        placeholder="Home Assistant URL"
                        placeholderTextColor={Colors.textDim}
                        value={haUrl}
                        onChangeText={setHaUrl}
                        autoCapitalize="none"
                    />
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
                    />
                </View>

                <TouchableOpacity
                    style={[styles.button, { backgroundColor: '#8947ca', opacity: isLoggingIn ? 0.7 : 1 }]}
                    onPress={() => handleLogin('/dashboard-v2')}
                    disabled={isLoggingIn}
                >
                    {isLoggingIn ? (
                        <ActivityIndicator color="#fff" />
                    ) : (
                        <Text style={styles.buttonText}>Login</Text>
                    )}
                </TouchableOpacity>

                {faceIdEnabled && isBiometricSupported && (
                    <TouchableOpacity
                        style={[styles.bioButton]}
                        onPress={handleBiometricLogin}
                    >
                        <Fingerprint size={28} color={Colors.primary} />
                        <Text style={styles.bioText}>Use FaceID</Text>
                    </TouchableOpacity>
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
                                        {/* Ideally show user picture here if available */}
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
                            <Text style={styles.modalTitle}>Connection Settings</Text>
                            <TouchableOpacity onPress={() => setShowSettings(false)}>
                                <X size={24} color={Colors.textDim} />
                            </TouchableOpacity>
                        </View>

                        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
                            <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
                                <View style={{ gap: 20 }}>
                                    <View>
                                        <Text style={styles.label}>Home Assistant URL</Text>
                                        <TextInput
                                            style={styles.settingsInput}
                                            value={haUrl}
                                            onChangeText={setHaUrl}
                                            placeholder="https://..."
                                            placeholderTextColor={Colors.textDim}
                                            autoCapitalize="none"
                                        />
                                    </View>

                                    <View>
                                        <Text style={styles.label}>Admin URL</Text>
                                        <TextInput
                                            style={styles.settingsInput}
                                            value={adminUrl}
                                            onChangeText={setAdminUrl}
                                            placeholder="https://..."
                                            placeholderTextColor={Colors.textDim}
                                            autoCapitalize="none"
                                        />
                                    </View>

                                    <View>
                                        <Text style={styles.label}>Long-Lived Access Token</Text>
                                        <TextInput
                                            style={[styles.settingsInput, { height: 120, textAlignVertical: 'top', paddingTop: 12 }]}
                                            value={haToken}
                                            onChangeText={setHaToken}
                                            placeholder="ey..."
                                            placeholderTextColor={Colors.textDim}
                                            multiline
                                        />
                                    </View>

                                    <View style={styles.switchRow}>
                                        <Text style={[styles.switchLabel, { color: Colors.textDim, fontSize: 14 }]}>
                                            To enable FaceID, please log in and go to Settings {'>'} General.
                                        </Text>
                                    </View>

                                    <TouchableOpacity style={[styles.button, { backgroundColor: Colors.primary, marginTop: 10 }]} onPress={handleSaveSettings}>
                                        <Text style={styles.buttonText}>Save Connection Settings</Text>
                                    </TouchableOpacity>
                                </View>
                            </ScrollView>
                        </KeyboardAvoidingView>
                    </View>
                </View>
            </Modal>
        </View>
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
        height: '100%' // Ensure text input takes full height
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
        height: '85%', // Increased height
        maxHeight: '90%'
    },
    modalTitle: {
        color: 'white',
        fontSize: 20,
        fontWeight: 'bold',
        marginBottom: 20,
        textAlign: 'center'
    },
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
    // Settings Modal Styles
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20
    },
    label: {
        color: Colors.textDim,
        marginBottom: 8,
        fontSize: 14,
        fontWeight: '600'
    },
    switchRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: 10,
        paddingVertical: 10,
        borderTopWidth: 1,
        borderTopColor: 'rgba(255,255,255,0.1)'
    },
    switchLabel: {
        color: Colors.text,
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
    bioButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        padding: 15,
        marginTop: 20
    },
    // Setting Inputs
    settingsInput: {
        backgroundColor: 'rgba(255,255,255,0.08)',
        borderRadius: 8,
        padding: 12,
        color: '#fff',
        fontSize: 16,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        minHeight: 50
    }
});
