/**
 * SecurityAlertModal
 *
 * Shown automatically when the alarm is armed and one or more locks
 * or garage / shutter covers are open.
 *
 * Props:
 *   visible  {bool}
 *   items    {Array<{ type: 'lock'|'cover', name: string, room: string }>}
 *   armedState  {string}  e.g. 'armed_away' | 'armed_home' | 'armed_night'
 *   onDismiss {fn}
 */

import { memo, useRef, useEffect } from 'react';
import {
    Modal, View, Text, TouchableOpacity, StyleSheet,
    Animated, ScrollView, Dimensions,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { TriangleAlert, Lock, DoorOpen, X } from 'lucide-react-native';
import { CF } from '../../utils/typography';

const SW = Dimensions.get('window').width;

// ── Human-readable armed state ─────────────────────────────────────────────
const ARMED_LABELS = {
    armed_away:  'Armed Away',
    armed_home:  'Armed Home',
    armed_night: 'Armed Night',
};

// ── Single item row ─────────────────────────────────────────────────────────
function AlertRow({ item }) {
    const isLock  = item.type === 'lock';
    const accent  = isLock ? '#EF5350' : '#FF9800';
    const Icon    = isLock ? Lock : DoorOpen;
    const verb    = isLock ? 'is unlocked' : 'is open';

    return (
        <View style={[row.wrap, { borderLeftColor: accent }]}>
            <View style={[row.iconBox, { backgroundColor: accent + '20' }]}>
                <Icon size={16} color={accent} />
            </View>
            <View style={row.text}>
                <Text style={row.name}>{item.name}</Text>
                <Text style={row.sub}>
                    {item.room
                        ? <Text><Text style={{ color: accent }}>in {item.room}</Text> • {verb}</Text>
                        : verb}
                </Text>
            </View>
        </View>
    );
}

const row = StyleSheet.create({
    wrap: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.04)',
        borderRadius: 12,
        borderLeftWidth: 3,
        paddingVertical: 11,
        paddingHorizontal: 12,
        marginBottom: 8,
        gap: 10,
    },
    iconBox: {
        width: 32,
        height: 32,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
    },
    text: { flex: 1 },
    name: {
        color: '#ededf5',
        fontSize: 14,
        fontFamily: CF.semibold,
        marginBottom: 2,
    },
    sub: {
        color: 'rgba(255,255,255,0.5)',
        fontSize: 12,
        fontFamily: CF.regular,
    },
});

// ── Main component ─────────────────────────────────────────────────────────
function SecurityAlertModal({ visible, items = [], armedState, onDismiss }) {
    const scaleAnim   = useRef(new Animated.Value(0.88)).current;
    const opacityAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (visible) {
            Animated.parallel([
                Animated.spring(scaleAnim,   { toValue: 1,   useNativeDriver: true, tension: 130, friction: 8 }),
                Animated.timing(opacityAnim, { toValue: 1,   useNativeDriver: true, duration: 220 }),
            ]).start();
        } else {
            scaleAnim.setValue(0.88);
            opacityAnim.setValue(0);
        }
    }, [visible]);

    const handleDismiss = () => {
        Animated.parallel([
            Animated.spring(scaleAnim,   { toValue: 0.88, useNativeDriver: true }),
            Animated.timing(opacityAnim, { toValue: 0,    useNativeDriver: true, duration: 160 }),
        ]).start(() => onDismiss?.());
    };

    const lockCount  = items.filter(i => i.type === 'lock').length;
    const coverCount = items.filter(i => i.type === 'cover').length;

    const subtitle = [
        lockCount  > 0 ? `${lockCount} lock${lockCount  > 1 ? 's' : ''} unlocked` : null,
        coverCount > 0 ? `${coverCount} door${coverCount > 1 ? 's' : ''} open`     : null,
    ].filter(Boolean).join(' & ');

    const armedLabel = ARMED_LABELS[armedState] ?? 'Armed';

    return (
        <Modal
            visible={visible}
            transparent
            animationType="none"
            statusBarTranslucent
            onRequestClose={handleDismiss}
        >
            <BlurView intensity={45} tint="dark" style={StyleSheet.absoluteFill} />

            <View style={s.overlay}>
                <Animated.View style={[s.card, { transform: [{ scale: scaleAnim }], opacity: opacityAnim }]}>

                    {/* Subtle gradient wash */}
                    <LinearGradient
                        colors={['rgba(239,83,80,0.12)', 'rgba(255,152,0,0.06)', 'rgba(0,0,0,0)']}
                        style={StyleSheet.absoluteFill}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                    />

                    {/* Dismiss × */}
                    <TouchableOpacity style={s.closeBtn} onPress={handleDismiss} activeOpacity={0.7}>
                        <X size={16} color="rgba(255,255,255,0.45)" />
                    </TouchableOpacity>

                    {/* ── Header band ─────────────────────────────────── */}
                    <View style={s.headerBand}>
                        <View style={s.warnBadge}>
                            <TriangleAlert size={14} color="#EF5350" />
                            <Text style={s.warnBadgeText}>SECURITY ALERT</Text>
                        </View>
                        <Text style={s.heading}>Warning</Text>
                        <Text style={s.headingSub}>
                            Home is <Text style={s.armedLabel}>{armedLabel}</Text> — no one should be inside.
                        </Text>
                    </View>

                    {/* ── Divider ──────────────────────────────────────── */}
                    <View style={s.divider} />

                    {/* ── Subtitle pill ───────────────────────────────── */}
                    {!!subtitle && (
                        <View style={s.summaryRow}>
                            <Text style={s.summaryText}>{subtitle} while armed</Text>
                        </View>
                    )}

                    {/* ── Item list ───────────────────────────────────── */}
                    <ScrollView
                        style={s.list}
                        contentContainerStyle={{ paddingBottom: 4 }}
                        showsVerticalScrollIndicator={false}
                        scrollEnabled={items.length > 4}
                    >
                        {items.map((item, idx) => (
                            <AlertRow key={`${item.type}-${item.name}-${idx}`} item={item} />
                        ))}
                    </ScrollView>

                    {/* ── Dismiss button ──────────────────────────────── */}
                    <TouchableOpacity style={s.dismissBtn} onPress={handleDismiss} activeOpacity={0.85}>
                        <Text style={s.dismissText}>Dismiss</Text>
                    </TouchableOpacity>

                </Animated.View>
            </View>
        </Modal>
    );
}

const s = StyleSheet.create({
    overlay: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 24,
    },
    card: {
        width: '100%',
        maxHeight: SW * 1.1,
        backgroundColor: '#0d0f26',
        borderRadius: 26,
        borderWidth: 1,
        borderColor: 'rgba(239,83,80,0.25)',
        paddingTop: 28,
        paddingBottom: 20,
        paddingHorizontal: 20,
        overflow: 'hidden',
        shadowColor: '#EF5350',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.3,
        shadowRadius: 28,
        elevation: 22,
    },
    closeBtn: {
        position: 'absolute',
        top: 14,
        right: 14,
        padding: 6,
        borderRadius: 18,
        backgroundColor: 'rgba(255,255,255,0.07)',
        zIndex: 10,
    },

    /* Header */
    headerBand: {
        alignItems: 'center',
        marginBottom: 16,
        paddingTop: 4,
    },
    warnBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(239,83,80,0.15)',
        borderRadius: 20,
        paddingHorizontal: 10,
        paddingVertical: 4,
        gap: 5,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: 'rgba(239,83,80,0.3)',
    },
    warnBadgeText: {
        color: '#EF5350',
        fontSize: 10,
        fontFamily: CF.bold ?? CF.semibold,
        letterSpacing: 1.2,
    },
    heading: {
        color: '#ffffff',
        fontSize: 26,
        fontFamily: CF.bold ?? CF.semibold,
        textAlign: 'center',
        marginBottom: 6,
    },
    headingSub: {
        color: 'rgba(255,255,255,0.5)',
        fontSize: 13,
        fontFamily: CF.regular,
        textAlign: 'center',
        lineHeight: 18,
    },
    armedLabel: {
        color: '#EF5350',
        fontFamily: CF.semibold,
    },

    /* Divider */
    divider: {
        height: 1,
        backgroundColor: 'rgba(255,255,255,0.07)',
        marginBottom: 12,
    },

    /* Summary pill */
    summaryRow: {
        backgroundColor: 'rgba(255,152,0,0.1)',
        borderRadius: 10,
        paddingHorizontal: 12,
        paddingVertical: 6,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: 'rgba(255,152,0,0.2)',
        alignSelf: 'stretch',
    },
    summaryText: {
        color: '#FF9800',
        fontSize: 12,
        fontFamily: CF.semibold,
        textAlign: 'center',
    },

    /* List */
    list: {
        maxHeight: 260,
        marginBottom: 16,
    },

    /* Dismiss */
    dismissBtn: {
        backgroundColor: '#EF5350',
        borderRadius: 14,
        paddingVertical: 13,
        alignItems: 'center',
    },
    dismissText: {
        color: '#fff',
        fontSize: 15,
        fontFamily: CF.semibold,
    },
});

export default memo(SecurityAlertModal);
