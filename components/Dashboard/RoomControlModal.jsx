import { Modal, View, Text, TouchableOpacity, Switch, StyleSheet, ScrollView, Pressable } from 'react-native';
import { Colors } from '../../constants/Colors';
import { X, Lightbulb } from 'lucide-react-native';
import ClimateControl from './ClimateControl';

export default function RoomControlModal({ visible, onClose, roomName, lights = [], climate = [], onToggleLight, onSetHvac, onSetTemp }) {
    return (
        <Modal
            animationType="slide"
            transparent={true}
            visible={visible}
            onRequestClose={onClose}
        >
            <View style={styles.centeredView}>
                {/* Backdrop to close */}
                <Pressable style={styles.backdrop} onPress={onClose} />

                <View style={styles.modalView}>
                    <View style={styles.header}>
                        <Text style={styles.modalTitle}>{roomName}</Text>
                        <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                            <X size={24} color={Colors.textDim} />
                        </TouchableOpacity>
                    </View>

                    <View style={styles.separator} />

                    <ScrollView style={styles.scrollContent}>
                        {/* Lights Section */}
                        {lights.length > 0 && (
                            <View style={styles.section}>
                                <Text style={styles.sectionTitle}>Lights</Text>
                                {lights.map((item) => (
                                    <View key={item.entity_id} style={styles.item}>
                                        <View style={styles.itemInfo}>
                                            <View style={styles.iconContainer}>
                                                <Lightbulb size={20} color={item.state === 'on' ? '#FFC107' : Colors.textDim} />
                                            </View>
                                            <Text style={styles.itemName}>{item.attributes.friendly_name || item.entity_id}</Text>
                                        </View>
                                        <Switch
                                            trackColor={{ false: '#767577', true: Colors.success }}
                                            thumbColor={'#f4f3f4'}
                                            ios_backgroundColor="#3e3e3e"
                                            onValueChange={() => onToggleLight(item)}
                                            value={item.state === 'on'}
                                        />
                                    </View>
                                ))}
                            </View>
                        )}

                        {lights.length > 0 && climate.length > 0 && <View style={styles.sectionSeparator} />}

                        {/* Climate Section */}
                        {climate.length > 0 && (
                            <View style={styles.section}>
                                <Text style={styles.sectionTitle}>Climate</Text>
                                {climate.map((item) => (
                                    <ClimateControl
                                        key={item.entity_id}
                                        entity={item}
                                        onSethvac={onSetHvac}
                                        onSetTemp={onSetTemp}
                                    />
                                ))}
                            </View>
                        )}

                        {lights.length === 0 && climate.length === 0 && (
                            <Text style={styles.emptyText}>No devices found for this room.</Text>
                        )}
                    </ScrollView>
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    centeredView: {
        flex: 1,
        justifyContent: 'flex-end',
    },
    backdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.5)',
    },
    modalView: {
        backgroundColor: Colors.surface,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        padding: 20,
        paddingBottom: 40,
        maxHeight: '80%',
        shadowColor: '#000',
        shadowOffset: {
            width: 0,
            height: -2,
        },
        shadowOpacity: 0.25,
        shadowRadius: 4,
        elevation: 5,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 10,
    },
    modalTitle: {
        fontSize: 24,
        fontWeight: 'bold',
        color: Colors.text,
    },
    closeBtn: {
        padding: 4,
    },
    separator: {
        height: 1,
        backgroundColor: 'rgba(255,255,255,0.1)',
        marginBottom: 10,
    },
    scrollContent: {
        paddingBottom: 20,
    },
    section: {
        marginBottom: 10,
    },
    sectionTitle: {
        color: Colors.textDim,
        fontSize: 14,
        fontWeight: '600',
        marginBottom: 10,
        marginTop: 5,
    },
    sectionSeparator: {
        height: 1,
        backgroundColor: 'rgba(255,255,255,0.1)',
        marginVertical: 15,
    },
    emptyText: {
        color: Colors.textDim,
        textAlign: 'center',
        marginTop: 20,
        fontStyle: 'italic',
    },
    item: {
        paddingVertical: 12,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: Colors.background,
        borderRadius: 12,
        paddingHorizontal: 16,
        marginBottom: 8,
    },
    itemInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    iconContainer: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: 'rgba(255,255,255,0.05)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    itemName: {
        color: Colors.text,
        fontSize: 16,
        fontWeight: '500',
        maxWidth: 200,
    },
});
