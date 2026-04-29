/**
 * LocksModal — bottom-sheet, drag-to-dismiss
 * Same pattern as HomeAccess EditModal.
 */
import {
    Modal, View, Text, StyleSheet,
    TouchableOpacity, ScrollView, ActivityIndicator,
} from 'react-native';
import { X, LockOpen, Lock, ShieldCheck, ShieldOff, Radio, RadioTower } from 'lucide-react-native';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import Animated, {
    useSharedValue, useAnimatedStyle, withTiming, withSpring, runOnJS,
} from 'react-native-reanimated';
import { useEffect, useState } from 'react';
import { CF } from '../../utils/typography';

const C_CYAN   = '#26C6DA';
const C_PURPLE = '#8947ca';
const C_RED    = '#EF5350';
const C_AMBER  = '#FFA000';

export default function LocksModal({
    visible,
    locks = [],
    lockPassageConfigs = {},
    entities = [],
    onClose,
    isArmed = false,
    onArmToggle,
}) {
    // Build a fast entity state lookup
    const entityStateMap = {};
    entities.forEach(e => { entityStateMap[e.entity_id] = e; });

    const unlocked = locks.filter(l => l.state === 'unlocked' || l.state === 'open').length;
    const [saving, setSaving] = useState(false);

    // ── Slide-in / drag-to-dismiss ────────────────────────────────────────────
    const sheetY = useSharedValue(700);

    useEffect(() => {
        if (visible) {
            sheetY.value = 700;
            sheetY.value = withTiming(0, { duration: 300 });
        }
    }, [visible]);

    const dismissGesture = Gesture.Pan()
        .activeOffsetY(5)
        .onUpdate(e => {
            if (e.translationY > 0) sheetY.value = e.translationY;
        })
        .onEnd(e => {
            if (e.translationY > 100 || e.velocityY > 600) {
                sheetY.value = withTiming(700, { duration: 250 }, () => {
                    runOnJS(onClose)();
                });
            } else {
                sheetY.value = withSpring(0, { damping: 20 });
            }
        });

    const sheetAnimStyle = useAnimatedStyle(() => ({
        transform: [{ translateY: sheetY.value }],
    }));

    // ── Arm toggle ────────────────────────────────────────────────────────────
    const handleToggleArm = async () => {
        if (saving || !onArmToggle) return;
        setSaving(true);
        try {
            await onArmToggle(!isArmed);
        } finally {
            setSaving(false);
        }
    };

    // ── Lock row ──────────────────────────────────────────────────────────────
    const renderLockRow = (item) => {
        const isUnlocked = item.state === 'unlocked' || item.state === 'open';
        const isTransit  = item.state === 'locking' || item.state === 'unlocking';
        const name       = item.attributes?.friendly_name || item.entity_id.replace(/_/g, ' ');
        const lockLabel  = isTransit
            ? (item.state === 'locking' ? 'Locking…' : 'Unlocking…')
            : isUnlocked ? 'Unlocked' : 'Locked';

        // Sensor linked to this lock (if configured)
        const sensorEntityId = lockPassageConfigs[item.entity_id]?.sensor_entity_id;
        const sensorEntity   = sensorEntityId ? entityStateMap[sensorEntityId] : null;
        const sensorTriggered = sensorEntity?.state === 'on';
        const sensorLabel    = sensorEntity
            ? (sensorTriggered ? 'Open' : 'Closed')
            : null;

        // Indicator dot color: sensor state takes priority if configured
        const dotColor = sensorEntity
            ? (sensorTriggered ? C_AMBER : 'rgba(237,237,245,0.2)')
            : (isUnlocked ? C_CYAN : 'rgba(237,237,245,0.2)');

        return (
            <View key={item.entity_id} style={styles.row}>
                {/* Lock icon — reflects lock state */}
                <View style={[styles.iconWrap, { borderColor: isUnlocked ? C_CYAN : 'rgba(255,255,255,0.1)' }]}>
                    {isUnlocked
                        ? <LockOpen size={18} color={C_CYAN} />
                        : <Lock    size={18} color="rgba(237,237,245,0.35)" />
                    }
                </View>

                <View style={{ flex: 1, gap: 4 }}>
                    <Text style={styles.rowName} numberOfLines={1}>{name}</Text>

                    {/* Badges row */}
                    <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                        {/* Lock state badge */}
                        <View style={[styles.badge, { borderColor: isUnlocked ? C_CYAN : 'rgba(255,255,255,0.08)' }]}>
                            <View style={[styles.dot, { backgroundColor: isUnlocked ? C_CYAN : 'rgba(237,237,245,0.2)' }]} />
                            <Text style={[styles.badgeText, { color: isUnlocked ? C_CYAN : 'rgba(237,237,245,0.45)' }]}>
                                {lockLabel}
                            </Text>
                        </View>

                        {/* Sensor state badge — only if sensor is configured */}
                        {sensorEntity && (
                            <View style={[styles.badge, {
                                borderColor: sensorTriggered ? C_AMBER : 'rgba(255,255,255,0.08)',
                            }]}>
                                <View style={[styles.dot, { backgroundColor: dotColor }]} />
                                <Text style={[styles.badgeText, {
                                    color: sensorTriggered ? C_AMBER : 'rgba(237,237,245,0.45)',
                                }]}>
                                    {sensorLabel}
                                </Text>
                            </View>
                        )}
                    </View>
                </View>
            </View>
        );
    };

    return (
        <Modal
            visible={visible}
            transparent
            animationType="none"
            onRequestClose={onClose}
        >
            <View style={styles.overlay}>
                <Animated.View style={[styles.sheet, sheetAnimStyle]}>

                    {/* ── Drag handle ── */}
                    <GestureDetector gesture={dismissGesture}>
                        <View style={styles.handleTouchArea}>
                            <View style={styles.handle} />
                        </View>
                    </GestureDetector>

                    {/* ── Header ── */}
                    <View style={styles.header}>
                        <View>
                            <Text style={styles.title}>Locks</Text>
                            <Text style={styles.subtitle}>
                                {unlocked > 0
                                    ? `${unlocked} unlocked · ${locks.length - unlocked} locked`
                                    : `All ${locks.length} locked`}
                            </Text>
                        </View>
                        <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.7}>
                            <X size={18} color="rgba(255,255,255,0.5)" />
                        </TouchableOpacity>
                    </View>

                    {/* ── Arm / Disarm row ── */}
                    <TouchableOpacity
                        style={[styles.armRow, isArmed && styles.armRowArmed]}
                        onPress={handleToggleArm}
                        activeOpacity={0.75}
                        disabled={saving}
                    >
                        <View style={[
                            styles.armIconWrap,
                            { backgroundColor: isArmed ? 'rgba(239,83,80,0.15)' : 'rgba(137,71,202,0.12)' },
                        ]}>
                            {saving
                                ? <ActivityIndicator size="small" color={isArmed ? C_RED : C_PURPLE} />
                                : isArmed
                                    ? <ShieldCheck size={20} color={C_RED} />
                                    : <ShieldOff   size={20} color={C_PURPLE} />
                            }
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={[styles.armTitle, { color: isArmed ? C_RED : 'rgba(237,237,245,0.9)' }]}>
                                {isArmed ? 'Lock Alert Armed' : 'Lock Alert Disarmed'}
                            </Text>
                            <Text style={styles.armSub}>
                                {isArmed
                                    ? 'You will be notified if any lock is unlocked'
                                    : 'Tap to get alerts when a lock is unlocked'}
                            </Text>
                        </View>
                        <View style={[styles.togglePill, isArmed && styles.togglePillOn]}>
                            <View style={[styles.toggleKnob, isArmed && styles.toggleKnobOn]} />
                        </View>
                    </TouchableOpacity>

                    {/* ── Section label ── */}
                    <Text style={styles.sectionLabel}>LOCKS</Text>

                    {/* ── Lock list ── */}
                    {locks.length === 0 ? (
                        <Text style={styles.emptyText}>No locks found</Text>
                    ) : (
                        <ScrollView
                            style={styles.scroll}
                            showsVerticalScrollIndicator={false}
                            contentContainerStyle={styles.scrollContent}
                        >
                            {locks.map(renderLockRow)}
                        </ScrollView>
                    )}

                </Animated.View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.65)',
        justifyContent: 'flex-end',
    },
    sheet: {
        backgroundColor: '#0f1028',
        borderTopLeftRadius: 28,
        borderTopRightRadius: 28,
        borderTopWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
        paddingBottom: 32,
        maxHeight: '85%',
    },
    handle: {
        width: 36,
        height: 4,
        borderRadius: 2,
        backgroundColor: 'rgba(255,255,255,0.15)',
        alignSelf: 'center',
        marginTop: 12,
        marginBottom: 4,
    },
    handleTouchArea: {
        alignSelf: 'stretch',
        alignItems: 'center',
        paddingVertical: 10,
        marginTop: 2,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingVertical: 14,
    },
    title: {
        color: '#fff',
        fontSize: 18,
        fontFamily: CF.bold,
        letterSpacing: 0.2,
    },
    subtitle: {
        color: 'rgba(255,255,255,0.35)',
        fontSize: 13,
        fontFamily: CF.regular,
        marginTop: 2,
    },
    closeBtn: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: 'rgba(255,255,255,0.07)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    armRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginHorizontal: 16,
        marginBottom: 16,
        paddingHorizontal: 14,
        paddingVertical: 14,
        borderRadius: 14,
        backgroundColor: 'rgba(255,255,255,0.03)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
        gap: 12,
    },
    armRowArmed: {
        borderColor: 'rgba(239,83,80,0.3)',
        backgroundColor: 'rgba(239,83,80,0.05)',
    },
    armIconWrap: {
        width: 40,
        height: 40,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    armTitle: {
        fontSize: 14,
        fontFamily: CF.semibold,
        marginBottom: 2,
    },
    armSub: {
        fontSize: 11,
        fontFamily: CF.regular,
        color: 'rgba(237,237,245,0.38)',
    },
    togglePill: {
        width: 44,
        height: 26,
        borderRadius: 13,
        backgroundColor: 'rgba(255,255,255,0.1)',
        justifyContent: 'center',
        paddingHorizontal: 3,
    },
    togglePillOn: {
        backgroundColor: C_RED,
    },
    toggleKnob: {
        width: 20,
        height: 20,
        borderRadius: 10,
        backgroundColor: '#fff',
        alignSelf: 'flex-start',
    },
    toggleKnobOn: {
        alignSelf: 'flex-end',
    },
    sectionLabel: {
        color: 'rgba(255,255,255,0.3)',
        fontSize: 11,
        fontFamily: CF.semibold,
        letterSpacing: 1.2,
        paddingHorizontal: 20,
        marginBottom: 8,
    },
    scroll: {
        paddingHorizontal: 16,
    },
    scrollContent: {
        paddingBottom: 8,
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.03)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
        borderRadius: 14,
        paddingHorizontal: 16,
        paddingVertical: 14,
        marginBottom: 8,
        gap: 12,
    },
    iconWrap: {
        width: 36,
        height: 36,
        borderRadius: 10,
        borderWidth: 1,
        backgroundColor: 'rgba(255,255,255,0.04)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    rowName: {
        flex: 1,
        color: '#ededf5',
        fontSize: 14,
        fontFamily: CF.medium,
        letterSpacing: 0.1,
    },
    badge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 20,
        borderWidth: 1,
        backgroundColor: 'rgba(255,255,255,0.03)',
    },
    dot: {
        width: 6,
        height: 6,
        borderRadius: 3,
    },
    badgeText: {
        fontSize: 12,
        fontFamily: CF.medium,
    },
    emptyText: {
        color: 'rgba(255,255,255,0.3)',
        fontSize: 13,
        fontFamily: CF.regular,
        textAlign: 'center',
        marginTop: 32,
        paddingHorizontal: 8,
    },
});
