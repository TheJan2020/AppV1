import { View, StyleSheet } from 'react-native';
import RoomsList from '../DashboardV2/RoomsList';

export default function RoomsWidget({
    rooms,
    onRoomPress,
    registryEntities,
    allEntities,
    haUrl,
    haToken,
    columns = 3,
    cardOpacity = 0.4,
    cardColor = '#000000',
    span = 4,
    totalColumns = 4,
}) {
    const widthPercent = `${(span / totalColumns) * 100 - 1}%`;

    return (
        <View style={[styles.container, { width: widthPercent }]}>
            <RoomsList
                rooms={rooms}
                onRoomPress={onRoomPress}
                overlayColor={cardColor}
                overlayOpacity={cardOpacity}
                layout="grid"
                columns={columns}
                registryEntities={registryEntities}
                allEntities={allEntities}
                haUrl={haUrl}
                haToken={haToken}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        marginBottom: 10,
    },
});
