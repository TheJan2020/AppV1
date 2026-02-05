import { View, Text, StyleSheet, Modal, TouchableOpacity, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { BlurView } from 'expo-blur';
import { X, Trash2, Plus, Bell } from 'lucide-react-native';
import { Colors } from '../../constants/Colors';
import { useState, useEffect } from 'react';
import AddAlertModal from './AddAlertModal';

export default function AlertEntitiesModal({ visible, onClose }) {
    const [rules, setRules] = useState([]);
    const [loading, setLoading] = useState(true);
    const [addModalVisible, setAddModalVisible] = useState(false);
    const [editingRule, setEditingRule] = useState(null);

    const adminUrl = process.env.EXPO_PUBLIC_ADMIN_URL;

    useEffect(() => {
        if (visible) {
            fetchRules();
        }
    }, [visible]);

    const fetchRules = async () => {
        setLoading(true);
        try {
            const url = adminUrl.endsWith('/') ? `${adminUrl}api/alerts` : `${adminUrl}/api/alerts`;
            const res = await fetch(url + `?t=${Date.now()}`);
            const data = await res.json();
            if (data.success) {
                setRules(data.rules);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const handleEdit = (rule) => {
        setEditingRule(rule);
        setAddModalVisible(true);
    };

    const handleDelete = async (id) => {
        // ... same logic
        Alert.alert(
            "Delete Rule",
            "Are you sure you want to delete this alert rule?",
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Delete",
                    style: "destructive",
                    onPress: async () => {
                        try {
                            const url = adminUrl.endsWith('/') ? `${adminUrl}api/alerts?id=${id}` : `${adminUrl}/api/alerts?id=${id}`;
                            await fetch(url, { method: 'DELETE' });
                            fetchRules();
                        } catch (e) {
                            Alert.alert("Error", "Failed to delete");
                        }
                    }
                }
            ]
        );
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
                        <Text style={styles.title}>Alert Entities</Text>
                        <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                            <X size={24} color={Colors.textDim} />
                        </TouchableOpacity>
                    </View>

                    <Text style={styles.subtitle}>
                        Configure alerts for specific entity states. Push notifications and 'script.main_alert' will be triggered.
                    </Text>

                    <TouchableOpacity style={styles.addBtn} onPress={() => { setEditingRule(null); setAddModalVisible(true); }}>
                        <Plus size={20} color="#fff" />
                        <Text style={styles.addBtnText}>Add New Alert</Text>
                    </TouchableOpacity>

                    {loading ? (
                        <View style={styles.centered}>
                            <ActivityIndicator size="large" color="#8947ca" />
                        </View>
                    ) : (
                        <View style={styles.listHeader}>
                            <Text style={styles.headerCell}>ENTITY / TRIGGER</Text>
                            <Text style={styles.headerCellRight}>ACTIONS</Text>
                        </View>
                    )}

                    <ScrollView style={styles.list} contentContainerStyle={{ paddingBottom: 40 }}>
                        {rules.map((rule) => (
                            <View key={rule.id} style={styles.row}>
                                <View style={{ flex: 1 }}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                        <Bell size={14} color={Colors.primary} />
                                        <Text style={styles.entityId}>{rule.entity_id}</Text>
                                    </View>
                                    <Text style={styles.ruleDetail}>
                                        <Text style={{ color: '#fff' }}>{rule.trigger_state}</Text> for <Text style={{ color: '#fff' }}>{rule.threshold_seconds}s</Text>
                                        {rule.repeat_minutes > 0 && <Text style={{ color: Colors.primary }}> • ↻ {rule.repeat_minutes}m</Text>}
                                    </Text>
                                </View>
                                <View style={{ flexDirection: 'row', gap: 8 }}>
                                    <TouchableOpacity onPress={() => handleEdit(rule)} style={styles.editBtn}>
                                        <Text style={{ color: Colors.primary, fontSize: 13, fontWeight: 'bold' }}>EDIT</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity onPress={() => handleDelete(rule.id)} style={styles.deleteBtn}>
                                        <Trash2 size={20} color={Colors.error} />
                                    </TouchableOpacity>
                                </View>
                            </View>
                        ))}
                    </ScrollView>
                </View>
            </View>

            <AddAlertModal
                visible={addModalVisible}
                onClose={() => setAddModalVisible(false)}
                initialRule={editingRule}
                onSuccess={() => {
                    setAddModalVisible(false);
                    fetchRules();
                }}
            />
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
    addBtn: {
        flexDirection: 'row',
        backgroundColor: Colors.primary,
        padding: 14,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        marginBottom: 20
    },
    addBtnText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: 'bold'
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
        paddingVertical: 16,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.05)'
    },
    entityId: {
        color: '#fff',
        fontSize: 15,
        fontWeight: '500'
    },
    ruleDetail: {
        color: Colors.textDim,
        fontSize: 13,
        marginTop: 4
    },
    deleteBtn: {
        padding: 8,
        backgroundColor: 'rgba(239, 83, 80, 0.1)',
        borderRadius: 8
    },
    editBtn: {
        padding: 8,
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        borderRadius: 8,
        justifyContent: 'center',
        alignItems: 'center'
    },
    centered: {
        padding: 40,
        alignItems: 'center'
    }
});
