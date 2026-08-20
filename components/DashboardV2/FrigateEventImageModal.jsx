/**
 * Full-screen Frigate event snapshot viewer (image only).
 * Pinch / double-tap / +/- to zoom — no clip/video loading UI.
 */

import { useEffect, useCallback, useState } from 'react';
import {
    Modal,
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Image,
    Dimensions,
} from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withTiming,
} from 'react-native-reanimated';
import { X, ZoomIn, ZoomOut } from 'lucide-react-native';
import { CF } from '../../utils/typography';
import { getEventThumbnailUrl } from '../../utils/frigateEvents';
import { formatCameraName } from '../../utils/formatDisplayName';

const MIN_SCALE = 1;
const MAX_SCALE = 4;
const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const IMAGE_H = SCREEN_H * 0.72;

function formatEventTime(unixTs) {
    if (!Number.isFinite(Number(unixTs))) return '';
    const d = new Date(Number(unixTs) * 1000);
    return d.toLocaleString([], {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
}

function ZoomableImage({ uri, headers, resetKey }) {
    const scale = useSharedValue(1);
    const savedScale = useSharedValue(1);
    const translateX = useSharedValue(0);
    const translateY = useSharedValue(0);
    const savedTX = useSharedValue(0);
    const savedTY = useSharedValue(0);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        setFailed(false);
        scale.value = 1;
        savedScale.value = 1;
        translateX.value = 0;
        translateY.value = 0;
        savedTX.value = 0;
        savedTY.value = 0;
    }, [resetKey, scale, savedScale, translateX, translateY, savedTX, savedTY]);

    const pinch = Gesture.Pinch()
        .onUpdate((e) => {
            const next = savedScale.value * e.scale;
            scale.value = Math.min(MAX_SCALE, Math.max(MIN_SCALE, next));
        })
        .onEnd(() => {
            savedScale.value = scale.value;
            if (scale.value <= 1.05) {
                scale.value = withTiming(1);
                savedScale.value = 1;
                translateX.value = withTiming(0);
                translateY.value = withTiming(0);
                savedTX.value = 0;
                savedTY.value = 0;
            }
        });

    const pan = Gesture.Pan()
        .averageTouches(true)
        .minPointers(1)
        .maxPointers(2)
        .onUpdate((e) => {
            if (scale.value > 1.05) {
                translateX.value = savedTX.value + e.translationX;
                translateY.value = savedTY.value + e.translationY;
            }
        })
        .onEnd(() => {
            savedTX.value = translateX.value;
            savedTY.value = translateY.value;
        });

    const doubleTap = Gesture.Tap()
        .numberOfTaps(2)
        .onEnd(() => {
            if (scale.value > 1.2) {
                scale.value = withTiming(1);
                savedScale.value = 1;
                translateX.value = withTiming(0);
                translateY.value = withTiming(0);
                savedTX.value = 0;
                savedTY.value = 0;
            } else {
                scale.value = withTiming(2.5);
                savedScale.value = 2.5;
            }
        });

    const composed = Gesture.Simultaneous(pinch, pan, doubleTap);

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [
            { translateX: translateX.value },
            { translateY: translateY.value },
            { scale: scale.value },
        ],
    }));

    const zoomBy = useCallback((factor) => {
        const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, savedScale.value * factor));
        scale.value = withTiming(next);
        savedScale.value = next;
        if (next <= 1.05) {
            translateX.value = withTiming(0);
            translateY.value = withTiming(0);
            savedTX.value = 0;
            savedTY.value = 0;
            scale.value = withTiming(1);
            savedScale.value = 1;
        }
    }, [scale, savedScale, translateX, translateY, savedTX, savedTY]);

    if (failed) {
        return <Text style={styles.errorText}>Could not load snapshot</Text>;
    }

    return (
        <View style={styles.zoomRoot}>
            <GestureDetector gesture={composed}>
                <Animated.View style={[styles.zoomStage, animatedStyle]}>
                    <Image
                        source={{ uri, headers }}
                        style={styles.image}
                        resizeMode="contain"
                        onError={() => setFailed(true)}
                    />
                </Animated.View>
            </GestureDetector>

            <View style={styles.zoomControls} pointerEvents="box-none">
                <TouchableOpacity
                    style={styles.zoomBtn}
                    onPress={() => zoomBy(1.4)}
                    accessibilityLabel="Zoom in"
                >
                    <ZoomIn size={20} color="#fff" />
                </TouchableOpacity>
                <TouchableOpacity
                    style={styles.zoomBtn}
                    onPress={() => zoomBy(1 / 1.4)}
                    accessibilityLabel="Zoom out"
                >
                    <ZoomOut size={20} color="#fff" />
                </TouchableOpacity>
            </View>
        </View>
    );
}

export default function FrigateEventImageModal({
    visible,
    event,
    adminUrl,
    authHeaders = {},
    onClose,
}) {
    if (!event) return null;

    const thumbUrl = adminUrl ? getEventThumbnailUrl(adminUrl, event.id) : null;
    const resetKey = `${event.id}-${visible ? '1' : '0'}`;

    return (
        <Modal
            visible={visible}
            animationType="fade"
            transparent
            onRequestClose={onClose}
        >
            <GestureHandlerRootView style={styles.backdrop}>
                <View style={styles.header}>
                    <View style={styles.meta}>
                        <Text style={styles.camera} numberOfLines={1}>{formatCameraName(event.camera)}</Text>
                        <Text style={styles.subtitle}>
                            {(event.label || 'event').toString()} · {formatEventTime(event.start_time)}
                        </Text>
                    </View>
                    <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={12}>
                        <X size={22} color="#fff" />
                    </TouchableOpacity>
                </View>

                <View style={styles.imageWrap}>
                    {thumbUrl ? (
                        <ZoomableImage
                            uri={thumbUrl}
                            headers={authHeaders}
                            resetKey={resetKey}
                        />
                    ) : (
                        <Text style={styles.errorText}>No snapshot available</Text>
                    )}
                </View>

                <Text style={styles.hint}>Pinch or double-tap to zoom</Text>
            </GestureHandlerRootView>
        </Modal>
    );
}

const styles = StyleSheet.create({
    backdrop: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.96)',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingTop: 56,
        paddingHorizontal: 16,
        paddingBottom: 12,
        zIndex: 2,
    },
    meta: {
        flex: 1,
        paddingRight: 12,
        gap: 2,
    },
    camera: {
        color: '#fff',
        fontSize: 17,
        fontFamily: CF.semibold,
        textTransform: 'capitalize',
    },
    subtitle: {
        color: 'rgba(255,255,255,0.55)',
        fontSize: 13,
        fontFamily: CF.regular,
        textTransform: 'capitalize',
    },
    closeBtn: {
        padding: 8,
    },
    imageWrap: {
        flex: 1,
        overflow: 'hidden',
    },
    zoomRoot: {
        flex: 1,
        width: SCREEN_W,
    },
    zoomStage: {
        flex: 1,
        width: SCREEN_W,
        height: IMAGE_H,
        alignItems: 'center',
        justifyContent: 'center',
    },
    image: {
        width: SCREEN_W,
        height: IMAGE_H,
    },
    zoomControls: {
        position: 'absolute',
        right: 16,
        bottom: 24,
        gap: 10,
    },
    zoomBtn: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: 'rgba(40,40,55,0.85)',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: 'rgba(255,255,255,0.15)',
    },
    hint: {
        textAlign: 'center',
        color: 'rgba(255,255,255,0.35)',
        fontSize: 12,
        fontFamily: CF.regular,
        paddingBottom: 28,
        paddingTop: 4,
    },
    errorText: {
        color: 'rgba(255,255,255,0.45)',
        fontSize: 14,
        fontFamily: CF.regular,
        textAlign: 'center',
        marginTop: 80,
    },
});
