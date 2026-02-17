import { View, Text, StyleSheet, Modal, TouchableOpacity, ScrollView, TextInput, ActivityIndicator, Switch } from 'react-native';
import { BlurView } from 'expo-blur';
import { X, Search, Heart } from 'lucide-react-native';
import { Colors } from '../../constants/Colors';
import { useState, useEffect } from 'react';

export default function PreferencedEntitiesModal({ visible, onClose, adminUrl }) {
    const [entities, setEntities] = useState([]);
    const [filteredEntities, setFilteredEntities] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [loading, setLoading] = useState(true);
    const [changedEntities, setChangedEntities] = useState({}); // { entity_id: newStatus }

    useEffect(() => {
        if (visible) {
            fetchEntities();
        }
    }, [visible]);

    useEffect(() => {
        if (!searchQuery) {
            setFilteredEntities(entities);
        } else {
            const lower = searchQuery.toLowerCase();
            setFilteredEntities(entities.filter(e =>
                e.entity_id.toLowerCase().includes(lower) ||
                e.type.toLowerCase().includes(lower)
            ));
        }
    }, [searchQuery, entities]);

    const fetchEntities = async () => {
        setLoading(true);
        try {
            const url = adminUrl.endsWith('/') ? `${adminUrl}api/monitor` : `${adminUrl}/api/monitor`;
            const res = await fetch(url + `?t=${Date.now()}`);
            const data = await res.json();
            if (data.success) {
                // Determine includePreference defaults to 1 if null/undefined
                const mapped = data.entities.map(e => ({
                    ...e,
                    includePreference: (e.includePreference === undefined || e.includePreference === null) ? 1 : e.includePreference
                }));
                setEntities(mapped);
                setFilteredEntities(mapped);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const togglePreference = (entityId, currentVal) => {
        const newStatus = currentVal === 1 ? 0 : 1;

        // Optimistic Update
        const updated = entities.map(e => e.entity_id === entityId ? { ...e, includePreference: newStatus } : e);
        setEntities(updated);

        // Track Change
        setChangedEntities(prev => ({
            ...prev,
            [entityId]: newStatus
        }));
    };

    const handleApply = async () => {
        const changes = Object.entries(changedEntities);
        if (changes.length === 0) {
            onClose();
            return;
        }

        setLoading(true);
        try {
            const url = adminUrl.endsWith('/') ? `${adminUrl}api/monitor` : `${adminUrl}/api/monitor`;

            // Send requests in parallel
            await Promise.all(changes.map(([entityId, val]) =>
                fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ entity_id: entityId, includePreference: val })
                })
            ));

            setChangedEntities({});
            onClose();
        } catch (e) {
            console.error("Failed to apply changes", e);
            alert("Failed to apply some changes");
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal
            animationType="slide"
            transparent={true}
            visible={visible}
            onRequestClose={onClose}
        >
            <View style={styles.overlay}>
                <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
                <View style={styles.contentContainer}>
                    <View style={styles.header}>
                        <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                            <X size={24} color={Colors.textDim} />
                        </TouchableOpacity>

                        <Text style={styles.title}>Preferenced Entities</Text>

                        {Object.keys(changedEntities).length > 0 ? (
                            <TouchableOpacity onPress={handleApply} style={styles.applyBtn}>
                                <Text style={styles.applyBtnText}>Apply</Text>
                            </TouchableOpacity>
                        ) : (
                            <View style={{ width: 60 }} />
                        )}
                    </View>

                    <Text style={styles.subtitle}>
                        Choose which entities are included in AI preference analysis.
                        Turn on to include, off to exclude.
                    </Text>

                    <View style={styles.searchContainer}>
                        <Search size={20} color={Colors.textDim} />
                        <TextInput
                            style={styles.searchInput}
                            placeholder="Search entities..."
                            placeholderTextColor={Colors.textDim}
                            value={searchQuery}
                            onChangeText={setSearchQuery}
                        />
                    </View>

                    {loading ? (
                        <View style={styles.centered}>
                            <ActivityIndicator size="large" color="#8947ca" />
                        </View>
                    ) : (
                        <View style={styles.listHeader}>
                            <Text style={styles.headerCell}>ENTITY ID</Text>
                            <Text style={styles.headerCellRight}>INCLUDE</Text>
                        </View>
                    )}

                    <ScrollView style={styles.list} contentContainerStyle={{ paddingBottom: 40 }}>
                        {filteredEntities.map((item) => (
                            <View key={item.entity_id} style={styles.row}>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.entityId}>{item.entity_id}</Text>
                                    <View style={styles.typeTag}>
                                        <Text style={styles.typeText}>{item.type.toUpperCase()}</Text>
                                    </View>
                                </View>
                                <Switch
                                    value={item.includePreference === 1}
                                    onValueChange={() => togglePreference(item.entity_id, item.includePreference)}
                                    trackColor={{ false: "#3e3e3e", true: Colors.primary }}
                                    thumbColor={item.includePreference === 1 ? "#fff" : "#f4f3f4"}
                                />
                            </View>
                        ))}
                    </ScrollView>
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'flex-end',
    },
    contentContainer: {
        height: '92%',
        backgroundColor: '#1a1b2e',
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        padding: 20,
        overflow: 'hidden'
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 10
    },
    title: {
        color: '#fff',
        fontSize: 22,
        fontWeight: 'bold'
    },
    subtitle: {
        color: Colors.textDim,
        fontSize: 14,
        marginBottom: 20
    },
    closeBtn: {
        padding: 5
    },
    searchContainer: {
        flexDirection: 'row',
        backgroundColor: 'rgba(255,255,255,0.08)',
        borderRadius: 12,
        padding: 12,
        alignItems: 'center',
        gap: 10,
        marginBottom: 15
    },
    searchInput: {
        flex: 1,
        color: '#fff',
        fontSize: 16
    },
    listHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.1)',
        marginBottom: 5
    },
    headerCell: {
        color: Colors.textDim,
        fontSize: 12,
        fontWeight: 'bold',
        letterSpacing: 1
    },
    headerCellRight: {
        color: Colors.textDim,
        fontSize: 12,
        fontWeight: 'bold',
        letterSpacing: 1,
        textAlign: 'right'
    },
    list: {
        flex: 1
    },
    row: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.05)'
    },
    entityId: {
        color: '#fff',
        fontSize: 15,
        marginBottom: 4
    },
    typeTag: {
        backgroundColor: 'rgba(255,255,255,0.1)',
        alignSelf: 'flex-start',
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 4
    },
    typeText: {
        color: 'rgba(255,255,255,0.7)',
        fontSize: 10,
        fontWeight: 'bold'
    },
    centered: {
        padding: 40,
        alignItems: 'center'
    },
    applyBtn: {
        backgroundColor: Colors.primary,
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 8
    },
    applyBtnText: {
        color: '#fff',
        fontWeight: 'bold',
        fontSize: 14
    }
});
