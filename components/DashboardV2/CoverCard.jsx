import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { ChevronUp, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { Colors } from '../../constants/Colors';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
    useSharedValue, useAnimatedStyle, withTiming, Easing, withRepeat, runOnJS, cancelAnimation,
} from 'react-native-reanimated';
import { useEffect, useState, useRef, useMemo, useCallback, memo } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Rect } from 'react-native-svg';
import {
    getCoverVisualStyle,
    PLEAT_BAR_WIDTH,
    COVER_BORDER_WIDTH,
    COVER_BORDER_GRADIENT,
} from '../../utils/coverVisualStyle';
import { resolveCoverType, getCoverControlIcons, VERTICAL_COVER_TYPES } from '../../utils/coverControls';
import { coversInStackOrder } from '../../utils/coverWindows';
import CoverWindowSky from './CoverWindowSky';

function readCoverPosition(cover) {
    const attrs = cover.stateObj?.attributes || {};
    const state = cover.stateObj?.state || 'closed';
    if (attrs.current_position !== undefined) return attrs.current_position;
    return state === 'open' ? 100 : 0;
}

const SLAT_BAR_HEIGHT = PLEAT_BAR_WIDTH;

/** In-window chevron / control sizing */
const WINDOW_ARROW_MIDDLE = 44;
const WINDOW_ARROW_SINGLE = 52;
const POSITION_SYNC_MS = 280;
const FALLBACK_PLEAT_WIDTH = 280;
const FALLBACK_SLAT_HEIGHT = 220;
const PLEAT_GRADIENT_LOCATIONS = [0.38, 0.5, 0.62];

/** Vertical pleat rib — soft 3-stop shading (no white highlight stripe) */
const PleatBar = memo(function PleatBar({ barWidth, colors }) {
    return (
        <View style={{ width: barWidth, height: '100%' }}>
            <LinearGradient
                colors={colors}
                locations={PLEAT_GRADIENT_LOCATIONS}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={StyleSheet.absoluteFill}
            />
        </View>
    );
});

/** Shutter slat — soft 3-stop vertical shading */
const SlatBar = memo(function SlatBar({ barHeight, colors }) {
    return (
        <View style={{ height: barHeight, width: '100%' }}>
            <LinearGradient
                colors={colors}
                locations={PLEAT_GRADIENT_LOCATIONS}
                start={{ x: 0.5, y: 0 }}
                end={{ x: 0.5, y: 1 }}
                style={StyleSheet.absoluteFill}
            />
        </View>
    );
});

const CHEVRON_BY_DIR = {
    up: ChevronUp,
    down: ChevronDown,
    left: ChevronLeft,
    right: ChevronRight,
};

/** Figma: curtains → ←/→, shutter/roll/garage → ↓/↑ */
function CoverControlButtons({ coverType, isOpen, onClose, onOpen, inline = false }) {
    const icons = useMemo(() => getCoverControlIcons(coverType, isOpen), [coverType, isOpen]);
    const CloseIcon = CHEVRON_BY_DIR[icons.close];
    const OpenIcon = CHEVRON_BY_DIR[icons.open];

    return (
        <View style={[curtainStyles.btnRow, inline && curtainStyles.btnRowInline]}>
            <TouchableOpacity
                style={curtainStyles.ctrlBtn}
                onPress={onClose}
                activeOpacity={0.75}
                accessibilityRole="button"
                accessibilityLabel="Close cover"
            >
                <CloseIcon size={20} color="rgba(255,255,255,0.9)" strokeWidth={2.5} />
            </TouchableOpacity>
            <TouchableOpacity
                style={curtainStyles.ctrlBtn}
                onPress={onOpen}
                activeOpacity={0.75}
                accessibilityRole="button"
                accessibilityLabel="Open cover"
            >
                <OpenIcon size={20} color="rgba(255,255,255,0.9)" strokeWidth={2.5} />
            </TouchableOpacity>
        </View>
    );
}

/** Cover name + status on the left, open/close controls on the right */
function CoverCardFooter({ name, status, coverType, isOpen, onClose, onOpen }) {
    return (
        <View style={curtainStyles.footerRow}>
            <View style={curtainStyles.footerTextCol}>
                <Text style={curtainStyles.name} numberOfLines={1}>{name}</Text>
                <Text style={curtainStyles.status}>{status}</Text>
            </View>
            <CoverControlButtons
                coverType={coverType}
                isOpen={isOpen}
                onClose={onClose}
                onOpen={onOpen}
                inline
            />
        </View>
    );
}

/** Figma — repeating vertical ribs, soft shading only (no divider lines) */
/**
 * Fixed-width pleat strip — sized to max panel width once so drag only clips,
 * without onLayout/setState on every animated resize (major drag lag fix).
 */
function VerticalPleatBars({ visual, extentWidth, alignRight = false }) {
    const barWidth = visual.pleatBarWidth ?? PLEAT_BAR_WIDTH;
    const colors = visual.pleatBarColors ?? ['#4A6A8A', '#7EC4F0', '#4A6A8A'];
    const w = extentWidth > 0 ? extentWidth : FALLBACK_PLEAT_WIDTH;
    const barCount = Math.ceil(w / barWidth) + 2;

    const bars = useMemo(
        () => Array.from({ length: barCount }, (_, i) => (
            <PleatBar key={i} barWidth={barWidth} colors={colors} />
        )),
        [barCount, barWidth, colors],
    );

    return (
        <View
            style={[
                curtainStyles.pleatStripAnchor,
                alignRight ? curtainStyles.pleatStripAnchorRight : curtainStyles.pleatStripAnchorLeft,
                { width: w },
            ]}
            pointerEvents="none"
        >
            {bars}
        </View>
    );
}

/** Figma shutter — fixed-height slat stack, clipped while panel height animates */
function ShutterSlats({ visual, extentHeight }) {
    const barHeight = visual.pleatBarWidth ?? SLAT_BAR_HEIGHT;
    const colors = visual.pleatBarColors ?? ['#3588BE', '#4298CE', '#3588BE'];
    const h = extentHeight > 0 ? extentHeight : FALLBACK_SLAT_HEIGHT;
    const slatCount = Math.ceil(h / barHeight) + 2;

    const slats = useMemo(
        () => Array.from({ length: slatCount }, (_, i) => (
            <SlatBar key={i} barHeight={barHeight} colors={colors} />
        )),
        [slatCount, barHeight, colors],
    );

    return (
        <View style={[curtainStyles.slatStripAnchor, { height: h }]} pointerEvents="none">
            {slats}
        </View>
    );
}

/** Fabric slats / folds — fixed-size Figma ribs */
const CoverFabricFolds = memo(function CoverFabricFolds({
    visual, layout = 'columns', extentWidth = 0, extentHeight = 0, alignRight = false,
}) {
    const foldStyle = visual?.foldStyle;

    if (foldStyle === 'slats') {
        return <ShutterSlats visual={visual} extentHeight={extentHeight} />;
    }
    return <VerticalPleatBars visual={visual} extentWidth={extentWidth} alignRight={alignRight} />;
});

/** White pill handle — vertical for curtains, horizontal for shutters */
function CoverHandle({ variant = 'vertical', style }) {
    if (variant === 'horizontal') {
        return (
            <View style={[curtainStyles.shutterHandlePill, style]}>
                <View style={curtainStyles.shutterHandleInner} />
            </View>
        );
    }
    return <View style={[curtainStyles.chiffonHandleBar, style]} />;
}

/** Figma — 2px gradient border (180deg #E5E5E5 → #7F7F7F) */
function CoverGradientBorder({ children, style, borderRadius = 12 }) {
    const innerRadius = Math.max(0, borderRadius - COVER_BORDER_WIDTH);
    return (
        <LinearGradient
            colors={COVER_BORDER_GRADIENT}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={[{ borderRadius, padding: COVER_BORDER_WIDTH, flex: 1 }, style]}
        >
            <View style={{ flex: 1, borderRadius: innerRadius, overflow: 'hidden', position: 'relative' }}>
                {children}
            </View>
        </LinearGradient>
    );
}

/** Two inner lines forming a + (one vertical, one horizontal) */
function WindowCrossLines() {
    return (
        <View style={curtainStyles.windowCross} pointerEvents="none">
            <LinearGradient
                colors={COVER_BORDER_GRADIENT}
                start={{ x: 0.5, y: 0 }}
                end={{ x: 0.5, y: 1 }}
                style={curtainStyles.windowCrossV}
            />
            <LinearGradient
                colors={COVER_BORDER_GRADIENT}
                start={{ x: 0.5, y: 0 }}
                end={{ x: 0.5, y: 1 }}
                style={curtainStyles.windowCrossH}
            />
        </View>
    );
}

/**
 * Figma pleats + original window structure:
 * one gradient border, sky/panes inside, side panels, center gap reveals window.
 */
function WindowPleatCoverView({
    visual,
    weather,
    isMiddle,
    showLeft,
    showRight,
    isRight,
    isMoving,
    isMovingUp,
    arrowAnimStyle,
    arrowAnimStyle2,
    leftPanelStyle,
    rightPanelStyle,
    fabricPanelWidth = 0,
}) {
    const panelOpacity = visual.panelOpacity ?? 1;

    const renderSidePanel = (handleSide, panelStyle, absoluteSide) => {
        const inner = (
            <>
                <CoverFabricFolds
                    visual={visual}
                    extentWidth={fabricPanelWidth}
                    alignRight={handleSide === 'left'}
                />
                <View style={handleSide === 'right' ? windowPleatStyles.handleRight : windowPleatStyles.handleLeft}>
                    <CoverHandle variant="vertical" />
                </View>
            </>
        );

        if (panelStyle) {
            return (
                <Animated.View style={[windowPleatStyles.sidePanelAbs, absoluteSide, panelStyle, { opacity: panelOpacity }]}>
                    {inner}
                </Animated.View>
            );
        }

        return (
            <View style={[windowPleatStyles.sidePanel, { opacity: panelOpacity }]}>
                {inner}
            </View>
        );
    };

    return (
        <CoverGradientBorder style={windowPleatStyles.outer} borderRadius={14}>
            <View style={windowPleatStyles.frame}>
                <CoverWindowSky weather={weather} />
                <WindowCrossLines />

                {showLeft && renderSidePanel('right', leftPanelStyle, windowPleatStyles.panelLeftAbs)}
                {showRight && renderSidePanel('left', rightPanelStyle, windowPleatStyles.panelRightAbs)}

                {isMiddle && isMoving && (
                    <>
                        <Animated.View style={[curtainStyles.arrowOverlayLeft, arrowAnimStyle]} pointerEvents="none">
                            {isMovingUp
                                ? <ChevronLeft size={WINDOW_ARROW_MIDDLE} color="rgba(255,255,255,0.85)" />
                                : <ChevronRight size={WINDOW_ARROW_MIDDLE} color="rgba(255,255,255,0.85)" />}
                        </Animated.View>
                        <Animated.View style={[curtainStyles.arrowOverlayRight, arrowAnimStyle2]} pointerEvents="none">
                            {isMovingUp
                                ? <ChevronRight size={WINDOW_ARROW_MIDDLE} color="rgba(255,255,255,0.85)" />
                                : <ChevronLeft size={WINDOW_ARROW_MIDDLE} color="rgba(255,255,255,0.85)" />}
                        </Animated.View>
                    </>
                )}

                {!isMiddle && isMoving && (
                    <Animated.View style={[curtainStyles.arrowOverlay, arrowAnimStyle]} pointerEvents="none">
                        {isRight
                            ? (isMovingUp
                                ? <ChevronRight size={WINDOW_ARROW_SINGLE} color="rgba(255,255,255,0.85)" />
                                : <ChevronLeft size={WINDOW_ARROW_SINGLE} color="rgba(255,255,255,0.85)" />)
                            : (isMovingUp
                                ? <ChevronLeft size={WINDOW_ARROW_SINGLE} color="rgba(255,255,255,0.85)" />
                                : <ChevronRight size={WINDOW_ARROW_SINGLE} color="rgba(255,255,255,0.85)" />)}
                    </Animated.View>
                )}

            </View>
        </CoverGradientBorder>
    );
}

const windowPleatStyles = StyleSheet.create({
    outer: {
        flex: 1,
        width: '100%',
    },
    frame: {
        flex: 1,
        position: 'relative',
        overflow: 'hidden',
        backgroundColor: '#1a1a22',
    },
    sidePanel: {
        flex: 1,
        overflow: 'hidden',
        position: 'relative',
    },
    sidePanelAbs: {
        position: 'absolute',
        top: 0,
        bottom: 0,
        overflow: 'hidden',
        zIndex: 2,
    },
    panelLeftAbs: {
        left: 0,
    },
    panelRightAbs: {
        right: 0,
    },
    handleRight: {
        position: 'absolute',
        right: 3,
        top: '38%',
        bottom: '38%',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 8,
    },
    handleLeft: {
        position: 'absolute',
        left: 3,
        top: '38%',
        bottom: '38%',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 8,
    },
});

/** One fabric layer in the All tab stack — z-order: chiffon → blackout → shutter. */
function StackedCoverLayer({
    cover, zIndex, frameWidth, frameHeight, syncPosition, isDragging, groupDraggingRef,
    fabricPanelWidth, fabricPanelHeight,
}) {
    const visual = useMemo(() => getCoverVisualStyle(cover), [
        cover.displayName,
        cover.coverType,
        cover.coverLayer,
        cover.entity_id,
        cover.stateObj?.attributes?.friendly_name,
    ]);
    const coverType = resolveCoverType(cover);
    const isVertical = VERTICAL_COVER_TYPES.includes(coverType) || coverType === 'curtain_roll';
    const isMiddle = coverType === 'curtain_middle';
    const isRight = coverType === 'curtain_right';
    const showLeft = isMiddle || !isRight;
    const showRight = isMiddle || isRight;
    const currentPosition = readCoverPosition(cover);
    const ownPos = useSharedValue(currentPosition);

    useEffect(() => {
        if (groupDraggingRef.current) return;
        cancelAnimation(ownPos);
        ownPos.value = withTiming(currentPosition, { duration: POSITION_SYNC_MS, easing: Easing.out(Easing.cubic) });
    }, [currentPosition, groupDraggingRef]);

    const panelOpacity = visual.panelOpacity ?? 1;

    const leftPanelStyle = useAnimatedStyle(() => {
        const fw = frameWidth.value;
        if (fw <= 0) return { width: 0 };
        const pos = isDragging.value ? syncPosition.value : ownPos.value;
        const maxW = isMiddle ? fw * 0.5 : fw;
        const fraction = Math.max(0.08, 1 - pos / 100);
        return { width: maxW * fraction };
    });

    const rightPanelStyle = useAnimatedStyle(() => {
        const fw = frameWidth.value;
        if (fw <= 0) return { width: 0 };
        const pos = isDragging.value ? syncPosition.value : ownPos.value;
        const maxW = isMiddle ? fw * 0.5 : fw;
        const fraction = Math.max(0.08, 1 - pos / 100);
        return { width: maxW * fraction };
    });

    const rollPanelStyle = useAnimatedStyle(() => {
        const fh = frameHeight.value;
        if (fh <= 0) return { height: 0 };
        const pos = isDragging.value ? syncPosition.value : ownPos.value;
        const fraction = 1 - pos / 100;
        return { height: Math.max(18, fh * fraction) };
    });

    const layerBase = { zIndex, opacity: panelOpacity, overflow: 'hidden' };

    if (isVertical || visual.variant === 'shutter') {
        return (
            <Animated.View style={[curtainStyles.rollPanel, rollPanelStyle, layerBase]}>
                <CoverFabricFolds visual={visual} layout="rows" extentHeight={fabricPanelHeight} />
                <View style={curtainStyles.shutterHandleWrap}>
                    <CoverHandle variant="horizontal" />
                </View>
            </Animated.View>
        );
    }

    return (
        <>
            {showLeft && (
                <Animated.View style={[windowPleatStyles.sidePanelAbs, windowPleatStyles.panelLeftAbs, leftPanelStyle, layerBase]}>
                    <CoverFabricFolds visual={visual} extentWidth={fabricPanelWidth} />
                    <View style={windowPleatStyles.handleRight}>
                        <CoverHandle variant="vertical" />
                    </View>
                </Animated.View>
            )}
            {showRight && (
                <Animated.View style={[windowPleatStyles.sidePanelAbs, windowPleatStyles.panelRightAbs, rightPanelStyle, layerBase]}>
                    <CoverFabricFolds visual={visual} extentWidth={fabricPanelWidth} alignRight />
                    <View style={windowPleatStyles.handleLeft}>
                        <CoverHandle variant="vertical" />
                    </View>
                </Animated.View>
            )}
        </>
    );
}

/**
 * All tab — stacked layers (chiffon inside, shutter outside).
 * Open/drag controls every cover on the window together.
 */
export function AllLayersCoverCard({
    covers, windowName, weather, onUpdate, onSliderDragStart, onSliderDragEnd,
}) {
    const stackedCovers = useMemo(() => coversInStackOrder(covers), [covers]);
    const frameWidth = useSharedValue(0);
    const frameHeight = useSharedValue(0);
    const syncPosition = useSharedValue(0);
    const isDragging = useSharedValue(false);
    const dragStartPos = useSharedValue(0);

    const positions = useMemo(() => covers.map(readCoverPosition), [covers]);
    const avgPosition = positions.length
        ? Math.round(positions.reduce((s, p) => s + p, 0) / positions.length)
        : 0;

    const [pendingAction, setPendingAction] = useState(null);
    const groupDraggingRef = useRef(false);
    const [fabricExtents, setFabricExtents] = useState({ w: 0, h: 0 });
    const pendingTimeoutRef = useRef(null);

    const setGroupDraggingFlag = useCallback((active) => {
        groupDraggingRef.current = active;
    }, []);

    const anyOpening = covers.some(c => c.stateObj?.state === 'opening') || pendingAction === 'opening';
    const anyClosing = covers.some(c => c.stateObj?.state === 'closing') || pendingAction === 'closing';
    const isMovingUp = anyOpening;
    const isMovingDown = anyClosing;
    const isMoving = isMovingUp || isMovingDown;
    const isOpen = avgPosition >= 5;

    useEffect(() => {
        if (groupDraggingRef.current) return;
        cancelAnimation(syncPosition);
        syncPosition.value = withTiming(avgPosition, { duration: POSITION_SYNC_MS, easing: Easing.out(Easing.cubic) });
    }, [avgPosition]);

    useEffect(() => {
        if (!pendingAction) return;
        const allSettled = covers.every(c => {
            const s = c.stateObj?.state;
            return s === 'open' || s === 'closed';
        });
        if (allSettled) {
            setPendingAction(null);
            if (pendingTimeoutRef.current) clearTimeout(pendingTimeoutRef.current);
        }
    }, [covers, pendingAction]);

    const onUpdateAll = useCallback((_entityId, domain, service, params) => {
        covers.forEach(c => onUpdate?.(c.entity_id, domain, service, params));
    }, [covers, onUpdate]);

    const handleAction = useCallback((action, params = {}) => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
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
        onUpdateAll(null, 'cover', action === 'open' ? 'open_cover' : action === 'close' ? 'close_cover' : action === 'set_cover_position' ? 'set_cover_position' : 'stop_cover', params);
    }, [onUpdateAll]);

    const arrowTranslateX = useSharedValue(0);
    const arrowTranslateX2 = useSharedValue(0);
    const arrowOpacity = useSharedValue(0);

    useEffect(() => {
        if (!isMoving) {
            arrowOpacity.value = withTiming(0, { duration: 300 });
            arrowTranslateX.value = 0;
            arrowTranslateX2.value = 0;
            return;
        }
        arrowOpacity.value = withTiming(1, { duration: 200 });
        if (isMovingUp) {
            arrowTranslateX.value = withRepeat(withTiming(-18, { duration: 600, easing: Easing.inOut(Easing.ease) }), -1, true);
            arrowTranslateX2.value = withRepeat(withTiming(18, { duration: 600, easing: Easing.inOut(Easing.ease) }), -1, true);
        } else {
            arrowTranslateX.value = withRepeat(withTiming(18, { duration: 600, easing: Easing.inOut(Easing.ease) }), -1, true);
            arrowTranslateX2.value = withRepeat(withTiming(-18, { duration: 600, easing: Easing.inOut(Easing.ease) }), -1, true);
        }
    }, [isMovingUp, isMovingDown, isMoving]);

    const arrowAnimStyle = useAnimatedStyle(() => ({
        transform: [{ translateX: arrowTranslateX.value }],
        opacity: arrowOpacity.value,
    }));
    const arrowAnimStyle2 = useAnimatedStyle(() => ({
        transform: [{ translateX: arrowTranslateX2.value }],
        opacity: arrowOpacity.value,
    }));

    const panGesture = Gesture.Pan()
        .minDistance(5)
        .activeOffsetX([-10, 10])
        .failOffsetY([-5, 5])
        .onStart(() => {
            cancelAnimation(syncPosition);
            isDragging.value = true;
            dragStartPos.value = syncPosition.value;
            runOnJS(setGroupDraggingFlag)(true);
            if (onSliderDragStart) runOnJS(onSliderDragStart)();
        })
        .onUpdate((e) => {
            const fw = frameWidth.value;
            if (fw <= 0) return;
            const maxW = fw * 0.5;
            const delta = (e.translationX / maxW) * 100;
            syncPosition.value = Math.max(0, Math.min(100, dragStartPos.value + delta));
        })
        .onEnd(() => {
            isDragging.value = false;
            runOnJS(setGroupDraggingFlag)(false);
            if (onSliderDragEnd) runOnJS(onSliderDragEnd)();
            runOnJS(handleAction)('set_cover_position', { position: Math.round(syncPosition.value) });
        });

    const tapGesture = Gesture.Tap().onEnd((e) => {
        const fw = frameWidth.value;
        if (fw <= 0) return;
        const halfW = fw * 0.5;
        const distFromEdge = Math.min(e.x, fw - e.x);
        const newPos = Math.max(0, Math.min(100, Math.round((distFromEdge / halfW) * 100)));
        syncPosition.value = withTiming(newPos, { duration: 400 });
        runOnJS(handleAction)('set_cover_position', { position: newPos });
    });

    const gesture = Gesture.Simultaneous(panGesture, tapGesture);

    const statusText = isMovingUp ? 'Opening...' : isMovingDown ? 'Closing...' : (
        avgPosition < 5 ? 'Closed' : avgPosition >= 95 ? 'Opened 100%' : `Opened ${avgPosition}%`
    );
    const displayName = windowName ? `${windowName} · All` : 'All layers';

    if (!stackedCovers.length) return null;

    return (
        <View style={curtainStyles.card}>
            <GestureDetector gesture={gesture}>
                <View
                    style={curtainStyles.windowArea}
                    onLayout={(e) => {
                        const w = e.nativeEvent.layout.width - 4;
                        const h = e.nativeEvent.layout.height - 4;
                        frameWidth.value = w;
                        frameHeight.value = h;
                        setFabricExtents({
                            w: Math.ceil(w * 0.5),
                            h: Math.ceil(h),
                        });
                    }}
                >
                    <CoverGradientBorder style={windowPleatStyles.outer} borderRadius={14}>
                        <View style={windowPleatStyles.frame}>
                            <CoverWindowSky weather={weather} />
                            <WindowCrossLines />
                            {stackedCovers.map((cover, i) => (
                                <StackedCoverLayer
                                    key={cover.entity_id}
                                    cover={cover}
                                    zIndex={i + 2}
                                    frameWidth={frameWidth}
                                    frameHeight={frameHeight}
                                    syncPosition={syncPosition}
                                    isDragging={isDragging}
                                    groupDraggingRef={groupDraggingRef}
                                    fabricPanelWidth={fabricExtents.w}
                                    fabricPanelHeight={fabricExtents.h}
                                />
                            ))}
                            {isMoving && (
                                <>
                                    <Animated.View style={[curtainStyles.arrowOverlayLeft, arrowAnimStyle]} pointerEvents="none">
                                        {isMovingUp
                                            ? <ChevronLeft size={WINDOW_ARROW_MIDDLE} color="rgba(255,255,255,0.85)" />
                                            : <ChevronRight size={WINDOW_ARROW_MIDDLE} color="rgba(255,255,255,0.85)" />}
                                    </Animated.View>
                                    <Animated.View style={[curtainStyles.arrowOverlayRight, arrowAnimStyle2]} pointerEvents="none">
                                        {isMovingUp
                                            ? <ChevronRight size={WINDOW_ARROW_MIDDLE} color="rgba(255,255,255,0.85)" />
                                            : <ChevronLeft size={WINDOW_ARROW_MIDDLE} color="rgba(255,255,255,0.85)" />}
                                    </Animated.View>
                                </>
                            )}
                        </View>
                    </CoverGradientBorder>
                </View>
            </GestureDetector>
            <CoverCardFooter
                name={displayName}
                status={statusText}
                coverType="curtain_middle"
                isOpen={isOpen}
                onClose={() => handleAction('close')}
                onOpen={() => handleAction('open')}
            />
        </View>
    );
}

// ── Cover type classification ──────────────────────────────────────────────────
export default function CoverCard({
    cover, sensor, weather, onUpdate, needsChange, onSliderDragStart, onSliderDragEnd,
}) {
    if (!cover) return null;

    const coverType = resolveCoverType(cover);
    const isHorizontal = !VERTICAL_COVER_TYPES.includes(coverType);

    if (isHorizontal) {
        return (
            <HorizontalCurtainCard
                cover={cover}
                sensor={sensor}
                weather={weather}
                onUpdate={onUpdate}
                needsChange={needsChange}
                onSliderDragStart={onSliderDragStart}
                onSliderDragEnd={onSliderDragEnd}
            />
        );
    }

    return (
        <VerticalShutterCard
            cover={cover}
            sensor={sensor}
            weather={weather}
            onUpdate={onUpdate}
            needsChange={needsChange}
            onSliderDragStart={onSliderDragStart}
            onSliderDragEnd={onSliderDragEnd}
        />
    );
}

// ─── Horizontal Curtain Card ──────────────────────────────────────────────────
// curtain_middle, curtain_left, curtain_right → animated window panels
// curtain_roll → roll-down animated panel
// Action buttons on BOTTOM
function HorizontalCurtainCard({ cover, sensor, weather, onUpdate, needsChange, onSliderDragStart, onSliderDragEnd }) {
    const { attributes, state } = cover.stateObj;
    const visual = useMemo(() => getCoverVisualStyle(cover), [
        cover.displayName,
        cover.coverType,
        cover.coverLayer,
        cover.entity_id,
        cover.stateObj?.attributes?.friendly_name,
    ]);
    const currentPosition = attributes.current_position !== undefined
        ? attributes.current_position
        : (state === 'open' ? 100 : 0);
    const friendlyName = cover.displayName || "";
    const coverType = resolveCoverType(cover);
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
    const isDraggingRef = useRef(false);
    const [fabricExtents, setFabricExtents] = useState({ w: 0, h: 0 });

    const setDraggingFlag = useCallback((active) => {
        isDraggingRef.current = active;
    }, []);

    // Arrow animation for opening/closing indicator
    const arrowTranslateX = useSharedValue(0);   // left arrow (or single arrow)
    const arrowTranslateX2 = useSharedValue(0);  // right arrow (middle curtain only)
    const arrowOpacity = useSharedValue(0);

    useEffect(() => {
        if (isDraggingRef.current) return;
        const validPos = isNaN(currentPosition) || currentPosition === null ? 0 : currentPosition;
        if (Math.abs(visualPos.value - validPos) < 0.5) return;
        cancelAnimation(visualPos);
        visualPos.value = withTiming(validPos, { duration: POSITION_SYNC_MS, easing: Easing.out(Easing.cubic) });
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
            cancelAnimation(visualPos);
            isDragging.value = true;
            dragStartPos.value = visualPos.value;
            runOnJS(setDraggingFlag)(true);
            if (onSliderDragStart) runOnJS(onSliderDragStart)();
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
            runOnJS(setDraggingFlag)(false);
            if (onSliderDragEnd) runOnJS(onSliderDragEnd)();
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
            cancelAnimation(visualPos);
            isDragging.value = true;
            dragStartPos.value = visualPos.value;
            runOnJS(setDraggingFlag)(true);
            if (onSliderDragStart) runOnJS(onSliderDragStart)();
        })
        .onUpdate((e) => {
            const fh = frameHeight.value;
            if (fh <= 0) return;
            const delta = (-e.translationY / fh) * 100;
            visualPos.value = Math.max(0, Math.min(100, dragStartPos.value + delta));
        })
        .onEnd(() => {
            isDragging.value = false;
            runOnJS(setDraggingFlag)(false);
            if (onSliderDragEnd) runOnJS(onSliderDragEnd)();
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

    const posText = currentPosition < 5
        ? 'Closed'
        : currentPosition >= 95
            ? 'Opened 100%'
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

    const isShutterVisual = visual.variant === 'shutter';
    const useSimpleView = visual.useSimpleView === true;
    const showWindowGrid = visual.showWindowGrid !== false;

    const shutterPanelStyle = useAnimatedStyle(() => {
        const fh = frameHeight.value;
        if (fh <= 0) return { height: 0 };
        const fraction = 1 - visualPos.value / 100;
        return { height: Math.max(18, fh * fraction) };
    });

    const statusText = isMovingUp ? 'Opening...' : isMovingDown ? 'Closing...' : posText;

    return (
        <View style={[curtainStyles.card, needsChange && { borderColor: '#8947ca', borderWidth: 2 }]}>
            {/* Window + Curtain Visual — entire area is draggable */}
            <GestureDetector gesture={isRoll || isShutterVisual ? rollGesture : curtainGesture}>
            <View
                style={curtainStyles.windowArea}
                onLayout={(e) => {
                    const w = e.nativeEvent.layout.width - 4;
                    const h = e.nativeEvent.layout.height - 4;
                    frameWidth.value = w;
                    frameHeight.value = h;
                    setFabricExtents({
                        w: Math.ceil(isMiddle ? w * 0.5 : w),
                        h: Math.ceil(h),
                    });
                }}
            >
                {useSimpleView ? (
                    <WindowPleatCoverView
                        visual={visual}
                        weather={weather}
                        isMiddle={isMiddle}
                        showLeft={showLeftPanel}
                        showRight={showRightPanel}
                        isRight={isRight}
                        isMoving={isMoving}
                        isMovingUp={isMovingUp}
                        arrowAnimStyle={arrowAnimStyle}
                        arrowAnimStyle2={arrowAnimStyle2}
                        leftPanelStyle={leftPanelStyle}
                        rightPanelStyle={rightPanelStyle}
                        fabricPanelWidth={fabricExtents.w}
                    />
                ) : (
                <View style={[
                    curtainStyles.windowFrameBorder,
                    { borderColor: visual.frameBorder || 'rgba(255,255,255,0.28)' },
                ]}>
                <View style={curtainStyles.windowFrame}>
                    {isRoll || isShutterVisual ? (
                        <>
                            {!isRoll && !showWindowGrid && (
                                <View style={curtainStyles.solidFrameBg} />
                            )}
                            {(isRoll || showWindowGrid) && <CoverWindowSky weather={weather} />}
                            <Animated.View style={[
                                curtainStyles.rollPanel,
                                isRoll ? rollPanelStyle : shutterPanelStyle,
                                { overflow: 'hidden', opacity: visual.panelOpacity },
                            ]}>
                                <CoverFabricFolds visual={visual} layout="rows" extentHeight={fabricExtents.h} />
                                <View style={isShutterVisual ? curtainStyles.shutterHandleWrap : curtainStyles.rollHandle}>
                                    <CoverHandle variant="horizontal" />
                                </View>
                            </Animated.View>
                        </>
                    ) : (
                        <>
                            {!showWindowGrid && (
                                <View style={curtainStyles.solidFrameBg} />
                            )}
                            {showWindowGrid && <CoverWindowSky weather={weather} />}
                            {showWindowGrid && <WindowCrossLines />}

                            {showLeftPanel && (
                                <Animated.View style={[curtainStyles.panelLeft, leftPanelStyle, { overflow: 'hidden', opacity: visual.panelOpacity }]}>
                                    <CoverFabricFolds visual={visual} layout="columns" extentWidth={fabricExtents.w} />
                                    <View style={curtainStyles.handleRight}>
                                        <CoverHandle variant="vertical" />
                                    </View>
                                </Animated.View>
                            )}

                            {showRightPanel && (
                                <Animated.View style={[curtainStyles.panelRight, rightPanelStyle, { overflow: 'hidden', opacity: visual.panelOpacity }]}>
                                    <CoverFabricFolds
                                        visual={{
                                            ...visual,
                                            stripeEven: visual.stripeOdd,
                                            stripeOdd: visual.stripeEven,
                                        }}
                                        layout="columns"
                                        extentWidth={fabricExtents.w}
                                        alignRight
                                    />
                                    <View style={curtainStyles.handleLeft}>
                                        <CoverHandle variant="vertical" />
                                    </View>
                                </Animated.View>
                            )}
                        </>
                    )}

                    {!useSimpleView && isMoving && (
                        isMiddle ? (
                            <>
                                <Animated.View style={[curtainStyles.arrowOverlayLeft, arrowAnimStyle]} pointerEvents="none">
                                    {isMovingUp
                                        ? <ChevronLeft size={32} color="rgba(255,255,255,0.85)" />
                                        : <ChevronRight size={32} color="rgba(255,255,255,0.85)" />}
                                </Animated.View>
                                <Animated.View style={[curtainStyles.arrowOverlayRight, arrowAnimStyle2]} pointerEvents="none">
                                    {isMovingUp
                                        ? <ChevronRight size={32} color="rgba(255,255,255,0.85)" />
                                        : <ChevronLeft size={32} color="rgba(255,255,255,0.85)" />}
                                </Animated.View>
                            </>
                        ) : isRoll ? (
                            <Animated.View style={[curtainStyles.arrowOverlay, arrowAnimStyle]} pointerEvents="none">
                                {isMovingUp
                                    ? <ChevronUp size={40} color="rgba(255,255,255,0.85)" />
                                    : <ChevronDown size={40} color="rgba(255,255,255,0.85)" />}
                            </Animated.View>
                        ) : (
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
                </View>
                )}
            </View>
            </GestureDetector>

            <CoverCardFooter
                name={friendlyName}
                status={statusText}
                coverType={coverType}
                isOpen={currentPosition >= 5}
                onClose={() => handleAction('close')}
                onOpen={() => handleAction('open')}
            />
        </View>
    );
}

// ─── Vertical Shutter/Garage Card ────────────────────────────────────────────
// Same logic & design as curtain_roll — panel drops from top
function VerticalShutterCard({ cover, sensor, weather, onUpdate, needsChange, onSliderDragStart, onSliderDragEnd }) {
    const { attributes, state } = cover.stateObj;
    const visual = useMemo(() => getCoverVisualStyle(cover), [
        cover.displayName,
        cover.coverType,
        cover.coverLayer,
        cover.entity_id,
        cover.stateObj?.attributes?.friendly_name,
    ]);
    const currentPosition = attributes.current_position !== undefined ? attributes.current_position : (state === 'open' ? 100 : 0);
    const friendlyName = cover.displayName || "";
    const coverType = resolveCoverType(cover);

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

    const posText = currentPosition < 5
        ? 'Closed'
        : currentPosition >= 95
            ? 'Opened 100%'
            : `Opened ${Math.round(currentPosition)}%`;

    // Shared values — mirrors roll curtain exactly
    const visualPos = useSharedValue(currentPosition);
    const frameHeight = useSharedValue(0);
    const isDragging = useSharedValue(false);
    const dragStartPos = useSharedValue(0);
    const isDraggingRef = useRef(false);
    const [fabricPanelHeight, setFabricPanelHeight] = useState(0);
    const arrowTranslateY = useSharedValue(0);
    const arrowOpacity = useSharedValue(0);

    const setDraggingFlag = useCallback((active) => {
        isDraggingRef.current = active;
    }, []);

    // Sync from HA (skip while dragging)
    useEffect(() => {
        if (isDraggingRef.current) return;
        const validPos = isNaN(currentPosition) || currentPosition === null ? 0 : currentPosition;
        if (Math.abs(visualPos.value - validPos) < 0.5) return;
        cancelAnimation(visualPos);
        visualPos.value = withTiming(validPos, { duration: POSITION_SYNC_MS, easing: Easing.out(Easing.cubic) });
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
            cancelAnimation(visualPos);
            isDragging.value = true;
            dragStartPos.value = visualPos.value;
            runOnJS(setDraggingFlag)(true);
            if (onSliderDragStart) runOnJS(onSliderDragStart)();
        })
        .onUpdate((e) => {
            const fh = frameHeight.value;
            if (fh <= 0) return;
            const delta = (-e.translationY / fh) * 100;
            visualPos.value = Math.max(0, Math.min(100, dragStartPos.value + delta));
        })
        .onEnd(() => {
            isDragging.value = false;
            runOnJS(setDraggingFlag)(false);
            if (onSliderDragEnd) runOnJS(onSliderDragEnd)();
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
                        const h = e.nativeEvent.layout.height - 4;
                        frameHeight.value = h;
                        setFabricPanelHeight(Math.ceil(h));
                    }}
                >
                    <View style={[curtainStyles.windowFrameBorder, { borderColor: visual.frameBorder || 'rgba(255,255,255,0.28)' }]}>
                        <View style={curtainStyles.windowFrame}>
                            <View style={curtainStyles.solidFrameBg} />
                            <Animated.View style={[curtainStyles.rollPanel, shutterPanelStyle, { overflow: 'hidden', opacity: visual.panelOpacity }]}>
                                <CoverFabricFolds visual={visual} layout="rows" extentHeight={fabricPanelHeight} />
                                <View style={curtainStyles.shutterHandleWrap}>
                                    <CoverHandle variant="horizontal" />
                                </View>
                            </Animated.View>

                            {isMoving && (
                                <Animated.View style={[curtainStyles.arrowOverlay, arrowAnimStyle]} pointerEvents="none">
                                    {isMovingUp
                                        ? <ChevronUp size={40} color="rgba(255,255,255,0.85)" />
                                        : <ChevronDown size={40} color="rgba(255,255,255,0.85)" />}
                                </Animated.View>
                            )}
                        </View>
                    </View>
                </View>
            </GestureDetector>

            <CoverCardFooter
                name={friendlyName}
                status={isMovingUp ? 'Opening...' : isMovingDown ? 'Closing...' : posText}
                coverType={coverType}
                isOpen={currentPosition >= 5}
                onClose={() => handleAction('close')}
                onOpen={() => handleAction('open')}
            />
        </View>
    );
}

// ─── Curtain Card Styles ───
const curtainStyles = StyleSheet.create({
    card: {
        width: '100%',
        backgroundColor: 'transparent',
        borderRadius: 20,
        paddingTop: 4,
        paddingBottom: 4,
        paddingHorizontal: 0,
        height: 252,
        alignItems: 'center',
        borderWidth: 0,
    },
    windowArea: {
        width: '100%',
        flex: 1,
        marginBottom: 4,
    },
    windowFrameBorder: {
        flex: 1,
        width: '100%',
        borderRadius: 16,
        padding: 2,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.28)',
        backgroundColor: 'transparent',
        overflow: 'hidden',
    },
    windowFrame: {
        flex: 1,
        borderRadius: 14,
        overflow: 'hidden',
        position: 'relative',
        backgroundColor: '#1a1a22',
    },
    windowCross: {
        ...StyleSheet.absoluteFillObject,
        zIndex: 1,
    },
    windowCrossV: {
        position: 'absolute',
        top: 0,
        bottom: 0,
        left: '50%',
        width: COVER_BORDER_WIDTH,
        marginLeft: -COVER_BORDER_WIDTH / 2,
    },
    windowCrossH: {
        position: 'absolute',
        left: 0,
        right: 0,
        top: '50%',
        height: COVER_BORDER_WIDTH,
        marginTop: -COVER_BORDER_WIDTH / 2,
    },
    simpleOuterFrame: {
        borderWidth: 0,
        padding: 0,
        backgroundColor: 'transparent',
    },
    simpleInnerFrame: {
        backgroundColor: 'transparent',
        overflow: 'visible',
        borderRadius: 0,
    },
    solidFrameBg: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: '#1e2a28',
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
    chiffonIndicator: {
        position: 'absolute',
        top: '22%',
        left: 12,
        right: 12,
        alignItems: 'center',
        zIndex: 9,
    },
    chiffonIndicatorText: {
        color: 'rgba(255,255,255,0.88)',
        fontSize: 12,
        fontWeight: '600',
        textAlign: 'center',
        lineHeight: 16,
        letterSpacing: 0.2,
    },
    chiffonCenterGap: {
        position: 'absolute',
        top: 0,
        bottom: 0,
        left: '50%',
        width: 10,
        marginLeft: -5,
        backgroundColor: '#0d0d0d',
        zIndex: 6,
    },
    chiffonHandleRight: {
        position: 'absolute',
        right: 4,
        top: '38%',
        bottom: '38%',
        width: 8,
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 7,
    },
    chiffonHandleLeft: {
        position: 'absolute',
        left: 4,
        top: '38%',
        bottom: '38%',
        width: 8,
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 7,
    },
    chiffonHandleBar: {
        width: 4,
        height: 24,
        borderRadius: 2,
        backgroundColor: 'rgba(255,255,255,0.95)',
    },
    shutterHandleWrap: {
        position: 'absolute',
        bottom: 6,
        left: 0,
        right: 0,
        alignItems: 'center',
        zIndex: 7,
    },
    shutterHandlePill: {
        width: 36,
        height: 8,
        borderRadius: 4,
        backgroundColor: 'rgba(255,255,255,0.92)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    shutterHandleInner: {
        width: 28,
        height: 3,
        borderRadius: 2,
        backgroundColor: 'rgba(255,255,255,0.95)',
    },
    btnDisabled: {
        opacity: 0.3,
    },
    rollSlat: {
        height: 1,
        backgroundColor: 'rgba(0,0,0,0.25)',
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
    pleatStrip: {
        ...StyleSheet.absoluteFillObject,
        flexDirection: 'row',
        overflow: 'hidden',
    },
    pleatStripAnchor: {
        position: 'absolute',
        top: 0,
        bottom: 0,
        flexDirection: 'row',
        overflow: 'hidden',
    },
    pleatStripAnchorLeft: {
        left: 0,
    },
    pleatStripAnchorRight: {
        right: 0,
    },
    slatStrip: {
        ...StyleSheet.absoluteFillObject,
        flexDirection: 'column',
        overflow: 'hidden',
    },
    slatStripAnchor: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        flexDirection: 'column',
        overflow: 'hidden',
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
    },
    status: {
        color: Colors.textDim,
        fontSize: 10,
        fontWeight: '500',
        textAlign: 'left',
        textTransform: 'uppercase',
    },
    footerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        width: '100%',
        marginTop: 4,
        gap: 12,
    },
    footerTextCol: {
        flex: 1,
        minWidth: 0,
    },
    btnRow: {
        flexDirection: 'row',
        gap: 20,
        justifyContent: 'center',
        alignItems: 'center',
        width: '100%',
        marginTop: 6,
        paddingBottom: 2,
    },
    btnRowInline: {
        width: 'auto',
        marginTop: 0,
        paddingBottom: 0,
        gap: 12,
        flexShrink: 0,
    },
    ctrlBtn: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.08)',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.18)',
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
        paddingTop: 4,
        paddingBottom: 4,
        paddingHorizontal: 0,
        minHeight: 196,
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
