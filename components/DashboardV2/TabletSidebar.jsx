import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Video, LayoutGrid, Home, MessageSquare, Settings } from 'lucide-react-native';
import { BlurView } from 'expo-blur';

export default function TabletSidebar({ activeTab, onTabPress }) {
    const tabs = [
        { id: 'home', label: 'Home', icon: Home },
        { id: 'rooms', label: 'Rooms', icon: LayoutGrid },
        { id: 'cctv', label: 'CCTV', icon: Video },
        { id: 'ai', label: 'A.I.', icon: MessageSquare },
        { id: 'settings', label: 'Settings', icon: Settings },
    ];

    return (
        <View style={styles.container}>
            <BlurView intensity={30} tint="dark" style={styles.blurContainer}>
                {tabs.map((tab) => {
                    const isActive = activeTab === tab.id;
                    const Icon = tab.icon;

                    return (
                        <TouchableOpacity
                            key={tab.id}
                            style={[styles.tab, isActive && styles.activeTab]}
                            onPress={() => onTabPress(tab.id)}
                            activeOpacity={0.7}
                        >
                            <Icon
                                size={24}
                                color={isActive ? '#fff' : 'rgba(255, 255, 255, 0.4)'}
                                strokeWidth={isActive ? 2 : 1.5}
                            />
                            <Text style={[styles.label, isActive && styles.activeLabel]}>
                                {tab.label}
                            </Text>
                        </TouchableOpacity>
                    );
                })}
            </BlurView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        width: 80,
        position: 'absolute',
        left: 0,
        top: 0,
        bottom: 0,
        zIndex: 10,
        borderRightWidth: 1,
        borderRightColor: 'rgba(255,255,255,0.05)',
    },
    blurContainer: {
        flex: 1,
        paddingTop: 60,
        paddingBottom: 30,
        alignItems: 'center',
        justifyContent: 'flex-start',
        gap: 8,
        backgroundColor: 'rgba(16, 16, 24, 0.85)',
    },
    tab: {
        width: 64,
        paddingVertical: 12,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 16,
        gap: 4,
    },
    activeTab: {
        backgroundColor: 'rgba(137, 71, 202, 0.25)',
    },
    label: {
        color: 'rgba(255,255,255,0.4)',
        fontSize: 10,
        fontWeight: '500',
    },
    activeLabel: {
        color: '#fff',
        fontWeight: '600',
    },
});
