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
import { useState, useEffect, useRef } from 'react';
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
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
            <Path
                d="M17 11H7a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2z"
                stroke={color} strokeWidth={1.8} fill="none"
            />
            <Path
                d="M12 15v2"
                stroke={color} strokeWidth={2} strokeLinecap="round"
            />
            <Path
                d="M8 11V7a4 4 0 018 0v4"
                stroke={color} strokeWidth={1.8} strokeLinecap="round" fill="none"
            />
        </Svg>
    );
}

function LockOpenIcon({ size = 22, color = '#fff' }) {
    return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
            <Path
                d="M17 11H7a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2z"
                stroke={color} strokeWidth={1.8} fill="none"
            />
            <Path
                d="M12 15v2"
                stroke={color} strokeWidth={2} strokeLinecap="round"
            />
            <Path
                d="M8 11V7a4 4 0 017.9-1.1"
                stroke={color} strokeWidth={1.8} strokeLinecap="round" fill="none"
            />
        </Svg>
    );
}

function GarageIcon({ size = 22 }) {
    return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
            <Path d="M3 10.5L12 4l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V10.5z" fill="#fff" opacity={0.9} />
            <Path d="M9 21v-5h6v5" fill="rgba(0,0,0,0.25)" />
            <Path d="M7.5 13h9M7.5 16h9" stroke="rgba(0,0,0,0.3)" strokeWidth={1.5} strokeLinecap="round" />
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
function LockPill({ name, isUnlocked, isLocking, isUnlocking, entityState, onToggle, focusKey }) {
    const inTransit  = !!(isLocking || isUnlocking);
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
        .enabled(!inTransit)
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

    const transitColor = isLocking ? '#B085FF' : C_ORANGE;
    const pillBg       = inTransit
        ? (isLocking ? 'rgba(137,71,202,0.12)' : 'rgba(255,112,67,0.07)')
        : (isUnlocked ? 'rgba(255,112,67,0.07)' : C_BG);
    const border       = inTransit
        ? (isLocking ? 'rgba(137,71,202,0.6)' : 'rgba(255,112,67,0.5)')
        : (isUnlocked ? 'rgba(255,112,67,0.4)' : C_BORDER);
    const Icon         = isUnlocked ? LockOpenIcon : LockClosedIcon;

    const transitLabel = isLocking ? 'Locking…' : 'Unlocking…';

    const labelPad = isUnlocked
        ? { paddingLeft: 14, paddingRight: KNOB + 8 }
        : { paddingLeft: KNOB + 8, paddingRight: 14 };

    return (
        <GestureDetector gesture={pan}>
            <Animated.View style={[styles.pill, { backgroundColor: pillBg }]} onLayout={onLayout}>
                <View style={[styles.pillTrack, { borderColor: border }]} />

                {inTransit ? (
                    <Animated.View style={[styles.garageTransitCenter, transitLabelStyle]} pointerEvents="none">
                        <Text style={[styles.pillLabelName, { color: transitColor, fontWeight: '700', letterSpacing: 0.3 }]}>{transitLabel}</Text>
                    </Animated.View>
                ) : (
                    <>
                        <Animated.View style={[styles.pillLabelWrap, labelPad, labelStyle]} pointerEvents="none">
                            <Text style={styles.pillLabelName} numberOfLines={1}>{name}</Text>
                        </Animated.View>
                        <Animated.View style={[styles.knob, knobStyle]} pointerEvents="none">
                            <LinearGradient
                                colors={isUnlocked ? [C_ORANGE, C_ORANGE] : ['#602FBE', '#7B2FBE']}
                                start={{ x: 0, y: 0.5 }}
                                end={{ x: 1, y: 0.5 }}
                                style={StyleSheet.absoluteFill}
                            />
                            <Icon size={32} color="#fff" />
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
function GaragePill({ name, isOpen, isOpening, isClosing, onControl, focusKey }) {
    const [localTransit, setLocalTransit] = useState(null);
    const timerRef = useRef(null);

    const inTransit   = !!(localTransit || isOpening || isClosing);
    const goingUp     = localTransit === 'opening' || isOpening;

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
            progress.value = withTiming(1, { duration: TRAVEL_MS });

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
        setLocalTransit(direction);
        onControl(direction === 'opening' ? 'open_cover' : 'close_cover');
        timerRef.current = setTimeout(() => setLocalTransit(null), TRAVEL_MS);
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

    const transitColor = goingUp ? C_ORANGE : C_PURPLE;
    const pillBg = inTransit
        ? (goingUp ? 'rgba(255,112,67,0.07)' : 'rgba(137,71,202,0.07)')
        : (isOpen  ? 'rgba(255,112,67,0.07)' : C_BG);
    const border = inTransit
        ? (goingUp ? 'rgba(255,112,67,0.4)' : 'rgba(137,71,202,0.4)')
        : (isOpen  ? 'rgba(255,112,67,0.4)' : C_BORDER);

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
                            <LinearGradient
                                colors={isOpen ? [C_ORANGE, C_ORANGE] : ['#602FBE', '#7B2FBE']}
                                start={{ x: 0, y: 0.5 }}
                                end={{ x: 1, y: 0.5 }}
                                style={StyleSheet.absoluteFill}
                            />
                            <GarageIcon size={32} />
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
    const [shutters,    setShutters]    = useState([]);
    const [loading,     setLoading]     = useState(false);

    // Drag-to-dismiss + slide-in animation
    const sheetY = useSharedValue(700);

    // Slide in when visible
    useEffect(() => {
        if (visible) {
            sheetY.value = 700;
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
                sheetY.value = withTiming(700, { duration: 250 }, () => {
                    runOnJS(onClose)();
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
                // Build garage / shutter lists from DB (coverType set in admin Covers page)
                const all = coversData.success ? coversData.covers : [];
                setGarages( all.filter(c => c.coverType === 'garage'));
                setShutters(all.filter(c => c.coverType === 'shutter'));

                // Seed lock selection
                const savedLocks = haData.success ? haData.locks : null;
                if (savedLocks === null) {
                    setLocalLocks(allLockEntities.map(l => l.entity_id));
                } else {
                    setLocalLocks(savedLocks);
                }

                // Seed cover selection
                const savedCovers = haData.success ? haData.covers : null;
                const allCoverIds = all
                    .filter(c => c.coverType === 'garage' || c.coverType === 'shutter')
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
        fetch(`${base}api/home-access`, {
            method: 'POST', headers: authHeaders,
            body: JSON.stringify({ type: 'lock', entity_id, action }),
        }).catch(e => console.error('[HomeAccess] toggleLock:', e));
    };

    const toggleCover = (entity_id) => {
        const isOn = localCovers.includes(entity_id);
        const action = isOn ? 'remove' : 'add';
        setLocalCovers(prev => isOn ? prev.filter(id => id !== entity_id) : [...prev, entity_id]);
        fetch(`${base}api/home-access`, {
            method: 'POST', headers: authHeaders,
            body: JSON.stringify({ type: 'cover', entity_id, action }),
        }).catch(e => console.error('[HomeAccess] toggleCover:', e));
    };

    const handleDone = () => {
        onSaved && onSaved();
        onClose();
    };

    const isEmpty = allLockEntities.length === 0 && garages.length === 0 && shutters.length === 0;

    return (
        <Modal
            visible={visible}
            transparent
            animationType="none"
            onRequestClose={handleDone}
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
                        <TouchableOpacity onPress={handleDone} style={mStyles.closeBtn}>
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

                            {/* ── Shutters ── */}
                            {shutters.length > 0 && (
                                <View style={mStyles.section}>
                                    <SectionHeader label="SHUTTERS" icon={Blinds} color="#9199BA" />
                                    {shutters.map(cover => (
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
                    <TouchableOpacity style={mStyles.doneBtn} onPress={handleDone} activeOpacity={0.8}>
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
    onConfigSaved,
}) {
    const garages  = covers.filter(c => c.coverType === 'garage');
    const shutters = covers.filter(c => c.coverType === 'shutter');

    const halfItems = [
        ...locks.map(l => ({ kind: 'lock',   data: l })),
        ...garages.map(g => ({ kind: 'garage', data: g })),
    ];

    const [editVisible, setEditVisible] = useState(false);

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

    if (halfItems.length === 0 && shutters.length === 0) return null;

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
                                    onControl={(action) =>
                                        onControlCover &&
                                        onControlCover(item.data.entity_id, action)
                                    }
                                />
                            )}
                        </View>
                    ))}
                </View>

                {/* Shutter full-width rows */}
                {shutters.map(shutter => (
                    <ShutterPill
                        key={`${shutter.entity_id}-${visibleKey}`}
                        name={shutter.name || 'Shutter'}
                        isOpen={shutter.isOpen}
                        isOpening={shutter.isOpening}
                        isClosing={shutter.isClosing}
                        onControl={(action) =>
                            onControlCover &&
                            onControlCover(shutter.entity_id, action)
                        }
                    />
                ))}
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