/**
 * AlertNotificationModal
 *
 * Centered full-screen overlay shown when the user taps a push notification.
 * Shows "Security Alert" as fixed heading, then the specific event name and detail.
 *
 * Props:
 *   visible   {bool}
 *   title     {string}   specific event, e.g. "Front Door — Door Sensor Triggered"
 *   body      {string}   detail text
 *   category  {string}   'lock' | 'garage' | 'security' | 'door' | 'camera' | 'default'
 *   timestamp {string}   ISO string
 *   onDismiss {fn}
 */

import { memo, useRef, useEffect } from 'react';
import {
    Modal, View, Text, TouchableOpacity, StyleSheet,
    Animated,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { X } from 'lucide-react-native';
import { CF } from '../../utils/typography';

// ── Category → accent colour (used for gradient tint only, no icon) ───────────
function accentColor(category) {
    const map = {
        lock:     '#44C8CA',
        garage:   '#FF9800',
        security: '#EF5350',
        door:     '#FF9800',
        camera:   '#7B2FBE',
        default:  '#9199BA',
        alert:    '#EF5350',
    };
    return map[category] ?? map.default;
}

// ── Format timestamp ──────────────────────────────────────────────────────────
function formatTime(iso) {
    if (!iso) return '';
    try {
        const d = new Date(iso);
        return d.toLocaleString(undefined, {
            month: 'short', day: 'numeric',
            hour: '2-digit', minute: '2-digit',
        });
    } catch {
        return '';
    }
}

// ── Component ─────────────────────────────────────────────────────────────────
function AlertNotificationModal({ visible, title, body, category = 'default', timestamp, onDismiss, onViewAll }) {
    const scaleAnim = useRef(new Animated.Value(0.85)).current;
    const opacityAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (visible) {
            Animated.parallel([
                Animated.spring(scaleAnim,   { toValue: 1,    useNativeDriver: true, tension: 120, friction: 8 }),
                Animated.timing(opacityAnim, { toValue: 1,    useNativeDriver: true, duration: 200 }),
            ]).start();
        } else {
            scaleAnim.setValue(0.85);
            opacityAnim.setValue(0);
        }
    }, [visible]);

    const handleDismiss = () => {
        Animated.parallel([
            Animated.spring(scaleAnim,   { toValue: 0.85, useNativeDriver: true }),
            Animated.timing(opacityAnim, { toValue: 0,    useNativeDriver: true, duration: 150 }),
        ]).start(() => onDismiss?.());
    };

    const accent = accentColor(category);

    return (
        <Modal
            visible={visible}
            transparent
            animationType="none"
            statusBarTranslucent
            onRequestClose={handleDismiss}
        >
            {/* Backdrop blur */}
            <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
            <View style={styles.overlay}>
                <Animated.View style={[styles.card, { transform: [{ scale: scaleAnim }], opacity: opacityAnim }]}>
                    {/* Gradient tint — colour follows category */}
                    <LinearGradient
                        colors={[accent + '22', accent + '08', 'rgba(0,0,0,0)']}
                        style={StyleSheet.absoluteFill}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                    />

                    {/* Dismiss button */}
                    <TouchableOpacity style={styles.closeBtn} onPress={handleDismiss} activeOpacity={0.7}>
                        <X size={18} color="rgba(255,255,255,0.5)" />
                    </TouchableOpacity>

                    {/* Fixed heading */}
                    <Text style={[styles.heading, { color: accent }]}>Security Alert</Text>

                    {/* Event name — what specifically triggered */}
                    {!!title && <Text style={styles.eventName}>{title}</Text>}

                    {/* Detail body */}
                    {!!body && <Text style={styles.body}>{body}</Text>}

                    {/* Timestamp */}
                    {!!timestamp && (
                        <Text style={styles.time}>{formatTime(timestamp)}</Text>
                    )}

                    {/* Buttons row */}
                    <View style={styles.btnRow}>
                        {!!onViewAll && (
                            <TouchableOpacity style={styles.viewAllBtn} onPress={() => { handleDismiss(); onViewAll(); }} activeOpacity={0.8}>
                                <Text style={styles.viewAllText}>View All</Text>
                            </TouchableOpacity>
                        )}
                        <TouchableOpacity style={[styles.dismissBtn, !onViewAll && styles.dismissBtnFull, { backgroundColor: accent }]} onPress={handleDismiss} activeOpacity={0.8}>
                            <Text style={styles.dismissText}>Dismiss</Text>
                        </TouchableOpacity>
                    </View>
                </Animated.View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 28,
    },
    card: {
        width: '100%',
        backgroundColor: '#0f1028',
        borderRadius: 28,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        paddingTop: 44,
        paddingBottom: 32,
        paddingHorizontal: 28,
        alignItems: 'center',
        overflow: 'hidden',
        shadowColor: '#44C8CA',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.25,
        shadowRadius: 24,
        elevation: 20,
    },
    closeBtn: {
        position: 'absolute',
        top: 16,
        right: 16,
        padding: 6,
        borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.06)',
    },
    heading: {
        fontSize: 13,
        fontFamily: CF.semibold,
        letterSpacing: 1.4,
        textTransform: 'uppercase',
        marginBottom: 14,
        opacity: 0.9,
    },
    eventName: {
        color: '#ededf5',
        fontSize: 20,
        fontFamily: CF.semibold,
        textAlign: 'center',
        marginBottom: 10,
        lineHeight: 27,
    },
    body: {
        color: 'rgba(255,255,255,0.5)',
        fontSize: 14,
        fontFamily: CF.regular,
        textAlign: 'center',
        lineHeight: 20,
        marginBottom: 12,
    },
    time: {
        color: 'rgba(255,255,255,0.28)',
        fontSize: 12,
        fontFamily: CF.regular,
        marginBottom: 28,
    },
    btnRow: {
        flexDirection: 'row',
        gap: 10,
        marginTop: 4,
        width: '100%',
    },
    dismissBtn: {
        flex: 1,
        borderRadius: 14,
        paddingVertical: 13,
        alignItems: 'center',
    },
    dismissBtnFull: {
        flex: 1,
    },
    dismissText: {
        color: '#fff',
        fontSize: 15,
        fontFamily: CF.semibold,
    },
    viewAllBtn: {
        flex: 1,
        backgroundColor: 'rgba(255,255,255,0.08)',
        borderRadius: 14,
        paddingVertical: 13,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.12)',
    },
    viewAllText: {
        color: 'rgba(255,255,255,0.7)',
        fontSize: 15,
        fontFamily: CF.semibold,
    },
});

export default memo(AlertNotificationModal);
