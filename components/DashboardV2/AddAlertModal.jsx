import { View, Text, StyleSheet, Modal, TouchableOpacity, ScrollView, TextInput, FlatList, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { X, ArrowRight, Check, Search, Save } from 'lucide-react-native';
import { Colors } from '../../constants/Colors';
import { useState, useEffect } from 'react';

export default function AddAlertModal({ visible, onClose, onSuccess, initialRule = null, adminUrl }) {
    const [step, setStep] = useState(1);
    const [entities, setEntities] = useState([]);
    const [filteredEntities, setFilteredEntities] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');

    // Form Data
    const [selectedEntity, setSelectedEntity] = useState(null);
    const [triggerState, setTriggerState] = useState('');
    const [threshold, setThreshold] = useState('0');
    const [repeatMinutes, setRepeatMinutes] = useState('0');

    const isEditing = !!initialRule;

    useEffect(() => {
        if (visible) {
            setStep(initialRule ? 2 : 1);
            if (initialRule) {
                setSelectedEntity({ entity_id: initialRule.entity_id });
                setTriggerState(initialRule.trigger_state);
                setThreshold(String(initialRule.threshold_seconds || 0));
                setRepeatMinutes(String(initialRule.repeat_minutes || 0));
            } else {
                setTriggerState('');
                setThreshold('0');
                setRepeatMinutes('0');
                setSelectedEntity(null);
                setSearchQuery('');
            }
            fetchMonitoredEntities();
        }
    }, [visible, initialRule]);

    useEffect(() => {
        if (!searchQuery) {
            setFilteredEntities(entities);
        } else {
            const lower = searchQuery.toLowerCase();
            setFilteredEntities(entities.filter(e => e.entity_id.includes(lower)));
        }
    }, [searchQuery, entities]);

    const fetchMonitoredEntities = async () => {
        try {
            const url = adminUrl.endsWith('/') ? `${adminUrl}api/monitor` : `${adminUrl}/api/monitor`;
            const res = await fetch(url);
            const data = await res.json();
            if (data.success) {
                setEntities(data.entities);
                setFilteredEntities(data.entities);
                // If editing, ensure we have the full object if needed, though we just need ID
            }
        } catch (e) {
            console.error(e);
        }
    };

    const handleSave = async () => {
        if (!selectedEntity || !triggerState) {
            Alert.alert("Missing Fields", "Please fill all fields.");
            return;
        }

        try {
            const url = adminUrl.endsWith('/') ? `${adminUrl}api/alerts` : `${adminUrl}/api/alerts`;
            const payload = {
                entity_id: selectedEntity.entity_id,
                trigger_state: triggerState,
                threshold_seconds: threshold,
                repeat_minutes: repeatMinutes
            };
            if (isEditing) payload.id = initialRule.id;

            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (data.success) {
                onSuccess();
            } else {
                Alert.alert("Error", data.error || "Failed to save");
            }
        } catch (e) {
            Alert.alert("Error", "Network request failed");
        }
    };

    const renderStep1 = () => (
        <View style={{ flex: 1 }}>
            <Text style={styles.stepTitle}>Select Entity</Text>
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
            <FlatList
                data={filteredEntities}
                keyExtractor={item => item.entity_id}
                renderItem={({ item }) => (
                    <TouchableOpacity
                        style={[styles.item, selectedEntity?.entity_id === item.entity_id && styles.selectedItem]}
                        onPress={() => setSelectedEntity(item)}
                    >
                        <Text style={[styles.itemText, selectedEntity?.entity_id === item.entity_id && { color: '#fff', fontWeight: 'bold' }]}>{item.entity_id}</Text>
                        {selectedEntity?.entity_id === item.entity_id && <Check size={20} color="#fff" />}
                    </TouchableOpacity>
                )}
                style={{ flex: 1 }}
            />
            <TouchableOpacity
                style={[styles.nextBtn, !selectedEntity && styles.disabledBtn]}
                disabled={!selectedEntity}
                onPress={() => setStep(2)}
            >
                <Text style={styles.btnText}>Next</Text>
                <ArrowRight size={20} color="#fff" />
            </TouchableOpacity>
        </View>
    );

    const renderStep2 = () => (
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
            <ScrollView style={{ flex: 1 }}>
                <Text style={styles.stepTitle}>Configuration</Text>

                <View style={styles.infoBox}>
                    <Text style={styles.label}>Selected Entity</Text>
                    <Text style={styles.value}>{selectedEntity?.entity_id}</Text>
                </View>

                <View style={styles.inputGroup}>
                    <Text style={styles.label}>Trigger State</Text>
                    <TextInput
                        style={styles.input}
                        placeholder="e.g. on, open, unavailable"
                        placeholderTextColor={Colors.textDim}
                        value={triggerState}
                        onChangeText={setTriggerState}
                        autoCapitalize="none"
                    />
                    <Text style={styles.helper}>The state that triggers the alert.</Text>
                </View>

                <View style={styles.inputGroup}>
                    <Text style={styles.label}>Threshold (Seconds)</Text>
                    <TextInput
                        style={styles.input}
                        placeholder="0"
                        placeholderTextColor={Colors.textDim}
                        value={threshold}
                        onChangeText={setThreshold}
                        keyboardType="numeric"
                    />
                    <Text style={styles.helper}>Time the entity must remain in state before triggering.</Text>
                </View>

                <View style={styles.inputGroup}>
                    <Text style={styles.label}>Repeat Alert (Minutes)</Text>
                    <TextInput
                        style={styles.input}
                        placeholder="0 (No Repeat)"
                        placeholderTextColor={Colors.textDim}
                        value={repeatMinutes}
                        onChangeText={setRepeatMinutes}
                        keyboardType="numeric"
                    />
                    <Text style={styles.helper}>Sends notification/script every X minutes if still active. 0 = Once.</Text>
                </View>

                {!isEditing && (
                    <TouchableOpacity style={styles.backBtn} onPress={() => setStep(1)}>
                        <Text style={styles.backBtnText}>Change Entity</Text>
                    </TouchableOpacity>
                )}
            </ScrollView>
        </KeyboardAvoidingView>
    );

    return (
        <Modal
            animationType="slide"
            transparent={true}
            visible={visible}
            onRequestClose={onClose}
        >
            <View style={styles.overlay}>
                <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
                <View style={[styles.contentContainer, { height: step === 1 ? '85%' : '75%' }]}>
                    <View style={styles.header}>
                        <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                            <X size={24} color={Colors.textDim} />
                        </TouchableOpacity>

                        <Text style={styles.title}>{isEditing ? 'Edit Alert' : 'Add Alert'}</Text>

                        {step === 2 ? (
                            <TouchableOpacity onPress={handleSave} style={styles.saveHeaderBtn}>
                                <Text style={styles.saveHeaderText}>Save</Text>
                            </TouchableOpacity>
                        ) : (
                            <View style={{ width: 40 }} /> // Spacer
                        )}
                    </View>

                    {step === 1 ? renderStep1() : renderStep2()}
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
        marginBottom: 20
    },
    title: {
        color: '#fff',
        fontSize: 18,
        fontWeight: 'bold'
    },
    closeBtn: {
        padding: 5
    },
    saveHeaderBtn: {
        paddingVertical: 6,
        paddingHorizontal: 12,
        backgroundColor: Colors.primary,
        borderRadius: 8
    },
    saveHeaderText: {
        color: '#fff',
        fontWeight: 'bold',
        fontSize: 14
    },
    stepTitle: {
        color: Colors.primary,
        fontSize: 14,
        fontWeight: 'bold',
        marginBottom: 10,
        textTransform: 'uppercase'
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
    item: {
        padding: 16,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.05)',
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center'
    },
    selectedItem: {
        backgroundColor: 'rgba(137, 71, 202, 0.2)',
        borderColor: Colors.primary,
        borderWidth: 1,
        borderRadius: 8,
        borderBottomWidth: 1,
        borderBottomColor: Colors.primary
    },
    itemText: {
        color: Colors.textDim,
        fontSize: 16
    },
    nextBtn: {
        backgroundColor: Colors.primary,
        padding: 16,
        borderRadius: 12,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        marginTop: 20
    },
    disabledBtn: {
        opacity: 0.5
    },
    btnText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: 'bold'
    },
    infoBox: {
        backgroundColor: 'rgba(255,255,255,0.05)',
        padding: 16,
        borderRadius: 12,
        marginBottom: 20
    },
    label: {
        color: Colors.textDim,
        fontSize: 12,
        marginBottom: 4
    },
    value: {
        color: '#fff',
        fontSize: 16,
        fontWeight: 'bold'
    },
    inputGroup: {
        marginBottom: 20
    },
    input: {
        backgroundColor: 'rgba(255,255,255,0.08)',
        borderRadius: 12,
        padding: 16,
        color: '#fff',
        fontSize: 16,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)'
    },
    helper: {
        color: Colors.textDim,
        fontSize: 12,
        marginTop: 6
    },
    backBtn: {
        padding: 16,
        alignItems: 'center',
        marginTop: 10
    },
    backBtnText: {
        color: Colors.textDim,
        fontSize: 14
    }
});
