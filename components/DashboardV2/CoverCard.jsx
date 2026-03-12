import { View, Text, StyleSheet } from 'react-native';
import { ChevronUp, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { Colors } from '../../constants/Colors';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing, withRepeat, runOnJS } from 'react-native-reanimated';
import { useEffect, useState, useRef } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Rect } from 'react-native-svg';

// ── Cover type classification ──────────────────────────────────────────────────
// Horizontal covers (panels slide left/right) → drag only
const HORIZONTAL_COVER_TYPES = ['curtain_middle', 'curtain_left', 'curtain_right', 'curtain_roll'];
// Vertical covers (panels slide up/down) → action buttons on RIGHT
const VERTICAL_COVER_TYPES = ['shutter', 'garage'];

export default function CoverCard({ cover, sensor, onUpdate, needsChange }) {
    if (!cover) return null;

    const coverType = cover.coverType || '';
    const isHorizontal = HORIZONTAL_COVER_TYPES.includes(coverType);

    if (isHorizontal) {
        return <HorizontalCurtainCard cover={cover} sensor={sensor} onUpdate={onUpdate} needsChange={needsChange} />;
    }

    return <VerticalShutterCard cover={cover} sensor={sensor} onUpdate={onUpdate} needsChange={needsChange} />;
}

// ─── Horizontal Curtain Card ──────────────────────────────────────────────────
// curtain_middle, curtain_left, curtain_right → animated window panels
// curtain_roll → roll-down animated panel
// Action buttons on BOTTOM
function HorizontalCurtainCard({ cover, sensor, onUpdate, needsChange }) {
    const { attributes, state } = cover.stateObj;
    const currentPosition = attributes.current_position !== undefined
        ? attributes.current_position
        : (state === 'open' ? 100 : 0);
    const friendlyName = cover.displayName || "";
    const coverType = cover.coverType || 'curtain_middle';
    const isRoll = coverType === 'curtain_roll';
    const isMiddle = coverType === 'curtain_middle';
    const isRight = coverType === 'curtain_right';
    const showLeftPanel = isMiddle || !isRight;
    const showRightPanel = isMiddle || isRight;

    const sensorRawState = sensor?.state;
    const sensorState = sensorRawState?.toUpperCase() || 'STOP';
    const coverState = cover.stateObj.state;

    // Optimistic local motion state — set immediately on button press,
    // cleared when the real socket state_changed arrives (coverState changes)
    const [pendingAction, setPendingAction] = useState(null); // 'opening' | 'closing' | null
    const pendingTimeoutRef = useRef(null);

    // When coverState changes from socket, clear any pending optimistic state
    useEffect(() => {
        if (pendingAction && (coverState === 'opening' || coverState === 'closing' || coverState === 'open' || coverState === 'closed')) {
            setPendingAction(null);
            if (pendingTimeoutRef.current) clearTimeout(pendingTimeoutRef.current);
        }
    }, [coverState]);

    const isMovingUp = sensorState === 'UP' || coverState === 'opening' || pendingAction === 'opening';
    const isMovingDown = sensorState === 'DOWN' || coverState === 'closing' || pendingAction === 'closing';
    const isMoving = isMovingUp || isMovingDown;

    // Animation
    const visualPos = useSharedValue(currentPosition);
    const frameWidth = useSharedValue(0);
    const frameHeight = useSharedValue(0);

    // Drag state — must be declared before useEffect so it's accessible in the guard
    const isDragging = useSharedValue(false);
    const dragStartPos = useSharedValue(0);

    // Arrow animation for opening/closing indicator
    const arrowTranslateX = useSharedValue(0);   // left arrow (or single arrow)
    const arrowTranslateX2 = useSharedValue(0);  // right arrow (middle curtain only)
    const arrowOpacity = useSharedValue(0);

    useEffect(() => {
        // Don't overwrite visual position while user is dragging
        if (isDragging.value) return;
        const validPos = isNaN(currentPosition) || currentPosition === null ? 0 : currentPosition;
        visualPos.value = withTiming(validPos, { duration: 800, easing: Easing.out(Easing.cubic) });
    }, [currentPosition]);

    // Arrow overlay animation — pulses while cover is moving
    useEffect(() => {
        if (!isMoving) {
            arrowOpacity.value = withTiming(0, { duration: 300 });
            arrowTranslateX.value = 0;
            arrowTranslateX2.value = 0;
            return;
        }

        arrowOpacity.value = withTiming(1, { duration: 200 });

        if (isRoll) {
            // Roll: vertical pulse only (translateX stays 0)
            return;
        }

        if (isMiddle) {
            // Middle: LEFT panel arrow goes ← when opening, → when closing
            //         RIGHT panel arrow goes → when opening, ← when closing
            if (isMovingUp) {
                // opening → panels pull apart → left arrow goes ←, right arrow goes →
                arrowTranslateX.value = withRepeat(
                    withTiming(-18, { duration: 600, easing: Easing.inOut(Easing.ease) }),
                    -1, true
                );
                arrowTranslateX2.value = withRepeat(
                    withTiming(18, { duration: 600, easing: Easing.inOut(Easing.ease) }),
                    -1, true
                );
            } else {
                // closing → panels come together → left arrow goes →, right arrow goes ←
                arrowTranslateX.value = withRepeat(
                    withTiming(18, { duration: 600, easing: Easing.inOut(Easing.ease) }),
                    -1, true
                );
                arrowTranslateX2.value = withRepeat(
                    withTiming(-18, { duration: 600, easing: Easing.inOut(Easing.ease) }),
                    -1, true
                );
            }
        } else if (isRight) {
            // Right-only panel: opening → arrow goes → (panel pulls right), closing → arrow goes ←
            const dir = isMovingUp ? 18 : -18;
            arrowTranslateX.value = withRepeat(
                withTiming(dir, { duration: 600, easing: Easing.inOut(Easing.ease) }),
                -1, true
            );
        } else {
            // Left-only panel: opening → arrow goes ← (panel pulls left), closing → arrow goes →
            const dir = isMovingUp ? -18 : 18;
            arrowTranslateX.value = withRepeat(
                withTiming(dir, { duration: 600, easing: Easing.inOut(Easing.ease) }),
                -1, true
            );
        }
    }, [isMovingUp, isMovingDown, isMoving]);

    const handleAction = (action, params = {}) => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        const service = action === 'stop' ? 'stop_cover' : (action === 'open' ? 'open_cover' : action === 'set_cover_position' ? 'set_cover_position' : 'close_cover');

        // Optimistically show motion immediately — don't wait for socket round-trip
        if (action === 'open') {
            setPendingAction('opening');
            if (pendingTimeoutRef.current) clearTimeout(pendingTimeoutRef.current);
            // Safety: clear after 30s if socket never responds
            pendingTimeoutRef.current = setTimeout(() => setPendingAction(null), 30000);
        } else if (action === 'close') {
            setPendingAction('closing');
            if (pendingTimeoutRef.current) clearTimeout(pendingTimeoutRef.current);
            pendingTimeoutRef.current = setTimeout(() => setPendingAction(null), 30000);
        } else if (action === 'stop' || action === 'set_cover_position') {
            setPendingAction(null);
            if (pendingTimeoutRef.current) clearTimeout(pendingTimeoutRef.current);
        }

        onUpdate(cover.entity_id, 'cover', service, params);
    };
    // right = open, left = close
    // activeOffsetX: only activate after 10px horizontal — lets ScrollView handle vertical scrolls
    const curtainPanGesture = Gesture.Pan()
        .minDistance(5)
        .activeOffsetX([-10, 10])
        .failOffsetY([-5, 5])
        .onStart(() => {
            isDragging.value = true;
            dragStartPos.value = visualPos.value;
        })
        .onUpdate((e) => {
            const fw = frameWidth.value;
            if (fw <= 0) return;
            const maxW = isMiddle ? fw * 0.5 : fw;
            // curtain_left: panel hangs from left edge — drag left = open (pull panel away), drag right = close
            // curtain_right / curtain_middle: drag right = open, drag left = close
            const sign = (!isMiddle && !isRight) ? -1 : 1;
            const delta = sign * (e.translationX / maxW) * 100;
            visualPos.value = Math.max(0, Math.min(100, dragStartPos.value + delta));
        })
        .onEnd(() => {
            isDragging.value = false;
            runOnJS(handleAction)('set_cover_position', { position: Math.round(visualPos.value) });
        });

    // Vertical pan gesture for roll curtain — up = open, down = close
    // activeOffsetY: only activate after 10px vertical — lets ScrollView handle vertical scrolls
    // failOffsetX: fail if horizontal movement detected first
    const rollPanGesture = Gesture.Pan()
        .minDistance(5)
        .activeOffsetY([-10, 10])
        .failOffsetX([-5, 5])
        .onStart(() => {
            isDragging.value = true;
            dragStartPos.value = visualPos.value;
        })
        .onUpdate((e) => {
            const fh = frameHeight.value;
            if (fh <= 0) return;
            const delta = (-e.translationY / fh) * 100;
            visualPos.value = Math.max(0, Math.min(100, dragStartPos.value + delta));
        })
        .onEnd(() => {
            isDragging.value = false;
            runOnJS(handleAction)('set_cover_position', { position: Math.round(visualPos.value) });
        });

    // Tap gesture — tap a position in the window to jump cover there
    const curtainTapGesture = Gesture.Tap()
        .onEnd((e) => {
            const fw = frameWidth.value;
            if (fw <= 0) return;
            // x=0 → fully closed (pos=0), x=fw → fully open (pos=100)
            // For left-only curtain: left edge = closed, right edge = open
            // For right-only or middle: mirror — right edge = closed side
            let newPos;
            if (isMiddle) {
                // In middle mode both panels move symmetrically; treat centre as 0
                const halfW = fw * 0.5;
                const distFromEdge = Math.min(e.x, fw - e.x);
                newPos = Math.round((distFromEdge / halfW) * 100);
            } else if (isRight) {
                // right panel: right edge = closed
                newPos = Math.round(((fw - e.x) / fw) * 100);
                newPos = 100 - newPos; // invert so tapping left = more open
            } else {
                // left panel: left edge = closed, right = open
                newPos = Math.round((e.x / fw) * 100);
                newPos = 100 - newPos;
            }
            newPos = Math.max(0, Math.min(100, newPos));
            visualPos.value = withTiming(newPos, { duration: 400 });
            runOnJS(handleAction)('set_cover_position', { position: newPos });
        });

    const rollTapGesture = Gesture.Tap()
        .onEnd((e) => {
            const fh = frameHeight.value;
            if (fh <= 0) return;
            // y=0 = top = open (100%), y=fh = bottom = closed (0%)
            const newPos = Math.round(((fh - e.y) / fh) * 100);
            const clamped = Math.max(0, Math.min(100, newPos));
            visualPos.value = withTiming(clamped, { duration: 400 });
            runOnJS(handleAction)('set_cover_position', { position: clamped });
        });

    // Combine pan + tap so both work on the same area
    const curtainGesture = Gesture.Simultaneous(curtainPanGesture, curtainTapGesture);
    const rollGesture = Gesture.Simultaneous(rollPanGesture, rollTapGesture);

    const posText = currentPosition <= 2
        ? 'Closed'
        : currentPosition >= 98
            ? 'Opened'
            : `Opened ${Math.round(currentPosition)}%`;

    // Animated curtain panel widths (for left/right/middle)
    // Min 8% of half-frame so pulled-back curtain is always a thin sliver
    const leftPanelStyle = useAnimatedStyle(() => {
        const fw = frameWidth.value;
        if (fw <= 0) return { width: 0 };
        const maxW = isMiddle ? fw * 0.5 : fw;
        const fraction = Math.max(0.08, 1 - visualPos.value / 100);
        return { width: maxW * fraction };
    });

    const rightPanelStyle = useAnimatedStyle(() => {
        const fw = frameWidth.value;
        if (fw <= 0) return { width: 0 };
        const maxW = isMiddle ? fw * 0.5 : fw;
        const fraction = Math.max(0.08, 1 - visualPos.value / 100);
        return { width: maxW * fraction };
    });

    // Animated roll panel height (for curtain_roll)
    const rollPanelStyle = useAnimatedStyle(() => {
        const fh = frameHeight.value;
        if (fh <= 0) return { height: 0 };
        const fraction = 1 - visualPos.value / 100;
        return { height: Math.max(18, fh * fraction) };
    });

    // Arrow overlay for opening/closing feedback
    const arrowAnimStyle = useAnimatedStyle(() => ({
        transform: [{ translateX: arrowTranslateX.value }],
        opacity: arrowOpacity.value,
    }));

    const arrowAnimStyle2 = useAnimatedStyle(() => ({
        transform: [{ translateX: arrowTranslateX2.value }],
        opacity: arrowOpacity.value,
    }));

    return (
        <View style={[curtainStyles.card, needsChange && { borderColor: '#8947ca', borderWidth: 2 }]}>
            {/* Window + Curtain Visual — entire area is draggable */}
            <GestureDetector gesture={isRoll ? rollGesture : curtainGesture}>
            <View
                style={curtainStyles.windowArea}
                onLayout={(e) => {
                    frameWidth.value = e.nativeEvent.layout.width - 4;
                    frameHeight.value = e.nativeEvent.layout.height - 4;
                }}
            >
                <LinearGradient
                    colors={['#ffffff', '#e5e7eb']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 0, y: 1 }}
                    style={curtainStyles.windowFrameGradient}
                >
                <View style={curtainStyles.windowFrame}>
                    {isRoll ? (
                        <>
                            {/* Roll curtain: panel drops from top */}
                            <View style={curtainStyles.staticBg} />
                            <Animated.View style={[curtainStyles.rollPanel, rollPanelStyle, { overflow: 'hidden' }]}>
                                {/* Horizontal gradient folds top-to-bottom */}
                                <View style={[StyleSheet.absoluteFill, { flexDirection: 'column' }]}>
                                    {[0, 1, 2, 3, 4].map(i => (
                                        <LinearGradient
                                            key={i}
                                            colors={i % 2 === 0
                                                ? ['#9f5ff5', '#5b21b6', '#7c3aed']
                                                : ['#6d28d9', '#a855f7', '#6d28d9']}
                                            start={{ x: 0, y: 0 }}
                                            end={{ x: 0, y: 1 }}
                                            style={{ flex: 1 }}
                                        />
                                    ))}
                                </View>
                                {/* Handle bar at bottom edge */}
                                <View style={curtainStyles.rollHandle}>
                                    <View style={[curtainStyles.handleBar, { width: 22, height: 3 }]} />
                                </View>
                            </Animated.View>
                        </>
                    ) : (
                        <>
                            {/* Window panes (2x2 grid) — dark open area */}
                            <View style={curtainStyles.panesGrid}>
                                <View style={curtainStyles.paneRow}>
                                    <View style={curtainStyles.pane} />
                                    <LinearGradient
                                        colors={['#ffffff', '#e5e7eb']}
                                        start={{ x: 0, y: 0 }}
                                        end={{ x: 0, y: 1 }}
                                        style={curtainStyles.paneDividerV}
                                    />
                                    <View style={curtainStyles.pane} />
                                </View>
                                <LinearGradient
                                    colors={['#ffffff', '#e5e7eb']}
                                    start={{ x: 0, y: 0 }}
                                    end={{ x: 1, y: 0 }}
                                    style={curtainStyles.paneDividerH}
                                />
                                <View style={curtainStyles.paneRow}>
                                    <View style={curtainStyles.pane} />
                                    <LinearGradient
                                        colors={['#ffffff', '#e5e7eb']}
                                        start={{ x: 0, y: 0 }}
                                        end={{ x: 0, y: 1 }}
                                        style={curtainStyles.paneDividerV}
                                    />
                                    <View style={curtainStyles.pane} />
                                </View>
                            </View>

                            {/* Left Curtain Panel */}
                            {showLeftPanel && (
                                <Animated.View style={[curtainStyles.panelLeft, leftPanelStyle, { overflow: 'hidden' }]}>
                                    {/* Fabric folds: alternating light→dark→light gradient columns */}
                                    <View style={curtainStyles.foldLines}>
                                        {[0,1,2,3,4].map(i => (
                                            <LinearGradient
                                                key={i}
                                                colors={i % 2 === 0
                                                    ? ['#9f5ff5', '#5b21b6', '#7c3aed']
                                                    : ['#6d28d9', '#a855f7', '#6d28d9']}
                                                start={{ x: 0, y: 0 }}
                                                end={{ x: 1, y: 0 }}
                                                style={curtainStyles.foldLine}
                                            />
                                        ))}
                                    </View>
                                    {/* Handle on inner (right) edge */}
                                    <View style={curtainStyles.handleRight}>
                                        <View style={curtainStyles.handleBar} />
                                    </View>
                                </Animated.View>
                            )}

                            {/* Right Curtain Panel */}
                            {showRightPanel && (
                                <Animated.View style={[curtainStyles.panelRight, rightPanelStyle, { overflow: 'hidden' }]}>
                                    {/* Fabric folds: alternating light→dark→light gradient columns */}
                                    <View style={curtainStyles.foldLines}>
                                        {[0,1,2,3,4].map(i => (
                                            <LinearGradient
                                                key={i}
                                                colors={i % 2 === 0
                                                    ? ['#6d28d9', '#a855f7', '#6d28d9']
                                                    : ['#9f5ff5', '#5b21b6', '#7c3aed']}
                                                start={{ x: 0, y: 0 }}
                                                end={{ x: 1, y: 0 }}
                                                style={curtainStyles.foldLine}
                                            />
                                        ))}
                                    </View>
                                    {/* Handle on inner (left) edge */}
                                    <View style={curtainStyles.handleLeft}>
                                        <View style={curtainStyles.handleBar} />
                                    </View>
                                </Animated.View>
                            )}
                        </>
                    )}

                    {/* Movement arrow overlay — shows while opening or closing */}
                    {isMoving && (
                        isMiddle ? (
                            // Middle curtain: two arrows, one on each half
                            <>
                                {/* Left half arrow */}
                                <Animated.View style={[curtainStyles.arrowOverlayLeft, arrowAnimStyle]} pointerEvents="none">
                                    {isMovingUp
                                        ? <ChevronLeft size={32} color="rgba(255,255,255,0.85)" />
                                        : <ChevronRight size={32} color="rgba(255,255,255,0.85)" />}
                                </Animated.View>
                                {/* Right half arrow */}
                                <Animated.View style={[curtainStyles.arrowOverlayRight, arrowAnimStyle2]} pointerEvents="none">
                                    {isMovingUp
                                        ? <ChevronRight size={32} color="rgba(255,255,255,0.85)" />
                                        : <ChevronLeft size={32} color="rgba(255,255,255,0.85)" />}
                                </Animated.View>
                            </>
                        ) : isRoll ? (
                            // Roll curtain: vertical arrow centered
                            <Animated.View style={[curtainStyles.arrowOverlay, arrowAnimStyle]} pointerEvents="none">
                                {isMovingUp
                                    ? <ChevronUp size={40} color="rgba(255,255,255,0.85)" />
                                    : <ChevronDown size={40} color="rgba(255,255,255,0.85)" />}
                            </Animated.View>
                        ) : (
                            // Left or right single-panel curtain
                            <Animated.View style={[curtainStyles.arrowOverlay, arrowAnimStyle]} pointerEvents="none">
                                {isRight
                                    ? (isMovingUp
                                        ? <ChevronRight size={40} color="rgba(255,255,255,0.85)" />
                                        : <ChevronLeft size={40} color="rgba(255,255,255,0.85)" />)
                                    : (isMovingUp
                                        ? <ChevronLeft size={40} color="rgba(255,255,255,0.85)" />
                                        : <ChevronRight size={40} color="rgba(255,255,255,0.85)" />)
                                }
                            </Animated.View>
                        )
                    )}
                </View>
                </LinearGradient>
            </View>
            </GestureDetector>

            {/* Name + Status */}
            <Text style={curtainStyles.name} numberOfLines={1}>{friendlyName}</Text>
            <Text style={curtainStyles.status}>
                {isMovingUp ? 'Opening...' : isMovingDown ? 'Closing...' : posText}
            </Text>
        </View>
    );
}

// ─── Vertical Shutter/Garage Card ────────────────────────────────────────────
// Same logic & design as curtain_roll — panel drops from top
function VerticalShutterCard({ cover, sensor, onUpdate, needsChange }) {
    const { attributes, state } = cover.stateObj;
    const currentPosition = attributes.current_position !== undefined ? attributes.current_position : (state === 'open' ? 100 : 0);
    const friendlyName = cover.displayName || "";

    // Sensor State Logic
    const sensorRawState = sensor?.state;
    const sensorState = sensorRawState?.toUpperCase() || 'STOP';
    const coverState = cover.stateObj.state;

    // Optimistic local motion state
    const [pendingAction, setPendingAction] = useState(null);
    const pendingTimeoutRef = useRef(null);

    useEffect(() => {
        if (pendingAction && (coverState === 'opening' || coverState === 'closing' || coverState === 'open' || coverState === 'closed')) {
            setPendingAction(null);
            if (pendingTimeoutRef.current) clearTimeout(pendingTimeoutRef.current);
        }
    }, [coverState]);

    const isMovingUp = sensorState === 'UP' || coverState === 'opening' || pendingAction === 'opening';
    const isMovingDown = sensorState === 'DOWN' || coverState === 'closing' || pendingAction === 'closing';
    const isMoving = isMovingUp || isMovingDown;

    const posText = currentPosition <= 2
        ? 'Closed'
        : currentPosition >= 98
            ? 'Opened'
            : `Opened ${Math.round(currentPosition)}%`;

    // Shared values — mirrors roll curtain exactly
    const visualPos = useSharedValue(currentPosition);
    const frameHeight = useSharedValue(0);
    const isDragging = useSharedValue(false);
    const dragStartPos = useSharedValue(0);
    const arrowTranslateY = useSharedValue(0);
    const arrowOpacity = useSharedValue(0);

    // Sync from HA (skip while dragging)
    useEffect(() => {
        if (isDragging.value) return;
        const validPos = isNaN(currentPosition) || currentPosition === null ? 0 : currentPosition;
        visualPos.value = withTiming(validPos, { duration: 800, easing: Easing.out(Easing.cubic) });
    }, [currentPosition]);

    // Arrow animation — same as roll curtain
    useEffect(() => {
        if (!isMoving) {
            arrowOpacity.value = withTiming(0, { duration: 300 });
            arrowTranslateY.value = 0;
            return;
        }
        arrowOpacity.value = withTiming(1, { duration: 200 });
        if (isMovingUp) {
            arrowTranslateY.value = withRepeat(
                withTiming(-18, { duration: 600, easing: Easing.inOut(Easing.ease) }),
                -1, true
            );
        } else {
            arrowTranslateY.value = withRepeat(
                withTiming(18, { duration: 600, easing: Easing.inOut(Easing.ease) }),
                -1, true
            );
        }
    }, [isMovingUp, isMovingDown, isMoving]);

    // Actions
    const handleAction = (action, params = {}) => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        const service = action === 'stop' ? 'stop_cover'
            : action === 'open' ? 'open_cover'
            : action === 'set_cover_position' ? 'set_cover_position'
            : 'close_cover';

        if (action === 'open') {
            setPendingAction('opening');
            if (pendingTimeoutRef.current) clearTimeout(pendingTimeoutRef.current);
            pendingTimeoutRef.current = setTimeout(() => setPendingAction(null), 30000);
        } else if (action === 'close') {
            setPendingAction('closing');
            if (pendingTimeoutRef.current) clearTimeout(pendingTimeoutRef.current);
            pendingTimeoutRef.current = setTimeout(() => setPendingAction(null), 30000);
        } else {
            setPendingAction(null);
            if (pendingTimeoutRef.current) clearTimeout(pendingTimeoutRef.current);
        }
        onUpdate(cover.entity_id, 'cover', service, params);
    };

    // Pan gesture — identical to rollPanGesture
    // failOffsetX: fail if horizontal movement detected, so ScrollView can scroll
    const gesture = Gesture.Pan()
        .minDistance(5)
        .activeOffsetY([-10, 10])
        .failOffsetX([-5, 5])
        .onStart(() => {
            isDragging.value = true;
            dragStartPos.value = visualPos.value;
        })
        .onUpdate((e) => {
            const fh = frameHeight.value;
            if (fh <= 0) return;
            const delta = (-e.translationY / fh) * 100;
            visualPos.value = Math.max(0, Math.min(100, dragStartPos.value + delta));
        })
        .onEnd(() => {
            isDragging.value = false;
            runOnJS(handleAction)('set_cover_position', { position: Math.round(visualPos.value) });
        });

    // Panel height — exact copy of rollPanelStyle
    const shutterPanelStyle = useAnimatedStyle(() => {
        const fh = frameHeight.value;
        if (fh <= 0) return { height: 0 };
        const fraction = 1 - visualPos.value / 100;
        return { height: Math.max(18, fh * fraction) };
    });

    // Arrow overlay style
    const arrowAnimStyle = useAnimatedStyle(() => ({
        transform: [{ translateY: arrowTranslateY.value }],
        opacity: arrowOpacity.value,
    }));

    return (
        <View style={[curtainStyles.card, needsChange && { borderColor: '#8947ca', borderWidth: 2 }]}>
            {/* Window area — identical structure to curtain_roll */}
            <GestureDetector gesture={gesture}>
                <View
                    style={curtainStyles.windowArea}
                    onLayout={(e) => {
                        frameHeight.value = e.nativeEvent.layout.height - 4;
                    }}
                >
                    <LinearGradient
                        colors={['#ffffff', '#e5e7eb']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 0, y: 1 }}
                        style={curtainStyles.windowFrameGradient}
                    >
                        <View style={curtainStyles.windowFrame}>
                            {/* Dark static background */}
                            <View style={curtainStyles.staticBg} />

                            {/* Shutter panel — exact copy of roll curtain panel */}
                            <Animated.View style={[curtainStyles.rollPanel, shutterPanelStyle, { overflow: 'hidden' }]}>
                                {/* Horizontal gradient folds top-to-bottom */}
                                <View style={[StyleSheet.absoluteFill, { flexDirection: 'column' }]}>
                                    {[0, 1, 2, 3, 4].map(i => (
                                        <LinearGradient
                                            key={i}
                                            colors={i % 2 === 0
                                                ? ['#9f5ff5', '#5b21b6', '#7c3aed']
                                                : ['#6d28d9', '#a855f7', '#6d28d9']}
                                            start={{ x: 0, y: 0 }}
                                            end={{ x: 0, y: 1 }}
                                            style={{ flex: 1 }}
                                        />
                                    ))}
                                </View>
                                {/* Handle bar at bottom edge */}
                                <View style={curtainStyles.rollHandle}>
                                    <View style={[curtainStyles.handleBar, { width: 22, height: 3 }]} />
                                </View>
                            </Animated.View>

                            {/* Arrow overlay */}
                            {isMoving && (
                                <Animated.View style={[curtainStyles.arrowOverlay, arrowAnimStyle]} pointerEvents="none">
                                    {isMovingUp
                                        ? <ChevronUp size={40} color="rgba(255,255,255,0.85)" />
                                        : <ChevronDown size={40} color="rgba(255,255,255,0.85)" />}
                                </Animated.View>
                            )}
                        </View>
                    </LinearGradient>
                </View>
            </GestureDetector>

            {/* Name + Status — same as curtain */}
            <Text style={curtainStyles.name} numberOfLines={1}>{friendlyName}</Text>
            <Text style={curtainStyles.status}>
                {isMovingUp ? 'Opening...' : isMovingDown ? 'Closing...' : posText}
            </Text>
        </View>
    );
}

// ─── Curtain Card Styles ───
const curtainStyles = StyleSheet.create({
    card: {
        width: '100%',
        backgroundColor: 'transparent',
        borderRadius: 20,
        padding: 10,
        height: 180,
        alignItems: 'center',
        borderWidth: 0,
    },
    windowArea: {
        width: '100%',
        flex: 1,
        marginBottom: 4,
    },
    windowFrameGradient: {
        flex: 1,
        width: '100%',
        borderRadius: 9,
        padding: 2,
    },
    windowFrame: {
        flex: 1,
        borderRadius: 7,
        overflow: 'hidden',
        position: 'relative',
    },
    staticBg: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: '#1c1c1e',
    },
    rollPanel: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        overflow: 'hidden',
    },
    rollHandle: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: 10,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0,0,0,0.25)',
    },
    arrowOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10,
    },
    // Left half — for middle curtain's left panel arrow
    arrowOverlayLeft: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: '50%',
        bottom: 0,
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10,
    },
    // Right half — for middle curtain's right panel arrow
    arrowOverlayRight: {
        position: 'absolute',
        top: 0,
        left: '50%',
        right: 0,
        bottom: 0,
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10,
    },
    btnDisabled: {
        opacity: 0.3,
    },
    rollSlat: {
        height: 1,
        backgroundColor: 'rgba(0,0,0,0.25)',
    },
    panesGrid: {
        flex: 1,
    },
    paneRow: {
        flex: 1,
        flexDirection: 'row',
    },
    pane: {
        flex: 1,
        backgroundColor: '#1c1c1e',
    },
    paneDividerV: {
        width: 2,
        backgroundColor: '#7c3aed',
    },
    paneDividerH: {
        height: 2,
        backgroundColor: '#7c3aed',
    },
    panelLeft: {
        position: 'absolute',
        top: 0,
        left: 0,
        bottom: 0,
        overflow: 'hidden',
    },
    panelRight: {
        position: 'absolute',
        top: 0,
        right: 0,
        bottom: 0,
        overflow: 'hidden',
    },
    handleRight: {
        position: 'absolute',
        right: 0,
        top: 0,
        bottom: 0,
        width: 10,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0,0,0,0.25)',
    },
    handleLeft: {
        position: 'absolute',
        left: 0,
        top: 0,
        bottom: 0,
        width: 10,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0,0,0,0.25)',
    },
    handleBar: {
        width: 3,
        height: 22,
        borderRadius: 2,
        backgroundColor: 'rgba(255,255,255,0.8)',
    },
    /* fold lines — evenly distributed vertical stripes */
    foldLines: {
        ...StyleSheet.absoluteFillObject,
        flexDirection: 'row',
    },
    foldLine: {
        flex: 1,
    },
    /* subtle left-edge sheen for left panel */
    sheenLeft: {
        position: 'absolute',
        top: 0,
        bottom: 0,
        left: 0,
        width: 0,
    },
    /* subtle right-edge sheen for right panel */
    sheenRight: {
        position: 'absolute',
        top: 0,
        bottom: 0,
        right: 0,
        width: 0,
    },
    /* top sheen for roll panel */
    sheenTop: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 0,
    },
    name: {
        color: '#fff',
        fontSize: 13,
        fontWeight: '700',
        textAlign: 'left',
        marginBottom: 1,
        width: '100%',
    },
    status: {
        color: Colors.textDim,
        fontSize: 10,
        fontWeight: '500',
        textAlign: 'left',
        marginBottom: 4,
        width: '100%',
    },
    btnRow: {
        flexDirection: 'row',
        gap: 10,
        justifyContent: 'flex-start',
        alignItems: 'center',
        width: '100%',
    },
    btnImg: {
        width: 32,
        height: 32,
    },
    pauseBtn: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: 'rgba(109,40,217,0.3)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    pauseBtnActive: {
        backgroundColor: 'rgba(255, 152, 0, 0.25)',
    },
    pauseIcon: {
        flexDirection: 'row',
        gap: 3,
    },
    pauseBar: {
        width: 3,
        height: 11,
        backgroundColor: '#fff',
        borderRadius: 1,
    },
});

// ─── Shutter/Garage Styles ───
const shutterStyles = StyleSheet.create({
    container: {
        width: '100%',
        backgroundColor: 'transparent',
        borderRadius: 20,
        padding: 12,
        height: 180,
        flexDirection: 'column',
        borderWidth: 0,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 2,
    },
    name: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '700',
        textAlign: 'left',
    },
    statusText: {
        color: Colors.textDim,
        fontSize: 10,
        fontWeight: '500',
        textAlign: 'left',
        marginTop: 1,
        marginBottom: 4,
    },
    contentRow: {
        flex: 1,
        flexDirection: 'row',
        gap: 10,
        alignItems: 'stretch',
    },
    visualContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        position: 'relative',
    },
    windowFrameGradient: {
        flex: 1,
        width: '100%',
        borderRadius: 9,
        padding: 2,
    },
    windowFrame: {
        flex: 1,
        backgroundColor: 'transparent',
        borderRadius: 7,
        overflow: 'hidden',
        position: 'relative'
    },
    shutterFrame: {
        flex: 1,
    },
    staticBg: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: '#1c1c1e',
    },
    purplePanel: {
        width: '100%',
        height: '100%',
        backgroundColor: '#7c3aed',
    },
    shutterPanel: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        overflow: 'hidden',
        borderBottomLeftRadius: 8,
        borderBottomRightRadius: 8,
        minHeight: 12,
    },
    dragHandleBar: {
        height: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    panesGrid: {
        ...StyleSheet.absoluteFillObject,
        flexDirection: 'column',
    },
    slatOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.05)'
    },
    floatingBadge: {
        position: 'absolute',
        top: 0,
        left: '50%',
        marginLeft: -16,
        width: 32,
        height: 32,
        backgroundColor: 'rgba(0,0,0,0.75)',
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 20,
        borderColor: 'rgba(109,40,217,0.6)',
        borderWidth: 1,
        gap: 5,
    },
    dragHandleLine: {
        width: 16,
        height: 2,
        borderRadius: 1,
        backgroundColor: 'rgba(255,255,255,0.7)',
    },
    controlsCol: {
        width: 44,
        justifyContent: 'space-between',
        alignItems: 'stretch',
        gap: 8,
    },
    ctrlBtn: {
        flex: 1,
        width: '100%',
        borderRadius: 12,
        backgroundColor: 'rgba(109,40,217,0.2)',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: 'rgba(109,40,217,0.4)'
    },
    activeBtn: {
        flex: 1,
        width: '100%',
        borderRadius: 12,
        backgroundColor: 'rgba(255, 152, 0, 0.15)',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255, 152, 0, 0.5)'
    },
    arrowOverlay: {
        ...StyleSheet.absoluteFillObject,
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 5
    }
});
