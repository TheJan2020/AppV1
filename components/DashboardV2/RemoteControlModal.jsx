import { View, Text, StyleSheet, TouchableOpacity, Modal, PanResponder, Animated } from 'react-native';
import { BlurView } from 'expo-blur';
import { ArrowLeft, Home, Menu, X, ChevronUp, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { Colors } from '../../constants/Colors';
import { useRef } from 'react';

export default function RemoteControlModal({ visible, onClose, player, remoteEntity, onUpdate }) {
    if (!visible || !player) return null;

    // Helper to send commands
    const sendCommand = (cmd) => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        const targetId = (remoteEntity && remoteEntity.entity_id) ? remoteEntity.entity_id : player.entity_id;
        onUpdate(targetId, 'remote', 'send_command', { command: cmd });
    };

    // Trackpad Logic with PanResponder (No External Native Deps)
    const pan = useRef(new Animated.ValueXY()).current;

    // Thresholds
    const SWIPE_THRESHOLD = 30;

    const panResponder = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onMoveShouldSetPanResponder: () => true,
            onPanResponderGrant: () => {
                pan.setOffset({
                    x: pan.x._value,
                    y: pan.y._value
                });
            },
            onPanResponderMove: Animated.event(
                [null, { dx: pan.x, dy: pan.y }],
                { useNativeDriver: false }
            ),
            onPanResponderRelease: (e, gestureState) => {
                pan.flattenOffset();

                // Snap back
                Animated.spring(pan, {
                    toValue: { x: 0, y: 0 },
                    useNativeDriver: false
                }).start();

                const { dx, dy } = gestureState;
                const absDx = Math.abs(dx);
                const absDy = Math.abs(dy);

                if (Math.max(absDx, absDy) > SWIPE_THRESHOLD) {
                    // Swipe
                    if (absDx > absDy) {
                        sendCommand(dx > 0 ? 'right' : 'left');
                    } else {
                        sendCommand(dy > 0 ? 'down' : 'up');
                    }
                } else {
                    // Tap
                    sendCommand('select');
                }
            }
        })
    ).current;

    return (
        <Modal
            animationType="slide"
            transparent={true}
            visible={visible}
            onRequestClose={onClose}
        >
            <View style={styles.overlay}>
                <TouchableOpacity style={styles.backdrop} onPress={onClose} activeOpacity={1} />

                <BlurView intensity={45} tint="dark" style={styles.remoteBody}>
                    <View style={styles.header}>
                        <Text style={styles.title}>{player.displayName} Remote</Text>
                        <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                            <X size={24} color={Colors.textDim} />
                        </TouchableOpacity>
                    </View>

                    {/* TRACKPAD AREA */}
                    <View style={styles.trackpadContainer} {...panResponder.panHandlers}>
                        <Animated.View style={[
                            styles.trackpadSurface,
                            {
                                transform: [
                                    { translateX: pan.x.interpolate({ inputRange: [-100, 100], outputRange: [-20, 20] }) }, // Dampened movement
                                    { translateY: pan.y.interpolate({ inputRange: [-100, 100], outputRange: [-20, 20] }) }
                                ]
                            }
                        ]}>
                            <Text style={styles.trackpadHint}>Swipe to Navigate</Text>
                            <Text style={styles.trackpadHintSub}>Tap to Select</Text>
                        </Animated.View>
                    </View>

                    {/* Action Buttons */}
                    <View style={styles.actionsRow}>
                        <TouchableOpacity style={styles.actionBtn} onPress={() => sendCommand('back')}>
                            <ArrowLeft size={24} color="#fff" />
                            <Text style={styles.btnLabel}>Back</Text>
                        </TouchableOpacity>

                        <TouchableOpacity style={styles.actionBtn} onPress={() => sendCommand('home')}>
                            <Home size={24} color="#fff" />
                            <Text style={styles.btnLabel}>Home</Text>
                        </TouchableOpacity>

                        <TouchableOpacity style={styles.actionBtn} onPress={() => sendCommand('menu')}>
                            <Menu size={24} color="#fff" />
                            <Text style={styles.btnLabel}>Menu</Text>
                        </TouchableOpacity>
                    </View>
                </BlurView>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        justifyContent: 'flex-end',
    },
    backdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.4)',
    },
    remoteBody: {
        width: '100%',
        backgroundColor: '#15151a',
        borderTopLeftRadius: 30,
        borderTopRightRadius: 30,
        paddingHorizontal: 20,
        paddingTop: 20,
        paddingBottom: 50,
        alignItems: 'center',
        gap: 30,
        overflow: 'hidden'
    },
    header: {
        flexDirection: 'row',
        width: '100%',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 10,
        paddingHorizontal: 10
    },
    title: {
        color: '#fff',
        fontSize: 18,
        fontWeight: 'bold',
    },
    closeBtn: {
        padding: 6
    },

    // Trackpad
    trackpadContainer: {
        width: '85%',
        aspectRatio: 1, // Square-ish
        borderRadius: 24,
        overflow: 'hidden',
        backgroundColor: 'rgba(255,255,255,0.08)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)'
    },
    trackpadSurface: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'transparent'
    },
    trackpadHint: {
        color: 'rgba(255,255,255,0.3)',
        fontSize: 16,
        fontWeight: '500',
        marginBottom: 4
    },
    trackpadHintSub: {
        color: 'rgba(255,255,255,0.2)',
        fontSize: 13
    },

    actionsRow: {
        flexDirection: 'row',
        width: '100%',
        justifyContent: 'space-evenly',
        paddingHorizontal: 20
    },
    actionBtn: {
        alignItems: 'center',
        gap: 8,
        minWidth: 60,
        padding: 10,
        borderRadius: 16,
        backgroundColor: 'rgba(255,255,255,0.05)'
    },
    btnLabel: {
        color: Colors.textDim,
        fontSize: 12
    }
});
