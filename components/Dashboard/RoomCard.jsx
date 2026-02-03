import { useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming, withSequence, Easing } from 'react-native-reanimated';
import { Colors } from '../../constants/Colors';
import { Sofa, Bed, ChefHat, Bath, Box, Moon, LampFloor } from 'lucide-react-native';

const ICONS = {
    'living': Sofa,
    'bedroom': Bed,
    'kitchen': ChefHat,
    'bathroom': Bath,
    'storage': Box,
    'guest': Moon,
    'hallway': LampFloor,
    'lulu': Bed // Using Bed for Lulus room too
};

const CLIMATE_COLORS = {
    'cool': '#42A5F5', // Blue
    'heat': '#FF7043', // Orange
    'fan_only': '#26A69A', // Teal
    'fan': '#26A69A',
    'dry': '#FFCA28', // Amber
    'auto': '#AA00FF', // Purple
};

export default function RoomCard({ name, type = 'living', temp, activeCount = 0, color = Colors.surface, style, onPress, climateState }) {
    const Icon = ICONS[type] || Sofa;
    const isActive = activeCount > 0;

    // Animation Values
    const glowOpacity = useSharedValue(0);

    const activeClimateColor = climateState ? CLIMATE_COLORS[climateState] : null;

    useEffect(() => {
        if (activeClimateColor) {
            glowOpacity.value = withRepeat(
                withSequence(
                    withTiming(0.6, { duration: 1500, easing: Easing.inOut(Easing.ease) }), // Increased to 0.6
                    withTiming(0, { duration: 1500, easing: Easing.inOut(Easing.ease) })
                ),
                -1,
                true
            );
        } else {
            glowOpacity.value = withTiming(0);
        }
    }, [activeClimateColor]);

    const animatedStyle = useAnimatedStyle(() => ({
        opacity: glowOpacity.value,
        backgroundColor: activeClimateColor || 'transparent',
    }));

    return (
        <TouchableOpacity style={[styles.container, { borderColor: color }, style]} onPress={onPress}>
            {/* Animated Background Overlay */}
            {activeClimateColor && (
                <Animated.View style={[StyleSheet.absoluteFill, styles.glowParams, animatedStyle]} />
            )}

            <View style={styles.topSection}>
                <View style={styles.info}>
                    <Text style={styles.name}>{name}</Text>
                    {isActive && <Text style={styles.subtitle}>{activeCount} devices on</Text>}
                </View>
            </View>

            <View style={styles.bottomSection}>
                {temp && (
                    <Text style={styles.temp}>{temp}°</Text>
                )}
                <Icon size={28} color={color} />
            </View>
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    container: {
        borderRadius: 24,
        padding: 20,
        height: 150,
        justifyContent: 'space-between',
        backgroundColor: '#2c2c2e',
        borderWidth: 2,
        overflow: 'hidden', // Ensure glow stays inside
        position: 'relative'
    },
    glowParams: {
        borderRadius: 22, // Match container minus border width
    },
    topSection: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        zIndex: 10,
    },
    name: {
        color: '#fff',
        fontSize: 18,
        fontWeight: 'bold',
    },
    subtitle: {
        color: 'rgba(255,255,255,0.8)',
        fontSize: 12,
        marginTop: 4,
    },
    bottomSection: {
        alignItems: 'flex-start', // Left align
        gap: 6, // Space between temp and icon
        zIndex: 10,
    },
    temp: {
        fontSize: 20,
        fontWeight: '600',
        color: '#fff',
    }
});
