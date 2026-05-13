import { View, Text, StyleSheet, TouchableOpacity, Animated, Easing } from 'react-native';
import { Zap, Moon, Sun, LogOut, Home } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { CF } from '../../utils/typography';
import React, { useEffect, useRef } from 'react';

function getSceneIcon(name = '') {
    const n = (name || '').toLowerCase();
    if (n.includes('night') || n.includes('sleep')) return Moon;
    if (n.includes('morning') || n.includes('wake'))  return Sun;
    if (n.includes('leav') || n.includes('away') || n.includes('out')) return LogOut;
    if (n.includes('arriv') || n.includes('home') || n.includes('back')) return Home;
    return Zap;
}

export default function SceneCard({ id, label, onPress, style }) {
    const Icon = getSceneIcon(label || '');
    const glowAnim = useRef(new Animated.Value(0)).current;
    const scaleAnim = useRef(new Animated.Value(1)).current;

    useEffect(() => {
        return () => {
            glowAnim.stopAnimation();
            scaleAnim.stopAnimation();
        };
    }, [glowAnim, scaleAnim]);

    const playPressScale = () => {
        scaleAnim.stopAnimation();
        scaleAnim.setValue(1);
        Animated.sequence([
            Animated.timing(scaleAnim, {
                toValue: 0.94,
                duration: 70,
                easing: Easing.out(Easing.cubic),
                useNativeDriver: true,
            }),
            Animated.spring(scaleAnim, {
                toValue: 1.045,
                friction: 4,
                tension: 420,
                useNativeDriver: true,
            }),
            Animated.spring(scaleAnim, {
                toValue: 1,
                friction: 7,
                tension: 320,
                useNativeDriver: true,
            }),
        ]).start();
    };

    const handlePress = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        playPressScale();

        glowAnim.stopAnimation();
        glowAnim.setValue(0);
        Animated.sequence([
            Animated.timing(glowAnim, {
                toValue: 1,
                duration: 220,
                easing: Easing.out(Easing.cubic),
                useNativeDriver: false,
            }),
            Animated.timing(glowAnim, {
                toValue: 0.55,
                duration: 550,
                easing: Easing.inOut(Easing.quad),
                useNativeDriver: false,
            }),
            Animated.timing(glowAnim, {
                toValue: 1,
                duration: 450,
                easing: Easing.inOut(Easing.quad),
                useNativeDriver: false,
            }),
            Animated.timing(glowAnim, {
                toValue: 0,
                duration: 780,
                easing: Easing.out(Easing.quad),
                useNativeDriver: false,
            }),
        ]).start();
        if (onPress) onPress(id);
    };

    const glowContainerStyle = {
        shadowColor: '#8947ca',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: glowAnim.interpolate({
            inputRange: [0, 1],
            outputRange: [0, 0.85],
        }),
        shadowRadius: glowAnim.interpolate({
            inputRange: [0, 1],
            outputRange: [0, 12],
        }),
        elevation: glowAnim.interpolate({
            inputRange: [0, 1],
            outputRange: [0, 8],
        }),
    };

    const glowOverlayStyle = {
        opacity: glowAnim.interpolate({
            inputRange: [0, 1],
            outputRange: [0, 0.18],
        }),
    };

    return (
        <Animated.View style={glowContainerStyle}>
            <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
                <TouchableOpacity
                    key={id}
                    style={[styles.card, style]}
                    onPress={handlePress}
                    activeOpacity={0.92}
                >
                    <Animated.View pointerEvents="none" style={[styles.glowOverlay, glowOverlayStyle]} />
                    <View style={styles.iconContainer}>
                        <Icon size={26} color="#8947ca" />
                    </View>
                    <Text style={styles.label} numberOfLines={1}>{label}</Text>
                </TouchableOpacity>
            </Animated.View>
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    card: {
        width: '100%',
        height: 62,
        backgroundColor: '#12132a',
        borderRadius: 48,
        borderWidth: 1,
        borderColor: '#212136',
        paddingHorizontal: 12,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        overflow: 'visible',
    },
    glowOverlay: {
        position: 'absolute',
        left: 0,
        right: 0,
        top: 0,
        bottom: 0,
        borderRadius: 48,
        backgroundColor: '#8947ca',
    },
    iconContainer: {
        width: 36,
        height: 36,
        borderRadius: 0,
        backgroundColor: 'transparent',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
    },
    label: {
        flex: 1,
        color: '#ededf5',
        fontSize: 13,
        fontFamily: CF.medium,
        letterSpacing: 0.1,
    },
});
