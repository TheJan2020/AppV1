import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal } from 'react-native';
import { BlurView } from 'expo-blur';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
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
    Easing,
} from 'react-native-reanimated';
import { DoorOpen, Blinds, ChevronUp, ChevronDown, Square, X, Check } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

// ── Constants — identical to SlideAction ─────────────────────────────────────
const BUTTON_SIZE = 48;
const PADDING = 4;
const CONTAINER_HEIGHT = BUTTON_SIZE + 2 * PADDING; // 56

const GARAGE_LOCK_MS = 20000;

// ─────────────────────────────────────────────────────────────────────────────
//  SwipePill  — garage closed state (swipe right to open)
//  Identical visual structure to SlideAction
// ─────────────────────────────────────────────────────────────────────────────
function SwipePill({ label, icon: Icon, color, onSlide }) {
    const [width, setWidth] = useState(0);
    const translateX     = useSharedValue(0);
    const successProg    = useSharedValue(0);
    const shimmerProg    = useSharedValue(0);

    const maxTranslate = Math.max(width - BUTTON_SIZE - 2 * PADDING, 0);

    useEffect(() => {
        shimmerProg.value = withRepeat(
            withTiming(1, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
            -1, true
        );
    }, []);

    const handleComplete = () => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        successProg.value = withTiming(1, { duration: 300 });
        setTimeout(() => { successProg.value = withTiming(0, { duration: 300 }); }, 2500);
        translateX.value = withSpring(0);
        if (onSlide) onSlide();
    };

    const pan = Gesture.Pan()
        .onUpdate((e) => {
            if (successProg.value > 0.5) return;
            translateX.value = Math.min(Math.max(e.translationX, 0), maxTranslate);
        })
        .onEnd(() => {
            if (successProg.value > 0.5) return;
            if (translateX.value > maxTranslate * 0.75) {
                runOnJS(handleComplete)();
            } else {
                translateX.value = withSpring(0);
            }
        });

    const thumbAnim  = useAnimatedStyle(() => ({ transform: [{ translateX: translateX.value }] }));
    const labelAnim  = useAnimatedStyle(() => ({
        opacity: interpolate(translateX.value, [0, maxTranslate / 2], [1, 0], Extrapolation.CLAMP),
    }));
    const shimmerAnim = useAnimatedStyle(() => ({
        opacity: interpolate(shimmerProg.value, [0, 0.5, 1], [0.5, 1, 0.5], Extrapolation.CLAMP),
    }));
    const successAnim = useAnimatedStyle(() => ({
        opacity: successProg.value,
        zIndex: successProg.value > 0.1 ? 20 : -1,
    }));

    return (
        <View style={styles.pill} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
            {/* grey translucent track — same as SlideAction */}
            <View style={styles.pillTrack} />

            {/* centered label (absolute, fades as thumb slides) */}
            <Animated.View pointerEvents="none" style={[styles.pillLabelAbsolute, labelAnim]}>
                <Animated.Text numberOfLines={1} ellipsizeMode="tail" style={[styles.pillLabelText, shimmerAnim]}>
                    {label}
                </Animated.Text>
            </Animated.View>

            {/* draggable thumb */}
            <GestureDetector gesture={pan}>
                <Animated.View style={[styles.pillThumb, thumbAnim]}>
                    <Icon size={24} color={color} />
                </Animated.View>
            </GestureDetector>

            {/* success overlay */}
            <Animated.View style={[styles.pillSuccess, { backgroundColor: color }, successAnim]}>
                <Check size={32} color="white" strokeWidth={3} />
            </Animated.View>
        </View>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
//  GarageTogglePill  — single pill for both open AND close
//  • Closed   → thumb LEFT,  drag RIGHT  to open
//  • Open     → thumb RIGHT, drag LEFT   to close
//  • Opening  → thumb snaps to RIGHT and is locked/pulsing, shows "Opening…"
//  • Closing  → thumb snaps to LEFT  and is locked/pulsing, shows "Closing…"
// ─────────────────────────────────────────────────────────────────────────────
function GarageTogglePill({ label, icon: Icon, isOpen, isMoving, movingDir, onOpen, onClose }) {
    const [width, setWidth] = useState(0);
    const widthSV      = useSharedValue(0);
    const pulseOpacity = useSharedValue(1);
    const translateX   = useSharedValue(0);
    const arrowBounce  = useSharedValue(0);   // translateY for arrow bounce animation

    // ── Mirror JS props/state into shared values so worklets always see current values
    const isOpenSV   = useSharedValue(isOpen);
    const isMovingSV = useSharedValue(isMoving);
    useEffect(() => { isOpenSV.value   = isOpen;   }, [isOpen]);
    useEffect(() => { isMovingSV.value = isMoving; }, [isMoving]);

    // Recompute where thumb should sit whenever width, open-state or moving-state changes
    useEffect(() => {
        if (width === 0) return;
        const max = Math.max(width - BUTTON_SIZE - 2 * PADDING, 0);

        if (isMoving) {
            const target = movingDir === 'opening' ? max : 0;
            translateX.value = withSpring(target, { damping: 18, stiffness: 180 });
        } else {
            isMovingSV.value = false;
            translateX.value = withSpring(isOpen ? max : 0, { damping: 18, stiffness: 180 });
        }
    }, [isOpen, isMoving, movingDir, width]);

    // Pulse thumb when moving
    useEffect(() => {
        if (isMoving) {
            pulseOpacity.value = withRepeat(
                withSequence(
                    withTiming(0.35, { duration: 600, easing: Easing.inOut(Easing.ease) }),
                    withTiming(1.0,  { duration: 600, easing: Easing.inOut(Easing.ease) }),
                ),
                -1, false
            );
        } else {
            pulseOpacity.value = withTiming(1, { duration: 200 });
        }
    }, [isMoving]);

    // Arrow bounce — up/down depending on direction
    useEffect(() => {
        if (isMoving) {
            const dir = movingDir === 'opening' ? -1 : 1;  // up = negative Y
            arrowBounce.value = withRepeat(
                withSequence(
                    withTiming(dir * 5,  { duration: 350, easing: Easing.inOut(Easing.ease) }),
                    withTiming(0,        { duration: 350, easing: Easing.inOut(Easing.ease) }),
                ),
                -1, false
            );
        } else {
            arrowBounce.value = withTiming(0, { duration: 200 });
        }
    }, [isMoving, movingDir]);

    // ── gesture ───────────────────────────────────────────────────────────────
    const dragStart = useSharedValue(0);

    const handleOpenJS  = () => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); if (onOpen)  onOpen();  };
    const handleCloseJS = () => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); if (onClose) onClose(); };

    const pan = Gesture.Pan()
        .onBegin(() => {
            dragStart.value = translateX.value;
        })
        .onUpdate((e) => {
            'worklet';
            if (isMovingSV.value) return;
            const max = Math.max(widthSV.value - BUTTON_SIZE - 2 * PADDING, 0);
            translateX.value = Math.min(Math.max(dragStart.value + e.translationX, 0), max);
        })
        .onEnd(() => {
            'worklet';
            if (isMovingSV.value) return;
            const max = Math.max(widthSV.value - BUTTON_SIZE - 2 * PADDING, 0);
            if (!isOpenSV.value && translateX.value > max * 0.6) {
                isMovingSV.value = true;
                translateX.value = withSpring(max, { damping: 18, stiffness: 180 });
                runOnJS(handleOpenJS)();
            } else if (isOpenSV.value && translateX.value < max * 0.4) {
                isMovingSV.value = true;
                translateX.value = withSpring(0, { damping: 18, stiffness: 180 });
                runOnJS(handleCloseJS)();
            } else {
                translateX.value = withSpring(isOpenSV.value ? max : 0, { damping: 18, stiffness: 180 });
            }
        });

    // ── animated styles ───────────────────────────────────────────────────────
    const thumbAnim = useAnimatedStyle(() => ({
        transform: [{ translateX: translateX.value }],
        opacity: pulseOpacity.value,
    }));

    // Fades the center content while the thumb is mid-drag
    const labelAnim = useAnimatedStyle(() => {
        const max = Math.max(widthSV.value - BUTTON_SIZE - 2 * PADDING, 1);
        const fromLeft = translateX.value / max;
        const distEdge = Math.min(fromLeft, 1 - fromLeft);
        const opacity  = interpolate(distEdge, [0, 0.25], [1, 0], Extrapolation.CLAMP);
        return { opacity };
    });

    const arrowAnim = useAnimatedStyle(() => ({
        transform: [{ translateY: arrowBounce.value }],
    }));

    // ── colours ───────────────────────────────────────────────────────────────
    const trackColor = isMoving
        ? 'rgba(192,132,252,0.2)'
        : isOpen ? 'rgba(255,112,67,0.25)' : 'rgba(255,255,255,0.18)';
    const iconColor = isMoving
        ? '#c084fc'
        : isOpen ? '#FF7043' : '#8947ca';
    const arrowColor = '#c084fc';

    const CenterArrow = movingDir === 'closing' ? ChevronDown : ChevronUp;

    return (
        <View style={styles.pill} onLayout={(e) => {
            const w = e.nativeEvent.layout.width;
            setWidth(w);
            widthSV.value = w;
        }}>
            {/* coloured track */}
            <View style={[styles.pillTrack, { backgroundColor: trackColor }]} />

            {/* center: name when idle, bouncing arrow when moving */}
            <Animated.View pointerEvents="none" style={[styles.pillLabelAbsolute, labelAnim]}>
                {isMoving ? (
                    <Animated.View style={arrowAnim}>
                        <CenterArrow size={22} color={arrowColor} strokeWidth={2.5} />
                    </Animated.View>
                ) : (
                    <Text numberOfLines={1} ellipsizeMode="tail" style={[styles.pillLabelText, styles.pillLabelCenter]}>{label}</Text>
                )}
            </Animated.View>

            {/* draggable (or locked) thumb */}
            <GestureDetector gesture={pan}>
                <Animated.View style={[styles.pillThumb, thumbAnim]}>
                    <Icon size={24} color={iconColor} />
                </Animated.View>
            </GestureDetector>
        </View>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
//  TapPill  — shutter state (tap to open modal)
//  Same visual shell as SwipePill, no gesture
// ─────────────────────────────────────────────────────────────────────────────
function TapPill({ label, sublabel, icon: Icon, color, pulsing, onPress }) {
    const pulseOpacity = useSharedValue(1);

    useEffect(() => {
        if (pulsing) {
            pulseOpacity.value = withRepeat(
                withSequence(
                    withTiming(0.3, { duration: 500, easing: Easing.inOut(Easing.ease) }),
                    withTiming(1.0, { duration: 500, easing: Easing.inOut(Easing.ease) }),
                ),
                -1, false
            );
        } else {
            pulseOpacity.value = withTiming(1, { duration: 200 });
        }
    }, [pulsing]);

    const pulseAnim = useAnimatedStyle(() => ({ opacity: pulseOpacity.value }));

    return (
        <TouchableOpacity
            style={styles.pill}
            onPress={onPress}
            activeOpacity={0.8}
        >
            {/* same grey track as SwipePill / SlideAction */}
            <View style={styles.pillTrack} />

            {/* fixed thumb — dark circle with shadow, same as SlideAction button */}
            <Animated.View style={[styles.pillThumb, styles.pillThumbStatic, pulseAnim]}>
                <Icon size={24} color={color} />
            </Animated.View>

            {/* label + sublabel in remaining space */}
            <View style={styles.pillLabelRow}>
                <Text numberOfLines={1} style={styles.pillLabelText}>
                    {label}
                    {sublabel ? (
                        <Text style={[styles.pillSubLabel, { color }]}>{'  '}{sublabel}</Text>
                    ) : null}
                </Text>
            </View>
        </TouchableOpacity>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Main component
// ─────────────────────────────────────────────────────────────────────────────
export default function ShutterGarageSlide({
    label,
    coverType = 'shutter',
    isOpen = false,
    isOpening = false,
    isClosing = false,
    position = null,
    onOpen,
    onClose,
    onStop,
}) {
    const isGarage  = coverType === 'garage';
    const isShutter = !isGarage;
    const Icon      = isGarage ? DoorOpen : Blinds;

    const pos       = position ?? (isOpen ? 100 : 0);
    const fullyOpen = pos >= 95;

    // ── Garage 30 s lock ──────────────────────────────────────────────────────
    const [garageLock, setGarageLock] = useState('idle');
    const lockTimer = useRef(null);
    // Track whether HA ever confirmed movement for this lock cycle
    const haConfirmedMoving = useRef(false);

    const startLock = (dir) => {
        clearTimeout(lockTimer.current);
        haConfirmedMoving.current = false; // reset for new cycle
        setGarageLock(dir);
        lockTimer.current = setTimeout(() => {
            setGarageLock('idle');
            haConfirmedMoving.current = false;
        }, GARAGE_LOCK_MS);
    };

    // Release lock when HA confirms movement (isOpening/isClosing) then stops,
    // OR immediately when position confirms the door has reached its destination.
    useEffect(() => {
        if (!isGarage) return;
        if (isOpening || isClosing) {
            haConfirmedMoving.current = true;
            return;
        }
        if (haConfirmedMoving.current && garageLock !== 'idle') {
            const grace = setTimeout(() => {
                setGarageLock('idle');
                haConfirmedMoving.current = false;
            }, 1500);
            return () => clearTimeout(grace);
        }
    }, [isOpening, isClosing]);

    // Also release lock as soon as position confirms destination reached
    useEffect(() => {
        if (!isGarage || garageLock === 'idle') return;
        const destReached =
            (garageLock === 'opening' && fullyOpen) ||
            (garageLock === 'closing' && pos < 5);
        if (destReached) {
            const grace = setTimeout(() => {
                setGarageLock('idle');
                haConfirmedMoving.current = false;
            }, 800);
            return () => clearTimeout(grace);
        }
    }, [fullyOpen, pos, garageLock]);

    useEffect(() => () => clearTimeout(lockTimer.current), []);

    // ── Shutter modal ─────────────────────────────────────────────────────────
    const [modalVisible, setModalVisible] = useState(false);

    // ── Derived ───────────────────────────────────────────────────────────────
    const garageMoving  = isGarage  && garageLock !== 'idle';
    const shutterMoving = isShutter && (isOpening || isClosing);

    const displayOpening = isGarage ? garageLock === 'opening' : isOpening;
    const displayClosing = isGarage ? garageLock === 'closing' : isClosing;

    let statusText;
    if      (displayOpening) statusText = 'Opening…';
    else if (displayClosing) statusText = 'Closing…';
    else if (pos >= 95)      statusText = 'Open';
    else if (pos < 5)        statusText = 'Closed';
    else                     statusText = `${pos}% open`;

    // ── Handlers ──────────────────────────────────────────────────────────────
    const handleOpen = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        if (isGarage) startLock('opening');
        setModalVisible(false);
        if (onOpen) onOpen();
    };
    const handleClose = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        if (isGarage) startLock('closing');
        setModalVisible(false);
        if (onClose) onClose();
    };
    const handleStop = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        setModalVisible(false);
        if (onStop) onStop();
    };

    // ══════════════════════════════════════════════════════════════════════════
    //  GARAGE — single toggle pill (thumb left = closed, right = open)
    // ══════════════════════════════════════════════════════════════════════════
    if (isGarage) {
        return (
            <GarageTogglePill
                label={label}
                icon={Icon}
                isOpen={fullyOpen}
                isMoving={garageMoving}
                movingDir={garageLock}
                onOpen={handleOpen}
                onClose={handleClose}
            />
        );
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  SHUTTER — tap pill identical in look to garage-closed pill
    // ══════════════════════════════════════════════════════════════════════════
    const shutterColor = shutterMoving
        ? '#c084fc'
        : pos >= 95 ? '#FF7043' : '#8947ca';

    return (
        <>
            <TapPill
                label={label}
                sublabel={statusText}
                icon={Icon}
                color={shutterColor}
                pulsing={shutterMoving}
                onPress={() => { Haptics.selectionAsync(); setModalVisible(true); }}
            />

            {/* ── Bottom-sheet modal ── */}
            <Modal
                visible={modalVisible}
                transparent
                animationType="slide"
                onRequestClose={() => setModalVisible(false)}
            >
                <TouchableOpacity
                    style={StyleSheet.absoluteFillObject}
                    activeOpacity={1}
                    onPress={() => setModalVisible(false)}
                >
                    <BlurView intensity={25} tint="dark" style={StyleSheet.absoluteFill} />
                </TouchableOpacity>

                <View style={styles.sheet}>
                    <View style={styles.handle} />

                    <View style={styles.sheetHeader}>
                        <View style={styles.sheetTitleRow}>
                            <Icon size={18} color={shutterColor} />
                            <Text style={styles.sheetTitle}>{label}</Text>
                        </View>
                        <TouchableOpacity onPress={() => setModalVisible(false)} style={styles.closeBtn}>
                            <X size={20} color="rgba(255,255,255,0.5)" />
                        </TouchableOpacity>
                    </View>

                    <Text style={[styles.sheetStatus, { color: shutterColor }]}>{statusText}</Text>

                    <View style={styles.modalBtnRow}>
                        <TouchableOpacity
                            style={[styles.modalBtn, styles.modalBtnOpen, isOpening && styles.btnActive, isClosing && styles.btnDim]}
                            onPress={handleOpen}
                            activeOpacity={0.75}
                        >
                            <ChevronUp size={22} color="#fff" strokeWidth={2.5} />
                            <Text style={styles.modalBtnLabel}>Open</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={[styles.modalBtn, styles.modalBtnStop, shutterMoving && styles.modalBtnStopActive]}
                            onPress={handleStop}
                            activeOpacity={0.75}
                        >
                            <Square size={16} color="#fff" fill={shutterMoving ? '#fff' : 'transparent'} />
                            <Text style={styles.modalBtnLabel}>Stop</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={[styles.modalBtn, styles.modalBtnClose, isClosing && styles.btnActive, isOpening && styles.btnDim]}
                            onPress={handleClose}
                            activeOpacity={0.75}
                        >
                            <ChevronDown size={22} color="#fff" strokeWidth={2.5} />
                            <Text style={styles.modalBtnLabel}>Close</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Styles
// ─────────────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
    // ── Shared pill shell ─────────────────────────────────────────────────────
    pill: {
        height: CONTAINER_HEIGHT,       // 56 — same as SlideAction
        width: '100%',
        borderRadius: CONTAINER_HEIGHT / 2,
        flexDirection: 'row',
        alignItems: 'center',
        padding: PADDING,
        overflow: 'hidden',
        position: 'relative',
    },
    pillTrack: {
        // translucent white track — exact copy from SlideAction
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(255,255,255,0.2)',
        borderRadius: CONTAINER_HEIGHT / 2,
    },
    // draggable thumb (SwipePill) — same as SlideAction .button
    pillThumb: {
        width: BUTTON_SIZE,
        height: BUTTON_SIZE,
        borderRadius: BUTTON_SIZE / 2,
        backgroundColor: '#2b2b3b',
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 3.84,
        elevation: 5,
        zIndex: 10,
        flexShrink: 0,
    },
    // static thumb (TapPill / open pill) — same dark circle, no translation
    pillThumbStatic: {
        // inherits pillThumb; just overrides nothing — kept separate for clarity
    },

    // ── GarageTogglePill: center content absolutely positioned ────────────────
    pillLabelAbsolute: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: BUTTON_SIZE + PADDING * 2,
    },

    // ── TapPill: label sits in flex row next to thumb ─────────────────────────
    pillLabelRow: {
        flex: 1,
        paddingLeft: 10,
        paddingRight: 6,
        justifyContent: 'center',
    },

    // shared text style used by both
    pillLabelText: {
        color: '#fff',
        fontSize: 13,
        fontWeight: '500',
        letterSpacing: 0.3,
    },
    pillLabelCenter: {
        textAlign: 'center',
    },
    pillLabelHint: {
        fontSize: 11,
        fontWeight: '700',
        opacity: 0.85,
    },
    pillSubLabel: {
        fontSize: 11,
        fontWeight: '600',
    },

    // SwipePill success overlay
    pillSuccess: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'center',
        alignItems: 'center',
        borderRadius: CONTAINER_HEIGHT / 2,
        height: CONTAINER_HEIGHT,
    },

    // Garage open: orange pill
    pillOpenBg: {
        backgroundColor: '#FF7043',
    },

    // ── Bottom-sheet modal ────────────────────────────────────────────────────
    sheet: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: '#1a1b2e',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        padding: 20,
        paddingBottom: 40,
    },
    handle: {
        width: 36,
        height: 4,
        backgroundColor: 'rgba(255,255,255,0.2)',
        borderRadius: 2,
        alignSelf: 'center',
        marginBottom: 16,
    },
    sheetHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 8,
    },
    sheetTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    sheetTitle: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '700',
    },
    closeBtn: {
        padding: 4,
    },
    sheetStatus: {
        fontSize: 12,
        fontWeight: '600',
        marginBottom: 20,
        paddingLeft: 4,
    },
    modalBtnRow: {
        flexDirection: 'row',
        gap: 10,
    },
    modalBtn: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingVertical: 18,
        borderRadius: 16,
    },
    modalBtnLabel: {
        color: '#fff',
        fontSize: 13,
        fontWeight: '700',
    },
    modalBtnOpen:  { backgroundColor: 'rgba(124,58,237,0.55)' },
    modalBtnStop:  { backgroundColor: 'rgba(100,116,139,0.45)' },
    modalBtnStopActive: { backgroundColor: 'rgba(234,179,8,0.65)' },
    modalBtnClose: { backgroundColor: 'rgba(180,83,9,0.55)' },
    btnActive: {
        borderWidth: 1.5,
        borderColor: 'rgba(255,255,255,0.4)',
    },
    btnDim: {
        opacity: 0.35,
    },
});
