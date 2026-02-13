import { View, Text, StyleSheet, TouchableOpacity, Image, ImageBackground, TextInput } from 'react-native';
import { ArrowUp, ArrowDown, Pause, Blinds, Columns, ChevronUp, ChevronDown } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { Colors } from '../../constants/Colors';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing, withRepeat, runOnJS, useDerivedValue, useAnimatedProps } from 'react-native-reanimated';
import { useEffect, useState } from 'react';

// Assets
const IMG_TEXTURE = require('../../assets/cover_widget/shutter_texture.png');

export default function CoverCard({ cover, sensor, onUpdate, needsChange }) {
    if (!cover) return null;

    const { attributes, state } = cover.stateObj;
    // HA Default: 0 = Closed, 100 = Open.
    // If undefined, fallback to state check.
    const currentPosition = attributes.current_position !== undefined ? attributes.current_position : (state === 'open' ? 100 : 0);
    const friendlyName = cover.displayName || "";

    // Differentiate Shutter vs Curtain
    const nameLower = friendlyName.toLowerCase();
    const isCurtain = nameLower.includes('curtain') || nameLower.includes('drape');
    const isShutter = !isCurtain;

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
        // If currentPosition updates from HA, we sync visualPos UNLESS we are dragging
        if (!isDragging.value) {
            // Validate currentPosition to prevent NaN
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

    // ... Arrow Animation ...

    // --- Actions ---
    const handleAction = (action, params = {}) => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        const service = action === 'stop' ? 'stop_cover' : (action === 'open' ? 'open_cover' : (action === 'set_cover_position' ? 'set_cover_position' : 'close_cover'));
        onUpdate(cover.entity_id, 'cover', service, params);
    };

    const topBtnIcon = isMovingUp ? <Pause size={24} color="#FF9800" fill="#FF9800" /> : <ArrowUp size={24} color="#fff" />;
    const topBtnAction = () => isMovingUp ? handleAction('stop') : handleAction('open');
    const topBtnStyle = isMovingUp ? styles.activeBtn : styles.ctrlBtn;

    const bottomBtnIcon = isMovingDown ? <Pause size={24} color="#FF9800" fill="#FF9800" /> : <ArrowDown size={24} color="#fff" />;
    const bottomBtnAction = () => isMovingDown ? handleAction('stop') : handleAction('close');
    const bottomBtnStyle = isMovingDown ? styles.activeBtn : styles.ctrlBtn;

    // --- Gestures ---
    const commitPosition = (newPos) => {
        handleAction('set_cover_position', { position: Math.round(newPos) });
    };

    const panGesture = Gesture.Pan()
        .onStart((e) => {
            isDragging.value = true;
            // Store the starting position to apply translation against
            // We use a clean object for context if needed, but Reanimated context is passed as 2nd arg in useAnimatedGestureHandler
            // BUT for Gesture.Pan() (new API), we don't have the context object explicitly passed to callbacks in the same way?
            // Actually, we can just grab current value.
            // But to use 'translationY' correctly, we need the snapshot of visualPos at start.
            // We can attach it to the gesture handler context if we use the old API, but with new API:
            // We can use a shared value or just a variable in the closure? 
            // Better: use a shared value 'startPos'.
        })
        .onUpdate((e) => {
            // We need the value at start of gesture. 
            // Since onStart runs once, we can try to rely on 'translationY'.
            // But we need 'startPos'.
            // Let's implement a 'startPos' SharedValue specifically for the gesture logic.
            // OR use 'changeY' safely?
            // 'changeY' accumulation is prone to drift.

            // Let's use the .onStart context pattern if possible, or just a shared value.
        })
    // Wait, the new Gesture API allows context in the callbacks?
    // .onStart((event, context) => ...) is supported?
    // documentation says: .onStart((e) => {})
    // To carry state: use external SharedValues.

    // Redoing Gesture Definition below with context simulation via SharedValue

    const dragStartPos = useSharedValue(0);

    const gesture = Gesture.Pan()
        .onStart(() => {
            isDragging.value = true;
            dragStartPos.value = visualPos.value;
        })
        .onUpdate((e) => {
            const height = containerHeight.value;
            if (height > 0) {
                // translationY is positive when moving DOWN.
                // Moving DOWN means increasing Top offset => Decreasing Open %.
                // Change in % = (translationY / height) * 100
                // New Pos = StartPos - Change

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

    // Shutter: Height decreases as opens. 
    const shutterStyle = useAnimatedStyle(() => {
        return { height: `${100 - visualPos.value}%` };
    });

    // Badge follows the bottom of the shutter
    // Position clamped to ensure it doesn't get clipped
    const badgeStyle = useAnimatedStyle(() => {
        return {
            top: `${100 - visualPos.value}%`,
            transform: [{ translateY: -12.5 }] // Center (height 25)
        };
    });

    // Curtain: Gap increases.
    const curtainLeftStyle = useAnimatedStyle(() => {
        const width = 50 - (visualPos.value * 0.4);
        return { width: `${width}%` };
    });
    const curtainRightStyle = useAnimatedStyle(() => {
        const width = 50 - (visualPos.value * 0.4);
        return { width: `${width}%` };
    });

    const arrowAnimStyle = useAnimatedStyle(() => {
        return {
            transform: [{ translateY: arrowTranslateY.value }],
            opacity: arrowOpacity.value
        };
    });

    // Helper text
    // We cannot use standard React state inside Reanimated text easily without ReText (if available) 
    // or passing shared value to a component.
    // Simpler: Just render visualPos using an Animated Text component, 
    // OR just use standard render since visualPos updates might not trigger re-render of React component tree
    // unless we use `useDerivedValue` + `runOnJS` or `ReText`.

    // Actually, `useAnimatedProps` or similar is best for text.
    // But for "Open/Closed" strings, it's tricky.
    // Let's try a simpler approach first: The Badge only updates on actual state usage during drag?
    // No, `visualPos` is a SharedValue. It won't trigger React re-renders. 
    // Standard <Text> won't update during drag.
    // We need AnimateableText.

    // For now, let's just show the numeric % using AnimatedTextInput trick or similar,
    // OR just accept that during smooth drag the text might lag slightly if we rely on state, 
    // BUT we are using Reanimated. 
    // Let's use a specialized AnimatedText component for this.

    // Defining a quick AnimatedText component inline or using TextInput
    // Actually, let's keep it simple: Show standard Position if not dragging, 
    // and if dragging, we update a JS state? No, that kills performance.

    // Solution: AnimatedTextInput that displays the string. 
    // OR: Just map '0%' to Closed and '100%' to Open visually?
    // User wants "Closed" at bottom, "Open" at top.

    // Let's use a value derived listener to set a local state strictly for the TEXT, 
    // debounced or runOnJS? High load.

    // Better: Reanimated `TextInput` (Editable=false).

    const visualContainerStyle = isShutter ? [styles.visualContainer, { flex: 2, transform: [{ scale: 0.95 }] }] : styles.visualContainer;
    const controlsContainerStyle = isShutter ? [styles.controlsCol, { width: 60 }] : styles.controlsCol;

    return (
        <View style={[
            styles.container,
            needsChange && { borderColor: '#8947ca', borderWidth: 2 }
        ]}>
            {/* Header */}
            <View style={styles.header}>
                <Text style={styles.name} numberOfLines={1}>{friendlyName}</Text>
                {isCurtain ? <Columns size={16} color={Colors.textDim} /> : <Blinds size={16} color={Colors.textDim} />}
            </View>

            <View style={styles.contentRow}>
                {/* Visual */}
                <View
                    style={visualContainerStyle}
                    onLayout={(e) => {
                        containerHeight.value = e.nativeEvent.layout.height;
                    }}
                >
                    {/* Window Frame */}
                    <View style={[styles.windowFrame, isShutter && styles.shutterFrame]}>

                        {/* Static Background */}
                        <View style={styles.staticBg} />

                        {isCurtain ? (
                            <>
                                <Animated.View style={[styles.curtainPanel, { left: 0 }, curtainLeftStyle]} />
                                <Animated.View style={[styles.curtainPanel, { right: 0 }, curtainRightStyle]} />
                            </>
                        ) : (
                            <Animated.View style={[styles.shutterPanel, shutterStyle]}>
                                {/* Textured Shutter - Cropped to middle */}
                                <View style={styles.textureContainer}>
                                    <Image
                                        source={IMG_TEXTURE}
                                        style={styles.textureImage}
                                        resizeMode="cover"
                                    />
                                </View>
                                {/* Slats defined by texture now, but we can keep subtle overlay if needed */}
                                <View style={styles.slatOverlay} />
                            </Animated.View>
                        )}

                        {/* Movement Arrow Overlay */}
                        <Animated.View style={[styles.arrowOverlay, arrowAnimStyle]}>
                            {isMovingUp && <ChevronUp size={40} color="rgba(255,255,255,0.8)" />}
                            {isMovingDown && <ChevronDown size={40} color="rgba(255,255,255,0.8)" />}
                        </Animated.View>

                    </View>

                    {/* Floating Percentage Badge - MOVED OUTSIDE FRAME to prevent clipping */}
                    <GestureDetector gesture={gesture}>
                        <Animated.View style={[styles.floatingBadge, badgeStyle]}>
                            <AnimatedText sharedValue={visualPos} />
                        </Animated.View>
                    </GestureDetector>


                </View>

                {/* Controls */}
                <View style={controlsContainerStyle}>
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
const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

function AnimatedText({ sharedValue }) {
    const animatedProps = useAnimatedProps(() => {
        const val = Math.round(sharedValue.value);
        let text = `${val}%`;
        if (val === 0) text = "Closed";
        if (val >= 100) text = "Open";
        return {
            text: text, // This unfortunately doesn't work directly on TextInput 'text' prop on all platforms easily
            // Actually 'text' prop is not standard for TextInput, it's 'value'. 
        };
    });

    // Workaround: We use useAnimatedProps to set the 'text' property of the native view
    // if using ReText from react-native-redash or similar.
    // Since we want to stick to standard reanimated:
    // We'll use a useDerivedValue with runOnJS to update a local state for the text, 
    // heavily optimized?
    // Or just use the native `value` prop?

    // Better: use events. 
    // Actually, Reanimated allows setting `text` on TextInput via animated props in newest versions.

    // Let's try the simpler "runOnJS" approach for now to ensure it works without complex reanimated components.
    // It might cause some JS thread traffic but it's just one number.

    const [text, setText] = useState("");

    useDerivedValue(() => {
        const val = Math.round(sharedValue.value);
        let newText = `${val}%`;
        if (val <= 0) newText = "Closed";
        if (val >= 100) newText = "Open";
        runOnJS(setText)(newText);
    });

    return (
        <Text style={{ color: '#fff', fontSize: 10, fontWeight: 'bold' }}>
            {text}
        </Text>
    );
}

const styles = StyleSheet.create({
    container: {
        width: '100%',
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 20,
        padding: 12,
        height: 180, // Increased height for better visual ratio
        justifyContent: 'space-between',
        borderWidth: 0, // Default no border
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
        borderWidth: 2, // Thicker frame
        borderColor: '#3e3e4a', // Frame color
        position: 'relative'
    },
    shutterFrame: {
        width: '100%',
        height: '100%'
    },
    staticBg: {
        width: '100%',
        height: '100%',
        backgroundColor: '#7c53c3', // Purple as requested
        position: 'absolute'
    },
    curtainPanel: {
        position: 'absolute',
        top: 0,
        bottom: 0,
        backgroundColor: '#7e57c2',
    },
    shutterPanel: {
        position: 'absolute',
        top: 0, // Shutter grows from top
        left: 0,
        right: 0,
        overflow: 'hidden',
        borderBottomWidth: 4, // Bottom Bar of shutter
        borderBottomColor: '#2d3436'
    },
    // Texture Crop Workaround
    textureContainer: {
        width: '100%',
        height: '100%',
        overflow: 'hidden', // Crop content
    },
    textureImage: {
        width: '100%',
        height: '140%', // Zoom in vertically
        marginTop: '-20%' // Center the crop (remove top 20% and bottom 20% effectively)
    },

    slatOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.05)'
    },
    floatingBadge: {
        position: 'absolute',
        top: 0,
        left: '50%',
        marginLeft: -24, // Center width 48
        width: 48, // Wider for text
        height: 24, // Slightly taller
        backgroundColor: 'rgba(0,0,0,0.8)', // Darker for visibility
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 20,
        borderColor: 'rgba(255,255,255,0.3)',
        borderWidth: 1
    },
    posText: {
        color: '#fff',
        fontSize: 10,
        fontWeight: 'bold'
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
