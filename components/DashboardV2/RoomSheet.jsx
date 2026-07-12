import { View, StyleSheet } from 'react-native';
import BottomSheetModal from '../BottomSheetModal';
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
        <BottomSheetModal visible={visible} onClose={onClose} height="85%">
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
        </BottomSheetModal>
    );
}

const styles = StyleSheet.create({});
