/**
 * FrigateEventsFeed
 *
 * Displays a paginated feed of Frigate detection events.
 * Each card shows:
 *   - Thumbnail from /api/frigate/events/{id}/thumbnail
 *   - Camera name, detected label, confidence score
 *   - Time ago / formatted timestamp
 *   - Duration (if clip available)
 *
 * Supports:
 *   - Per-camera filtering (pill selector at top)
 *   - Per-label filtering (person / car / animal / all)
 *   - Infinite scroll (load more)
 *   - Pull-to-refresh
 *   - Tap to open FrigateCameraModal in events/clip view
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
    View, Text, StyleSheet, FlatList, Image, TouchableOpacity,
    ActivityIndicator, RefreshControl, ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { User, Car, Dog, AlertTriangle, Clock, Video } from 'lucide-react-native';
import { CF } from '../../utils/typography';

const PAGE_SIZE = 20;

// ── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(unixTs) {
    const diff = Math.floor(Date.now() / 1000) - unixTs;
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
}

function formatTime(unixTs) {
    const d = new Date(unixTs * 1000);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDate(unixTs) {
    const d = new Date(unixTs * 1000);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);

    if (d.toDateString() === today.toDateString()) return 'Today';
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function LabelIcon({ label, size = 14, color = '#fff' }) {
    const l = (label || '').toLowerCase();
    if (l === 'person') return <User size={size} color={color} />;
    if (l === 'car' || l === 'vehicle' || l === 'truck' || l === 'motorcycle') return <Car size={size} color={color} />;
    if (l === 'dog' || l === 'cat' || l === 'animal') return <Dog size={size} color={color} />;
    return <AlertTriangle size={size} color={color} />;
}

function labelColor(label) {
    const l = (label || '').toLowerCase();
    if (l === 'person') return '#8947ca';
    if (l === 'car' || l === 'vehicle' || l === 'truck') return '#FF7043';
    if (l === 'dog' || l === 'cat' || l === 'animal') return '#4CAF50';
    return '#FFA000';
}

// ── Single event card (grid style — vertical) ─────────────────────────────────

function EventCard({ event, adminUrl, authHeaders, onPress }) {
    const [thumbError, setThumbError] = useState(false);
    const thumbUrl = `${adminUrl}/api/frigate/events/${event.id}/thumbnail`;
    const color = labelColor(event.label);
    const score = event.data?.top_score ?? event.top_score;
    const scoreText = score ? `${Math.round(score * 100)}%` : null;

    return (
        <View style={styles.card}>
            {/* Thumbnail — top, 16:9 */}
            <View style={styles.thumb}>
                {thumbError ? (
                    <View style={[StyleSheet.absoluteFill, { backgroundColor: '#111', alignItems: 'center', justifyContent: 'center' }]}>
                        <LabelIcon label={event.label} size={28} color="rgba(255,255,255,0.15)" />
                    </View>
                ) : (
                    <Image
                        source={{ uri: thumbUrl, headers: authHeaders }}
                        style={StyleSheet.absoluteFill}
                        resizeMode="cover"
                        onError={() => setThumbError(true)}
                    />
                )}
                <LinearGradient
                    colors={['transparent', 'rgba(0,0,0,0.75)']}
                    style={StyleSheet.absoluteFill}
                />
                {/* Label badge */}
                <View style={[styles.labelBadge, { backgroundColor: `${color}cc` }]}>
                    <LabelIcon label={event.label} size={10} color="#fff" />
                    <Text style={styles.labelText}>{event.label || 'unknown'}</Text>
                    {scoreText && <Text style={styles.scoreText}>{scoreText}</Text>}
                </View>
                {/* Clip indicator */}
                {event.has_clip && (
                    <View style={styles.clipBadge}>
                        <Video size={10} color="#fff" />
                    </View>
                )}
            </View>

            {/* Info — below thumbnail */}
            <View style={styles.info}>
                <Text style={styles.cameraName} numberOfLines={1}>{event.camera}</Text>
                <View style={styles.timeRow}>
                    <Clock size={10} color="rgba(255,255,255,0.4)" />
                    <Text style={styles.timeText}>{formatDate(event.start_time)} · {formatTime(event.start_time)}</Text>
                </View>
                <Text style={styles.agoText}>{timeAgo(event.start_time)}</Text>
            </View>
        </View>
    );
}

// ── Filter pills ──────────────────────────────────────────────────────────────

function FilterPills({ items, selected, onSelect, style }) {
    return (
        <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={[styles.pillRow, style]}
        >
            {items.map(item => (
                <TouchableOpacity
                    key={item.value}
                    style={[styles.pill, selected === item.value && styles.pillActive]}
                    onPress={() => onSelect(item.value)}
                    activeOpacity={0.7}
                >
                    <Text style={[styles.pillText, selected === item.value && styles.pillTextActive]}>
                        {item.label}
                    </Text>
                </TouchableOpacity>
            ))}
        </ScrollView>
    );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function FrigateEventsFeed({ adminUrl, authHeaders = {}, frigateService, frigateCameras = [], onEventPress }) {
    const [events, setEvents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    const [cameraFilter, setCameraFilter] = useState('all');
    const [labelFilter, setLabelFilter] = useState('all');
    const afterRef = useRef(null); // unix timestamp for pagination

    const base = adminUrl ? (adminUrl.endsWith('/') ? adminUrl : `${adminUrl}/`) : '';

    const buildUrl = useCallback((after = null) => {
        const params = new URLSearchParams();
        params.set('limit', PAGE_SIZE);
        params.set('include_thumbnails', '0');
        if (cameraFilter !== 'all') params.set('camera', cameraFilter);
        if (labelFilter !== 'all') params.set('label', labelFilter);
        if (after) params.set('before', after);
        return `${base}api/frigate/events?${params.toString()}`;
    }, [base, cameraFilter, labelFilter]);

    const fetchEvents = useCallback(async (reset = false) => {
        if (!base) return;
        try {
            const url = buildUrl(reset ? null : afterRef.current);
            const res = await fetch(url, { headers: authHeaders });
            if (!res.ok) return;
            const data = await res.json();
            if (!Array.isArray(data)) return;

            if (reset) {
                setEvents(data);
            } else {
                setEvents(prev => [...prev, ...data]);
            }

            setHasMore(data.length === PAGE_SIZE);
            if (data.length > 0) {
                afterRef.current = data[data.length - 1].start_time;
            }
        } catch (e) {
            // silently ignore
        }
    }, [buildUrl, authHeaders]);

    // Initial load + filter changes
    useEffect(() => {
        afterRef.current = null;
        setLoading(true);
        setHasMore(true);
        fetchEvents(true).finally(() => setLoading(false));
    }, [cameraFilter, labelFilter]);

    const onRefresh = useCallback(async () => {
        afterRef.current = null;
        setRefreshing(true);
        setHasMore(true);
        await fetchEvents(true);
        setRefreshing(false);
    }, [fetchEvents]);

    const onLoadMore = useCallback(async () => {
        if (loadingMore || !hasMore) return;
        setLoadingMore(true);
        await fetchEvents(false);
        setLoadingMore(false);
    }, [loadingMore, hasMore, fetchEvents]);

    // Camera filter pills
    const cameraPills = [
        { value: 'all', label: 'All Cameras' },
        ...frigateCameras.map(c => ({ value: c.name || c.id, label: c.name || c.id })),
    ];

    const labelPills = [
        { value: 'all', label: 'All' },
        { value: 'person', label: 'Person' },
        { value: 'car', label: 'Car' },
        { value: 'dog', label: 'Animal' },
    ];

    const renderItem = ({ item }) => (
        <EventCard
            event={item}
            adminUrl={adminUrl}
            authHeaders={authHeaders}
            onPress={onEventPress}
        />
    );

    const renderFooter = () => {
        if (!loadingMore) return <View style={{ height: 32 }} />;
        return (
            <View style={styles.loadMoreWrap}>
                <ActivityIndicator size="small" color="#8947ca" />
            </View>
        );
    };

    const renderEmpty = () => {
        if (loading) return null;
        return (
            <View style={styles.empty}>
                <AlertTriangle size={36} color="rgba(255,255,255,0.15)" />
                <Text style={styles.emptyText}>No events found</Text>
                <Text style={styles.emptySubText}>Try a different camera or label filter</Text>
            </View>
        );
    };

    return (
        <View style={styles.container}>
            {/* Filters block */}
            <View style={styles.filtersWrap}>
                {/* Camera filter */}
                <FilterPills
                    items={cameraPills}
                    selected={cameraFilter}
                    onSelect={setCameraFilter}
                />
                {/* Label filter */}
                <FilterPills
                    items={labelPills}
                    selected={labelFilter}
                    onSelect={setLabelFilter}
                />
            </View>

            {loading ? (
                <View style={styles.loadingWrap}>
                    <ActivityIndicator size="large" color="#8947ca" />
                    <Text style={styles.loadingText}>Loading events…</Text>
                </View>
            ) : (
                <FlatList
                    data={events}
                    keyExtractor={item => item.id}
                    renderItem={renderItem}
                    numColumns={2}
                    columnWrapperStyle={styles.columnWrapper}
                    ListEmptyComponent={renderEmpty}
                    ListFooterComponent={renderFooter}
                    onEndReached={onLoadMore}
                    onEndReachedThreshold={0.3}
                    refreshControl={
                        <RefreshControl
                            refreshing={refreshing}
                            onRefresh={onRefresh}
                            tintColor="#8947ca"
                        />
                    }
                    contentContainerStyle={styles.list}
                    showsVerticalScrollIndicator={false}
                />
            )}
        </View>
    );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    filtersWrap: {
        paddingTop: 12,
        paddingBottom: 4,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.06)',
        gap: 6,
    },
    pillRow: {
        paddingHorizontal: 16,
        gap: 8,
        paddingVertical: 4,
    },
    pill: {
        paddingHorizontal: 12,
        paddingVertical: 5,
        borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.06)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    pillActive: {
        backgroundColor: 'rgba(137,71,202,0.25)',
        borderColor: '#8947ca',
    },
    pillText: {
        color: 'rgba(255,255,255,0.45)',
        fontSize: 12,
        fontFamily: CF.medium,
    },
    pillTextActive: {
        color: '#c49ef0',
    },
    list: {
        paddingTop: 12,
        paddingBottom: 40,
    },
    columnWrapper: {
        gap: 10,
        paddingHorizontal: 16,
        marginBottom: 10,
    },
    card: {
        flex: 1,
        flexDirection: 'column',
        backgroundColor: 'rgba(255,255,255,0.04)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.07)',
        borderRadius: 14,
        overflow: 'hidden',
    },
    thumb: {
        width: '100%',
        aspectRatio: 16 / 9,
        backgroundColor: '#0f0f1e',
        position: 'relative',
    },
    labelBadge: {
        position: 'absolute',
        bottom: 5,
        left: 5,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 3,
        paddingHorizontal: 6,
        paddingVertical: 3,
        borderRadius: 6,
    },
    labelText: {
        color: '#fff',
        fontSize: 10,
        fontFamily: CF.semibold,
        textTransform: 'capitalize',
    },
    scoreText: {
        color: 'rgba(255,255,255,0.7)',
        fontSize: 9,
        fontFamily: CF.regular,
    },
    clipBadge: {
        position: 'absolute',
        top: 5,
        right: 5,
        backgroundColor: 'rgba(0,0,0,0.6)',
        borderRadius: 4,
        padding: 3,
    },
    info: {
        padding: 8,
        gap: 3,
    },
    cameraName: {
        color: '#ededf5',
        fontSize: 12,
        fontFamily: CF.semibold,
    },
    timeRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    timeText: {
        color: 'rgba(255,255,255,0.4)',
        fontSize: 10,
        fontFamily: CF.regular,
    },
    agoText: {
        color: 'rgba(255,255,255,0.25)',
        fontSize: 9,
        fontFamily: CF.regular,
    },
    loadingWrap: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 60,
    },
    loadingText: {
        color: 'rgba(255,255,255,0.3)',
        fontSize: 13,
        fontFamily: CF.regular,
    },
    loadMoreWrap: {
        paddingVertical: 20,
        alignItems: 'center',
    },
    empty: {
        alignItems: 'center',
        paddingTop: 48,
        paddingHorizontal: 32,
        gap: 10,
    },
    emptyText: {
        color: 'rgba(255,255,255,0.3)',
        fontSize: 15,
        fontFamily: CF.semibold,
    },
    emptySubText: {
        color: 'rgba(255,255,255,0.2)',
        fontSize: 12,
        fontFamily: CF.regular,
    },
});
