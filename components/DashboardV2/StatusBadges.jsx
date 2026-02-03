import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { Shield, Lightbulb, Fan, DoorOpen, Zap, Repeat } from 'lucide-react-native';
import { Colors } from '../../constants/Colors';

export default function StatusBadges({ securityState, lightsOn, acOn, doorsOpen, power, onPress }) {
    const [activeIndex, setActiveIndex] = useState(0);
    const [mode, setMode] = useState('loop'); // 'loop', 'fixed-1', 'fixed-2'

    // Timer Logic
    useEffect(() => {
        let interval;
        if (mode === 'loop') {
            interval = setInterval(() => {
                setActiveIndex(prev => (prev === 0 ? 1 : 0));
            }, 4000);
        } else if (mode === 'fixed-1') {
            setActiveIndex(0);
        } else if (mode === 'fixed-2') {
            setActiveIndex(1);
        }

        return () => {
            if (interval) clearInterval(interval);
        };
    }, [mode]);

    const handleToggleMode = () => {
        setMode(prev => {
            if (prev === 'loop') return 'fixed-1';
            if (prev === 'fixed-1') return 'fixed-2';
            return 'loop';
        });
    };

    const renderBadge = (item) => (
        <TouchableOpacity
            key={item.id}
            style={styles.badge}
            onPress={() => onPress && onPress(item.id)}
        >
            <item.icon size={13} color={item.color} />
            <Text style={styles.label}>{item.label}</Text>
        </TouchableOpacity>
    );

    const powerItems = [
        {
            id: 'lights',
            icon: Lightbulb,
            label: `${lightsOn} On`,
            color: '#FFD700', // Gold/Yellow
        },
        {
            id: 'ac',
            icon: Fan,
            label: `${acOn} On`,
            color: '#4FC3F7', // Light Blue
        },
        {
            id: 'power',
            icon: Zap,
            label: '120 KWh', // Hardcoded dummy text
            color: '#FFB74D', // Orange
        }
    ];

    const securityItems = [
        {
            id: 'security',
            icon: Shield,
            label: securityState || 'Disarmed',
            color: securityState === 'disarmed' ? Colors.primary : Colors.error,
        },
        {
            id: 'doors',
            icon: DoorOpen,
            label: doorsOpen > 0 ? `${doorsOpen} Open` : 'All Closed',
            color: doorsOpen > 0 ? Colors.error : '#81C784', // Red if open, Green if closed
        }
    ];

    return (
        <View style={styles.container}>
            <View style={styles.mainRow}>
                {/* Loop Toggle Button */}
                <TouchableOpacity
                    style={[styles.toggleButton, mode !== 'loop' && styles.toggleButtonActive]}
                    onPress={handleToggleMode}
                >
                    {mode === 'loop' && <Repeat size={14} color="rgba(255,255,255,0.6)" />}
                    {mode === 'fixed-1' && <Text style={styles.toggleText}>1</Text>}
                    {mode === 'fixed-2' && <Text style={styles.toggleText}>2</Text>}
                </TouchableOpacity>

                {/* Animated Content */}
                <View style={{ flex: 1 }}>
                    {activeIndex === 0 ? (
                        <Animated.View
                            key="row-0"
                            entering={FadeIn.duration(500)}
                            exiting={FadeOut.duration(500)}
                            style={styles.row}
                        >
                            <View style={styles.iconContainer}>
                                <Zap size={18} color="rgba(255,255,255,0.7)" />
                            </View>
                            <View style={styles.badgesContainer}>
                                {powerItems.map(renderBadge)}
                            </View>
                        </Animated.View>
                    ) : (
                        <Animated.View
                            key="row-1"
                            entering={FadeIn.duration(500)}
                            exiting={FadeOut.duration(500)}
                            style={styles.row}
                        >
                            <View style={styles.iconContainer}>
                                <Shield size={18} color="rgba(255,255,255,0.7)" />
                            </View>
                            <View style={styles.badgesContainer}>
                                {securityItems.map(renderBadge)}
                            </View>
                        </Animated.View>
                    )}
                </View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        marginBottom: 10,
        paddingHorizontal: 20,
    },
    mainRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12
    },
    toggleButton: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: 'rgba(255,255,255,0.05)',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)'
    },
    toggleButtonActive: {
        backgroundColor: '#8947ca',
        borderColor: '#8947ca'
    },
    toggleText: {
        color: '#fff',
        fontSize: 14,
        fontWeight: 'bold'
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12
    },
    iconContainer: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: 'rgba(255,255,255,0.05)',
        alignItems: 'center',
        justifyContent: 'center'
    },
    badgesContainer: {
        flexDirection: 'row',
        gap: 8,
        flex: 1,
        flexWrap: 'wrap'
    },
    badge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        paddingVertical: 4,  // Reduced from 6
        paddingHorizontal: 8, // Reduced from 10
        borderRadius: 20,
        gap: 4, // Reduced from 6
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.08)',
    },
    label: {
        color: '#fff',
        fontWeight: '600',
        fontSize: 11, // Reduced from 12
    }
});
