import React, { memo, useCallback, useEffect } from 'react';
import {
    View, Text, StyleSheet, Modal, TouchableOpacity,
    ScrollView, Pressable,
} from 'react-native';
import { X, Bell, Lock, Thermometer, Camera, Zap, DoorOpen, Shield, Sun } from 'lucide-react-native';

// ── Icon config per notification category ──────────────────────────────────
const CATEGORY_CONFIG = {
    lock:     { icon: Lock,        bg: '#6c2d99', color: '#fff' },
    climate:  { icon: Thermometer, bg: '#1a7ab5', color: '#fff' },
    camera:   { icon: Camera,      bg: '#1a8fa8', color: '#fff' },
    scene:    { icon: Zap,         bg: '#b06a10', color: '#fff' },
    door:     { icon: DoorOpen,    bg: '#a83232', color: '#fff' },
    security: { icon: Shield,      bg: '#5c3d99', color: '#fff' },
    light:    { icon: Sun,         bg: '#9a7010', color: '#fff' },
    default:  { icon: Bell,        bg: '#3a3a5c', color: 'rgba(237,237,245,0.8)' },
};

function getCategory(notification) {
    const cat = notification.category?.toLowerCase() || '';
    if (cat in CATEGORY_CONFIG) return cat;
    // Infer from title / body
    const text = `${notification.title} ${notification.body}`.toLowerCase();
    if (text.includes('lock') || text.includes('unlock') || text.includes('door lock')) return 'lock';
    if (text.includes('ac') || text.includes('climate') || text.includes('temperature') || text.includes('°')) return 'climate';
    if (text.includes('camera') || text.includes('motion') || text.includes('frigate')) return 'camera';
    if (text.includes('scene') || text.includes('routine') || text.includes('automation')) return 'scene';
    if (text.includes('door') || text.includes('window')) return 'door';
    if (text.includes('alarm') || text.includes('security') || text.includes('arm') || text.includes('disarm')) return 'security';
    if (text.includes('light') || text.includes('blind')) return 'light';
    return 'default';
}

function formatTime(ts) {
    if (!ts) return '';
    // Accept both ISO string and numeric timestamp
    const ms  = typeof ts === 'number' ? ts : new Date(ts).getTime();
    const now = Date.now();
    const diff = Math.floor((now - ms) / 1000);
    if (diff < 60)   return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
    if (diff < 86400) {
        const h = Math.floor(diff / 3600);
        return `${h} hr ago`;
    }
    // Older — show date + time
    const d = new Date(ms);
    const hh = d.getHours();
    const mm = d.getMinutes().toString().padStart(2, '0');
    const ampm = hh >= 12 ? 'PM' : 'AM';
    return `${hh % 12 || 12}:${mm} ${ampm}`;
}

function NotificationItem({ item }) {
    const cat = getCategory(item);
    const cfg = CATEGORY_CONFIG[cat] || CATEGORY_CONFIG.default;
    const IconComp = cfg.icon;

    return (
        <View style={styles.item}>
            {/* Icon orb */}
            <View style={[styles.iconOrb, { backgroundColor: cfg.bg }]}>
                <IconComp size={18} color={cfg.color} />
            </View>

            {/* Text */}
            <View style={styles.itemText}>
                <Text style={styles.itemTitle} numberOfLines={1}>{item.title}</Text>
                <Text style={styles.itemBody} numberOfLines={2}>{item.body}</Text>
                <Text style={styles.itemTime}>{formatTime(item.timestamp)}</Text>
            </View>

            {/* Unread dot */}
            {item.unread && <View style={styles.unreadDot} />}
        </View>
    );
}

function NotificationModal({ visible, notifications = [], onClose, onClearAll, onOpen }) {
    const handleClearAll = useCallback(() => {
        if (onClearAll) onClearAll();
    }, [onClearAll]);

    // Refresh from server whenever the modal opens
    useEffect(() => {
        if (visible && onOpen) onOpen();
    }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            statusBarTranslucent
            onRequestClose={onClose}
        >
            {/* Dim backdrop — tap to close */}
            <Pressable style={styles.backdrop} onPress={onClose} />

            {/* Floating card — drops from top of screen below status bar */}
            <View style={styles.panelWrapper} pointerEvents="box-none">
                <View style={styles.panel}>
                    {/* Header row */}
                    <View style={styles.header}>
                        <Text style={styles.headerTitle}>Notifications</Text>
                        <View style={styles.headerRight}>
                            {notifications.length > 0 && (
                                <TouchableOpacity onPress={handleClearAll} activeOpacity={0.7}>
                                    <Text style={styles.clearText}>Clear all</Text>
                                </TouchableOpacity>
                            )}
                            <TouchableOpacity onPress={onClose} activeOpacity={0.7} style={styles.closeBtn}>
                                <X size={14} color="rgba(237,237,245,0.75)" />
                            </TouchableOpacity>
                        </View>
                    </View>

                    {/* List */}
                    {notifications.length === 0 ? (
                        <View style={styles.empty}>
                            <Bell size={32} color="rgba(237,237,245,0.2)" />
                            <Text style={styles.emptyText}>No notifications</Text>
                        </View>
                    ) : (
                        <ScrollView
                            showsVerticalScrollIndicator={false}
                            contentContainerStyle={styles.list}
                        >
                            {notifications.map((n, idx) => (
                                <React.Fragment key={n.id || idx}>
                                    <NotificationItem item={n} />
                                    {idx < notifications.length - 1 && <View style={styles.separator} />}
                                </React.Fragment>
                            ))}
                        </ScrollView>
                    )}
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    // ── Backdrop ──
    backdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.45)',
    },
    // ── Panel ──
    panelWrapper: {
        position: 'absolute',
        top: 54,          // just below the status bar — same as designer
        left: 0,
        right: 0,
        maxHeight: '78%',
        paddingHorizontal: 14,
    },
    panel: {
        borderRadius: 22,
        backgroundColor: '#12121e',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.07)',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.55,
        shadowRadius: 28,
        elevation: 20,
        overflow: 'hidden',
    },
    // ── Header ──
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingTop: 20,
        paddingBottom: 14,
    },
    headerTitle: {
        fontSize: 17,
        fontWeight: '700',
        color: '#ededf5',
        letterSpacing: -0.2,
    },
    headerRight: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    clearText: {
        fontSize: 13,
        color: 'rgba(237,237,245,0.4)',
        fontWeight: '500',
    },
    closeBtn: {
        width: 26,
        height: 26,
        borderRadius: 13,
        backgroundColor: 'rgba(255,255,255,0.09)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    // ── List ──
    list: {
        paddingHorizontal: 16,
        paddingBottom: 18,
    },
    item: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        paddingVertical: 13,
        gap: 13,
    },
    iconOrb: {
        width: 42,
        height: 42,
        borderRadius: 13,
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
    },
    itemText: {
        flex: 1,
        gap: 3,
    },
    itemTitle: {
        fontSize: 14,
        fontWeight: '600',
        color: '#ededf5',
        letterSpacing: -0.1,
    },
    itemBody: {
        fontSize: 12.5,
        color: 'rgba(237,237,245,0.5)',
        lineHeight: 17,
    },
    itemTime: {
        fontSize: 11,
        color: 'rgba(237,237,245,0.28)',
        marginTop: 1,
    },
    unreadDot: {
        width: 7,
        height: 7,
        borderRadius: 3.5,
        backgroundColor: '#832ea9',
        marginTop: 5,
        flexShrink: 0,
    },
    separator: {
        height: StyleSheet.hairlineWidth,
        backgroundColor: 'rgba(255,255,255,0.07)',
        marginLeft: 55,   // aligns with text, skips icon column
    },
    // ── Empty ──
    empty: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 44,
        gap: 10,
    },
    emptyText: {
        fontSize: 13,
        color: 'rgba(237,237,245,0.3)',
    },
});

export default memo(NotificationModal);
