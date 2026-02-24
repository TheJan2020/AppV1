import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { ArrowUp, ArrowDown, Pause, Blinds, Columns, ChevronUp, ChevronDown } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { Colors } from '../../constants/Colors';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing, withRepeat, runOnJS, useAnimatedReaction } from 'react-native-reanimated';
import { useEffect, useState } from 'react';

// Assets
const IMG_TEXTURE = require('../../assets/cover_widget/shutter_texture.png');
const IMG_CURTAIN_FABRIC = require('../../assets/cover_widget/curtain_fabric.png');
const IMG_BTN_OPEN = require('../../assets/cover_widget/btn_open.png');
const IMG_BTN_CLOSE = require('../../assets/cover_widget/btn_close.png');

// Curtain types that use the simple card layout (open/close buttons on top, curtain icon)
const SIMPLE_CURTAIN_TYPES = ['curtain_middle', 'curtain_left', 'curtain_right'];

export default function CoverCard({ cover, sensor, onUpdate, needsChange }) {
    if (!cover) return null;

    const coverType = cover.coverType || '';
    const isSimpleCurtain = SIMPLE_CURTAIN_TYPES.includes(coverType);

    if (isSimpleCurtain) {
        return <SimpleCurtainCard cover={cover} sensor={sensor} onUpdate={onUpdate} needsChange={needsChange} />;
    }

    return <ShutterStyleCard cover={cover} sensor={sensor} onUpdate={onUpdate} needsChange={needsChange} />;
}

// ─── Curtain Card (curtain_middle, curtain_left, curtain_right) ───
// Animated window frame with sliding curtain panels using Figma assets
function SimpleCurtainCard({ cover, sensor, onUpdate, needsChange }) {
    const { attributes, state } = cover.stateObj;
    const currentPosition = attributes.current_position !== undefined
        ? attributes.current_position
        : (state === 'open' ? 100 : 0);
    const friendlyName = cover.displayName || "";
    const coverType = cover.coverType || 'curtain_middle';

    const sensorRawState = sensor?.state;
    const sensorState = sensorRawState?.toUpperCase() || 'STOP';
    const coverState = cover.stateObj.state;
    const isMovingUp = sensorState === 'UP' || coverState === 'opening';
    const isMovingDown = sensorState === 'DOWN' || coverState === 'closing';
    const isMoving = isMovingUp || isMovingDown;

    // Animation
    const visualPos = useSharedValue(currentPosition);
    const frameWidth = useSharedValue(0);

    useEffect(() => {
        const validPos = isNaN(currentPosition) || currentPosition === null ? 0 : currentPosition;
        visualPos.value = withTiming(validPos, { duration: 800, easing: Easing.out(Easing.cubic) });
    }, [currentPosition]);

    const handleAction = (action) => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        const service = action === 'stop' ? 'stop_cover' : (action === 'open' ? 'open_cover' : 'close_cover');
        onUpdate(cover.entity_id, 'cover', service, {});
    };

    const posText = currentPosition <= 0
        ? 'Closed'
        : currentPosition >= 100
            ? 'Opened 100%'
            : `Opened ${Math.round(currentPosition)}%`;

    const isMiddle = coverType === 'curtain_middle';
    const isRight = coverType === 'curtain_right';
    const showLeftPanel = isMiddle || !isRight;
    const showRightPanel = isMiddle || isRight;

    // Animated curtain panel widths
    const leftPanelStyle = useAnimatedStyle(() => {
        const fw = frameWidth.value;
        if (fw <= 0) return { width: 0 };
        const maxW = isMiddle ? fw * 0.5 : fw;
        const fraction = 1 - visualPos.value / 100;
        return { width: Math.max(3, maxW * fraction) };
    });

    const rightPanelStyle = useAnimatedStyle(() => {
        const fw = frameWidth.value;
        if (fw <= 0) return { width: 0 };
        const maxW = isMiddle ? fw * 0.5 : fw;
        const fraction = 1 - visualPos.value / 100;
        return { width: Math.max(3, maxW * fraction) };
    });

    return (
        <View style={[curtainStyles.card, needsChange && { borderColor: '#8947ca', borderWidth: 2 }]}>
            {/* Window + Curtain Visual */}
            <View
                style={curtainStyles.windowArea}
                onLayout={(e) => { frameWidth.value = e.nativeEvent.layout.width - 4; }}
            >
                <View style={curtainStyles.windowFrame}>
                    {/* Window panes (2x2 grid) */}
                    <View style={curtainStyles.panesGrid}>
                        <View style={curtainStyles.paneRow}>
                            <View style={curtainStyles.pane} />
                            <View style={curtainStyles.paneDividerV} />
                            <View style={curtainStyles.pane} />
                        </View>
                        <View style={curtainStyles.paneDividerH} />
                        <View style={curtainStyles.paneRow}>
                            <View style={curtainStyles.pane} />
                            <View style={curtainStyles.paneDividerV} />
                            <View style={curtainStyles.pane} />
                        </View>
                    </View>

                    {/* Left Curtain Panel — flipped so handle faces the opening edge (right) */}
                    {showLeftPanel && (
                        <Animated.View style={[curtainStyles.panelLeft, leftPanelStyle]}>
                            <Image
                                source={IMG_CURTAIN_FABRIC}
                                style={[curtainStyles.fabricFull, { transform: [{ scaleX: -1 }] }]}
                                resizeMode="cover"
                            />
                        </Animated.View>
                    )}

                    {/* Right Curtain Panel — handle faces the opening edge (left) */}
                    {showRightPanel && (
                        <Animated.View style={[curtainStyles.panelRight, rightPanelStyle]}>
                            <Image
                                source={IMG_CURTAIN_FABRIC}
                                style={curtainStyles.fabricFull}
                                resizeMode="cover"
                            />
                        </Animated.View>
                    )}
                </View>
            </View>

            {/* Name + Status */}
            <Text style={curtainStyles.name} numberOfLines={1}>{friendlyName}</Text>
            <Text style={curtainStyles.status}>
                {isMoving ? (isMovingUp ? 'Opening...' : 'Closing...') : posText}
            </Text>

            {/* Open / Pause / Close Buttons */}
            <View style={curtainStyles.btnRow}>
                <TouchableOpacity onPress={() => handleAction('open')} activeOpacity={0.7}>
                    <Image source={IMG_BTN_OPEN} style={curtainStyles.btnImg} />
                </TouchableOpacity>
                <TouchableOpacity
                    style={[curtainStyles.pauseBtn, isMoving && curtainStyles.pauseBtnActive]}
                    onPress={() => handleAction('stop')}
                    activeOpacity={0.7}
                >
                    <View style={curtainStyles.pauseIcon}>
                        <View style={[curtainStyles.pauseBar, isMoving && { backgroundColor: '#FF9800' }]} />
                        <View style={[curtainStyles.pauseBar, isMoving && { backgroundColor: '#FF9800' }]} />
                    </View>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleAction('close')} activeOpacity={0.7}>
                    <Image source={IMG_BTN_CLOSE} style={curtainStyles.btnImg} />
                </TouchableOpacity>
            </View>
        </View>
    );
}

// ─── Shutter-Style Card (curtain_roll, shutter, garage) ───
function ShutterStyleCard({ cover, sensor, onUpdate, needsChange }) {
    const { attributes, state } = cover.stateObj;
    const currentPosition = attributes.current_position !== undefined ? attributes.current_position : (state === 'open' ? 100 : 0);
    const friendlyName = cover.displayName || "";

    const coverType = cover.coverType || '';
    const isRollCurtain = coverType === 'curtain_roll';

    // Track container height for drag calculation
    const containerHeight = useSharedValue(0);

    // Sensor State Logic
    const sensorRawState = sensor?.state;
    const sensorState = sensorRawState?.toUpperCase() || 'STOP';
    const coverState = cover.stateObj.state;

    const isMovingUp = sensorState === 'UP' || coverState === 'opening';
    const isMovingDown = sensorState === 'DOWN' || coverState === 'closing';

    // Animation Values
    const visualPos = useSharedValue(currentPosition);
    const arrowTranslateY = useSharedValue(0);
    const arrowOpacity = useSharedValue(0);
    const isDragging = useSharedValue(false);

    // Sync visual position (only if not dragging)
    useEffect(() => {
        if (!isDragging.value) {
            const validPos = isNaN(currentPosition) || currentPosition === null ? 0 : currentPosition;
            visualPos.value = withTiming(validPos, {
                duration: 1000,
                easing: Easing.out(Easing.cubic)
            });
        }
    }, [currentPosition]);

    // Directional Arrow Animation (Looping)
    useEffect(() => {
        if (isMovingUp) {
            arrowOpacity.value = 1;
            arrowTranslateY.value = 20;
            arrowTranslateY.value = withRepeat(
                withTiming(-20, { duration: 1000, easing: Easing.linear }),
                -1, false
            );
        } else if (isMovingDown) {
            arrowOpacity.value = 1;
            arrowTranslateY.value = -20;
            arrowTranslateY.value = withRepeat(
                withTiming(20, { duration: 1000, easing: Easing.linear }),
                -1, false
            );
        } else {
            arrowOpacity.value = 0;
            arrowTranslateY.value = 0;
        }
    }, [isMovingUp, isMovingDown]);

    // --- Actions ---
    const handleAction = (action, params = {}) => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        const service = action === 'stop' ? 'stop_cover' : (action === 'open' ? 'open_cover' : (action === 'set_cover_position' ? 'set_cover_position' : 'close_cover'));
        onUpdate(cover.entity_id, 'cover', service, params);
    };

    const topBtnIcon = isMovingUp ? <Pause size={24} color="#FF9800" fill="#FF9800" /> : <ArrowUp size={24} color="#fff" />;
    const topBtnAction = () => isMovingUp ? handleAction('stop') : handleAction('open');
    const topBtnStyle = isMovingUp ? shutterStyles.activeBtn : shutterStyles.ctrlBtn;

    const bottomBtnIcon = isMovingDown ? <Pause size={24} color="#FF9800" fill="#FF9800" /> : <ArrowDown size={24} color="#fff" />;
    const bottomBtnAction = () => isMovingDown ? handleAction('stop') : handleAction('close');
    const bottomBtnStyle = isMovingDown ? shutterStyles.activeBtn : shutterStyles.ctrlBtn;

    // --- Gestures ---
    const commitPosition = (newPos) => {
        handleAction('set_cover_position', { position: Math.round(newPos) });
    };

    const dragStartPos = useSharedValue(0);

    const gesture = Gesture.Pan()
        .onStart(() => {
            isDragging.value = true;
            dragStartPos.value = visualPos.value;
        })
        .onUpdate((e) => {
            const height = containerHeight.value;
            if (height > 0) {
                const change = (e.translationY / height) * 100;
                const newPos = dragStartPos.value - change;
                visualPos.value = Math.max(0, Math.min(100, newPos));
            }
        })
        .onEnd(() => {
            isDragging.value = false;
            runOnJS(commitPosition)(visualPos.value);
        });

    // --- Animations ---
    const shutterStyle = useAnimatedStyle(() => {
        return { height: `${100 - visualPos.value}%` };
    });

    const badgeStyle = useAnimatedStyle(() => {
        return {
            top: `${100 - visualPos.value}%`,
            transform: [{ translateY: -12.5 }]
        };
    });

    const arrowAnimStyle = useAnimatedStyle(() => {
        return {
            transform: [{ translateY: arrowTranslateY.value }],
            opacity: arrowOpacity.value
        };
    });

    return (
        <View style={[
            shutterStyles.container,
            needsChange && { borderColor: '#8947ca', borderWidth: 2 }
        ]}>
            {/* Header */}
            <View style={shutterStyles.header}>
                <Text style={shutterStyles.name} numberOfLines={1}>{friendlyName}</Text>
                {isRollCurtain ? <Columns size={16} color={Colors.textDim} /> : <Blinds size={16} color={Colors.textDim} />}
            </View>

            <View style={shutterStyles.contentRow}>
                {/* Visual */}
                <View
                    style={[shutterStyles.visualContainer, { flex: 2, transform: [{ scale: 0.95 }] }]}
                    onLayout={(e) => {
                        containerHeight.value = e.nativeEvent.layout.height;
                    }}
                >
                    <View style={[shutterStyles.windowFrame, shutterStyles.shutterFrame]}>
                        <View style={shutterStyles.staticBg} />

                        <Animated.View style={[shutterStyles.shutterPanel, shutterStyle]}>
                            <View style={shutterStyles.textureContainer}>
                                <Image
                                    source={IMG_TEXTURE}
                                    style={shutterStyles.textureImage}
                                    resizeMode="cover"
                                />
                            </View>
                            <View style={shutterStyles.slatOverlay} />
                        </Animated.View>

                        {/* Movement Arrow Overlay */}
                        <Animated.View style={[shutterStyles.arrowOverlay, arrowAnimStyle]}>
                            {isMovingUp && <ChevronUp size={40} color="rgba(255,255,255,0.8)" />}
                            {isMovingDown && <ChevronDown size={40} color="rgba(255,255,255,0.8)" />}
                        </Animated.View>
                    </View>

                    {/* Floating Percentage Badge */}
                    <GestureDetector gesture={gesture}>
                        <Animated.View style={[shutterStyles.floatingBadge, badgeStyle]}>
                            <AnimatedText sharedValue={visualPos} />
                        </Animated.View>
                    </GestureDetector>
                </View>

                {/* Controls */}
                <View style={[shutterStyles.controlsCol, { width: 60 }]}>
                    <TouchableOpacity style={topBtnStyle} onPress={topBtnAction}>
                        {topBtnIcon}
                    </TouchableOpacity>
                    <TouchableOpacity style={bottomBtnStyle} onPress={bottomBtnAction}>
                        {bottomBtnIcon}
                    </TouchableOpacity>
                </View>
            </View>
        </View>
    );
}

// Simple Animated Text Component for % or Open/Closed
function AnimatedText({ sharedValue }) {
    const [text, setText] = useState("");

    useAnimatedReaction(
        () => Math.round(sharedValue.value),
        (val, prev) => {
            if (val !== prev) {
                let newText = `${val}%`;
                if (val <= 0) newText = "Closed";
                if (val >= 100) newText = "Open";
                runOnJS(setText)(newText);
            }
        },
        []
    );

    return (
        <Text style={{ color: '#fff', fontSize: 10, fontWeight: 'bold' }}>
            {text}
        </Text>
    );
}

// ─── Curtain Card Styles ───
const curtainStyles = StyleSheet.create({
    card: {
        width: '100%',
        backgroundColor: 'rgba(255,255,255,0.05)',
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
    windowFrame: {
        width: '100%',
        height: '100%',
        borderRadius: 8,
        overflow: 'hidden',
        borderWidth: 2,
        borderColor: '#4a4a58',
        position: 'relative',
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
        backgroundColor: '#8aafc2',
    },
    paneDividerV: {
        width: 2,
        backgroundColor: '#4a4a58',
    },
    paneDividerH: {
        height: 2,
        backgroundColor: '#4a4a58',
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
    fabricFull: {
        width: '100%',
        height: '100%',
    },
    name: {
        color: '#fff',
        fontSize: 13,
        fontWeight: '700',
        textAlign: 'center',
        marginBottom: 1,
    },
    status: {
        color: Colors.textDim,
        fontSize: 10,
        fontWeight: '500',
        textAlign: 'center',
        marginBottom: 4,
    },
    btnRow: {
        flexDirection: 'row',
        gap: 10,
        justifyContent: 'center',
        alignItems: 'center',
    },
    btnImg: {
        width: 32,
        height: 32,
    },
    pauseBtn: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: '#333',
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

// ─── Shutter-Style Styles ───
const shutterStyles = StyleSheet.create({
    container: {
        width: '100%',
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 20,
        padding: 12,
        height: 180,
        justifyContent: 'space-between',
        borderWidth: 0,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8
    },
    name: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '600',
        flex: 1,
        marginRight: 8
    },
    contentRow: {
        flex: 1,
        flexDirection: 'row',
        gap: 12,
        alignItems: 'center'
    },
    visualContainer: {
        flex: 1,
        height: '100%',
        justifyContent: 'center',
        alignItems: 'center',
        position: 'relative'
    },
    windowFrame: {
        width: '100%',
        height: '100%',
        backgroundColor: '#2a2a35',
        borderRadius: 8,
        overflow: 'hidden',
        borderWidth: 2,
        borderColor: '#3e3e4a',
        position: 'relative'
    },
    shutterFrame: {
        width: '100%',
        height: '100%'
    },
    staticBg: {
        width: '100%',
        height: '100%',
        backgroundColor: '#7c53c3',
        position: 'absolute'
    },
    shutterPanel: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        overflow: 'hidden',
        borderBottomWidth: 4,
        borderBottomColor: '#2d3436'
    },
    textureContainer: {
        width: '100%',
        height: '100%',
        overflow: 'hidden',
    },
    textureImage: {
        width: '100%',
        height: '140%',
        marginTop: '-20%'
    },
    slatOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.05)'
    },
    floatingBadge: {
        position: 'absolute',
        top: 0,
        left: '50%',
        marginLeft: -24,
        width: 48,
        height: 24,
        backgroundColor: 'rgba(0,0,0,0.8)',
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 20,
        borderColor: 'rgba(255,255,255,0.3)',
        borderWidth: 1
    },
    controlsCol: {
        width: 48,
        justifyContent: 'space-between',
        height: '100%',
        gap: 8
    },
    ctrlBtn: {
        flex: 1,
        width: '100%',
        borderRadius: 12,
        backgroundColor: 'rgba(255,255,255,0.08)',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.05)'
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
