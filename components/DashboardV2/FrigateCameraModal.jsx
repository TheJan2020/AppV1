import { Modal, View, Text, StyleSheet, TouchableOpacity, FlatList, Image, ActivityIndicator, ScrollView } from 'react-native';
import { WebView } from 'react-native-webview';
import { X, User, Car, Dog, AlertTriangle, Clock, Video } from 'lucide-react-native';
import { useState, useEffect, useRef, useMemo } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { CF } from '../../utils/typography';
import CameraSensorOverlay, { isSensorActive, buildEntityMap, resolveSensorIds } from './CameraSensorOverlay';

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

function EventCard({ event, adminUrl, authHeaders }) {
    const [thumbError, setThumbError] = useState(false);
    const thumbUrl = `${adminUrl}/api/frigate/events/${event.id}/thumbnail`;
    const color = labelColor(event.label);
    const score = event.data?.top_score ?? event.top_score;
    const scoreText = score ? `${Math.round(score * 100)}%` : null;

    return (
        <View style={styles.card}>
            {/* Thumbnail */}
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
                {event.has_clip && (
                    <View style={styles.clipBadge}>
                        <Video size={10} color="#fff" />
                    </View>
                )}
            </View>

            {/* Info */}
            <View style={styles.info}>
                <Text style={styles.cameraName} numberOfLines={1}>{event.camera}</Text>
                <View style={styles.timeRow}>
                    <Clock size={11} color="rgba(255,255,255,0.4)" />
                    <Text style={styles.timeText}>{formatDate(event.start_time)} · {formatTime(event.start_time)}</Text>
                </View>
                <Text style={styles.agoText}>{timeAgo(event.start_time)}</Text>
            </View>
        </View>
    );
}

// ── Live Stream ───────────────────────────────────────────────────────────────

function LiveStream({ service, cameraName, sensorIds, entityMap }) {
    const webViewRef = useRef(null);
    if (!service || !cameraName) {
        return (
            <View style={[styles.streamContainer, { alignItems: 'center', justifyContent: 'center' }]}>
                <ActivityIndicator color="white" />
            </View>
        );
    }
    const streamUrl = service.getStreamUrl(cameraName);
    return (
        <View style={styles.streamContainer}>
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
        try {
            loadMore ? setLoadingMore(true) : setLoadingEvents(true);
            const options = { camera: camera.name, limit: loadMore ? 20 : 10 };
            if (selectedLabel) options.label = selectedLabel;
            if (loadMore && events.length > 0) {
                const last = Number(events[events.length - 1].start_time);
                if (!isNaN(last)) options.before = last - 0.001;
            }
            const data = await service.getEvents(options);
            const newEvents = Array.isArray(data) ? data : [];
            setEvents(prev => loadMore ? [...prev, ...newEvents] : newEvents);
            if (!loadMore) setEventsLoaded(true);
            setHasMore(newEvents.length === options.limit);
        } catch {
            if (!loadMore) setEvents([]);
        } finally {
            setLoadingEvents(false);
            setLoadingMore(false);
        }
    };

    useEffect(() => {
        if (!visible || !ready) {
            setEvents([]);
            setSelectedLabel(null);
            setHasMore(true);
            setEventsLoaded(false);
            return;
        }
        // Initial fetch: small page to show results quickly
        if (!eventsLoaded) fetchEvents(false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [visible, camera?.name, service?.baseUrl, selectedLabel, eventsLoaded]);

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
            <View style={styles.container}>
                <View style={styles.header}>
                    <Text style={styles.title}>{camera?.name ?? 'Camera'}</Text>
                    <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                        <X size={24} color="white" />
                    </TouchableOpacity>
                </View>

                {/* Live stream lives OUTSIDE FlatList so it never remounts */}
                <LiveStream
                    service={service}
                    cameraName={camera?.name}
                    sensorIds={assignedSensorIds}
                    entityMap={entityMap}
                />

                <FlatList
                    data={events}
                    keyExtractor={(item, index) => item.id ? `${item.id}-${index}` : String(index)}
                    renderItem={({ item }) => (
                        <EventCard
                            event={item}
                            adminUrl={service?.adminUrl}
                            authHeaders={service?.headers}
                        />
                    )}
                    numColumns={2}
                    columnWrapperStyle={styles.columnWrapper}
                    ListHeaderComponent={ListHeader}
                    contentContainerStyle={styles.listContent}
                    showsVerticalScrollIndicator={false}
                    onEndReached={() => hasMore && !loadingMore && fetchEvents(true)}
                    onEndReachedThreshold={0.4}
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
    loadMoreWrap: {
        paddingVertical: 20,
        alignItems: 'center',
    },
});
