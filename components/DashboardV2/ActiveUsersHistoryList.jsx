import { View, Text, StyleSheet, ScrollView, ActivityIndicator, RefreshControl, TouchableOpacity } from 'react-native';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import PlatformGlyph from './PlatformGlyph';
import { CF } from '../../utils/typography';

const C_PURPLE = '#8947ca';

export function formatTimeAgo(date) {
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

export function formatDuration(start, end) {
    if (!start || !end) return null;
    const ms = new Date(end).getTime() - new Date(start).getTime();
    if (!Number.isFinite(ms) || ms < 0) return null;
    const seconds = Math.max(1, Math.floor(ms / 1000));
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const remain = minutes % 60;
    return remain ? `${hours}h ${remain}m` : `${hours}h`;
}

function platformLabel(platform) {
    const p = String(platform || '').toLowerCase();
    if (p === 'ios' || p === 'iphone' || p === 'ipad') return 'iPhone';
    if (p === 'android') return 'Android';
    return null;
}

export function SessionHistoryRow({ session }) {
    const initial = (session.userName || '?')[0]?.toUpperCase();
    const duration = formatDuration(session.startedAt, session.lastSeen);
    const device = session.deviceName || platformLabel(session.platform) || 'Unknown device';

    return (
        <View style={styles.row}>
            <View style={styles.avatar}>
                <Text style={styles.avatarText}>{initial}</Text>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.name} numberOfLines={1}>
                    {session.userName || 'Unknown user'}
                </Text>
                <View style={styles.metaLine}>
                    <PlatformGlyph platform={session.platform} size={12} framed={false} />
                    <Text style={styles.meta} numberOfLines={1}>
                        {device}
                    </Text>
                </View>
            </View>
            <View style={styles.rightCol}>
                {session.isActive ? (
                    <Text style={styles.now}>Online now</Text>
                ) : (
                    <Text style={styles.when}>{formatTimeAgo(session.lastSeen)}</Text>
                )}
                {!!duration && !session.isActive && <Text style={styles.duration}>{duration}</Text>}
            </View>
        </View>
    );
}

export default function ActiveUsersHistoryList({
    sessions = [],
    loading = false,
    error = null,
    emptyText = 'No recent sessions',
    refreshing = false,
    onRefresh,
    page = 1,
    pages = 1,
    pageLoading = false,
    onPrevPage,
    onNextPage,
}) {
    const refreshControl = onRefresh ? (
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C_PURPLE} />
    ) : undefined;

    const pager = pages > 1 ? (
        <View style={styles.pager}>
            <TouchableOpacity
                style={[styles.pageBtn, !onPrevPage && styles.pageBtnDisabled]}
                onPress={onPrevPage || undefined}
                disabled={!onPrevPage || pageLoading}
                activeOpacity={0.75}
            >
                <ChevronLeft size={18} color={onPrevPage ? '#fff' : 'rgba(255,255,255,0.25)'} />
            </TouchableOpacity>
            <View style={styles.pageMeta}>
                {pageLoading ? (
                    <ActivityIndicator size="small" color={C_PURPLE} />
                ) : (
                    <Text style={styles.pageText}>Page {page} of {pages}</Text>
                )}
            </View>
            <TouchableOpacity
                style={[styles.pageBtn, !onNextPage && styles.pageBtnDisabled]}
                onPress={onNextPage || undefined}
                disabled={!onNextPage || pageLoading}
                activeOpacity={0.75}
            >
                <ChevronRight size={18} color={onNextPage ? '#fff' : 'rgba(255,255,255,0.25)'} />
            </TouchableOpacity>
        </View>
    ) : null;

    if (loading && sessions.length === 0) {
        return (
            <ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.centered}
                refreshControl={refreshControl}
            >
                <ActivityIndicator size="small" color={C_PURPLE} />
            </ScrollView>
        );
    }
    if (error && sessions.length === 0) {
        return (
            <ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.centered}
                refreshControl={refreshControl}
            >
                <Text style={styles.empty}>{error}</Text>
            </ScrollView>
        );
    }
    if (sessions.length === 0) {
        return (
            <ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.centered}
                refreshControl={refreshControl}
            >
                <Text style={styles.empty}>{emptyText}</Text>
            </ScrollView>
        );
    }

    return (
        <View style={{ flex: 1 }}>
            <ScrollView
                key={page}
                style={styles.scroll}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.scrollContent}
                refreshControl={refreshControl}
            >
                {sessions.map((session) => (
                    <SessionHistoryRow key={session.id || `${session.userId}-${session.lastSeen}`} session={session} />
                ))}
            </ScrollView>
            {pager}
        </View>
    );
}

const styles = StyleSheet.create({
    scroll: {
        flex: 1,
        paddingHorizontal: 16,
    },
    scrollContent: {
        paddingBottom: 24,
    },
    centered: {
        flexGrow: 1,
        justifyContent: 'center',
        paddingBottom: 48,
    },
    now: {
        color: '#26D07C',
        fontSize: 12,
        fontFamily: CF.medium,
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
    avatar: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(137,71,202,0.22)',
        borderWidth: 1,
        borderColor: 'rgba(137,71,202,0.35)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    avatarText: {
        fontSize: 15,
        fontFamily: CF.bold,
        color: '#fff',
    },
    name: {
        color: '#ededf5',
        fontSize: 14,
        fontFamily: CF.medium,
        marginBottom: 4,
    },
    metaLine: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    meta: {
        flex: 1,
        color: 'rgba(237,237,245,0.45)',
        fontSize: 12,
        fontFamily: CF.regular,
    },
    rightCol: {
        alignItems: 'flex-end',
        gap: 3,
    },
    when: {
        color: 'rgba(237,237,245,0.55)',
        fontSize: 12,
        fontFamily: CF.medium,
    },
    duration: {
        color: 'rgba(237,237,245,0.32)',
        fontSize: 11,
        fontFamily: CF.regular,
    },
    empty: {
        color: 'rgba(255,255,255,0.3)',
        fontSize: 13,
        fontFamily: CF.regular,
        textAlign: 'center',
        marginTop: 32,
        marginBottom: 32,
        paddingHorizontal: 16,
    },
    pager: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 16,
        paddingTop: 8,
        paddingBottom: 8,
        gap: 16,
    },
    pageBtn: {
        width: 40,
        height: 40,
        borderRadius: 12,
        backgroundColor: 'rgba(255,255,255,0.08)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    pageBtnDisabled: {
        backgroundColor: 'rgba(255,255,255,0.03)',
    },
    pageMeta: {
        minWidth: 110,
        alignItems: 'center',
        justifyContent: 'center',
        height: 40,
    },
    pageText: {
        color: 'rgba(255,255,255,0.7)',
        fontSize: 13,
        fontFamily: CF.medium,
    },
});
