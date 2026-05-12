/**
 * HomeAccess — Locks, Garage & Shutter section
 *
 * Three distinct pill types sharing the same visual language:
 *
 *   LockPill    — binary drag knob
 *                 locked:   knob LEFT  (purple) → drag RIGHT to unlock
 *                 unlocked: knob RIGHT (orange) → drag LEFT  to lock
 *
 *   GaragePill  — drag when idle, timed progress bar + stop button when in transit
 *                 closed:   knob LEFT  (purple) → drag RIGHT to open
 *                 open:     knob RIGHT (orange) → drag LEFT  to close
 *                 opening/closing: knob hidden, pulsing label, progress bar, amber ✕ stop
 *
 *   ShutterPill — full-width 3-zone tap bar
 *                 [ ↑ Open | ■ Stop | ↓ Close ]
 *                 active zone highlights based on current HA state
 *
 * Layout:
 *   Locks + Garages → half-width pills, 2 per row
 *   Shutters        → full-width pill, one per row (below locks/garages)
 */

import { View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView, Switch, ActivityIndicator } from 'react-native';
import { Edit2, ChevronUp, ChevronDown, Square, X, Check, Lock, DoorOpen, Blinds } from 'lucide-react-native';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withSpring,
    withTiming,
    withRepeat,
    withSequence,
    runOnJS,
    interpolate,
    Extrapolation,
    cancelAnimation,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useState, useEffect, useRef, useCallback } from 'react';
import Svg, { Path } from 'react-native-svg';
import { CF } from '../../utils/typography';

// ── Color tokens ──────────────────────────────────────────────────────────────
const C_PURPLE = '#8947ca';   // locked / closed
const C_ORANGE = '#FF7043';   // unlocked / open
const C_AMBER  = '#FFA000';   // in transit / stop
const C_BG     = '#12132a';
const C_BORDER = '#212136';

// ── Pill dimensions ───────────────────────────────────────────────────────────
const KNOB      = 60;
const PAD       = 4;
const HEIGHT    = 54;
const TRAVEL_MS = 15000;           // ~15s garage travel estimate

// ── SVG Icons ─────────────────────────────────────────────────────────────────
function LockClosedIcon({ size = 22, color = '#fff' }) {
    return (
        <Svg width={size} height={size * (26.49 / 20.6)} viewBox="0 0 20.6 26.49" fill="none">
            <Path
                d="M4.73,10.14v-4.22c0-1.4.58-2.74,1.61-3.73,1.03-.99,2.43-1.54,3.89-1.54s2.86.56,3.89,1.54c1.03.99,1.61,2.33,1.61,3.73v4.22"
                stroke={color} strokeWidth={1.29}
            />
            <Path
                d="M10.3,17.59c.37,0,.73-.15.99-.41.26-.26.41-.62.41-.99s-.15-.73-.41-.99c-.26-.26-.62-.41-.99-.41s-.73.15-.99.41-.41.62-.41.99.15.73.41.99c.26.26.62.41.99.41ZM10.3,17.59v4.2M2.74,10.59h15.12c1.23,0,2.24,1.01,2.24,2.24v9.8c0,1.85-1.51,3.36-3.36,3.36H3.86c-1.85,0-3.36-1.51-3.36-3.36v-9.8c0-1.23,1.01-2.24,2.24-2.24Z"
                stroke={color} strokeWidth={1} strokeLinecap="round" strokeLinejoin="round"
            />
        </Svg>
    );
}

function LockOpenIcon({ size = 22, color = '#fff' }) {
    return (
        <Svg width={size} height={size * (26.21 / 20.6)} viewBox="0 0 20.6 26.21" fill="none">
            <Path
                d="M4.7,10.31v-4.2c0-1.36.5-2.68,1.4-3.71.9-1.02,2.15-1.68,3.5-1.86,1.35-.17,2.72.16,3.85.92,1.13.77,1.94,1.92,2.28,3.24M10.3,17.31c.37,0,.73-.15.99-.41.26-.26.41-.62.41-.99s-.15-.73-.41-.99c-.26-.26-.62-.41-.99-.41s-.73.15-.99.41-.41.62-.41.99.15.73.41.99c.26.26.62.41.99.41ZM10.3,17.31v4.2M2.74,10.31h15.12c1.23,0,2.24,1.01,2.24,2.24v9.8c0,1.85-1.51,3.36-3.36,3.36H3.86c-1.85,0-3.36-1.51-3.36-3.36v-9.8c0-1.23,1.01-2.24,2.24-2.24Z"
                stroke={color} strokeWidth={1} strokeLinecap="round" strokeLinejoin="round"
            />
        </Svg>
    );
}

function GarageClosedIcon({ size = 22, color = '#fff' }) {
    return (
        <Svg width={size} height={size * (24.33 / 22)} viewBox="0 0 22 24.33" fill="none">
            <Path
                d="M8.41,1.78l-4.8,3.26c-1.52,1.04-2.29,1.56-2.7,2.35-.41.79-.41,1.73-.41,3.6v8.08c0,2.24,0,3.37.68,4.06.68.7,1.78.7,3.98.7h11.67c2.2,0,3.3,0,3.98-.7.68-.7.68-1.82.68-4.06v-8.08c0-1.87,0-2.81-.41-3.6-.41-.79-1.18-1.31-2.7-2.35l-4.8-3.26c-1.25-.85-1.88-1.28-2.59-1.28s-1.33.43-2.59,1.28Z"
                stroke={color} strokeWidth={1} strokeLinecap="round" strokeLinejoin="round"
            />
            <Path
                d="M5.17,23.83v-8.17c0-2.2,0-3.3.68-3.98.68-.68,1.78-.68,3.98-.68h2.33c2.2,0,3.3,0,3.98.68.68.68.68,1.78.68,3.98v8.17M5.17,14.5h11.67M5.17,19.17h11.67"
                stroke={color} strokeWidth={1} strokeLinecap="round" strokeLinejoin="round"
            />
            <Path
                d="M11.01,6.33h-.01"
                stroke={color} strokeWidth={1} strokeLinecap="round" strokeLinejoin="round"
            />
        </Svg>
    );
}

function GarageOpenIcon({ size = 22, color = '#fff' }) {
    return (
        <Svg width={size} height={size * (24.33 / 22)} viewBox="0 0 22 24.33" fill="none">
            <Path
                d="M5.17,23.83v-8.17c0-2.2,0-3.3.68-3.98.68-.68,1.78-.68,3.98-.68h2.33c2.2,0,3.3,0,3.98.68.68.68.68,1.78.68,3.98v8.17"
                stroke={color} strokeWidth={1} strokeLinecap="round" strokeLinejoin="round"
            />
            <Path
                d="M8.41,1.78l-4.8,3.26c-1.52,1.04-2.29,1.56-2.7,2.35-.41.79-.41,1.73-.41,3.6v8.08c0,2.24,0,3.37.68,4.06.68.7,1.78.7,3.98.7h11.67c2.2,0,3.3,0,3.98-.7.68-.7.68-1.82.68-4.06v-8.08c0-1.87,0-2.81-.41-3.6-.41-.79-1.18-1.31-2.7-2.35l-4.8-3.26c-1.25-.85-1.88-1.28-2.59-1.28s-1.33.43-2.59,1.28Z"
                stroke={color} strokeWidth={1} strokeLinecap="round" strokeLinejoin="round"
            />
            <Path
                d="M11.01,6.33h-.01"
                stroke={color} strokeWidth={1} strokeLinecap="round" strokeLinejoin="round"
            />
        </Svg>
    );
}

function ShutterIcon({ size = 18 }) {
    return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
            <Path d="M3 5h18M3 9h18M3 13h18M3 17h18" stroke="#fff" strokeWidth={2} strokeLinecap="round" />
        </Svg>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
//  LockPill — binary drag + locking/unlocking transit state
// ─────────────────────────────────────────────────────────────────────────────
export function LockPill({ name, isUnlocked, isLocking, isUnlocking, isPassage, entityState, onToggle, focusKey }) {
    const inTransit  = !!(isLocking || isUnlocking);
    const disabled   = isPassage; // passage mode — lock is held open, cannot be locked
    const [pillW, setPillW] = useState(0);
    const translateX        = useSharedValue(0);
    const maxTravelSV       = useSharedValue(0);
    const pulseOpacity      = useSharedValue(1);

    // Knob is absolutely positioned at left:0.
    // locked   → translateX = 0            (knob at left edge)
    // unlocked → translateX = pillW - KNOB (knob at right edge)
    useEffect(() => {
        if (pillW === 0) return;
        maxTravelSV.value = pillW - KNOB;
        translateX.value  = withSpring(isUnlocked ? pillW - KNOB : 0, { damping: 18 });
    }, [isUnlocked, pillW, focusKey]);

    // Pulse label during transit
    useEffect(() => {
        if (inTransit) {
            pulseOpacity.value = withRepeat(
                withSequence(
                    withTiming(0.35, { duration: 500 }),
                    withTiming(1,    { duration: 500 }),
                ),
                -1,
                false,
            );
        } else {
            cancelAnimation(pulseOpacity);
            pulseOpacity.value = withTiming(1, { duration: 200 });
        }
    }, [inTransit]);

    const onLayout = (e) => setPillW(e.nativeEvent.layout.width);

    const confirm = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        onToggle && onToggle(entityState);
    };

    const pan = Gesture.Pan()
        .enabled(!inTransit && !disabled)
        .activeOffsetX([-8, 8])
        .failOffsetY([-20, 20])
        .onUpdate(e => {
            const max = maxTravelSV.value;
            if (isUnlocked) {
                translateX.value = Math.min(Math.max(max + e.translationX, 0), max);
            } else {
                translateX.value = Math.min(Math.max(e.translationX, 0), max);
            }
        })
        .onEnd(() => {
            const max = maxTravelSV.value;
            const mid = max / 2;
            if (isUnlocked) {
                if (translateX.value < mid) runOnJS(confirm)();
                else translateX.value = withSpring(max);
            } else {
                if (translateX.value > mid) runOnJS(confirm)();
                else translateX.value = withSpring(0);
            }
        });

    const knobStyle = useAnimatedStyle(() => ({
        transform: [{ translateX: translateX.value }],
    }));

    const labelStyle = useAnimatedStyle(() => {
        const max = maxTravelSV.value;
        if (max === 0) return { opacity: 1 };
        const p = isUnlocked
            ? interpolate(translateX.value, [max, max * 0.5], [1, 0], Extrapolation.CLAMP)
            : interpolate(translateX.value, [0, max * 0.5],   [1, 0], Extrapolation.CLAMP);
        return { opacity: p };
    });

    const transitLabelStyle = useAnimatedStyle(() => ({
        opacity: pulseOpacity.value,
    }));

    const transitColor = isLocking ? C_PURPLE : '#FF3B3B';
    const pillBg       = '#13132A';
    const border       = isPassage
        ? C_BORDER
        : inTransit
            ? (isLocking ? 'rgba(137,71,202,0.60)' : 'rgba(255,59,59,0.70)')
            : C_BORDER;
    const Icon         = isUnlocked ? LockOpenIcon : LockClosedIcon;

    const transitLabel = isLocking ? 'Locking…' : 'Unlocking…';

    const labelPad = isUnlocked
        ? { paddingLeft: 14, paddingRight: KNOB + 8 }
        : { paddingLeft: KNOB + 8, paddingRight: 14 };

    return (
        <GestureDetector gesture={pan}>
            <Animated.View style={[styles.pill, { backgroundColor: pillBg }]} onLayout={onLayout}>
                <View style={[styles.pillTrack, { borderColor: border }]} />

                {isPassage ? (
                    /* ── Passage mode — unlocked style, disabled, with badge ── */
                    <>
                        <Animated.View style={[styles.pillLabelWrap, { paddingLeft: 14, paddingRight: KNOB + 8 }]} pointerEvents="none">
                            <Text style={styles.pillLabelName} numberOfLines={1}>{name}</Text>
                            <View style={styles.passageBadge}>
                                <View style={styles.passageDot} />
                                <Text style={styles.passageLabel}>Passage mode</Text>
                            </View>
                        </Animated.View>
                        <Animated.View
                            style={[styles.knob, { transform: [{ translateX: pillW > 0 ? pillW - KNOB : 0 }] }]}
                            pointerEvents="none"
                        >
                            <View style={[StyleSheet.absoluteFill, { borderRadius: KNOB / 2, borderWidth: 2, borderColor: C_PURPLE, backgroundColor: 'transparent' }]} />
                            <LockOpenIcon size={26} color={C_PURPLE} />
                        </Animated.View>
                    </>
                ) : inTransit ? (
                    <Animated.View style={[styles.garageTransitCenter, transitLabelStyle]} pointerEvents="none">
                        <Text style={[styles.pillLabelName, { color: transitColor, fontWeight: '700', letterSpacing: 0.3 }]}>{transitLabel}</Text>
                    </Animated.View>
                ) : (
                    <>
                        <Animated.View style={[styles.pillLabelWrap, labelPad, labelStyle]} pointerEvents="none">
                            <Text style={styles.pillLabelName} numberOfLines={1}>{name}</Text>
                        </Animated.View>
                        <Animated.View style={[styles.knob, knobStyle]} pointerEvents="none">
                            {isUnlocked ? (
                                // Outlined circle for unlocked
                                <View style={[StyleSheet.absoluteFill, { borderRadius: KNOB / 2, borderWidth: 2, borderColor: C_PURPLE, backgroundColor: 'transparent' }]} />
                            ) : (
                                // Filled gradient for locked
                                <LinearGradient
                                    colors={['#602FBE', '#7B2FBE']}
                                    start={{ x: 0, y: 0.5 }}
                                    end={{ x: 1, y: 0.5 }}
                                    style={StyleSheet.absoluteFill}
                                />
                            )}
                            {isUnlocked
                                ? <LockOpenIcon size={26} color={C_PURPLE} />
                                : <LockClosedIcon size={26} color="#fff" />
                            }
                        </Animated.View>
                    </>
                )}
            </Animated.View>
        </GestureDetector>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
//  GaragePill — drag when idle, progress bar + stop when in transit
// ─────────────────────────────────────────────────────────────────────────────
function GaragePill({
    name, isOpen, isOpening, isClosing, onControl, focusKey, travelMs = TRAVEL_MS,
    // Lifted transit state — survives key-based remounts (screen navigation)
    savedTransit,       // { direction: 'opening'|'closing', startedAt: number } | null
    onTransitStart,     // (direction, startedAt) => void
    onTransitEnd,       // () => void
}) {
    const [localTransit, setLocalTransit] = useState(null);
    const timerRef = useRef(null);

    // On mount: restore in-progress transit from parent (survives remount)
    useEffect(() => {
        if (savedTransit) {
            const elapsed   = Date.now() - savedTransit.startedAt;
            const remaining = travelMs - elapsed;
            if (remaining > 500) {
                setLocalTransit(savedTransit.direction);
                clearTimeout(timerRef.current);
                timerRef.current = setTimeout(() => {
                    setLocalTransit(null);
                    onTransitEnd && onTransitEnd();
                }, remaining);
            } else {
                // Transit already done while away — clear it
                onTransitEnd && onTransitEnd();
            }
        }
        return () => clearTimeout(timerRef.current);
    }, []); // intentionally only on mount

    // Keep in sync with HA state (isOpening/isClosing from WebSocket)
    useEffect(() => {
        if (isOpening && localTransit !== 'opening') {
            clearTimeout(timerRef.current);
            const now = Date.now();
            setLocalTransit('opening');
            onTransitStart && onTransitStart('opening', now);
            timerRef.current = setTimeout(() => {
                setLocalTransit(null);
                onTransitEnd && onTransitEnd();
            }, travelMs);
        } else if (isClosing && localTransit !== 'closing') {
            clearTimeout(timerRef.current);
            const now = Date.now();
            setLocalTransit('closing');
            onTransitStart && onTransitStart('closing', now);
            timerRef.current = setTimeout(() => {
                setLocalTransit(null);
                onTransitEnd && onTransitEnd();
            }, travelMs);
        } else if (!isOpening && !isClosing && localTransit && !savedTransit) {
            // HA confirmed done and no saved transit pending restore
            clearTimeout(timerRef.current);
            setLocalTransit(null);
            onTransitEnd && onTransitEnd();
        }
    }, [isOpening, isClosing]);

    const inTransit = !!(localTransit || isOpening || isClosing);
    const goingUp   = localTransit === 'opening' || isOpening;

    const [pillW, setPillW] = useState(0);
    const translateX        = useSharedValue(0);
    const maxTravelSV       = useSharedValue(0);
    const progress          = useSharedValue(0);
    const arrowY            = useSharedValue(0);

    useEffect(() => {
        if (pillW === 0) return;
        maxTravelSV.value = pillW - KNOB;
    }, [pillW]);

    // Snap knob when idle. locked=left(0), open=right(pillW-KNOB)
    useEffect(() => {
        if (pillW === 0 || inTransit) return;
        translateX.value = withSpring(isOpen ? pillW - KNOB : 0, { damping: 18 });
    }, [isOpen, inTransit, pillW, focusKey]);

    useEffect(() => {
        if (inTransit) {
            progress.value = 0;
            progress.value = withTiming(1, { duration: travelMs });

            const dist = goingUp ? -10 : 10;
            arrowY.value = 0;
            arrowY.value = withRepeat(
                withSequence(
                    withTiming(dist, { duration: 350 }),
                    withTiming(0,    { duration: 350 }),
                ),
                -1,
                false,
            );
        } else {
            cancelAnimation(progress);
            cancelAnimation(arrowY);
            progress.value = withTiming(0, { duration: 400 });
            arrowY.value   = withTiming(0, { duration: 150 });
        }
    }, [inTransit, goingUp]);

    const onLayout = (e) => setPillW(e.nativeEvent.layout.width);

    const startTransit = (direction) => {
        clearTimeout(timerRef.current);
        const now = Date.now();
        setLocalTransit(direction);
        onTransitStart && onTransitStart(direction, now);
        onControl(direction === 'opening' ? 'open_cover' : 'close_cover');
        // Fallback: clear local transit after travelMs + 2s if HA goes silent
        timerRef.current = setTimeout(() => {
            setLocalTransit(null);
            onTransitEnd && onTransitEnd();
        }, travelMs + 2000);
    };

    const pan = Gesture.Pan()
        .enabled(!inTransit)
        .activeOffsetX([-8, 8])
        .failOffsetY([-20, 20])
        .onUpdate(e => {
            const max = maxTravelSV.value;
            if (isOpen) {
                translateX.value = Math.min(Math.max(max + e.translationX, 0), max);
            } else {
                translateX.value = Math.min(Math.max(e.translationX, 0), max);
            }
        })
        .onEnd(() => {
            const max = maxTravelSV.value;
            const mid = max / 2;
            if (isOpen) {
                if (translateX.value < mid) runOnJS(startTransit)('closing');
                else translateX.value = withSpring(max);
            } else {
                if (translateX.value > mid) runOnJS(startTransit)('opening');
                else translateX.value = withSpring(0);
            }
        });

    const knobAnimStyle = useAnimatedStyle(() => ({
        transform: [{ translateX: translateX.value }],
    }));

    const idleLabelStyle = useAnimatedStyle(() => {
        const max = maxTravelSV.value;
        if (max === 0) return { opacity: 1 };
        const p = isOpen
            ? interpolate(translateX.value, [max, max * 0.5], [1, 0], Extrapolation.CLAMP)
            : interpolate(translateX.value, [0, max * 0.5],   [1, 0], Extrapolation.CLAMP);
        return { opacity: p };
    });

    const arrowAnimStyle = useAnimatedStyle(() => ({
        transform: [{ translateY: arrowY.value }],
    }));

    const progressBarStyle = useAnimatedStyle(() => ({
        width: progress.value * Math.max(pillW - PAD * 2, 0),
    }));

    const transitColor = goingUp ? '#FF3B3B' : C_PURPLE;
    const pillBg = '#13132A';
    const border = inTransit
        ? (goingUp ? 'rgba(255,59,59,0.70)' : 'rgba(137,71,202,0.60)')
        : C_BORDER;

    const idlePad = isOpen
        ? { paddingLeft: 14, paddingRight: KNOB + 8 }
        : { paddingLeft: KNOB + 8, paddingRight: 14 };

    return (
        <GestureDetector gesture={pan}>
            <Animated.View style={[styles.pill, { backgroundColor: pillBg }]} onLayout={onLayout}>
                <View style={[styles.pillTrack, { borderColor: border }]} />

                {inTransit ? (
                    <View style={styles.garageTransitCenter} pointerEvents="none">
                        <Animated.View style={arrowAnimStyle}>
                            {goingUp
                                ? <ChevronUp   size={30} color={transitColor} strokeWidth={2.5} />
                                : <ChevronDown size={30} color={transitColor} strokeWidth={2.5} />
                            }
                        </Animated.View>
                    </View>
                ) : (
                    <>
                        <Animated.View style={[styles.pillLabelWrap, idlePad, idleLabelStyle]} pointerEvents="none">
                            <Text style={styles.pillLabelName} numberOfLines={1}>{name}</Text>
                        </Animated.View>
                        <Animated.View style={[styles.knob, knobAnimStyle]} pointerEvents="none">
                            {isOpen ? (
                                // Outlined circle for open
                                <View style={[StyleSheet.absoluteFill, { borderRadius: KNOB / 2, borderWidth: 2, borderColor: C_PURPLE, backgroundColor: 'transparent' }]} />
                            ) : (
                                // Filled gradient for closed
                                <LinearGradient
                                    colors={['#602FBE', '#7B2FBE']}
                                    start={{ x: 0, y: 0.5 }}
                                    end={{ x: 1, y: 0.5 }}
                                    style={StyleSheet.absoluteFill}
                                />
                            )}
                            {isOpen
                                ? <GarageOpenIcon size={28} color={C_PURPLE} />
                                : <GarageClosedIcon size={28} color="#fff" />
                            }
                        </Animated.View>
                    </>
                )}

                {inTransit && (
                    <View style={styles.progressTrack} pointerEvents="none">
                        <Animated.View style={[styles.progressBar, { backgroundColor: transitColor }, progressBarStyle]} />
                    </View>
                )}
            </Animated.View>
        </GestureDetector>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
//  ShutterPill — same pill shell as Lock/Garage, 3 knob-style tap buttons
// ─────────────────────────────────────────────────────────────────────────────
function ShutterPill({ name, isOpen, isOpening, isClosing, onControl }) {
    const inMotion = isOpening || isClosing;

    const handlePress = (action) => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        onControl(action);
    };

    const pillBg = inMotion ? 'rgba(255,160,0,0.05)' : C_BG;
    const border = inMotion ? 'rgba(255,160,0,0.35)' : C_BORDER;

    const openActive  = isOpening || (isOpen && !inMotion);
    const closeActive = isClosing || (!isOpen && !inMotion);
    const stopActive  = inMotion;

    const openColor  = isOpening  ? C_ORANGE : openActive  ? `${C_ORANGE}aa` : 'rgba(255,255,255,0.45)';
    const stopColor  = stopActive ? C_AMBER  : 'rgba(255,255,255,0.45)';
    const closeColor = isClosing  ? C_PURPLE : closeActive ? `${C_PURPLE}aa` : 'rgba(255,255,255,0.45)';

    const openKnobBg  = isOpening  ? `${C_ORANGE}33` : openActive  ? `${C_ORANGE}1A` : 'rgba(255,255,255,0.06)';
    const stopKnobBg  = stopActive ? `${C_AMBER}33`  : 'rgba(255,255,255,0.06)';
    const closeKnobBg = isClosing  ? `${C_PURPLE}33` : closeActive ? `${C_PURPLE}1A` : 'rgba(255,255,255,0.06)';

    const KNOB_BTN = HEIGHT - PAD * 2;

    return (
        <View style={[styles.pill, styles.shutterPill, { backgroundColor: pillBg }]}>
            <View style={[styles.pillTrack, { borderColor: border }]} />

            <Text style={styles.shutterName} numberOfLines={1}>{name}</Text>

            <View style={styles.shutterBtns}>
                <TouchableOpacity
                    style={[styles.shutterKnob, { width: KNOB_BTN, height: KNOB_BTN, borderRadius: KNOB_BTN / 2, backgroundColor: openKnobBg }]}
                    onPress={() => handlePress('open_cover')}
                    activeOpacity={0.65}
                >
                    <ChevronUp size={18} color={openColor} strokeWidth={2.5} />
                </TouchableOpacity>

                <TouchableOpacity
                    style={[styles.shutterKnob, { width: KNOB_BTN, height: KNOB_BTN, borderRadius: KNOB_BTN / 2, backgroundColor: stopKnobBg }]}
                    onPress={() => handlePress('stop_cover')}
                    activeOpacity={0.65}
                >
                    <Square size={14} color={stopColor} strokeWidth={2.5} fill={stopActive ? C_AMBER : 'transparent'} />
                </TouchableOpacity>

                <TouchableOpacity
                    style={[styles.shutterKnob, { width: KNOB_BTN, height: KNOB_BTN, borderRadius: KNOB_BTN / 2, backgroundColor: closeKnobBg }]}
                    onPress={() => handlePress('close_cover')}
                    activeOpacity={0.65}
                >
                    <ChevronDown size={18} color={closeColor} strokeWidth={2.5} />
                </TouchableOpacity>
            </View>
        </View>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
//  EditModal sub-components — defined OUTSIDE modal to keep stable references
//  (defining them inside would recreate them on every state change → lag)
// ─────────────────────────────────────────────────────────────────────────────
function SectionHeader({ label, icon: Icon, color }) {
    return (
        <View style={mStyles.sectionHeader}>
            <Icon size={14} color={color} strokeWidth={2} />
            <Text style={[mStyles.sectionTitle, { color }]}>{label}</Text>
        </View>
    );
}

function EntityRow({ name, entity_id, isSelected, onToggle }) {
    return (
        <TouchableOpacity
            style={[mStyles.row, isSelected && mStyles.rowSelected]}
            onPress={() => onToggle(entity_id)}
            activeOpacity={0.7}
        >
            <Text style={mStyles.rowName} numberOfLines={1}>{name}</Text>
            <View style={[mStyles.checkCircle, isSelected && mStyles.checkCircleOn]}>
                {isSelected && <Check size={12} color="#fff" strokeWidth={3} />}
            </View>
        </TouchableOpacity>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
//  EditModal — pick which locks, garages, and shutters appear on Home
//
//  Data flow:
//   • Locks   — passed in as allLockEntities (already in HA state from dashboard)
//   • Covers  — fetched fresh from /api/covers on open, filtered to
//               coverType === 'shutter' | 'garage'  (type assigned in admin Covers page)
//   • Names   — covers: friendly_name from haEntities prop (HA live state)
//   • Saved selection — fetched fresh from /api/home-access on open
// ─────────────────────────────────────────────────────────────────────────────
function EditModal({
    visible,
    onClose,
    adminUrl,
    haToken,
    allLockEntities = [],   // { entity_id, attributes: { friendly_name } }[] from HA
    haEntities = [],        // full HA entity list for cover name lookup
    onSaved,
}) {
    const [localLocks,  setLocalLocks]  = useState([]);  // string[]
    const [localCovers, setLocalCovers] = useState([]);  // string[]
    const [garages,     setGarages]     = useState([]);
    const [loading,     setLoading]     = useState(false);
    /** POSTs from toggleLock/toggleCover — must settle before parent refresh or GET races the server */
    const pendingWritesRef = useRef([]);
    const dismissingRef = useRef(false);

    // Drag-to-dismiss + slide-in animation
    const sheetY = useSharedValue(700);

    // Slide in when visible
    useEffect(() => {
        if (visible) {
            sheetY.value = 700;
            sheetY.value = withTiming(0, { duration: 300 });
        }
    }, [visible]);

    const flushPendingWritesAndClose = useCallback(async () => {
        if (dismissingRef.current) return;
        dismissingRef.current = true;
        try {
            const pending = pendingWritesRef.current.splice(0);
            await Promise.all(pending.map(p => p.catch(() => {})));
            onSaved?.();
            onClose();
        } finally {
            dismissingRef.current = false;
        }
    }, [onSaved, onClose]);

    const dismissGesture = Gesture.Pan()
        .activeOffsetY(5)
        .onUpdate(e => {
            if (e.translationY > 0) sheetY.value = e.translationY;
        })
        .onEnd(e => {
            if (e.translationY > 100 || e.velocityY > 600) {
                sheetY.value = withTiming(700, { duration: 250 }, (finished) => {
                    if (finished) runOnJS(flushPendingWritesAndClose)();
                });
            } else {
                sheetY.value = withSpring(0, { damping: 20 });
            }
        });
    const sheetAnimStyle = useAnimatedStyle(() => ({
        transform: [{ translateY: sheetY.value }],
    }));

    const base        = adminUrl ? (adminUrl.endsWith('/') ? adminUrl : `${adminUrl}/`) : '';
    const authHeaders = { 'Authorization': `Bearer ${haToken}`, 'Content-Type': 'application/json' };

    // Friendly name helper — use HA state first, fall back to entity_id
    const getName = (entity_id) => {
        const e = haEntities.find(x => x.entity_id === entity_id);
        return e?.attributes?.friendly_name || entity_id;
    };

    // Fetch covers from backend + current selection when modal opens
    useEffect(() => {
        if (!visible || !base) return;
        pendingWritesRef.current = [];
        setLoading(true);

        Promise.all([
            // All covers with their assigned type from the DB
            fetch(`${base}api/covers`, { headers: authHeaders })
                .then(r => { if (!r.ok) throw new Error('covers'); return r.json(); }),
            // Current saved selection (locks + covers)
            fetch(`${base}api/home-access`, { headers: authHeaders })
                .then(r => { if (!r.ok) throw new Error('home-access'); return r.json(); }),
        ])
            .then(([coversData, haData]) => {
                // Build garage list from DB (coverType set in admin Covers page)
                const all = coversData.success ? coversData.covers : [];
                setGarages(all.filter(c => c.coverType === 'garage'));

                // Seed lock selection
                const savedLocks = haData.success ? haData.locks : null;
                if (savedLocks === null) {
                    setLocalLocks(allLockEntities.map(l => l.entity_id));
                } else {
                    setLocalLocks(savedLocks);
                }

                // Seed cover selection (garage only)
                const savedCovers = haData.success ? haData.covers : null;
                const allCoverIds = all
                    .filter(c => c.coverType === 'garage')
                    .map(c => c.entity_id);
                if (savedCovers === null) {
                    setLocalCovers(allCoverIds);
                } else {
                    setLocalCovers(savedCovers);
                }
            })
            .catch(e => console.error('[HomeAccess EditModal] fetch error:', e))
            .finally(() => setLoading(false));
    }, [visible]);

    const toggleLock = (entity_id) => {
        const isOn = localLocks.includes(entity_id);
        const action = isOn ? 'remove' : 'add';
        setLocalLocks(prev => isOn ? prev.filter(id => id !== entity_id) : [...prev, entity_id]);
        const p = fetch(`${base}api/home-access`, {
            method: 'POST', headers: authHeaders,
            body: JSON.stringify({ type: 'lock', entity_id, action }),
        }).then(res => {
            if (!res.ok) console.warn('[HomeAccess] toggleLock HTTP', res.status);
        }).catch(e => console.error('[HomeAccess] toggleLock:', e));
        pendingWritesRef.current.push(p);
    };

    const toggleCover = (entity_id) => {
        const isOn = localCovers.includes(entity_id);
        const action = isOn ? 'remove' : 'add';
        setLocalCovers(prev => isOn ? prev.filter(id => id !== entity_id) : [...prev, entity_id]);
        const p = fetch(`${base}api/home-access`, {
            method: 'POST', headers: authHeaders,
            body: JSON.stringify({ type: 'cover', entity_id, action }),
        }).then(res => {
            if (!res.ok) console.warn('[HomeAccess] toggleCover HTTP', res.status);
        }).catch(e => console.error('[HomeAccess] toggleCover:', e));
        pendingWritesRef.current.push(p);
    };

    const isEmpty = allLockEntities.length === 0 && garages.length === 0;

    return (
        <Modal
            visible={visible}
            transparent
            animationType="none"
            onRequestClose={() => { void flushPendingWritesAndClose(); }}
        >
            <View style={mStyles.overlay}>
                <Animated.View style={[mStyles.sheet, sheetAnimStyle]}>
                    {/* Handle — drag down to dismiss */}
                    <GestureDetector gesture={dismissGesture}>
                        <View style={mStyles.handleTouchArea}>
                            <View style={mStyles.handle} />
                        </View>
                    </GestureDetector>

                    {/* Header */}
                    <View style={mStyles.header}>
                        <Text style={mStyles.title}>Home Access</Text>
                        <TouchableOpacity onPress={() => { void flushPendingWritesAndClose(); }} style={mStyles.closeBtn}>
                            <X size={18} color="rgba(255,255,255,0.5)" />
                        </TouchableOpacity>
                    </View>
                    <Text style={mStyles.subtitle}>Choose which devices appear on your home screen.</Text>

                    {loading ? (
                        <View style={mStyles.loadingWrap}>
                            <ActivityIndicator color={C_PURPLE} />
                            <Text style={mStyles.loadingText}>Loading…</Text>
                        </View>
                    ) : (
                        <ScrollView style={mStyles.scroll} showsVerticalScrollIndicator={false}>
                            {/* ── Locks ── */}
                            {allLockEntities.length > 0 && (
                                <View style={mStyles.section}>
                                    <SectionHeader label="LOCKS" icon={Lock} color={C_PURPLE} />
                                    {allLockEntities.map(lock => (
                                        <EntityRow
                                            key={lock.entity_id}
                                            entity_id={lock.entity_id}
                                            name={lock.attributes?.friendly_name || lock.entity_id}
                                            isSelected={localLocks.includes(lock.entity_id)}
                                            onToggle={toggleLock}
                                        />
                                    ))}
                                </View>
                            )}

                            {/* ── Garage ── */}
                            {garages.length > 0 && (
                                <View style={mStyles.section}>
                                    <SectionHeader label="GARAGE" icon={DoorOpen} color={C_ORANGE} />
                                    {garages.map(cover => (
                                        <EntityRow
                                            key={cover.entity_id}
                                            entity_id={cover.entity_id}
                                            name={getName(cover.entity_id)}
                                            isSelected={localCovers.includes(cover.entity_id)}
                                            onToggle={toggleCover}
                                        />
                                    ))}
                                </View>
                            )}

                            {isEmpty && (
                                <Text style={mStyles.emptyText}>
                                    No locks found.{'\n'}Go to the admin Covers page and assign a type (Garage / Shutter) to your covers so they appear here.
                                </Text>
                            )}

                            <View style={{ height: 32 }} />
                        </ScrollView>
                    )}

                    {/* Done button */}
                    <TouchableOpacity style={mStyles.doneBtn} onPress={() => { void flushPendingWritesAndClose(); }} activeOpacity={0.8}>
                        <LinearGradient
                            colors={['#602FBE', '#8947ca']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                            style={StyleSheet.absoluteFill}
                        />
                        <Text style={mStyles.doneBtnText}>Save</Text>
                    </TouchableOpacity>
                </Animated.View>
            </View>
        </Modal>
    );
}

// Modal styles
const mStyles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.65)',
        justifyContent: 'flex-end',
    },
    sheet: {
        backgroundColor: '#0f1028',
        borderTopLeftRadius: 28,
        borderTopRightRadius: 28,
        borderTopWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
        paddingBottom: 32,
        maxHeight: '85%',
    },
    handle: {
        width: 36,
        height: 4,
        borderRadius: 2,
        backgroundColor: 'rgba(255,255,255,0.15)',
        alignSelf: 'center',
        marginTop: 12,
        marginBottom: 4,
    },
    handleTouchArea: {
        alignSelf: 'stretch',
        alignItems: 'center',
        paddingVertical: 10,
        marginTop: 2,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingVertical: 14,
    },
    title: {
        color: '#fff',
        fontSize: 18,
        fontFamily: CF.bold,
        letterSpacing: 0.2,
    },
    subtitle: {
        color: 'rgba(255,255,255,0.35)',
        fontSize: 13,
        fontFamily: CF.regular,
        paddingHorizontal: 20,
        marginBottom: 16,
    },
    closeBtn: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: 'rgba(255,255,255,0.07)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    scroll: {
        paddingHorizontal: 16,
    },
    section: {
        marginBottom: 20,
    },
    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginBottom: 10,
        paddingHorizontal: 4,
    },
    sectionTitle: {
        fontSize: 11,
        fontFamily: CF.semibold,
        letterSpacing: 1.2,
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.03)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
        borderRadius: 14,
        paddingHorizontal: 16,
        paddingVertical: 14,
        marginBottom: 8,
    },
    rowSelected: {
        backgroundColor: 'rgba(137,71,202,0.08)',
        borderColor: 'rgba(137,71,202,0.35)',
    },
    rowName: {
        flex: 1,
        color: '#ededf5',
        fontSize: 14,
        fontFamily: CF.medium,
        letterSpacing: 0.1,
    },
    checkCircle: {
        width: 24,
        height: 24,
        borderRadius: 12,
        borderWidth: 1.5,
        borderColor: 'rgba(255,255,255,0.2)',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'transparent',
    },
    checkCircleOn: {
        backgroundColor: C_PURPLE,
        borderColor: C_PURPLE,
    },
    emptyText: {
        color: 'rgba(255,255,255,0.3)',
        fontSize: 13,
        fontFamily: CF.regular,
        textAlign: 'center',
        marginTop: 32,
        lineHeight: 20,
        paddingHorizontal: 8,
    },
    loadingWrap: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 40,
        gap: 12,
    },
    loadingText: {
        color: 'rgba(255,255,255,0.35)',
        fontSize: 13,
        fontFamily: CF.regular,
    },
    doneBtn: {
        marginHorizontal: 16,
        marginTop: 12,
        height: 50,
        borderRadius: 25,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
    },
    doneBtnText: {
        color: '#fff',
        fontSize: 16,
        fontFamily: CF.semibold,
        letterSpacing: 0.3,
    },
});

// ─────────────────────────────────────────────────────────────────────────────
//  HomeAccess — main export
// ─────────────────────────────────────────────────────────────────────────────
export default function HomeAccess({
    locks = [],
    covers = [],
    onToggleLock,
    onControlCover,
    isHomeActive = true,
    adminUrl,
    haToken,
    allLockEntities = [],
    haEntities = [],
    lockPassageConfigs = {},
    onConfigSaved,
}) {
    const garages  = covers.filter(c => c.coverType === 'garage');

    const halfItems = [
        ...locks.map(l => ({ kind: 'lock',   data: l })),
        ...garages.map(g => ({ kind: 'garage', data: g })),
    ];

    const [editVisible, setEditVisible] = useState(false);

    // Lifted garage transit state — keyed by entity_id so it survives GaragePill
    // remounts caused by visibleKey changes (screen navigation).
    // Shape: { [entity_id]: { direction: 'opening'|'closing', startedAt: number } }
    const [garageTransits, setGarageTransits] = useState({});

    const handleTransitStart = (entity_id, direction, startedAt) => {
        setGarageTransits(prev => ({ ...prev, [entity_id]: { direction, startedAt } }));
    };
    const handleTransitEnd = (entity_id) => {
        setGarageTransits(prev => {
            const next = { ...prev };
            delete next[entity_id];
            return next;
        });
    };

    // Each time the home tab becomes visible, increment visibleKey.
    // This is passed into the pill `key` props to force a full native remount,
    // re-attaching RNGH gesture handlers to fresh native views.
    // (display:none destroys native views; when tab re-shows, old gesture
    //  handlers point to dead view handles → gestures break.)
    const [visibleKey, setVisibleKey] = useState(0);
    const prevActiveRef = useRef(isHomeActive);
    useEffect(() => {
        if (isHomeActive && !prevActiveRef.current) {
            setVisibleKey(k => k + 1);
        }
        prevActiveRef.current = isHomeActive;
    }, [isHomeActive]);

    if (halfItems.length === 0) return null;

    return (
        <View style={styles.container}>
            {/* Edit Modal */}
            <EditModal
                visible={editVisible}
                onClose={() => setEditVisible(false)}
                adminUrl={adminUrl}
                haToken={haToken}
                allLockEntities={allLockEntities}
                haEntities={haEntities}
                onSaved={onConfigSaved}
            />

            {/* Section header */}
            <View style={styles.header}>
                <Text style={styles.title}>HOME ACCESS</Text>
                <TouchableOpacity style={styles.editBtn} onPress={() => setEditVisible(true)} activeOpacity={0.7}>
                    <Edit2 size={12} color="#9199BA" />
                    <Text style={styles.editText}>Edit</Text>
                </TouchableOpacity>
            </View>

            <View style={styles.list}>
                {/* Lock + Garage 2-column grid */}
                <View style={styles.grid}>
                    {halfItems.map(item => (
                        <View key={item.data.entity_id} style={styles.gridCell}>
                            {item.kind === 'lock' ? (
                                <LockPill
                                    key={`lock-${item.data.entity_id}-${visibleKey}`}
                                    focusKey={visibleKey}
                                    name={item.data.attributes?.friendly_name || 'Door'}
                                    isUnlocked={
                                        item.data.state === 'unlocked' ||
                                        item.data.state === 'open'
                                    }
                                    isLocking={item.data.state === 'locking'}
                                    isUnlocking={item.data.state === 'unlocking'}
                                    isPassage={(() => {
                                        const pc = lockPassageConfigs[item.data.entity_id];
                                        if (pc?.enabled) {
                                            if (pc?.passage_entity_id) {
                                                // Check the LIVE HA state of the passage entity
                                                const passageEntity = haEntities.find(
                                                    e => e.entity_id === pc.passage_entity_id
                                                );
                                                return (
                                                    passageEntity?.state === 'on' ||
                                                    passageEntity?.state === 'true'
                                                );
                                            }
                                            // passage mode is configured but no entity linked yet — not active
                                            return false;
                                        }
                                        // Fallback: check HA attributes directly on the lock
                                        return (
                                            item.data.attributes?.lock_status === 'passage_mode' ||
                                            item.data.attributes?.passage_mode === true
                                        );
                                    })()}
                                    entityState={item.data.state}
                                    onToggle={(currentState) =>
                                        onToggleLock &&
                                        onToggleLock(item.data.entity_id, currentState)
                                    }
                                />
                            ) : (
                                <GaragePill
                                    key={`garage-${item.data.entity_id}-${visibleKey}`}
                                    focusKey={visibleKey}
                                    name={item.data.name || 'Garage'}
                                    isOpen={item.data.isOpen}
                                    isOpening={item.data.isOpening}
                                    isClosing={item.data.isClosing}
                                    travelMs={item.data.garageDurationMs || TRAVEL_MS}
                                    savedTransit={garageTransits[item.data.entity_id] || null}
                                    onTransitStart={(direction, startedAt) =>
                                        handleTransitStart(item.data.entity_id, direction, startedAt)
                                    }
                                    onTransitEnd={() => handleTransitEnd(item.data.entity_id)}
                                    onControl={(action) =>
                                        onControlCover &&
                                        onControlCover(item.data.entity_id, action)
                                    }
                                />
                            )}
                        </View>
                    ))}
                </View>
            </View>
        </View>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Styles
// ─────────────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
    container: { marginBottom: 20 },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 12,
        marginHorizontal: 2,
    },
    title: {
        color: '#9199BA',
        fontSize: 12,
        fontFamily: CF.semibold,
        letterSpacing: 1.4,
    },
    editBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    editText: {
        color: '#9199BA',
        fontSize: 12,
        fontFamily: CF.semibold,
        letterSpacing: 1.4,
    },
    list:     { gap: 16 },
    halfRow:  { flexDirection: 'row', gap: 16 },
    halfCell: { flex: 1 },
    grid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        rowGap: 20,
        columnGap: 12,
    },
    gridCell: {
        width: '47%',
    },

    // ── Shared pill shell ─────────────────────────────────────────────────────
    pill: {
        height: HEIGHT,
        borderRadius: HEIGHT / 2,
        padding: PAD,
        justifyContent: 'center',
        overflow: 'visible',
        position: 'relative',
    },
    pillTrack: {
        ...StyleSheet.absoluteFillObject,
        borderRadius: HEIGHT / 2,
        borderWidth: 1,
    },
    pillLabelWrap: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'center',
    },
    pillLabelWrapTransit: {},
    transitRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    garageTransitCenter: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'center',
        alignItems: 'center',
    },
    pillLabel: {
        color: '#ededf5',
        fontSize: 13,
        fontFamily: CF.bold,
        letterSpacing: 0.1,
    },
    pillLabelName: {
        color: '#ededf5',
        fontSize: 13,
        fontFamily: CF.semibold,
        letterSpacing: 0.1,
    },
    knob: {
        position: 'absolute',
        top: (HEIGHT - KNOB) / 2,  // centres vertically, slight overflow is fine
        left: 0,                    // translateX animates from here
        width: KNOB,
        height: KNOB,
        borderRadius: KNOB / 2,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.35,
        shadowRadius: 5,
        elevation: 6,
        zIndex: 10,
    },
    successOverlay: {
        ...StyleSheet.absoluteFillObject,
        borderRadius: HEIGHT / 2,
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 20,
    },
    passageBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 3,
        gap: 4,
    },
    passageDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: C_PURPLE,
    },
    passageLabel: {
        color: C_PURPLE,
        fontSize: 10,
        fontFamily: CF.semibold,
        letterSpacing: 0.3,
        opacity: 0.9,
    },

    // ── Garage transit UI ────────────────────────────────────────────────────
    stopBtn: {
        position: 'absolute',
        right: PAD,
        top: (HEIGHT - KNOB) / 2,
        width: KNOB,
        height: KNOB,
        borderRadius: KNOB / 2,
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 15,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 4,
        elevation: 5,
    },
    progressTrack: {
        position: 'absolute',
        bottom: 0,
        left: PAD,
        right: PAD,
        height: 3,
        borderRadius: 1.5,
        backgroundColor: 'rgba(255,255,255,0.06)',
        overflow: 'hidden',
    },
    progressBar: {
        height: 3,
        borderRadius: 1.5,
    },

    // ── ShutterPill ──────────────────────────────────────────────────────────
    shutterPill: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingLeft: PAD + 12,
        paddingRight: PAD,
        gap: 8,
    },
    shutterName: {
        flex: 1,
        color: '#ededf5',
        fontSize: 13,
        fontFamily: CF.semibold,
        letterSpacing: 0.1,
    },
    shutterBtns: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    shutterKnob: {
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 4,
        elevation: 4,
    },
});