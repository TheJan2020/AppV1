import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Zap } from 'lucide-react-native';
import { Colors } from '../../constants/Colors';

export default function QuickScenes({
    scenes = [],
    onScenePress
}) {
    const GenericIcon = Zap;

    if (!scenes || scenes.length === 0) {
        return (
            <View style={styles.container}>
                <Text style={styles.title}>Quick Scenes</Text>
                <View style={styles.emptyContainer}>
                    <Text style={styles.emptyText}>(No Quick Actions Found)</Text>
                </View>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <Text style={styles.title}>Quick Scenes</Text>
            <View style={styles.grid}>
                {scenes.map((scene) => (
                    <TouchableOpacity
                        key={scene.id}
                        style={styles.card}
                        onPress={() => onScenePress && onScenePress(scene.id)}
                    >
                        <View style={[styles.iconContainer, { backgroundColor: 'rgba(137, 71, 202, 0.2)' }]}>
                            <GenericIcon size={20} color="#8947ca" />
                        </View>
                        <Text style={styles.label} numberOfLines={1}>{scene.label}</Text>
                    </TouchableOpacity>
                ))}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        marginBottom: 20,
    },
    title: {
        color: 'white',
        fontSize: 16,
        fontWeight: '300', // Lite
        marginBottom: 10,
        marginLeft: 4,
        letterSpacing: 0.5,
    },
    grid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 12,
    },
    card: {
        width: '48%',
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        borderRadius: 12, // Reduced radius slightly
        padding: 12, // Reduced from 16
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'flex-start',
        gap: 12,
    },
    iconContainer: {
        padding: 8, // Reduced from 12
        borderRadius: 50,
        // marginBottom: 10, // Removed margin to use gap in card
    },
    label: {
        color: '#fff',
        fontSize: 13, // Reduced from 14
        fontWeight: '400', // Reduced weight
        flex: 1,
    },
    emptyContainer: {
        padding: 20,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        borderRadius: 12,
    },
    emptyText: {
        color: 'rgba(255, 255, 255, 0.4)',
        fontSize: 14,
        fontStyle: 'italic',
    }
});
