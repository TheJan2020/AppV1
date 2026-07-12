/**
 * useSwipeDismiss
 * ──────────────────────────────────────────────────────────────
 * Adds slide-in animation + swipe-down-to-dismiss to any bottom-sheet modal.
 *
 * Usage:
 *   const { sheetAnimStyle, dismissGesture } = useSwipeDismiss({ visible, onClose });
 *
 *   <GestureDetector gesture={dismissGesture}>
 *     <Animated.View style={[styles.sheet, sheetAnimStyle]}>
 *       ...content
 *     </Animated.View>
 *   </GestureDetector>
 */

import { useEffect } from 'react';
import { useSharedValue, useAnimatedStyle, withTiming, withSpring, runOnJS, interpolate, Extrapolation } from 'react-native-reanimated';
import { Gesture } from 'react-native-gesture-handler';

export default function useSwipeDismiss({ visible, onClose, initialY = 900 }) {
    const sheetY = useSharedValue(initialY);

    useEffect(() => {
        if (visible) {
            sheetY.value = initialY;
            sheetY.value = withTiming(0, { duration: 300 });
        }
    }, [visible]);

    const dismissGesture = Gesture.Pan()
        .activeOffsetY(5)
        .onUpdate(e => {
            if (e.translationY > 0) sheetY.value = e.translationY;
        })
        .onEnd(e => {
            if (e.translationY > 100 || e.velocityY > 600) {
                sheetY.value = withTiming(initialY, { duration: 250 }, () => {
                    runOnJS(onClose)();
                });
            } else {
                sheetY.value = withSpring(0, { damping: 20 });
            }
        });

    const sheetAnimStyle = useAnimatedStyle(() => ({
        transform: [{ translateY: sheetY.value }],
    }));

    // Fades the sheet's container (use on the overlay/backdrop wrapper)
    const backdropAnimStyle = useAnimatedStyle(() => ({
        opacity: interpolate(sheetY.value, [0, 300], [1, 0], Extrapolation.CLAMP),
    }));

    return { sheetAnimStyle, dismissGesture, backdropAnimStyle };
}
