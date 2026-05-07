/**
 * AlertNotificationModal
 *
 * Centered full-screen overlay shown when the user taps a push notification.
 * Displays the title, body, category icon, and timestamp of the alert.
 *
 * Props:
 *   visible   {bool}
 *   title     {string}
 *   body      {string}
 *   category  {string}  'lock' | 'security' | 'door' | 'camera' | 'default' ...
 *   timestamp {string}  ISO string
 *   onDismiss {fn}
 */

import { memo, useRef, useEffect } from 'react';
import {
    Modal, View, Text, TouchableOpacity, StyleSheet,
    Animated,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Shield, Lock, DoorOpen, Camera, Bell, X, AlertTriangle } from 'lucide-react-native';
import { CF } from '../../utils/typography';

// ── Category → icon + colour ─────────────────────────────────────────────────
function CategoryIcon({ category, size = 48 }) {
    const map = {
        lock:     { Icon: Lock,          color: '#44C8CA' },
        security: { Icon: Shield,        color: '#EF5350' },
        door:     { Icon: DoorOpen,      color: '#FF9800' },
        camera:   { Icon: Camera,        color: '#7B2FBE' },
        default:  { Icon: Bell,          color: '#9199BA' },
        alert:    { Icon: AlertTriangle, color: '#EF5350' },
    };
    const { Icon, color } = map[category] ?? map.default;
    return (
        <View style={[iconStyles.circle, { borderColor: color + '40', backgroundColor: color + '18' }]}>
            <Icon size={size} color={color} />
        </View>
    );
}

const iconStyles = StyleSheet.create({
    circle: {
        width: 96,
        height: 96,
        borderRadius: 48,
        borderWidth: 1.5,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 20,
    },
});

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
                    {/* Gradient border effect */}
                    <LinearGradient
                        colors={['rgba(68,200,202,0.15)', 'rgba(123,47,190,0.08)', 'rgba(0,0,0,0)']}
                        style={StyleSheet.absoluteFill}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                    />

                    {/* Dismiss button */}
                    <TouchableOpacity style={styles.closeBtn} onPress={handleDismiss} activeOpacity={0.7}>
                        <X size={18} color="rgba(255,255,255,0.5)" />
                    </TouchableOpacity>

                    {/* Icon */}
                    <CategoryIcon category={category} />

                    {/* Content */}
                    <Text style={styles.title}>{title || 'Alert'}</Text>
                    {!!body && <Text style={styles.body}>{body}</Text>}
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
                        <TouchableOpacity style={[styles.dismissBtn, !onViewAll && styles.dismissBtnFull]} onPress={handleDismiss} activeOpacity={0.8}>
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
        paddingVertical: 40,
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
    title: {
        color: '#ededf5',
        fontSize: 20,
        fontFamily: CF.semibold,
        textAlign: 'center',
        marginBottom: 10,
        lineHeight: 26,
    },
    body: {
        color: 'rgba(255,255,255,0.55)',
        fontSize: 14,
        fontFamily: CF.regular,
        textAlign: 'center',
        lineHeight: 20,
        marginBottom: 12,
    },
    time: {
        color: 'rgba(255,255,255,0.3)',
        fontSize: 12,
        fontFamily: CF.regular,
        marginBottom: 28,
    },
    btnRow: {
        flexDirection: 'row',
        gap: 10,
        marginTop: 4,
    },
    dismissBtn: {
        flex: 1,
        backgroundColor: '#44C8CA',
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
