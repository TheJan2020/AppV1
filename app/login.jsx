import { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, Image, Modal, FlatList } from 'react-native';
import { useRouter } from 'expo-router';
import * as LocalAuthentication from 'expo-local-authentication';
import { Colors } from '../constants/Colors';
import { Scan, Lock, User, Server, ChevronDown, Check } from 'lucide-react-native';
import { scanNetwork } from '../utils/discovery';
import { HAService } from '../services/ha';

export default function Login() {
    const router = useRouter();
    const service = useRef(null);

    const [password, setPassword] = useState('');
    const [haUrl, setHaUrl] = useState(process.env.EXPO_PUBLIC_HA_URL || '');
    const [haToken, setHaToken] = useState(process.env.EXPO_PUBLIC_HA_TOKEN || '');

    // User Management
    const [users, setUsers] = useState([]);
    const [selectedUser, setSelectedUser] = useState(null);
    const [showUserModal, setShowUserModal] = useState(false);
    const [loadingUsers, setLoadingUsers] = useState(false);

    const [isScanning, setIsScanning] = useState(false);

    useEffect(() => {
        // Auto-connect to fetch users if URL/Token available
        if (haUrl && haToken) {
            connectAndFetchUsers();
        }
    }, []);

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

    const handleLogin = (route = '/dashboard-v2') => {
        if (!selectedUser) {
            Alert.alert('Error', 'Please select a user');
            return;
        }

        // Demo/Mock Password Check
        // In reality, we cannot check password via API easily.
        if (password.length > 0) {
            // Pass the user name to the dashboard
            router.replace({
                pathname: route,
                params: { userName: selectedUser.name }
            });
        } else {
            Alert.alert('Error', 'Please enter password');
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

                <TouchableOpacity style={[styles.button, { backgroundColor: '#8947ca' }]} onPress={() => handleLogin('/dashboard-v2')}>
                    <Text style={styles.buttonText}>Login</Text>
                </TouchableOpacity>

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
        marginBottom: 40,
        alignItems: 'center',
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
        padding: 20,
        maxHeight: '60%'
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
    }
});
