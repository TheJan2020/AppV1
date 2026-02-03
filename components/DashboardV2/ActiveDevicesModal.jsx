import { Modal, View, Text, StyleSheet, TouchableOpacity, SectionList, Pressable } from 'react-native';
import { BlurView } from 'expo-blur';
import { X, Power } from 'lucide-react-native';
import { Colors } from '../../constants/Colors';

export default function ActiveDevicesModal({ visible, title, devices, onClose, onToggle }) {

    const handleToggle = (item) => {
        if (!onToggle) return;

        const domain = item.entity_id.split('.')[0];
        const service = domain === 'light' ? 'turn_off' :
            domain === 'climate' ? 'turn_off' :
                domain === 'switch' ? 'turn_off' :
                    'turn_off';

        onToggle(domain, service, { entity_id: item.entity_id });
    };

    return (
        <Modal
            animationType="fade"
            transparent={true}
            visible={visible}
            onRequestClose={onClose}
        >
            <Pressable style={styles.backdrop} onPress={onClose}>
                <BlurView intensity={20} style={styles.absolute} />
            </Pressable>

            <View style={styles.centeredView}>
                <View style={styles.modalView}>
                    <View style={styles.header}>
                        <Text style={styles.title}>{title}</Text>
                        <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                            <X size={24} color="#fff" />
                        </TouchableOpacity>
                    </View>

                    {devices.length === 0 ? (
                        <View style={styles.emptyState}>
                            <Text style={styles.emptyText}>No active devices found</Text>
                        </View>
                    ) : (
                        <SectionList
                            sections={devices}
                            keyExtractor={item => item.entity_id}
                            renderSectionHeader={({ section: { title } }) => (
                                <View style={styles.sectionHeader}>
                                    <Text style={styles.sectionHeaderText}>{title}</Text>
                                </View>
                            )}
                            renderItem={({ item }) => (
                                <View style={styles.deviceRow}>
                                    <View>
                                        <Text style={styles.deviceName}>
                                            {item.attributes.friendly_name || item.entity_id}
                                        </Text>
                                        <Text style={styles.deviceState}>
                                            {item.state} {item.attributes.temperature ? `(${item.attributes.temperature}°C)` : ''}
                                        </Text>
                                    </View>
                                    <TouchableOpacity
                                        onPress={() => handleToggle(item)}
                                        style={styles.powerBtn}
                                    >
                                        <Power size={20} color="#EF5350" />
                                    </TouchableOpacity>
                                </View>
                            )}
                            contentContainerStyle={styles.listContent}
                            stickySectionHeadersEnabled={false}
                        />
                    )}
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    backdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.5)',
    },
    absolute: {
        ...StyleSheet.absoluteFillObject,
    },
    centeredView: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    modalView: {
        width: '100%',
        maxWidth: 400,
        backgroundColor: '#1E1E2C',
        borderRadius: 20,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        overflow: 'hidden',
        maxHeight: '60%',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 20,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.1)',
    },
    title: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#fff',
    },
    sectionHeader: {
        paddingVertical: 8,
        paddingHorizontal: 10,
        backgroundColor: 'rgba(255,255,255,0.05)',
        marginTop: 10,
        borderRadius: 8
    },
    sectionHeaderText: {
        color: '#8947ca',
        fontWeight: 'bold',
        fontSize: 14,
        textTransform: 'uppercase'
    },
    listContent: {
        padding: 20,
        paddingTop: 10
    },
    deviceRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.05)',
        paddingLeft: 10
    },
    deviceName: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '500',
    },
    deviceState: {
        color: '#aaa',
        fontSize: 14,
    },
    emptyState: {
        padding: 40,
        alignItems: 'center',
    },
    emptyText: {
        color: '#aaa',
        fontSize: 16,
    }
});
