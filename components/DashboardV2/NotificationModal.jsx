import React, { memo, useCallback, useEffect } from 'react';
import {
    View, Text, StyleSheet, Modal, TouchableOpacity,
    ScrollView, Pressable,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { X, Bell, Lock, Thermometer, Camera, Zap, DoorOpen, Shield, Sun } from 'lucide-react-native';

// ── Icon config per notification category ──────────────────────────────────
const CATEGORY_CONFIG = {
    lock:     { icon: Lock,        grad: ['#832ea9', '#9b45c8'], color: '#c084fc' },
    climate:  { icon: Thermometer, grad: ['#1e6fa8', '#3b9fd4'], color: '#60c8f0' },
    camera:   { icon: Camera,      grad: ['#1e6fa8', '#44c8ca'], color: '#44c8ca' },
    scene:    { icon: Zap,         grad: ['#b06a10', '#e8a020'], color: '#f0b040' },
    door:     { icon: DoorOpen,    grad: ['#a83232', '#d95050'], color: '#f08080' },
    security: { icon: Shield,      grad: ['#832ea9', '#7354b1'], color: '#a880e0' },
    light:    { icon: Sun,         grad: ['#9a7010', '#d4b030'], color: '#f0d060' },
    default:  { icon: Bell,        grad: ['#3a3a5c', '#565680'], color: 'rgba(237,237,245,0.6)' },
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
    const now = Date.now();
    const diff = Math.floor((now - ts) / 1000);
    if (diff < 60)   return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
    if (diff < 86400) {
        const h = Math.floor(diff / 3600);
        return `${h} hr ago`;
    }
    // Same day → show time
    const d = new Date(ts);
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
            <LinearGradient
                colors={cfg.grad}
                style={styles.iconOrb}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
            >
                <IconComp size={20} color="#fff" />
            </LinearGradient>

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

    // Fetch latest from DB whenever the modal becomes visible
    useEffect(() => {
        if (visible && onOpen) onOpen();
    }, [visible]);

    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            statusBarTranslucent
            onRequestClose={onClose}
        >
            {/* Backdrop */}
            <Pressable style={styles.backdrop} onPress={onClose} />

            {/* Panel */}
            <View style={styles.panelWrapper} pointerEvents="box-none">
                <BlurView intensity={60} tint="dark" style={styles.panel}>
                    {/* Header row */}
                    <View style={styles.header}>
                        <Text style={styles.headerTitle}>Notifications</Text>
                        <View style={styles.headerRight}>
                            {notifications.length > 0 && (
                                <TouchableOpacity onPress={handleClearAll} activeOpacity={0.7} style={styles.clearBtn}>
                                    <Text style={styles.clearText}>Clear all</Text>
                                </TouchableOpacity>
                            )}
                            <TouchableOpacity onPress={onClose} activeOpacity={0.7} style={styles.closeBtn}>
                                <X size={16} color="rgba(237,237,245,0.8)" />
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
                </BlurView>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    backdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.55)',
    },
    panelWrapper: {
        position: 'absolute',
        top: 100,
        left: 16,
        right: 16,
        maxHeight: '75%',
    },
    panel: {
        borderRadius: 20,
        overflow: 'hidden',
        backgroundColor: 'rgba(13,13,30,0.85)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    // ── Header ──
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 18,
        paddingTop: 18,
        paddingBottom: 12,
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#ededf5',
        letterSpacing: -0.3,
    },
    headerRight: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    clearBtn: {
        paddingHorizontal: 8,
        paddingVertical: 4,
    },
    clearText: {
        fontSize: 13,
        color: 'rgba(237,237,245,0.45)',
        fontWeight: '500',
    },
    closeBtn: {
        width: 30,
        height: 30,
        borderRadius: 10,
        backgroundColor: 'rgba(255,255,255,0.08)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    // ── List ──
    list: {
        paddingHorizontal: 14,
        paddingBottom: 16,
    },
    item: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        paddingVertical: 12,
        gap: 12,
    },
    iconOrb: {
        width: 44,
        height: 44,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
    },
    itemText: {
        flex: 1,
        gap: 2,
    },
    itemTitle: {
        fontSize: 14,
        fontWeight: '600',
        color: '#ededf5',
        letterSpacing: -0.1,
    },
    itemBody: {
        fontSize: 12.5,
        color: 'rgba(237,237,245,0.55)',
        lineHeight: 17,
    },
    itemTime: {
        fontSize: 11,
        color: 'rgba(237,237,245,0.3)',
        marginTop: 2,
    },
    unreadDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#832ea9',
        marginTop: 4,
        flexShrink: 0,
    },
    separator: {
        height: 1,
        backgroundColor: 'rgba(255,255,255,0.05)',
        marginHorizontal: 4,
    },
    // ── Empty ──
    empty: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 40,
        gap: 10,
    },
    emptyText: {
        fontSize: 13,
        color: 'rgba(237,237,245,0.3)',
    },
});

export default memo(NotificationModal);
