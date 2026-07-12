/**
 * BottomSheetModal
 * ─────────────────────────────────────────────────────────────
 * Reusable wrapper for ALL bottom-sheet modals.
 *
 * Features:
 *  • Tap backdrop  → close
 *  • Swipe down    → close (threshold: 100px or velocity > 600)
 *  • Slide-in animation on open
 *  • onRequestClose (Android back button)
 *
 * Usage:
 *   <BottomSheetModal visible={visible} onClose={onClose} height="85%">
 *     {children}
 *   </BottomSheetModal>
 */

import { Modal, View, StyleSheet } from 'react-native';
import { GestureDetector, Gesture, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
    useSharedValue, useAnimatedStyle, withTiming, withSpring, runOnJS, interpolate, Extrapolation,
} from 'react-native-reanimated';
import { useEffect } from 'react';
import ModalBackdrop from './ModalBackdrop';

export default function BottomSheetModal({
    visible,
    onClose,
    children,
    height = '85%',
    backgroundColor = '#09091A',
    backdropColor = 'rgba(0,0,0,0.55)',
}) {
    const sheetY = useSharedValue(900);

    useEffect(() => {
        if (visible) {
            sheetY.value = 900;
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
                sheetY.value = withTiming(900, { duration: 250 }, () => {
                    runOnJS(onClose)();
                });
            } else {
                sheetY.value = withSpring(0, { damping: 20 });
            }
        });

    const sheetAnimStyle = useAnimatedStyle(() => ({
        transform: [{ translateY: sheetY.value }],
    }));

    // Fade backdrop out as sheet slides down — disappears well before sheet is fully gone
    const backdropAnimStyle = useAnimatedStyle(() => ({
        opacity: interpolate(sheetY.value, [0, 300], [1, 0], Extrapolation.CLAMP),
    }));

    return (
        <Modal
            animationType="none"
            transparent
            visible={visible}
            onRequestClose={onClose}
            statusBarTranslucent
        >
            <GestureHandlerRootView style={styles.root}>
                <Animated.View style={[styles.overlay, { backgroundColor: backdropColor }, backdropAnimStyle]}>
                    <ModalBackdrop onPress={onClose} />
                    <GestureDetector gesture={dismissGesture}>
                        <Animated.View
                            style={[
                                styles.sheet,
                                { height, backgroundColor },
                                sheetAnimStyle,
                            ]}
                        >
                            {/* No handle here — each child renders its own if needed */}
                            {children}
                        </Animated.View>
                    </GestureDetector>
                </Animated.View>
            </GestureHandlerRootView>
        </Modal>
    );
}

const styles = StyleSheet.create({
    root: {
        flex: 1,
    },
    overlay: {
        flex: 1,
        justifyContent: 'flex-end',
    },
    sheet: {
        borderTopLeftRadius: 30,
        borderTopRightRadius: 30,
        overflow: 'hidden',
    },
    handle: {
        width: 36,
        height: 4,
        borderRadius: 2,
        backgroundColor: 'rgba(255,255,255,0.25)',
        alignSelf: 'center',
        marginTop: 10,
        marginBottom: 4,
    },
});
