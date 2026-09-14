/**
 * ActiveUsersSheetModal — bottom-sheet, drag-to-dismiss
 * Same visual pattern as LocksModal. Lists each active app session:
 * who is logged in, on which device, platform, and current app state.
 */
import {
    Modal, View, Text, StyleSheet,
    TouchableOpacity, ScrollView, ActivityIndicator,
} from 'react-native';
import { X, Smartphone, Users } from 'lucide-react-native';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import ModalBackdrop from '../ModalBackdrop';
import Animated, {
    useSharedValue, useAnimatedStyle, withTiming, withSpring, runOnJS,
} from 'react-native-reanimated';
import { useEffect } from 'react';
import { CF } from '../../utils/typography';

const C_GREEN  = '#26D07C';
const C_AMBER  = '#FFA000';
const C_PURPLE = '#8947ca';

function formatTimeAgo(date) {
    if (!date) return '--';
    const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
    if (seconds < 10) return 'Just now';
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
}

function platformEmoji(platform) {
    if (platform === 'ios') return '🍎';
    if (platform === 'android') return '🤖';
    return '📱';
}

export default function ActiveUsersSheetModal({
    visible,
    onClose,
    users = [],
    loading = false,
    error = null,
}) {
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

    const foregroundCount = users.filter(u => u.appState === 'foreground').length;

    const renderUserRow = (user) => {
        const isForeground = user.appState === 'foreground';
        const initial = (user.userName || '?')[0]?.toUpperCase();

        return (
            <View key={user.id} style={styles.row}>
                <View style={styles.avatarWrap}>
                    <View style={styles.avatar}>
                        <Text style={styles.avatarText}>{initial}</Text>
                    </View>
                    <View style={[
                        styles.statusDot,
                        { backgroundColor: isForeground ? C_GREEN : C_AMBER },
                    ]} />
                </View>

                <View style={{ flex: 1, gap: 4 }}>
                    <Text style={styles.rowName} numberOfLines={1}>
                        {user.userName || 'Unknown user'}
                    </Text>
                    <View style={styles.deviceLine}>
                        <Smartphone size={12} color="rgba(237,237,245,0.4)" />
                        <Text style={styles.deviceText} numberOfLines={1}>
                            {platformEmoji(user.platform)} {user.deviceName || 'Unknown device'}
                        </Text>
                    </View>
                </View>

                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <View style={[styles.badge, {
                        borderColor: isForeground ? C_GREEN : 'rgba(255,255,255,0.08)',
                    }]}>
                        <View style={[styles.dot, { backgroundColor: isForeground ? C_GREEN : C_AMBER }]} />
                        <Text style={[styles.badgeText, {
                            color: isForeground ? C_GREEN : 'rgba(237,237,245,0.5)',
                        }]}>
                            {isForeground ? 'Active' : 'Background'}
                        </Text>
                    </View>
                    <Text style={styles.lastSeenText}>{formatTimeAgo(user.lastSeen)}</Text>
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
                <ModalBackdrop onPress={onClose} />
                <Animated.View style={[styles.sheet, sheetAnimStyle]}>

                    {/* ── Drag handle ── */}
                    <GestureDetector gesture={dismissGesture}>
                        <View style={styles.handleTouchArea}>
                            <View style={styles.handle} />
                        </View>
                    </GestureDetector>

                    {/* ── Header ── */}
                    <View style={styles.header}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                            <View style={styles.headerIconWrap}>
                                <Users size={18} color={C_PURPLE} />
                            </View>
                            <View>
                                <Text style={styles.title}>Active Users</Text>
                                <Text style={styles.subtitle}>
                                    {users.length === 0
                                        ? 'No one online'
                                        : `${foregroundCount} active · ${users.length} online`}
                                </Text>
                            </View>
                        </View>
                        <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.7}>
                            <X size={18} color="rgba(255,255,255,0.5)" />
                        </TouchableOpacity>
                    </View>

                    <Text style={styles.sectionLabel}>SESSIONS</Text>

                    {loading && users.length === 0 ? (
                        <ActivityIndicator size="small" color={C_PURPLE} style={{ marginTop: 24, marginBottom: 24 }} />
                    ) : error ? (
                        <Text style={styles.emptyText}>Unable to load active users</Text>
                    ) : users.length === 0 ? (
                        <Text style={styles.emptyText}>No active users right now</Text>
                    ) : (
                        <ScrollView
                            style={styles.scroll}
                            showsVerticalScrollIndicator={false}
                            contentContainerStyle={styles.scrollContent}
                        >
                            {users.map(renderUserRow)}
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
    headerIconWrap: {
        width: 36,
        height: 36,
        borderRadius: 12,
        backgroundColor: 'rgba(137,71,202,0.12)',
        alignItems: 'center',
        justifyContent: 'center',
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
        paddingHorizontal: 14,
        paddingVertical: 12,
        marginBottom: 8,
        gap: 12,
    },
    avatarWrap: {
        position: 'relative',
    },
    avatar: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(137,71,202,0.25)',
        borderWidth: 1,
        borderColor: 'rgba(137,71,202,0.4)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    avatarText: {
        fontSize: 15,
        fontFamily: CF.bold,
        color: '#fff',
    },
    statusDot: {
        position: 'absolute',
        width: 11,
        height: 11,
        borderRadius: 5.5,
        bottom: -1,
        right: -1,
        borderWidth: 2,
        borderColor: '#0f1028',
    },
    rowName: {
        color: '#ededf5',
        fontSize: 14,
        fontFamily: CF.medium,
        letterSpacing: 0.1,
    },
    deviceLine: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
    },
    deviceText: {
        color: 'rgba(237,237,245,0.45)',
        fontSize: 12,
        fontFamily: CF.regular,
    },
    badge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingHorizontal: 9,
        paddingVertical: 4,
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
        fontSize: 11,
        fontFamily: CF.medium,
    },
    lastSeenText: {
        color: 'rgba(237,237,245,0.3)',
        fontSize: 10,
        fontFamily: CF.regular,
    },
    emptyText: {
        color: 'rgba(255,255,255,0.3)',
        fontSize: 13,
        fontFamily: CF.regular,
        textAlign: 'center',
        marginTop: 32,
        marginBottom: 32,
        paddingHorizontal: 8,
    },
});
