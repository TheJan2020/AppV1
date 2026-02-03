import { View, Text, StyleSheet, Modal, TouchableOpacity, ScrollView, TextInput, ActivityIndicator, Switch } from 'react-native';
import { BlurView } from 'expo-blur';
import { X, Search, Database } from 'lucide-react-native';
import { Colors } from '../../constants/Colors';
import { useState, useEffect } from 'react';

export default function MonitoredEntitiesModal({ visible, onClose }) {
    const [entities, setEntities] = useState([]);
    const [filteredEntities, setFilteredEntities] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [loading, setLoading] = useState(true);

    const adminUrl = process.env.EXPO_PUBLIC_ADMIN_URL;

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
                setEntities(data.entities);
                setFilteredEntities(data.entities);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const toggleIgnore = async (entityId, currentIgnored) => {
        const newStatus = !currentIgnored;

        // Optimistic Update
        const updated = entities.map(e => e.entity_id === entityId ? { ...e, ignored: newStatus ? 1 : 0 } : e);
        setEntities(updated);

        try {
            const url = adminUrl.endsWith('/') ? `${adminUrl}api/monitor` : `${adminUrl}/api/monitor`;
            await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ entity_id: entityId, ignored: newStatus })
            });
            // Success
        } catch (e) {
            console.error("Failed to update", e);
            // Revert on error
            setEntities(entities);
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
                        <Text style={styles.title}>Monitored Entities</Text>
                        <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                            <X size={24} color={Colors.textDim} />
                        </TouchableOpacity>
                    </View>

                    <Text style={styles.subtitle}>
                        Manage which entities are tracked by the data recorder.
                        Ignored entities will not be stored in history logs.
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
                            <Text style={styles.headerCellRight}>IGNORED</Text>
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
                                    value={item.ignored === 1}
                                    onValueChange={() => toggleIgnore(item.entity_id, item.ignored === 1)}
                                    trackColor={{ false: "#3e3e3e", true: "#EF5350" }}
                                    thumbColor={item.ignored === 1 ? "#fff" : "#f4f3f4"}
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
    }
});
