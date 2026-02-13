import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, FlatList, Switch, ActivityIndicator, TouchableOpacity, SafeAreaView, TextInput } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import * as SecureStore from 'expo-secure-store';
import { HAService } from '../services/ha';
import { Colors } from '../constants/Colors';
import * as Haptics from 'expo-haptics';

export default function AutomationsPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [automations, setAutomations] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [connectionConfig, setConnectionConfig] = useState(null);
    const service = useRef(null);

    // Load Connection Config
    useEffect(() => {
        const loadConfig = async () => {
            try {
                const activeProfileId = await SecureStore.getItemAsync('ha_active_profile_id');
                const profilesJson = await SecureStore.getItemAsync('ha_profiles');

                if (activeProfileId && profilesJson) {
                    const profiles = JSON.parse(profilesJson);
                    const activeProfile = profiles.find(p => p.id === activeProfileId);
                    if (activeProfile) {
                        setConnectionConfig({
                            url: activeProfile.haUrl,
                            token: activeProfile.haToken
                        });
                        return;
                    }
                }
                // Fallback to env vars if no profile
                setConnectionConfig({
                    url: process.env.EXPO_PUBLIC_HA_URL,
                    token: process.env.EXPO_PUBLIC_HA_TOKEN
                });
            } catch (e) {
                console.error("Error loading config", e);
                setLoading(false);
            }
        };
        loadConfig();
    }, []);

    // Connect to HA
    useEffect(() => {
        if (!connectionConfig) return;

        service.current = new HAService(connectionConfig.url, connectionConfig.token);
        service.current.connect();

        const onStateChanged = (data) => {
            if (data.type === 'connected') {
                fetchAutomations();
                setLoading(false);
            } else if (data.type === 'state_changed' && data.event) {
                const newState = data.event.data.new_state;
                if (newState && newState.entity_id.startsWith('automation.')) {
                    setAutomations(prev => {
                        const index = prev.findIndex(a => a.entity_id === newState.entity_id);
                        if (index !== -1) {
                            const newArr = [...prev];
                            newArr[index] = newState;
                            return newArr;
                        }
                        return [newState, ...prev];
                    });
                }
            }
        };

        const unsubscribe = service.current.subscribe(onStateChanged);

        return () => {
            unsubscribe();
            if (service.current) service.current.disconnect();
        };
    }, [connectionConfig]);

    const fetchAutomations = async () => {
        if (!service.current) return;
        try {
            const states = await service.current.getStates();
            const autos = states.filter(s => s.entity_id.startsWith('automation.'));
            // Sort by name
            autos.sort((a, b) => {
                const nameA = a.attributes.friendly_name || a.entity_id;
                const nameB = b.attributes.friendly_name || b.entity_id;
                return nameA.localeCompare(nameB);
            });
            setAutomations(autos);
        } catch (e) {
            console.error("Error fetching automations", e);
        }
    };

    const handleToggle = async (entityId, currentState) => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        const serviceName = currentState === 'on' ? 'turn_off' : 'turn_on';
        // Optimistic update
        setAutomations(prev => prev.map(a => {
            if (a.entity_id === entityId) {
                return { ...a, state: currentState === 'on' ? 'off' : 'on' };
            }
            return a;
        }));

        try {
            await service.current.callService('automation', serviceName, { entity_id: entityId });
        } catch (e) {
            console.error("Error toggling automation", e);
            // Revert on error could be implemented here by re-fetching
        }
    };

    const filteredAutomations = automations.filter(a => {
        const name = a.attributes.friendly_name || a.entity_id;
        return name.toLowerCase().includes(searchQuery.toLowerCase());
    });

    const renderItem = ({ item }) => {
        const isOn = item.state === 'on';
        const name = item.attributes.friendly_name || item.entity_id;

        let lastTriggeredText = 'Never';
        if (item.attributes.last_triggered) {
            const date = new Date(item.attributes.last_triggered);
            lastTriggeredText = new Intl.DateTimeFormat('en-US', {
                calendar: 'gregory',
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: 'numeric',
                hour12: true
            }).format(date);
        }

        return (
            <View style={styles.card}>
                <View style={styles.cardContent}>
                    <View style={styles.iconContainer}>
                        <MaterialCommunityIcons
                            name="robot"
                            size={24}
                            color={isOn ? Colors.primary : Colors.textDim}
                        />
                    </View>
                    <View style={styles.textContainer}>
                        <Text style={styles.name} numberOfLines={1}>{name}</Text>
                        <Text style={styles.subtitle}>Last triggered:</Text>
                        <Text style={styles.timestamp}>{lastTriggeredText}</Text>
                    </View>
                    <Switch
                        value={isOn}
                        onValueChange={() => handleToggle(item.entity_id, item.state)}
                        trackColor={{ false: '#767577', true: Colors.primary }}
                        thumbColor={'#fff'}
                    />
                </View>
            </View>
        );
    };

    return (
        <View style={styles.container}>
            <LinearGradient colors={['#1a1b2e', '#16161e', '#000000']} style={StyleSheet.absoluteFill} />
            <StatusBar style="light" />
            <SafeAreaView style={{ flex: 1 }}>

                {/* Header */}
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                        <Ionicons name="arrow-back" size={24} color="white" />
                    </TouchableOpacity>
                    <Text style={styles.title}>Automations</Text>
                    <View style={{ width: 40 }} />
                </View>

                {/* Search Bar */}
                <View style={styles.searchContainer}>
                    <Ionicons name="search" size={20} color={Colors.textDim} style={styles.searchIcon} />
                    <TextInput
                        style={styles.searchInput}
                        placeholder="Search automations..."
                        placeholderTextColor={Colors.textDim}
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                    />
                    {searchQuery.length > 0 && (
                        <TouchableOpacity onPress={() => setSearchQuery('')}>
                            <Ionicons name="close-circle" size={20} color={Colors.textDim} />
                        </TouchableOpacity>
                    )}
                </View>

                {loading && automations.length === 0 ? (
                    <View style={styles.loadingContainer}>
                        <ActivityIndicator size="large" color={Colors.primary} />
                        <Text style={styles.loadingText}>Connecting to Home Assistant...</Text>
                    </View>
                ) : (
                    <FlatList
                        data={filteredAutomations}
                        keyExtractor={item => item.entity_id}
                        renderItem={renderItem}
                        contentContainerStyle={styles.listContent}
                        initialNumToRender={15}
                    />
                )}

            </SafeAreaView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingVertical: 10,
    },
    backBtn: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.1)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    title: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#fff',
    },
    searchContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.05)',
        marginHorizontal: 20,
        marginBottom: 15,
        borderRadius: 12,
        paddingHorizontal: 12,
        height: 44,
    },
    searchIcon: {
        marginRight: 8,
    },
    searchInput: {
        flex: 1,
        color: '#fff',
        fontSize: 16,
        height: '100%',
    },
    listContent: {
        paddingHorizontal: 20,
        paddingBottom: 40,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    loadingText: {
        color: Colors.textDim,
        marginTop: 10,
    },
    card: {
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 16,
        marginBottom: 10,
        padding: 16,
    },
    cardContent: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    iconContainer: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.05)',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    textContainer: {
        flex: 1,
        marginRight: 10,
    },
    name: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
        marginBottom: 4,
    },
    subtitle: {
        color: Colors.textDim,
        fontSize: 12,
    },
    timestamp: {
        color: '#fff',
        fontSize: 12,
        marginTop: 2,
    },
});
