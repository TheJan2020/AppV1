/**
 * FrigateEventsFeed
 *
 * Paginated Frigate detection events (Cameras → Events tab).
 */

import { useState, useEffect, useCallback, useRef, useMemo, memo } from 'react';
import {
    View, Text, StyleSheet, FlatList, Image, TouchableOpacity,
    ActivityIndicator, RefreshControl, ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { User, Car, Dog, AlertTriangle, Clock } from 'lucide-react-native';
import { CF } from '../../utils/typography';
import { formatCameraName } from '../../utils/formatDisplayName';
import { cameraKey, cameraKeysMatch } from '../../services/appRole';
import { dedupeEventsById, paginationBeforeCursor } from '../../utils/frigateEvents';
import FrigateEventImageModal from './FrigateEventImageModal';

const INITIAL_PAGE_SIZE = 12;
const PAGE_SIZE = 20;

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

const EventCard = memo(function EventCard({ event, adminUrl, authHeaders, onPress }) {
    const [thumbError, setThumbError] = useState(false);
    const thumbUrl = adminUrl
        ? `${adminUrl.replace(/\/$/, '')}/api/frigate/events/${encodeURIComponent(String(event.id))}/thumbnail`
        : null;
    const color = labelColor(event.label);
    const score = event.data?.top_score ?? event.top_score;
    const scoreText = score ? `${Math.round(score * 100)}%` : null;

    const cardBody = (
        <>
            <View style={styles.thumb}>
                {thumbError ? (
                    <View style={[StyleSheet.absoluteFill, styles.thumbFallback]}>
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
                <View style={[styles.labelBadge, { backgroundColor: `${color}cc` }]}>
                    <LabelIcon label={event.label} size={10} color="#fff" />
                    <Text style={styles.labelText}>{event.label || 'unknown'}</Text>
                    {scoreText ? <Text style={styles.scoreText}>{scoreText}</Text> : null}
                </View>
            </View>
            <View style={styles.info}>
                <Text style={styles.cameraName} numberOfLines={1}>{formatCameraName(event.camera)}</Text>
                <View style={styles.timeRow}>
                    <Clock size={10} color="rgba(255,255,255,0.4)" />
                    <Text style={styles.timeText}>
                        {formatDate(event.start_time)} · {formatTime(event.start_time)}
                    </Text>
                </View>
                <Text style={styles.agoText}>{timeAgo(event.start_time)}</Text>
            </View>
        </>
    );

    if (!onPress) {
        return <View style={styles.card}>{cardBody}</View>;
    }

    return (
        <TouchableOpacity style={styles.card} activeOpacity={0.85} onPress={() => onPress(event)}>
            {cardBody}
        </TouchableOpacity>
    );
});

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

export default function FrigateEventsFeed({ adminUrl, authHeaders = {}, frigateCameras = [], onEventPress }) {
    const [events, setEvents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    const [cameraFilter, setCameraFilter] = useState('all');
    const [labelFilter, setLabelFilter] = useState('all');
    const [selectedEvent, setSelectedEvent] = useState(null);

    const beforeRef = useRef(null);
    const fetchGenRef = useRef(0);
    const loadMoreLockRef = useRef(false);
    const abortRef = useRef(null);
    const dedupeTrackerRef = useRef({ seenIds: new Set(), seenFingerprints: new Set() });
    const authHeadersRef = useRef(authHeaders);
    authHeadersRef.current = authHeaders;

    const base = adminUrl ? (adminUrl.endsWith('/') ? adminUrl : `${adminUrl}/`) : '';

    const allowedCameraNames = useMemo(() => (
        (Array.isArray(frigateCameras) ? frigateCameras : [])
            .map((c) => c?.name || c?.id || c?.entity_id)
            .filter(Boolean)
    ), [frigateCameras]);

    const eventInRole = useCallback((event) => {
        if (!allowedCameraNames.length) return false;
        const cam = String(event?.camera || '');
        return allowedCameraNames.some((name) => cameraKeysMatch(cameraKey(name), cameraKey(cam)) || name === cam);
    }, [allowedCameraNames]);

    const buildUrl = useCallback((before = null, limit = INITIAL_PAGE_SIZE) => {
        const params = new URLSearchParams();
        params.set('limit', String(limit));
        params.set('include_thumbnails', '0');
        if (cameraFilter !== 'all') params.set('camera', cameraFilter);
        if (labelFilter !== 'all') params.set('label', labelFilter);
        if (before != null) params.set('before', String(before));
        return `${base}api/frigate/events?${params.toString()}`;
    }, [base, cameraFilter, labelFilter]);

    const loadPage = useCallback(async ({ reset, limit, signal }) => {
        if (!base) return { ok: false, data: [] };

        const url = buildUrl(reset ? null : beforeRef.current, limit);
        const res = await fetch(url, { headers: authHeadersRef.current, signal });
        if (!res.ok) return { ok: false, data: [] };

        const data = await res.json();
        if (!Array.isArray(data)) return { ok: false, data: [] };
        return { ok: true, data: dedupeEventsById(data) };
    }, [base, buildUrl]);

    const applyPage = useCallback((data, reset, limit) => {
        const tracker = dedupeTrackerRef.current;
        if (reset) {
            tracker.seenIds = new Set();
            tracker.seenFingerprints = new Set();
        }

        const incoming = dedupeEventsById(data, tracker.seenIds, tracker.seenFingerprints)
            .filter((event) => eventInRole(event));

        setEvents(prev => (reset ? incoming : [...prev, ...incoming]));

        setHasMore(data.length >= limit);
        if (data.length > 0) {
            beforeRef.current = paginationBeforeCursor(data[data.length - 1]);
        } else if (reset) {
            beforeRef.current = null;
        }

        if (!reset && incoming.length === 0 && data.length >= limit) {
            setHasMore(false);
        }
    }, [eventInRole]);

    const runFetch = useCallback(async ({ reset, limit = reset ? INITIAL_PAGE_SIZE : PAGE_SIZE }) => {
        if (!base) return;

        if (abortRef.current) abortRef.current.abort();
        const controller = new AbortController();
        abortRef.current = controller;

        const gen = fetchGenRef.current;

        try {
            const { ok, data } = await loadPage({ reset, limit, signal: controller.signal });
            if (gen !== fetchGenRef.current) return;
            if (!ok) {
                if (reset) setEvents([]);
                setHasMore(false);
                return;
            }
            applyPage(data, reset, limit);
        } catch (e) {
            if (e?.name === 'AbortError') return;
            if (gen === fetchGenRef.current && reset) setEvents([]);
        }
    }, [base, loadPage, applyPage]);

    const handleEventPress = useCallback((event) => {
        setSelectedEvent(event);
        onEventPress?.(event);
    }, [onEventPress]);

    useEffect(() => {
        fetchGenRef.current += 1;
        beforeRef.current = null;
        dedupeTrackerRef.current = { seenIds: new Set(), seenFingerprints: new Set() };
        setLoading(true);
        setHasMore(true);

        const gen = fetchGenRef.current;
        runFetch({ reset: true }).finally(() => {
            if (gen === fetchGenRef.current) setLoading(false);
        });

        return () => {
            fetchGenRef.current += 1;
            if (abortRef.current) abortRef.current.abort();
        };
    }, [cameraFilter, labelFilter, base, runFetch]);

    const onRefresh = useCallback(async () => {
        beforeRef.current = null;
        dedupeTrackerRef.current = { seenIds: new Set(), seenFingerprints: new Set() };
        setRefreshing(true);
        setHasMore(true);
        await runFetch({ reset: true });
        setRefreshing(false);
    }, [runFetch]);

    const onLoadMore = useCallback(async () => {
        if (loadMoreLockRef.current || loadingMore || !hasMore || loading) return;
        loadMoreLockRef.current = true;
        setLoadingMore(true);
        try {
            await runFetch({ reset: false, limit: PAGE_SIZE });
        } finally {
            setLoadingMore(false);
            loadMoreLockRef.current = false;
        }
    }, [loadingMore, hasMore, loading, runFetch]);

    const cameraPills = [
        { value: 'all', label: 'All Cameras' },
        ...frigateCameras.map(c => ({
            value: c.name || c.id,
            label: formatCameraName(c.name || c.id),
        })),
    ];

    const labelPills = [
        { value: 'all', label: 'All' },
        { value: 'person', label: 'Person' },
        { value: 'car', label: 'Car' },
        { value: 'dog', label: 'Animal' },
    ];

    const renderItem = useCallback(({ item }) => (
        <EventCard
            event={item}
            adminUrl={adminUrl}
            authHeaders={authHeadersRef.current}
            onPress={handleEventPress}
        />
    ), [adminUrl, handleEventPress]);

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
            <FrigateEventImageModal
                visible={!!selectedEvent}
                event={selectedEvent}
                adminUrl={adminUrl}
                authHeaders={authHeadersRef.current}
                onClose={() => setSelectedEvent(null)}
            />
            <View style={styles.filtersWrap}>
                <FilterPills items={cameraPills} selected={cameraFilter} onSelect={setCameraFilter} />
                <FilterPills items={labelPills} selected={labelFilter} onSelect={setLabelFilter} />
            </View>

            {loading ? (
                <View style={styles.loadingWrap}>
                    <ActivityIndicator size="large" color="#8947ca" />
                    <Text style={styles.loadingText}>Loading events…</Text>
                </View>
            ) : (
                <FlatList
                    data={events}
                    keyExtractor={item => String(item.id)}
                    renderItem={renderItem}
                    numColumns={2}
                    columnWrapperStyle={styles.columnWrapper}
                    ListEmptyComponent={renderEmpty}
                    ListFooterComponent={renderFooter}
                    onEndReached={onLoadMore}
                    onEndReachedThreshold={0.4}
                    initialNumToRender={6}
                    maxToRenderPerBatch={8}
                    windowSize={7}
                    removeClippedSubviews
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
        flexDirection: 'row',
        gap: 10,
        paddingHorizontal: 16,
        marginBottom: 10,
    },
    card: {
        flex: 1,
        minWidth: 0,
        maxWidth: '48.5%',
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
    thumbFallback: {
        backgroundColor: '#111',
        alignItems: 'center',
        justifyContent: 'center',
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
