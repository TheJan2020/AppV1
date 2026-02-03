import { Modal, View, Text, FlatList, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors } from '../../constants/Colors';
import { X } from 'lucide-react-native';
// expo-blur import removed

export default function ActiveEntitiesModal({ visible, onClose, title, entities }) {
    return (
        <Modal
            animationType="slide"
            transparent={true}
            visible={visible}
            onRequestClose={onClose}
        >
            <View style={styles.centeredView}>
                <View style={styles.modalView}>
                    <View style={styles.header}>
                        <Text style={styles.modalTitle}>{title}</Text>
                        <TouchableOpacity onPress={onClose}>
                            <X size={24} color={Colors.text} />
                        </TouchableOpacity>
                    </View>

                    <FlatList
                        data={entities}
                        keyExtractor={item => item.entity_id}
                        renderItem={({ item }) => (
                            <View style={styles.item}>
                                <Text style={styles.itemName}>{item.attributes.friendly_name || item.entity_id}</Text>
                                <Text style={styles.itemState}>{item.state}</Text>
                            </View>
                        )}
                        style={{ maxHeight: 300 }}
                    />
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    centeredView: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.5)',
    },
    modalView: {
        width: '80%',
        backgroundColor: Colors.surface,
        borderRadius: 20,
        padding: 20,
        shadowColor: '#000',
        shadowOffset: {
            width: 0,
            height: 2,
        },
        shadowOpacity: 0.25,
        shadowRadius: 4,
        elevation: 5,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 15,
    },
    modalTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: Colors.text,
    },
    item: {
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.1)',
        flexDirection: 'row',
        justifyContent: 'space-between'
    },
    itemName: {
        color: Colors.text,
        fontSize: 16,
    },
    itemState: {
        color: Colors.textDim,
        fontSize: 14,
    }
});
