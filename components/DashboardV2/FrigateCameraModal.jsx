import { Modal, View, Text, StyleSheet, TouchableOpacity, FlatList, Image, ActivityIndicator, ScrollView } from 'react-native';
import { WebView } from 'react-native-webview';
import { X, User, Car, Dog, AlertTriangle, Clock } from 'lucide-react-native';
import { useState, useEffect, useRef, useMemo } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { CF } from '../../utils/typography';
import { formatCameraName } from '../../utils/formatDisplayName';
import CameraSensorOverlay, { isSensorActive, buildEntityMap, resolveSensorIds } from './CameraSensorOverlay';
import { cameraUsesHaFeed } from '../../services/appRole';
import { dedupeEventsById, paginationBeforeCursor } from '../../utils/frigateEvents';
import FrigateEventImageModal from './FrigateEventImageModal';

// ── Helpers ───────────────────────────────────────────────────────────────────

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

// ── Event Card ────────────────────────────────────────────────────────────────

function EventCard({ event, adminUrl, authHeaders, onPress }) {
    const [thumbError, setThumbError] = useState(false);
    const thumbUrl = `${adminUrl}/api/frigate/events/${event.id}/thumbnail`;
    const color = labelColor(event.label);
    const score = event.data?.top_score ?? event.top_score;
    const scoreText = score ? `${Math.round(score * 100)}%` : null;

    const cardBody = (
        <>
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
                    colors={['transparent', 'rgba(0,0,0,0.7)']}
                    style={StyleSheet.absoluteFill}
                />
                <View style={[styles.labelBadge, { backgroundColor: `${color}cc` }]}>
                    <LabelIcon label={event.label} size={11} color="#fff" />
                    <Text style={styles.labelText}>{event.label || 'unknown'}</Text>
                    {scoreText && <Text style={styles.scoreText}>{scoreText}</Text>}
                </View>
            </View>

            <View style={styles.info}>
                <Text style={styles.cameraName} numberOfLines={1}>{formatCameraName(event.camera)}</Text>
                <View style={styles.timeRow}>
                    <Clock size={11} color="rgba(255,255,255,0.4)" />
                    <Text style={styles.timeText}>{formatDate(event.start_time)} · {formatTime(event.start_time)}</Text>
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
}

// ── Live Stream ───────────────────────────────────────────────────────────────

function LiveStream({ service, camera, sensorIds, entityMap }) {
    const webViewRef = useRef(null);
    const [tick, setTick] = useState(0);
    const [useFrigateFallback, setUseFrigateFallback] = useState(false);
    const isHACamera = cameraUsesHaFeed(camera) && !useFrigateFallback;
    const cameraName = String(camera?.name || camera?.id || '').replace(/^camera\./, '');

    useEffect(() => {
        setUseFrigateFallback(false);
    }, [camera?.id, camera?.entity_id, camera?.name]);

    useEffect(() => {
        if (!isHACamera) return undefined;
        const id = setInterval(() => setTick((n) => n + 1), 2000);
        return () => clearInterval(id);
    }, [isHACamera]);

    if (!service || !cameraName) {
        return (
            <View style={[styles.streamContainer, { alignItems: 'center', justifyContent: 'center' }]}>
                <ActivityIndicator color="white" />
            </View>
        );
    }
    const streamUrl = isHACamera
        ? service.getHASnapshotUrl(camera.entity_id || camera.id || cameraName)
        : service.getStreamUrl(cameraName);
    const uri = isHACamera
        ? `${streamUrl}${streamUrl.includes('?') ? '&' : '?'}t=${tick}`
        : streamUrl;
    return (
        <View style={styles.streamContainer}>
            {isHACamera ? (
                <Image
                    source={{ uri, headers: service?.headers || {} }}
                    style={StyleSheet.absoluteFill}
                    resizeMode="cover"
                    onError={() => setUseFrigateFallback(true)}
                />
            ) : (
                <WebView
                    ref={webViewRef}
                    source={{ uri: streamUrl, headers: service?.headers || {} }}
                    style={{ flex: 1, backgroundColor: 'black' }}
                    scrollEnabled={false}
                    allowsInlineMediaPlayback={true}
                    mediaPlaybackRequiresUserAction={false}
                    originWhitelist={['*']}
                    scalesPageToFit={true}
                    javaScriptEnabled={true}
                />
            )}
            <CameraSensorOverlay sensorIds={sensorIds} entityMap={entityMap} position="bl" />
        </View>
    );
}

// ── Main Modal ────────────────────────────────────────────────────────────────

export default function FrigateCameraModal({ visible, camera, service, onClose, cameraSensors = {}, haEntities = [] }) {
    const [events, setEvents] = useState([]);
    const [eventsLoaded, setEventsLoaded] = useState(false);
    const [loadingEvents, setLoadingEvents] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [selectedLabel, setSelectedLabel] = useState(null);
    const [availableLabels, setAvailableLabels] = useState([]);
    const [hasMore, setHasMore] = useState(true);
    const [selectedEvent, setSelectedEvent] = useState(null);

    const eventsRef = useRef([]);
    eventsRef.current = events;
    const beforeRef = useRef(null);
    const loadMoreLockRef = useRef(false);
    const dedupeTrackerRef = useRef({ seenIds: new Set(), seenFingerprints: new Set() });
    const fetchGenRef = useRef(0);

    const ready = !!camera && !!service;

    // ── Build entity map — only sensor entities to avoid rebuilding on every HA event ──
    const entityMap = useMemo(() => {
        const sensorEntities = haEntities.filter(e =>
            e.entity_id.startsWith('sensor.') || e.entity_id.startsWith('binary_sensor.')
        );
        const map = buildEntityMap(sensorEntities);
        return map;
    }, [haEntities]);

    // ── Find assigned sensor IDs for this camera ──────────────────
    const assignedSensorIds = useMemo(() => {
        return resolveSensorIds(camera, cameraSensors);
    }, [camera, cameraSensors]);

    useEffect(() => {
        if (!ready || !visible) return;
        service.getConfig().then(config => {
            if (config?.objects?.track) setAvailableLabels(config.objects.track);
        }).catch(() => {});
    }, [ready, visible]);

    const fetchEvents = async (loadMore = false) => {
        if (!ready) return;
        const gen = fetchGenRef.current;
        try {
            loadMore ? setLoadingMore(true) : setLoadingEvents(true);
            const limit = loadMore ? 20 : 12;
            const options = { camera: camera.name, limit, include_thumbnails: 0 };
            if (selectedLabel) options.label = selectedLabel;
            if (loadMore && beforeRef.current != null) {
                options.before = beforeRef.current;
            }
            const data = await service.getEvents(options);
            if (gen !== fetchGenRef.current) return;

            const page = Array.isArray(data) ? data : [];
            const tracker = dedupeTrackerRef.current;
            if (!loadMore) {
                tracker.seenIds = new Set();
                tracker.seenFingerprints = new Set();
            }
            const incoming = dedupeEventsById(page, tracker.seenIds, tracker.seenFingerprints);

            setEvents(prev => (loadMore ? [...prev, ...incoming] : incoming));
            if (!loadMore) setEventsLoaded(true);
            setHasMore(page.length >= limit);
            if (page.length > 0) {
                beforeRef.current = paginationBeforeCursor(page[page.length - 1]);
            }
            if (loadMore && incoming.length === 0 && page.length >= limit) {
                setHasMore(false);
            }
        } catch {
            if (gen === fetchGenRef.current && !loadMore) setEvents([]);
        } finally {
            if (gen === fetchGenRef.current) {
                setLoadingEvents(false);
                setLoadingMore(false);
            }
        }
    };

    useEffect(() => {
        if (!visible || !ready || cameraUsesHaFeed(camera)) {
            setEvents([]);
            setSelectedLabel(null);
            setSelectedEvent(null);
            setHasMore(false);
            setEventsLoaded(true);
            return;
        }
        fetchGenRef.current += 1;
        beforeRef.current = null;
        dedupeTrackerRef.current = { seenIds: new Set(), seenFingerprints: new Set() };
        setEventsLoaded(false);
        setEvents([]);
        setHasMore(true);
        fetchEvents(false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [visible, camera?.name, camera?.entity_id, service?.baseUrl, selectedLabel]);

    const labelPills = [
        { value: null, label: 'All' },
        ...(availableLabels.map(l => ({ value: l, label: l.charAt(0).toUpperCase() + l.slice(1) }))),
    ];

    // FlatList header — only the events section (no WebView here)
    const ListHeader = useMemo(() => (
        <>
            <View style={styles.eventsHeader}>
                <Text style={styles.sectionTitle}>Recent Events</Text>
                {availableLabels.length > 0 && (
                    <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.chipsContent}
                        style={styles.chipsScroll}
                    >
                        {labelPills.map(item => (
                            <TouchableOpacity
                                key={String(item.value)}
                                style={[styles.chip, selectedLabel === item.value && styles.chipActive]}
                                onPress={() => setSelectedLabel(item.value)}
                                activeOpacity={0.7}
                            >
                                <Text style={[styles.chipText, selectedLabel === item.value && styles.chipTextActive]}>
                                    {item.label}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                )}
            </View>

            {loadingEvents && events.length === 0 && (
                <View style={styles.centered}>
                    <ActivityIndicator color="white" />
                    <Text style={styles.dimText}>Loading events...</Text>
                </View>
            )}
            {!loadingEvents && events.length === 0 && (
                <View style={styles.centered}>
                    <Text style={styles.dimText}>
                        {selectedLabel ? `No ${selectedLabel} events found` : 'No recent events'}
                    </Text>
                </View>
            )}
        </>
    // eslint-disable-next-line react-hooks/exhaustive-deps
    ), [availableLabels, selectedLabel, loadingEvents, events.length]);

    return (
        <Modal animationType="slide" transparent={false} visible={visible} onRequestClose={onClose}>
            <FrigateEventImageModal
                visible={!!selectedEvent}
                event={selectedEvent}
                adminUrl={service?.adminUrl}
                authHeaders={service?.headers || {}}
                onClose={() => setSelectedEvent(null)}
            />
            <View style={styles.container}>
                <View style={styles.header}>
                    <Text style={styles.title}>{formatCameraName(camera?.name) || 'Camera'}</Text>
                    <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                        <X size={24} color="white" />
                    </TouchableOpacity>
                </View>

                {/* Live stream lives OUTSIDE FlatList so it never remounts */}
                <LiveStream
                    service={service}
                    camera={camera}
                    sensorIds={assignedSensorIds}
                    entityMap={entityMap}
                />

                <FlatList
                    data={events}
                    keyExtractor={(item) => String(item.id)}
                    renderItem={({ item }) => (
                        <EventCard
                            event={item}
                            adminUrl={service?.adminUrl}
                            authHeaders={service?.headers}
                            onPress={setSelectedEvent}
                        />
                    )}
                    numColumns={2}
                    columnWrapperStyle={styles.columnWrapper}
                    ListHeaderComponent={ListHeader}
                    contentContainerStyle={styles.listContent}
                    showsVerticalScrollIndicator={false}
                    onEndReached={() => {
                        if (loadMoreLockRef.current || !hasMore || loadingMore || loadingEvents) return;
                        loadMoreLockRef.current = true;
                        fetchEvents(true).finally(() => { loadMoreLockRef.current = false; });
                    }}
                    onEndReachedThreshold={0.4}
                    initialNumToRender={6}
                    maxToRenderPerBatch={8}
                    windowSize={7}
                    removeClippedSubviews
                    ListFooterComponent={
                        loadingMore ? (
                            <View style={styles.loadMoreWrap}>
                                <ActivityIndicator color="rgba(255,255,255,0.4)" size="small" />
                            </View>
                        ) : null
                    }
                />
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0a0a0a',
        paddingTop: 50,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingVertical: 14,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.1)',
    },
    title: {
        color: 'white',
        fontSize: 20,
        fontWeight: 'bold',
        textTransform: 'capitalize',
    },
    closeBtn: {
        padding: 8,
    },
    streamContainer: {
        width: '100%',
        aspectRatio: 16 / 9,
        backgroundColor: 'black',
        position: 'relative',
        overflow: 'hidden',
    },
    eventsHeader: {
        paddingTop: 16,
        paddingBottom: 4,
    },
    sectionTitle: {
        color: 'white',
        fontSize: 17,
        fontWeight: '700',
        marginBottom: 10,
        paddingHorizontal: 16,
    },
    chipsScroll: {
        flexGrow: 0,
        marginBottom: 8,
    },
    chipsContent: {
        gap: 8,
        paddingHorizontal: 16,
        paddingVertical: 2,
        alignItems: 'center',
    },
    chip: {
        paddingHorizontal: 14,
        paddingVertical: 6,
        borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.06)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    chipActive: {
        backgroundColor: 'rgba(137,71,202,0.25)',
        borderColor: '#8947ca',
    },
    chipText: {
        color: 'rgba(255,255,255,0.45)',
        fontSize: 12,
        fontFamily: CF.medium,
    },
    chipTextActive: {
        color: '#c49ef0',
    },
    centered: {
        paddingVertical: 40,
        alignItems: 'center',
        gap: 10,
    },
    dimText: {
        color: 'rgba(255,255,255,0.4)',
        fontSize: 14,
        fontFamily: CF.regular,
    },
    listContent: {
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
    loadMoreWrap: {
        paddingVertical: 20,
        alignItems: 'center',
    },
});
