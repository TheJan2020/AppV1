import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { LogOut, LogIn, Users, Power, Youtube, Wifi, History, BarChart2 } from 'lucide-react-native';
import { Colors } from '../../constants/Colors';

export default function QuickScenes({ onScenePress, onPlayMediaPress, onRemotePress, onNetworkPress, onHistoryPress, onStatisticsPress }) {
    const scenes = [
        { id: 'leaving_home', label: 'Leaving Home', icon: LogOut, color: '#8947ca' },
        { id: 'arriving_home', label: 'Arriving Home', icon: LogIn, color: '#8947ca' },
        { id: 'guests_mode', label: 'Guests Mode', icon: Users, color: '#8947ca' },
        { id: 'all_off', label: 'All Off', icon: Power, color: '#8947ca' },
    ];

    return (
        <View style={styles.container}>
            <Text style={styles.title}>Quick Scenes</Text>
            <View style={styles.grid}>
                {scenes.map((scene) => (
                    <TouchableOpacity
                        key={scene.id}
                        style={styles.card}
                        onPress={() => {
                            if (scene.isSpecial && scene.action === 'playMedia' && onPlayMediaPress) {
                                onPlayMediaPress();
                            } else if (scene.isSpecial && scene.action === 'network' && onNetworkPress) {
                                onNetworkPress();
                            } else if (scene.isSpecial && scene.action === 'history' && onHistoryPress) {
                                onHistoryPress();
                            } else if (scene.isSpecial && scene.action === 'statistics' && onStatisticsPress) {
                                onStatisticsPress();
                            } else if (onScenePress) {
                                onScenePress(scene.id);
                            }
                        }}
                    >
                        <View style={[styles.iconContainer, { backgroundColor: `${scene.color}20` }]}>
                            <scene.icon size={20} color={scene.color} />
                        </View>
                        <Text style={styles.label}>{scene.label}</Text>
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
    }
});
