import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withSpring,
    withTiming,
    withRepeat,
    runOnJS,
    interpolate,
    Extrapolation,
    Easing
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { ChevronRight, Check } from 'lucide-react-native';

const BUTTON_SIZE = 48;
const PADDING = 4;
const CONTAINER_HEIGHT = BUTTON_SIZE + 2 * PADDING;

export default function SlideAction({
    label,
    icon: Icon,
    onSlide,
    color = '#4CAF50',
    disabled = false
}) {
    const [layout, setLayout] = useState({ width: 0 });
    const successProgress = useSharedValue(0);
    const translateX = useSharedValue(0);

    const maxTranslate = layout.width - BUTTON_SIZE - 2 * PADDING;

    const handleComplete = () => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        if (onSlide) {
            onSlide();
        }

        // Show Success State
        successProgress.value = withTiming(1, { duration: 300 });

        // Reset after delay
        setTimeout(() => {
            successProgress.value = withTiming(0, { duration: 300 });
        }, 2500);

        // Spring back immediately for "button-like" behavior
        translateX.value = withSpring(0);
    };

    const pan = Gesture.Pan()
        .onUpdate((event) => {
            if (disabled || successProgress.value > 0.5) return;
            // Only allow sliding to the right
            translateX.value = Math.min(Math.max(event.translationX, 0), maxTranslate);
        })
        .onEnd(() => {
            if (disabled || successProgress.value > 0.5) return;
            if (translateX.value > maxTranslate * 0.75) { // 75% threshold
                runOnJS(handleComplete)();
            } else {
                translateX.value = withSpring(0);
            }
        });

    const animatedButtonStyle = useAnimatedStyle(() => {
        return {
            transform: [{ translateX: translateX.value }],
        };
    });

    const textStyle = useAnimatedStyle(() => {
        return {
            opacity: interpolate(
                translateX.value,
                [0, maxTranslate / 2],
                [1, 0],
                Extrapolation.CLAMP
            ),
            transform: [{
                translateX: interpolate(
                    translateX.value,
                    [0, maxTranslate],
                    [0, 10], // Slight movement of text
                    Extrapolation.CLAMP
                )
            }]
        };
    });

    // Dynamic background opacity based on slide progress
    const fillStyle = useAnimatedStyle(() => {
        return {
            opacity: interpolate(
                translateX.value,
                [0, maxTranslate],
                [0.1, 0.4],
                Extrapolation.CLAMP
            ),
            width: interpolate(
                translateX.value,
                [0, maxTranslate],
                [BUTTON_SIZE, layout.width - (2 * PADDING)],
                Extrapolation.CLAMP
            )
        };
    });

    const successStyle = useAnimatedStyle(() => {
        return {
            opacity: successProgress.value,
            zIndex: successProgress.value > 0.1 ? 20 : -1,
            pointerEvents: successProgress.value > 0.5 ? 'auto' : 'none'
        };
    });

    const shimmerProgress = useSharedValue(0);

    useEffect(() => {
        shimmerProgress.value = withRepeat(
            withTiming(1, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
            -1,
            true
        );
    }, []);

    const shimmerStyle = useAnimatedStyle(() => ({
        opacity: interpolate(shimmerProgress.value, [0, 0.5, 1], [0.5, 1, 0.5], Extrapolation.CLAMP),
    }));

    return (
        <View
            style={[styles.container]}
            onLayout={(e) => setLayout(e.nativeEvent.layout)}
        >
            {/* Background Track */}
            <View style={styles.track} />

            {/* Label with Shimmer */}
            <Animated.View pointerEvents="none" style={[styles.labelContainer, textStyle]}>
                <Animated.Text style={[styles.label, shimmerStyle]}>
                    {label}
                </Animated.Text>
            </Animated.View>

            {/* Slider Button */}
            <GestureDetector gesture={pan}>
                <Animated.View style={[styles.button, animatedButtonStyle]}>
                    {Icon ? (
                        <Icon size={24} color={color} />
                    ) : (
                        <ChevronRight size={24} color={color} />
                    )}
                </Animated.View>
            </GestureDetector>

            {/* Success Overlay */}
            <Animated.View style={[styles.successOverlay, { backgroundColor: color }, successStyle]}>
                <Check size={32} color="white" strokeWidth={3} />
            </Animated.View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        height: CONTAINER_HEIGHT,
        width: '100%',
        justifyContent: 'center',
        padding: PADDING,
        position: 'relative',
    },
    track: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(255, 255, 255, 0.2)',
        borderRadius: CONTAINER_HEIGHT / 2,
    },
    fill: {
        position: 'absolute',
        top: PADDING,
        left: PADDING,
        bottom: PADDING,
        borderRadius: BUTTON_SIZE / 2,
    },
    labelContainer: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'center',
        alignItems: 'center',
        paddingLeft: BUTTON_SIZE, // Offset so text is centered in remaining space roughly
        paddingRight: 10,
    },
    label: {
        color: 'white',
        fontSize: 12, // Small font since space is limited
        fontWeight: '500',
        letterSpacing: 0.5,
        textAlign: 'center'
    },
    button: {
        width: BUTTON_SIZE,
        height: BUTTON_SIZE,
        borderRadius: BUTTON_SIZE / 2,
        backgroundColor: '#2b2b3b', // Dark Grey
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: "#000",
        shadowOffset: {
            width: 0,
            height: 2,
        },
        shadowOpacity: 0.25,
        shadowRadius: 3.84,
        elevation: 5,
        zIndex: 10
    },
    successOverlay: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'center',
        alignItems: 'center',
        borderRadius: CONTAINER_HEIGHT / 2,
        height: CONTAINER_HEIGHT,
    }
});
