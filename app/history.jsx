import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Switch, ActivityIndicator, TouchableOpacity, SafeAreaView, Modal, ScrollView } from 'react-native';
import { useRouter, useLocalSearchParams, Stack } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';

export default function HistoryPage() {
    const router = useRouter();
    const { entity_id } = useLocalSearchParams();
    const [history, setHistory] = useState([]);
    const [selectedItem, setSelectedItem] = useState(null);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [offset, setOffset] = useState(0);
    const [hasMore, setHasMore] = useState(true);
    const [showTrackers, setShowTrackers] = useState(false);
    const [showAttributes, setShowAttributes] = useState(false);
    const [activeTab, setActiveTab] = useState(entity_id ? 'all' : 'all'); // Default to 'all'
    const [user, setUser] = useState(null);
    const LIMIT = 50;

    const adminUrl = process.env.EXPO_PUBLIC_ADMIN_URL;

    // 1. Fetch User (Once)
    useEffect(() => {
        if (!adminUrl) return;
        const fetchUser = async () => {
            try {
                const usersRes = await fetch(`${adminUrl}/api/users`);
                const users = await usersRes.json();
                if (users && users.length > 0) setUser(users[0]);
            } catch (e) { console.error(e); }
        };
        fetchUser();
    }, [adminUrl]);

    // 2. Fetch History (Pagination)
    const loadHistory = async (reset = false) => {
        if ((loading && !reset) || loadingMore) return;
        if (!reset && !hasMore) return;

        if (reset) {
            setLoading(true);
            setOffset(0);
            setHasMore(true);
        } else {
            setLoadingMore(true);
        }

        try {
            const currentOffset = reset ? 0 : offset;
            let url;
            if (activeTab === 'my') {
                if (!user) {
                    if (reset) {
                        setHistory([]);
                        setHasMore(false);
                    }
                    setLoading(false);
                    return;
                }
                url = `${adminUrl}/api/history/user?limit=${LIMIT}&offset=${currentOffset}`;
                if (user.name) url += `&user_name=${encodeURIComponent(user.name)}`;
                if (user.entity_id) url += `&device_entity_id=${encodeURIComponent(user.entity_id)}`;
                if (entity_id) url += `&entity_ids=${entity_id}`;
            } else {
                url = `${adminUrl}/api/history?limit=${LIMIT}&offset=${currentOffset}`;
                if (entity_id) url += `&entity_ids=${entity_id}`;
            }

            const res = await fetch(url);
            const data = await res.json();

            if (data.length < LIMIT) setHasMore(false);

            setHistory(prev => {
                if (reset) return data;
                const existingIds = new Set(prev.map(p => p.id));
                const uniqueNew = data.filter(d => !existingIds.has(d.id));
                return [...prev, ...uniqueNew];
            });
            setOffset(currentOffset + LIMIT);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
            setLoadingMore(false);
        }
    };

    useEffect(() => {
        if (adminUrl) loadHistory(true);
    }, [adminUrl, entity_id, activeTab, activeTab === 'my' ? user : null]);

    const renderHeader = () => (
        <View style={styles.headerRow}>
            <Text style={[styles.cell, { flex: 0.8 }]}>Time</Text>
            {activeTab === 'all' && <Text style={[styles.cell, { flex: 0.9, color: '#4CAF50' }]}>User</Text>}
            <Text style={[styles.cell, { flex: 0.9, color: '#FFD700' }]}>Room</Text>
            <Text style={[styles.cell, { flex: 1.5 }]}>Entity</Text>
            <Text style={[styles.cell, { flex: 1.0 }]}>State</Text>
            {showAttributes && <Text style={[styles.cell, { flex: 2 }]}>Attributes</Text>}
        </View>
    );

    const renderItem = ({ item }) => {
        const date = new Date(item.timestamp);
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHrs = Math.floor(diffMins / 60);

        let relativeTime;
        if (diffHrs < 24) {
            if (diffHrs > 0) relativeTime = `${diffHrs}h ${diffMins % 60}m ago`;
            else relativeTime = `${diffMins}m ago`;
        }

        // Manual formatting for consistency/safety
        let hours = date.getHours();
        const minutes = date.getMinutes().toString().padStart(2, '0');
        const ampm = hours >= 12 ? 'PM' : 'AM';
        hours = hours % 12;
        hours = hours ? hours : 12; // the hour '0' should be '12'
        const time = `${hours}:${minutes}`;

        return (
            <TouchableOpacity style={styles.row} onPress={() => setSelectedItem(item)}>
                {/* TIME COLUMN */}
                <View style={[styles.cellContainer, { flex: 0.8 }]}>
                    <Text style={styles.timeMain}>{time}</Text>
                    <Text style={styles.timeSub}>{ampm}</Text>
                    {relativeTime && <Text style={styles.timeRelative}>{relativeTime}</Text>}
                </View>

                {/* USER COLUMN */}
                {activeTab === 'all' && (
                    <Text style={[styles.cellText, { flex: 0.9, color: item.changed_by && item.changed_by !== 'System' ? '#4CAF50' : '#888', fontSize: 11 }]} numberOfLines={1}>
                        {item.changed_by || 'System'}
                    </Text>
                )}

                {/* ROOM COLUMN - NEW */}
                <Text style={[styles.cellText, { flex: 0.9, color: '#FFD700', fontSize: 11 }]} numberOfLines={1}>
                    {item.area_name || '-'}
                </Text>

                {/* ENTITY COLUMN */}
                <View style={[styles.cellContainer, { flex: 1.5, justifyContent: 'center' }]}>
                    <Text style={[styles.cellText, { fontWeight: '600', fontSize: 12 }]} numberOfLines={1} ellipsizeMode="tail">
                        {(() => {
                            try {
                                const attrs = item.attributes ? JSON.parse(item.attributes) : {};
                                return attrs.friendly_name || item.entity_id;
                            } catch { return item.entity_id; }
                        })()}
                    </Text>
                    <Text style={[styles.cellText, { color: 'rgba(255,255,255,0.5)', fontSize: 10 }]} numberOfLines={1} ellipsizeMode="tail">
                        {item.entity_id}
                    </Text>
                </View>

                {/* STATE COLUMN (Merged) */}
                <View style={[styles.cellContainer, { flex: 1.0, justifyContent: 'center' }]}>
                    <Text style={[styles.cellText, { fontWeight: 'bold' }]} numberOfLines={1}>{item.state}</Text>
                    <Text style={[styles.cellText, { color: '#aaa', fontSize: 10 }]} numberOfLines={1}>{item.old_state || '-'}</Text>
                </View>

                {/* ATTRS COLUMN */}
                {showAttributes && (
                    <Text style={[styles.cellText, { flex: 2, fontSize: 10, fontFamily: 'monospace', opacity: 0.7 }]} numberOfLines={2}>
                        {item.attributes}
                    </Text>
                )}
            </TouchableOpacity>
        );
    };

    const renderAttributes = (attrsStr) => {
        if (!attrsStr) return <Text style={{ color: '#888', fontStyle: 'italic', marginTop: 5 }}>No attributes</Text>;
        try {
            const attrs = JSON.parse(attrsStr);
            const filtered = Object.entries(attrs).filter(([key]) =>
                !['friendly_name', 'icon', 'supported_features', 'user_id', 'device_class'].includes(key)
            );
            if (filtered.length === 0) return <Text style={{ color: '#888', fontStyle: 'italic', marginTop: 5 }}>No relevant changed attributes</Text>;

            return filtered.map(([key, val]) => {
                let displayVal = String(val);
                let valComp = null;

                if (key === 'brightness' && typeof val === 'number') {
                    displayVal = `${Math.round((val / 255) * 100)}%`;
                } else if (key === 'rgb_color' && Array.isArray(val)) {
                    valComp = (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                            <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: `rgb(${val.join(',')})`, borderWidth: 1, borderColor: '#fff' }} />
                            <Text style={styles.detailValue}>RGB({val.join(', ')})</Text>
                        </View>
                    );
                } else if (typeof val === 'object') {
                    displayVal = JSON.stringify(val);
                }

                return (
                    <View key={key} style={styles.attrRow}>
                        <Text style={styles.attrKey}>{key.replace(/_/g, ' ').toUpperCase()}</Text>
                        {valComp || <Text style={styles.detailValue}>{displayVal}</Text>}
                    </View>
                );
            });
        } catch (e) {
            return <Text style={{ color: 'red' }}>Error parsing attributes</Text>;
        }
    };

    const renderDetailsModal = () => (
        <Modal
            visible={!!selectedItem}
            transparent={true}
            animationType="fade"
            onRequestClose={() => setSelectedItem(null)}
        >
            <View style={styles.modalOverlay}>
                <View style={styles.modalContent}>
                    <Text style={styles.modalTitle}>History Record</Text>
                    {selectedItem && (
                        <ScrollView contentContainerStyle={{ paddingVertical: 10 }}>
                            <View style={styles.detailBlock}>
                                <Text style={styles.detailLabel}>Entity</Text>
                                <Text style={styles.detailMainValue}>{selectedItem.entity_id}</Text>
                            </View>

                            <View style={styles.rowSpace}>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.detailLabel}>Time</Text>
                                    <Text style={styles.detailValue}>{new Date(selectedItem.timestamp).toLocaleString('en-US')}</Text>
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.detailLabel}>Changed By</Text>
                                    <Text style={[styles.detailValue, { color: selectedItem.changed_by ? '#4CAF50' : '#888' }]}>
                                        {selectedItem.changed_by || 'System'}
                                    </Text>
                                </View>
                            </View>

                            <View style={styles.stateChangeContainer}>
                                <View style={{ flex: 1, alignItems: 'center' }}>
                                    <Text style={styles.detailLabel}>Old State</Text>
                                    <Text style={styles.stateValue}>{selectedItem.old_state || 'None'}</Text>
                                </View>
                                <Ionicons name="arrow-forward" size={20} color="#666" />
                                <View style={{ flex: 1, alignItems: 'center' }}>
                                    <Text style={styles.detailLabel}>New State</Text>
                                    <Text style={[styles.stateValue, { color: '#8947ca' }]}>{selectedItem.state}</Text>
                                </View>
                            </View>

                            <Text style={styles.sectionHeader}>Attributes Details</Text>
                            <View style={styles.attrsContainer}>
                                {renderAttributes(selectedItem.attributes)}
                            </View>
                        </ScrollView>
                    )}
                    <TouchableOpacity style={styles.closeBtn} onPress={() => setSelectedItem(null)}>
                        <Text style={styles.closeBtnText}>Close</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
    );

    const displayData = history.filter(item => {
        // If Trackers OFF: Hide items with NO ROOM (empty area_name)
        if (activeTab === 'all' && !showTrackers) {
            // If area_name is missing/empty, FILTER OUT.
            // So we return TRUE only if area_name exists
            return !!item.area_name;
        }
        return true;
    });

    return (
        <View style={styles.container}>
            <Stack.Screen options={{ headerShown: false }} />
            <LinearGradient colors={['#1a1b2e', '#16161e', '#000000']} style={StyleSheet.absoluteFill} />
            <StatusBar style="light" />
            <SafeAreaView style={{ flex: 1 }}>
                <View style={[styles.header, { paddingBottom: 10 }]}>
                    <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                        <Ionicons name="arrow-back" size={24} color="white" />
                    </TouchableOpacity>
                    <View style={{ flex: 1, marginHorizontal: 15 }}>
                        {entity_id ? (
                            <>
                                <Text style={{ color: 'white', fontSize: 16, fontWeight: 'bold' }} numberOfLines={1}>
                                    {(() => {
                                        if (history.length > 0) {
                                            try {
                                                const attrs = JSON.parse(history[0].attributes);
                                                return attrs.friendly_name || entity_id;
                                            } catch (e) { return entity_id; }
                                        }
                                        return entity_id;
                                    })()}
                                </Text>
                                <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 10 }}>
                                    {entity_id}
                                    {history.length > 0 && history[0].area_name ? ` • ${history[0].area_name}` : ''}
                                </Text>
                            </>
                        ) : (
                            <Text style={styles.title}>History Log</Text>
                        )}
                    </View>
                    <View style={styles.controls}>
                        {activeTab === 'all' && (
                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                <Text style={styles.label}>Trackers</Text>
                                <Switch
                                    value={showTrackers}
                                    onValueChange={setShowTrackers}
                                    trackColor={{ false: '#767577', true: '#8947ca' }}
                                    thumbColor={showTrackers ? '#fff' : '#f4f3f4'}
                                    style={{ transform: [{ scaleX: 0.7 }, { scaleY: 0.7 }] }}
                                />
                            </View>
                        )}
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <Text style={styles.label}>Attrs</Text>
                            <Switch
                                value={showAttributes}
                                onValueChange={setShowAttributes}
                                trackColor={{ false: '#767577', true: '#8947ca' }}
                                thumbColor={showAttributes ? '#fff' : '#f4f3f4'}
                                style={{ transform: [{ scaleX: 0.7 }, { scaleY: 0.7 }] }}
                            />
                        </View>
                    </View>
                </View>

                {/* Tabs */}
                <View style={{ flexDirection: 'row', marginHorizontal: 20, marginBottom: 15, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: 4 }}>
                    <TouchableOpacity onPress={() => setActiveTab('all')} style={{ flex: 1, paddingVertical: 8, alignItems: 'center', backgroundColor: activeTab === 'all' ? '#8947ca' : 'transparent', borderRadius: 8 }}>
                        <Text style={{ color: 'white', fontWeight: 'bold', fontSize: 14 }}>All History</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setActiveTab('my')} style={{ flex: 1, paddingVertical: 8, alignItems: 'center', backgroundColor: activeTab === 'my' ? '#8947ca' : 'transparent', borderRadius: 8 }}>
                        <Text style={{ color: 'white', fontWeight: 'bold', fontSize: 14 }}>My History</Text>
                    </TouchableOpacity>
                </View>

                {activeTab === 'my' && user && (
                    <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, marginHorizontal: 20, marginBottom: 10, textAlign: 'center' }}>
                        Filtering activity for: <Text style={{ color: '#8947ca', fontWeight: 'bold' }}>{user.name || user.entity_id}</Text>
                    </Text>
                )}

                {loading ? (
                    <ActivityIndicator size="large" color="#8947ca" style={{ marginTop: 50 }} />
                ) : (
                    <View style={styles.tableContainer}>
                        {renderHeader()}
                        <FlatList
                            data={displayData}
                            keyExtractor={(item) => item.id ? item.id.toString() : Math.random().toString()}
                            renderItem={renderItem}
                            contentContainerStyle={{ paddingBottom: 40 }}
                            ItemSeparatorComponent={() => <View style={styles.separator} />}
                            onEndReached={() => loadHistory(false)}
                            onEndReachedThreshold={0.5}
                            ListFooterComponent={loadingMore ? <ActivityIndicator color="#8947ca" style={{ margin: 20 }} /> : null}
                            ListEmptyComponent={() => (
                                <View style={{ padding: 20, alignItems: 'center' }}>
                                    <Text style={{ color: '#888' }}>No records found.</Text>
                                    {hasMore && (
                                        <TouchableOpacity onPress={() => loadHistory(false)} style={{ marginTop: 10, padding: 10, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 8 }}>
                                            <Text style={{ color: '#fff' }}>Load older records</Text>
                                        </TouchableOpacity>
                                    )}
                                </View>
                            )}
                        />

                    </View>
                )}

                {renderDetailsModal()}
            </SafeAreaView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 20,
        justifyContent: 'space-between',
        marginTop: 10
    },
    backBtn: { padding: 5, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 20 },
    title: { color: 'white', fontSize: 20, fontWeight: 'bold' },
    controls: { alignItems: 'flex-end', gap: 4 },
    label: { color: 'rgba(255,255,255,0.6)', fontSize: 10, marginRight: 4 },
    tableContainer: { flex: 1, paddingHorizontal: 15 },
    headerRow: {
        flexDirection: 'row',
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.2)',
        marginBottom: 5
    },
    cell: { color: 'rgba(255,255,255,0.5)', fontSize: 11, paddingHorizontal: 2, fontWeight: '600', textTransform: 'uppercase' },
    row: {
        flexDirection: 'row',
        paddingVertical: 14,
        alignItems: 'center'
    },
    cellText: { color: 'white', fontSize: 12, paddingHorizontal: 2 },
    separator: { height: 1, backgroundColor: 'rgba(255,255,255,0.05)' },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', padding: 20 },
    modalContent: { backgroundColor: '#16161e', borderRadius: 20, padding: 20, maxHeight: '80%', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
    modalTitle: { color: 'white', fontSize: 20, fontWeight: 'bold', marginBottom: 20, textAlign: 'center' },
    detailBlock: { marginBottom: 15 },
    rowSpace: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15 },
    detailLabel: { color: '#888', fontSize: 12, marginBottom: 4, textTransform: 'uppercase' },
    detailMainValue: { color: 'white', fontSize: 16, fontWeight: 'bold' },
    detailValue: { color: 'white', fontSize: 14 },
    stateChangeContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: 15, marginBottom: 20, justifyContent: 'space-between' },
    stateValue: { color: 'white', fontSize: 16, fontWeight: 'bold', marginTop: 4 },
    sectionHeader: { color: '#8947ca', fontSize: 16, fontWeight: 'bold', marginBottom: 10, marginTop: 10 },
    attrsContainer: { backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: 15 },
    attrRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
    attrKey: { color: '#aaa', fontSize: 13 },
    closeBtn: { backgroundColor: '#8947ca', paddingVertical: 15, borderRadius: 12, alignItems: 'center', marginTop: 20 },
    closeBtnText: { color: 'white', fontWeight: 'bold', fontSize: 16 },
    cellContainer: { justifyContent: 'center' },
    timeMain: { color: 'white', fontSize: 12, fontWeight: 'bold' },
    timeSub: { color: 'rgba(255,255,255,0.6)', fontSize: 10 },
    timeRelative: { color: '#8947ca', fontSize: 9, fontStyle: 'italic', marginTop: 2 },
});
