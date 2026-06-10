import { View, StyleSheet, Modal, TouchableOpacity } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import RoomDetailView from './RoomDetailView';
import { useRoomAreaEntities } from '../../hooks/useRoomAreaEntities';

export default function RoomSheet({
    visible,
    onClose,
    room,
    registryAreas = [],
    registryDevices = [],
    registryEntities = [],
    allEntities = [],
    onToggle,
    lightMappings = [],
    mediaMappings = [],
    adminUrl,
    haUrl,
    haToken,
    showPreferenceButton = true,
    sensorMappings = [],
    coverMappings = [],
    coverWindows = [],
    musicAssistantEntryIds = [],
    browseMedia,
    callServiceWithResponse,
    systemHealthBanner = null,
    canControlHa = true,
    badgeConfig = null,
}) {
    if (!room) return null;

    const {
        areaTabs,
        activeAreaKey,
        setActiveAreaKey,
        lights,
        fans,
        climates,
        covers,
        medias,
        musicMedias,
        cameras,
        sensors,
        doors,
        switches,
        automations,
        scripts,
    } = useRoomAreaEntities({
        room,
        registryAreas,
        registryDevices,
        registryEntities,
        allEntities,
        sensorMappings,
        coverMappings,
        mediaMappings,
        musicAssistantEntryIds,
        badgeConfig,
    });

    return (
        <Modal
            animationType="slide"
            transparent={true}
            visible={visible}
            onRequestClose={onClose}
        >
            <View style={styles.overlay}>
                <TouchableOpacity style={styles.backdrop} onPress={onClose} activeOpacity={1} />
                <GestureHandlerRootView style={styles.sheetContainer}>
                    <RoomDetailView
                        room={room}
                        areaTabs={areaTabs}
                        activeAreaKey={activeAreaKey}
                        onSelectArea={setActiveAreaKey}
                        lights={lights}
                        fans={fans}
                        covers={covers}
                        climates={climates}
                        medias={medias}
                        musicMedias={musicMedias}
                        cameras={cameras}
                        sensors={sensors}
                        doors={doors}
                        switches={switches}
                        automations={automations}
                        scripts={scripts}
                        allEntities={allEntities}
                        onToggle={onToggle}
                        onClose={onClose}
                        isModal={true}
                        lightMappings={lightMappings}
                        mediaMappings={mediaMappings}
                        adminUrl={adminUrl}
                        haUrl={haUrl}
                        haToken={haToken}
                        showPreferenceButton={showPreferenceButton}
                        sensorMappings={sensorMappings}
                        coverMappings={coverMappings}
                        coverWindows={coverWindows}
                        musicAssistantEntryIds={musicAssistantEntryIds}
                        browseMedia={browseMedia}
                        callServiceWithResponse={callServiceWithResponse}
                        systemHealthBanner={systemHealthBanner}
                        canControlHa={canControlHa}
                    />
                </GestureHandlerRootView>
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
        backgroundColor: '#09091A', // Rooms modal background (requested)
    }
});
