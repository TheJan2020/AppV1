import React, { useState, useEffect } from 'react';
import { Modal, View, Text, StyleSheet, TouchableOpacity, Switch, ScrollView } from 'react-native';
import { BlurView } from 'expo-blur';
import { X, Wifi, Users, Router, Cpu, Activity, Clock, Link, CheckCircle, XCircle } from 'lucide-react-native';
import { Colors } from '../../constants/Colors';
import * as Haptics from 'expo-haptics';

export default function NetworkModal({ visible, onClose, config, entities, onToggle }) {
    const [networks, setNetworks] = useState([]);
    const [aps, setAPs] = useState([]);
    const [activeTab, setActiveTab] = useState('networks'); // 'networks' or 'aps'

    useEffect(() => {
        if (!visible) return; // Optimization

        // 1. Parse SSIDs
        if (config?.network_list && entities.length > 0) {
            const mapped = config.network_list.map(net => {
                const switchState = entities.find(e => e.entity_id === net.switch_entity);
                const sensorState = entities.find(e => e.entity_id === net.client_sensor);

                return {
                    ...net,
                    isOn: switchState?.state === 'on',
                    clientCount: sensorState ? sensorState.state : '0',
                    isAvailable: !!switchState
                };
            });
            setNetworks(mapped);
        }

        // 2. Parse APs
        console.log('DEBUG: Config APs List:', config?.aps_list);
        if (config?.aps_list && entities.length > 0) {
            const mappedAPs = config.aps_list.map(ap => {
                // If explicit sensors are provided, use them. Otherwise fallback to base_entity derivation.
                const getEnt = (explicit, suffix) => {
                    if (explicit) {
                        const direct = entities.find(e => e.entity_id === explicit);
                        // console.log(`DEBUG: LOOKUP ${explicit} ->`, direct ? direct.state : 'NOT FOUND');
                        return direct?.state || '--';
                    }
                    if (ap.base_entity) return entities.find(e => e.entity_id === `${ap.base_entity}_${suffix}`)?.state || '--';
                    return '--';
                };

                console.log('DEBUG: Parsing AP:', ap.name);

                return {
                    name: ap.name,
                    clients: getEnt(ap.clients_sensor, 'clients'),
                    cpu: getEnt(ap.cpu_sensor, 'cpu_utilization'),
                    memory: getEnt(ap.mem_sensor, 'memory_utilization'),
                    state: getEnt(ap.state_sensor, 'state'),
                    uptime: getEnt(ap.uptime_sensor, 'uptime'),
                    uplink: getEnt(ap.uplink_sensor, 'uplink_mac'),

                    // Offline check: if explicit state sensor says 'disconnected' or similar
                    // For now keeping simple check on state string
                };
            }).map(ap => ({
                ...ap,
                // Refined online check
                isOnline: ap.state !== '--' && ap.state !== 'disconnected' && ap.state !== 'unavailable'
            }));
            console.log('DEBUG: Mapped APs:', JSON.stringify(mappedAPs));
            setAPs(mappedAPs);
        } else {
            console.log('DEBUG: No APs list or entities empty');
        }
    }, [config, entities, visible]);

    const handleToggle = (net, value) => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        onToggle('switch', value ? 'turn_on' : 'turn_off', { entity_id: net.switch_entity });

        // Optimistic update
        setNetworks(prev =>
            prev.map(n => n.ssid === net.ssid ? { ...n, isOn: value } : n)
        );
    };

    const renderNetworks = () => (
        <ScrollView contentContainerStyle={styles.scrollContent}>
            {networks.length === 0 ? (
                <Text style={styles.emptyText}>No networks configured.</Text>
            ) : (
                networks.map((net, index) => (
                    <View key={index} style={[styles.card, !net.isAvailable && styles.cardDisabled]}>
                        <View style={styles.info}>
                            <View style={styles.iconContainer}>
                                <Wifi size={24} color={net.isAvailable ? (net.isOn ? '#4CAF50' : 'rgba(255,255,255,0.3)') : 'rgba(255,255,255,0.1)'} />
                            </View>
                            <View>
                                <Text style={[styles.ssid, !net.isAvailable && styles.textDisabled]}>
                                    {net.ssid}
                                    {!net.isAvailable && " (Entity Not Found)"}
                                </Text>
                                {net.isAvailable && net.isOn && (
                                    <View style={styles.clientsBadge}>
                                        <Users size={12} color="rgba(255,255,255,0.7)" />
                                        <Text style={styles.clientsText}>{net.clientCount} Clients</Text>
                                    </View>
                                )}
                                {!net.isAvailable && (
                                    <Text style={styles.debugText}>{net.switch_entity}</Text>
                                )}
                            </View>
                        </View>

                        <Switch
                            value={net.isOn}
                            onValueChange={(val) => handleToggle(net, val)}
                            trackColor={{ false: '#767577', true: '#8947ca' }}
                            thumbColor={net.isOn ? '#fff' : '#f4f3f4'}
                            disabled={!net.isAvailable}
                        />
                    </View>
                ))
            )}
        </ScrollView>
    );

    const formatUptime = (state) => {
        if (!state || state === '--') return '--';

        // Check if it's a timestamp (contains - or :) or just seconds
        const isTimestamp = state.includes('-') || state.includes(':') || state.includes(' at ');

        let seconds = 0;
        if (isTimestamp) {
            const startTime = new Date(state).getTime();
            if (isNaN(startTime)) return state; // Fallback if parse fails
            seconds = (Date.now() - startTime) / 1000;
        } else {
            seconds = parseFloat(state);
        }

        if (isNaN(seconds)) return '--';

        const days = Math.floor(seconds / (3600 * 24));
        const hours = Math.floor((seconds % (3600 * 24)) / 3600);

        if (days > 0) return `${days}d ${hours}h`;
        return `${hours}h`;
    };

    const renderAPs = () => (
        <ScrollView contentContainerStyle={styles.scrollContent}>
            {aps.length === 0 ? (
                <Text style={styles.emptyText}>No Access Points configured.</Text>
            ) : (
                aps.map((ap, index) => (
                    <View key={index} style={styles.apCard}>
                        {/* Header */}
                        <View style={styles.apHeader}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                                <Router size={22} color="#00B0FF" />
                                <Text style={styles.apName}>{ap.name}</Text>
                            </View>
                            <View style={[styles.statusBadge, { backgroundColor: ap.isOnline ? 'rgba(76, 175, 80, 0.2)' : 'rgba(239, 83, 80, 0.2)' }]}>
                                {ap.isOnline ? <CheckCircle size={12} color="#4CAF50" /> : <XCircle size={12} color="#EF5350" />}
                                <Text style={[styles.statusText, { color: ap.isOnline ? '#4CAF50' : '#EF5350' }]}>
                                    {ap.state === 'ready' ? 'Online' : ap.state}
                                </Text>
                            </View>
                        </View>

                        {/* Stats Grid */}
                        <View style={styles.statsGrid}>
                            <View style={styles.statItem}>
                                <Users size={16} color="#aaa" />
                                <Text style={styles.statValue}>{ap.clients}</Text>
                                <Text style={styles.statLabel}>Clients</Text>
                            </View>
                            <View style={styles.statItem}>
                                <Cpu size={16} color="#aaa" />
                                <Text style={styles.statValue}>{ap.cpu}%</Text>
                                <Text style={styles.statLabel}>CPU</Text>
                            </View>
                            <View style={styles.statItem}>
                                <Activity size={16} color="#aaa" />
                                <Text style={styles.statValue}>{ap.memory}%</Text>
                                <Text style={styles.statLabel}>Mem</Text>
                            </View>
                            <View style={styles.statItem}>
                                <Clock size={16} color="#aaa" />
                                <Text style={styles.statValue}>{formatUptime(ap.uptime)}</Text>
                                <Text style={styles.statLabel}>Uptime</Text>
                            </View>
                        </View>
                    </View>
                ))
            )}
        </ScrollView>
    );

    return (
        <Modal
            animationType="slide"
            transparent={true}
            visible={visible}
            onRequestClose={onClose}
        >
            <View style={styles.container}>
                <BlurView intensity={20} style={StyleSheet.absoluteFill} tint="dark" />
                <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.7)' }]} />

                <View style={styles.content}>
                    <View style={styles.header}>
                        <Text style={styles.title}>Network Status</Text>
                        <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                            <X size={24} color="#fff" />
                        </TouchableOpacity>
                    </View>

                    {/* Tabs */}
                    <View style={styles.tabs}>
                        <TouchableOpacity
                            style={[styles.tab, activeTab === 'networks' && styles.activeTab]}
                            onPress={() => {
                                Haptics.selectionAsync();
                                setActiveTab('networks');
                            }}
                        >
                            <Text style={[styles.tabText, activeTab === 'networks' && styles.activeTabText]}>SSIDs</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.tab, activeTab === 'aps' && styles.activeTab]}
                            onPress={() => {
                                Haptics.selectionAsync();
                                setActiveTab('aps');
                            }}
                        >
                            <Text style={[styles.tabText, activeTab === 'aps' && styles.activeTabText]}>Access Points</Text>
                        </TouchableOpacity>
                    </View>

                    {activeTab === 'networks' ? renderNetworks() : renderAPs()}
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'flex-end',
    },
    content: {
        backgroundColor: '#1a1b2e',
        borderTopLeftRadius: 30,
        borderTopRightRadius: 30,
        height: '70%', // Increased height for more data
        padding: 20,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20,
    },
    title: {
        fontSize: 24,
        fontWeight: 'bold',
        color: 'white',
    },
    closeBtn: {
        padding: 5,
        backgroundColor: 'rgba(255,255,255,0.1)',
        borderRadius: 20
    },
    tabs: {
        flexDirection: 'row',
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 12,
        padding: 4,
        marginBottom: 15
    },
    tab: {
        flex: 1,
        paddingVertical: 10,
        alignItems: 'center',
        borderRadius: 10
    },
    activeTab: {
        backgroundColor: '#8947ca',
    },
    tabText: {
        color: 'rgba(255,255,255,0.5)',
        fontWeight: '600',
        fontSize: 14
    },
    activeTabText: {
        color: 'white'
    },
    scrollContent: {
        paddingBottom: 40,
        gap: 15
    },
    // Network Cards
    card: {
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 20,
        padding: 20,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    info: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 15
    },
    iconContainer: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: 'rgba(0,0,0,0.3)',
        justifyContent: 'center',
        alignItems: 'center'
    },
    ssid: {
        color: 'white',
        fontSize: 18,
        fontWeight: '600',
        marginBottom: 4
    },
    clientsBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: 'rgba(255,255,255,0.1)',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 8,
        alignSelf: 'flex-start'
    },
    clientsText: {
        color: 'rgba(255,255,255,0.7)',
        fontSize: 12,
        fontWeight: '500'
    },
    emptyText: {
        color: 'rgba(255,255,255,0.4)',
        textAlign: 'center',
        marginTop: 40,
        fontSize: 16
    },
    cardDisabled: {
        opacity: 0.5,
        borderStyle: 'dashed',
        borderColor: 'rgba(255,255,255,0.2)'
    },
    textDisabled: {
        color: 'rgba(255,255,255,0.4)'
    },
    debugText: {
        color: '#ff4444',
        fontSize: 10,
        marginTop: 2
    },
    // AP Cards
    apCard: {
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 20,
        padding: 15,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.05)'
    },
    apHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 15,
        paddingBottom: 10,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.05)'
    },
    apName: {
        color: 'white',
        fontSize: 16,
        fontWeight: 'bold'
    },
    statusBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 8
    },
    statusText: {
        fontSize: 12,
        fontWeight: '600',
        textTransform: 'capitalize'
    },
    statsGrid: {
        flexDirection: 'row',
        justifyContent: 'space-between'
    },
    statItem: {
        alignItems: 'center',
        flex: 1
    },
    statValue: {
        color: 'white',
        fontSize: 16,
        fontWeight: '600',
        marginVertical: 4
    },
    statLabel: {
        color: 'rgba(255,255,255,0.5)',
        fontSize: 11
    }
});
