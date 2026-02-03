import { View, StyleSheet, Modal, TouchableOpacity } from 'react-native';
import { BlurView } from 'expo-blur';
import { Colors } from '../../constants/Colors';
import RoomDetailView from './RoomDetailView';
import { getRoomEntities } from '../../utils/roomHelpers';

export default function RoomSheet({
    visible,
    onClose,
    room,
    registryDevices = [],
    registryEntities = [],
    allEntities = [],
    onToggle
}) {
    if (!room) return null;

    const { lights, fans, climates, covers, medias, cameras, sensors, doors } = getRoomEntities(room, registryDevices, registryEntities, allEntities);

    return (
        <Modal
            animationType="slide"
            transparent={true}
            visible={visible}
            onRequestClose={onClose}
        >
            <View style={styles.overlay}>
                <TouchableOpacity style={styles.backdrop} onPress={onClose} activeOpacity={1} />
                <View style={styles.sheetContainer}>
                    <RoomDetailView
                        room={room}
                        lights={lights}
                        fans={fans}
                        covers={covers}
                        climates={climates}
                        medias={medias}
                        cameras={cameras}
                        sensors={sensors}
                        doors={doors}
                        allEntities={allEntities}
                        onToggle={onToggle}
                        onClose={onClose}
                        isModal={true}
                    />
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        justifyContent: 'flex-end',
    },
    backdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.5)',
    },
    sheetContainer: {
        height: '85%',
        borderTopLeftRadius: 30,
        borderTopRightRadius: 30,
        overflow: 'hidden',
        backgroundColor: '#16161e', // Moved bg here to ensure solid behind view
    }
});
