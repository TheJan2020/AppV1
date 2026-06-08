/**
 * SmoothSlider — UI-thread drag via Reanimated + Gesture Handler.
 * Gesture stays on the full track (thumb only via manual activation).
 * Live % uses a tiny isolated child — no parent re-renders during pan.
 */
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    useAnimatedReaction,
    runOnJS,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

const THUMB = 28;
const TRACK = 7;
const THUMB_HIT_PAD = 10;
const SLIDER_H = THUMB + 18;

function clamp(v, lo, hi) {
    'worklet';
    return Math.min(hi, Math.max(lo, v));
}

/** Updates only this leaf Text when the rounded % changes (~≤100 times per drag). */
function LivePercent({ raw, max, style, seed = 0 }) {
    const [label, setLabel] = useState(() => `${Math.round((seed / max) * 100)}%`);

    useAnimatedReaction(
        () => `${Math.round((raw.value / max) * 100)}%`,
        (next, prev) => {
            if (next !== prev) runOnJS(setLabel)(next);
        },
    );

    return <Text style={style}>{label}</Text>;
}

export default function SmoothSlider({
    value,
    max = 255,
    minVal = 0,
    onChange,
    onRelease,
    onDragStart,
    onDragEnd,
    trackBg,
    showFill = false,
    thumbColor = '#3A7BD5',
    fillColor = 'rgba(255,255,255,0.40)',
    thumbBorder = false,
    showBubble = false,
    showPctLabel = false,
    disabled = false,
    thumbSize = THUMB,
    sliderHeight = SLIDER_H,
}) {
    const trackW = useSharedValue(0);
    const raw = useSharedValue(value);
    const startRaw = useSharedValue(value);
    const dragActive = useSharedValue(0);

    const isDraggingRef = useRef(false);
    const onChangeRef = useRef(onChange);
    const onReleaseRef = useRef(onRelease);
    const onDragStartRef = useRef(onDragStart);
    const onDragEndRef = useRef(onDragEnd);
    const disabledRef = useSharedValue(disabled ? 1 : 0);

    onChangeRef.current = onChange;
    onReleaseRef.current = onRelease;
    onDragStartRef.current = onDragStart;
    onDragEndRef.current = onDragEnd;
    disabledRef.value = disabled ? 1 : 0;

    useEffect(() => {
        if (!isDraggingRef.current) {
            raw.value = value;
        }
    }, [value]);

    const beginDrag = () => {
        isDraggingRef.current = true;
        onDragStartRef.current?.();
    };

    const endDrag = () => {
        if (!isDraggingRef.current) return;
        isDraggingRef.current = false;
        onDragEndRef.current?.();
    };

    const fireHaptic = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const finishDrag = (rounded) => {
        onChangeRef.current?.(rounded);
        onReleaseRef.current?.(rounded);
    };

    const pan = Gesture.Pan()
        .enabled(!disabled)
        .manualActivation(true)
        .activeOffsetX([-2, 2])
        .failOffsetY([-14, 14])
        .onTouchesDown((e, state) => {
            'worklet';
            if (disabledRef.value) {
                state.fail();
                return;
            }
            const w = trackW.value;
            if (w <= 0) {
                state.fail();
                return;
            }
            const thumbX = clamp((raw.value / max) * w - thumbSize / 2, 0, w - thumbSize);
            const tx = e.allTouches[0].x;
            if (tx >= thumbX - THUMB_HIT_PAD && tx <= thumbX + thumbSize + THUMB_HIT_PAD) {
                startRaw.value = raw.value;
                state.activate();
            } else {
                state.fail();
            }
        })
        .onBegin(() => {
            'worklet';
            dragActive.value = 1;
            runOnJS(beginDrag)();
            runOnJS(fireHaptic)();
        })
        .onUpdate((e) => {
            'worklet';
            const w = trackW.value;
            if (w <= 0) return;
            raw.value = clamp(
                startRaw.value + (e.translationX / w) * max,
                minVal,
                max,
            );
        })
        .onEnd(() => {
            'worklet';
            dragActive.value = 0;
            const rounded = Math.round(raw.value);
            runOnJS(endDrag)();
            runOnJS(finishDrag)(rounded);
        })
        .onFinalize(() => {
            'worklet';
            dragActive.value = 0;
            runOnJS(endDrag)();
        });

    const thumbTop = (sliderHeight - thumbSize) / 2;
    const trackTop = (sliderHeight - TRACK) / 2;

    const thumbPosStyle = useAnimatedStyle(() => {
        const w = trackW.value;
        const thumbX = w <= 0 ? 0 : clamp((raw.value / max) * w - thumbSize / 2, 0, w - thumbSize);
        return { transform: [{ translateX: thumbX }] };
    });

    const fillStyle = useAnimatedStyle(() => {
        const w = trackW.value;
        return { width: w <= 0 ? 0 : (raw.value / max) * w };
    });

    const bubblePosStyle = useAnimatedStyle(() => {
        const w = trackW.value;
        const thumbX = w <= 0 ? 0 : clamp((raw.value / max) * w - thumbSize / 2, 0, w - thumbSize);
        return {
            transform: [{ translateX: clamp(thumbX + thumbSize / 2 - 18, 0, Math.max(0, w - 36)) }],
            opacity: dragActive.value,
        };
    });

    const bubbleBottom = sliderHeight + 2;

    return (
        <View pointerEvents="box-none">
            {showPctLabel && (
                <LivePercent raw={raw} max={max} seed={value} style={styles.pctLabel} />
            )}
            <GestureDetector gesture={pan}>
                <Animated.View
                    style={[styles.wrap, { height: sliderHeight }]}
                    onLayout={(e) => {
                        trackW.value = e.nativeEvent.layout.width;
                    }}
                >
                    <View style={StyleSheet.absoluteFill} pointerEvents="none">
                        {trackBg}
                        {showFill && (
                            <Animated.View
                                style={[
                                    styles.fill,
                                    { backgroundColor: fillColor, top: trackTop },
                                    fillStyle,
                                ]}
                            />
                        )}
                    </View>

                    {showBubble && (
                        <Animated.View
                            style={[styles.bubble, { bottom: bubbleBottom }, bubblePosStyle]}
                            pointerEvents="none"
                        >
                            <LivePercent raw={raw} max={max} seed={value} style={styles.bubbleText} />
                        </Animated.View>
                    )}

                    <Animated.View
                        pointerEvents="none"
                        style={[
                            {
                                position: 'absolute',
                                top: thumbTop,
                                left: 0,
                                width: thumbSize,
                                height: thumbSize,
                                zIndex: 10,
                            },
                            thumbPosStyle,
                        ]}
                    >
                        <View style={[
                            styles.thumb,
                            {
                                width: thumbSize,
                                height: thumbSize,
                                borderRadius: thumbSize / 2,
                                backgroundColor: thumbColor,
                                borderWidth: thumbBorder && !disabled ? 2.5 : 0,
                                borderColor: thumbBorder && !disabled ? 'rgba(255,255,255,0.9)' : 'transparent',
                            },
                            disabled && styles.thumbDisabled,
                        ]} />
                    </Animated.View>
                </Animated.View>
            </GestureDetector>
        </View>
    );
}

export const SMOOTH_SLIDER_THUMB = THUMB;
export const SMOOTH_SLIDER_TRACK = TRACK;

const styles = StyleSheet.create({
    pctLabel: {
        color: 'rgba(255,255,255,0.45)',
        fontSize: 11,
        fontWeight: '600',
        marginBottom: 4,
    },
    wrap: {
        justifyContent: 'center',
        marginBottom: 6,
        overflow: 'visible',
    },
    fill: {
        position: 'absolute',
        left: 0,
        height: TRACK,
        borderRadius: TRACK / 2,
    },
    bubble: {
        position: 'absolute',
        minWidth: 36,
        backgroundColor: '#3A7BD5',
        borderRadius: 8,
        paddingHorizontal: 7,
        paddingVertical: 3,
        alignItems: 'center',
        zIndex: 30,
    },
    bubbleText: {
        color: '#fff',
        fontSize: 11,
        fontWeight: '700',
        textAlign: 'center',
        minWidth: 28,
    },
    thumb: {
        shadowColor: '#3A7BD5',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.8,
        shadowRadius: 10,
        elevation: 8,
    },
    thumbDisabled: {
        backgroundColor: '#444',
        shadowOpacity: 0,
        elevation: 0,
    },
});
