/**
 * useSwipeDismiss
 * ──────────────────────────────────────────────────────────────
 * Adds slide-in animation + swipe-down-to-dismiss to any bottom-sheet modal.
 *
 * Usage — attach handleGesture ONLY to the drag handle area, not the whole sheet:
 *
 *   const { sheetAnimStyle, backdropAnimStyle, handleGesture } = useSwipeDismiss({ visible, onClose });
 *
 *   <Animated.View style={[styles.overlay, backdropAnimStyle]}>
 *     <Animated.View style={[styles.sheet, sheetAnimStyle]}>
 *       <GestureDetector gesture={handleGesture}>
 *         <View style={styles.handleZone}><View style={styles.handle} /></View>
 *       </GestureDetector>
 *       ...scrollable content
 *     </Animated.View>
 *   </Animated.View>
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

    // Attach this ONLY to the drag handle — not to the full sheet
    const handleGesture = Gesture.Pan()
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

    // Keep dismissGesture as alias for backward compat
    const dismissGesture = handleGesture;

    const sheetAnimStyle = useAnimatedStyle(() => ({
        transform: [{ translateY: sheetY.value }],
    }));

    const backdropAnimStyle = useAnimatedStyle(() => ({
        opacity: interpolate(sheetY.value, [0, 300], [1, 0], Extrapolation.CLAMP),
    }));

    return { sheetAnimStyle, dismissGesture, handleGesture, backdropAnimStyle };
}
