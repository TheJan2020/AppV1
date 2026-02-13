import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Video, LayoutGrid, Home, MessageSquare, Settings } from 'lucide-react-native';
import { BlurView } from 'expo-blur';

export default function TabBar({ activeTab, onTabPress }) {
    const tabs = [
        { id: 'cctv', label: 'CCTV', icon: Video },
        { id: 'rooms', label: 'Rooms', icon: LayoutGrid },
        { id: 'home', label: 'Home', icon: Home },
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
                            style={styles.tab}
                            onPress={() => onTabPress(tab.id)}
                            activeOpacity={0.7}
                        >
                            <View style={[styles.iconContainer, isActive && styles.activeIconContainer]}>
                                <Icon
                                    size={30}
                                    color={isActive ? '#fff' : 'rgba(255, 255, 255, 0.5)'}
                                    strokeWidth={1.5}
                                />
                            </View>
                        </TouchableOpacity>
                    );
                })}
            </BlurView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        position: 'absolute',
        bottom: 30,
        left: 20,
        right: 20,
        height: 80,
        borderRadius: 40,
        overflow: 'hidden',
        shadowColor: "#000",
        shadowOffset: {
            width: 0,
            height: 10,
        },
        shadowOpacity: 0.5,
        shadowRadius: 20,
        elevation: 10,
    },
    blurContainer: {
        flex: 1,
        flexDirection: 'row',
        justifyContent: 'space-around',
        alignItems: 'center',
        paddingHorizontal: 10,
        backgroundColor: 'rgba(20, 20, 30, 0.7)',
    },
    tab: {
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        flex: 1,
    },
    iconContainer: {
        padding: 8,
        borderRadius: 20,
    },
    activeIconContainer: {}
});
