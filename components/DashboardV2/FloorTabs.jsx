import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Colors } from '../../constants/Colors';

export default function FloorTabs({ floors, selectedFloor, onSelect }) {
    // if (!floors || floors.length === 0) return null; // Removed to always show Home tab

    return (
        <View style={styles.container}>
            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.scrollContent}
            >
                <TouchableOpacity
                    style={[styles.tab, selectedFloor === 'home' && styles.activeTab]}
                    onPress={() => onSelect('home')}
                >
                    <Text style={[styles.tabText, selectedFloor === 'home' && styles.activeTabText]}>
                        Home
                    </Text>
                </TouchableOpacity>

                {(floors || []).map((floor) => {
                    const isActive = selectedFloor === floor.floor_id;
                    return (
                        <TouchableOpacity
                            key={floor.floor_id}
                            style={[styles.tab, isActive && styles.activeTab]}
                            onPress={() => onSelect(floor.floor_id)}
                        >
                            <Text style={[styles.tabText, isActive && styles.activeTabText]}>
                                {floor.name}
                            </Text>
                        </TouchableOpacity>
                    );
                })}
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        marginBottom: 10,
    },
    scrollContent: {
        paddingHorizontal: 20,
        gap: 10,
    },
    tab: {
        paddingVertical: 8,
        paddingHorizontal: 16,
        borderRadius: 20,
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
    },
    activeTab: {
        backgroundColor: '#8947ca',
        borderColor: '#8947ca',
    },
    tabText: {
        color: '#888',
        fontWeight: '600',
        fontSize: 14,
    },
    activeTabText: {
        color: '#fff',
    }
});
