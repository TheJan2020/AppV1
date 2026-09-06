import { Text, TouchableOpacity, StyleSheet, ScrollView, View } from 'react-native';

export default function RoomFloorChips({ floors, selectedFloor, onSelect }) {
    if (!floors?.length) return null;

    return (
        <View style={styles.wrap}>
            <ScrollView
                horizontal
                nestedScrollEnabled
                directionalLockEnabled
                bounces={false}
                showsHorizontalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={styles.row}
                style={styles.scroller}
            >
                {floors.map((floor) => {
                    const active = selectedFloor === floor.floor_id;
                    const label = floor.name
                        ? floor.name.toUpperCase()
                        : String(floor.floor_id || '').toUpperCase();
                    return (
                        <TouchableOpacity
                            key={floor.floor_id}
                            onPress={() => onSelect(floor.floor_id)}
                            style={[styles.chip, active && styles.chipActive]}
                            activeOpacity={0.8}
                        >
                            <Text style={[styles.label, active && styles.labelActive]} numberOfLines={1}>
                                {label}
                            </Text>
                        </TouchableOpacity>
                    );
                })}
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    wrap: {
        width: '100%',
        marginBottom: 20,
    },
    scroller: {
        flexGrow: 0,
        flexShrink: 0,
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        flexGrow: 0,
        gap: 10,
        paddingRight: 8,
    },
    chip: {
        paddingVertical: 8,
        paddingHorizontal: 16,
        backgroundColor: 'rgba(255,255,255,0.1)',
        borderRadius: 20,
        flexGrow: 0,
        flexShrink: 0,
    },
    chipActive: {
        backgroundColor: '#8947ca',
    },
    label: {
        color: 'rgba(255,255,255,0.6)',
        fontWeight: '600',
    },
    labelActive: {
        color: 'white',
    },
});
