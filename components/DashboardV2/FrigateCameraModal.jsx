import { Modal, View, Text, StyleSheet, TouchableOpacity, FlatList, Platform, ActivityIndicator, ScrollView } from 'react-native';
import { WebView } from 'react-native-webview';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import AuthedCameraImage from './AuthedCameraImage';
import HaCameraView from './HaCameraView';
import { X, User, Car, Dog, AlertTriangle, Clock, Eye, ZoomIn, ZoomOut } from 'lucide-react-native';
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { CF } from '../../utils/typography';
import { formatCameraName } from '../../utils/formatDisplayName';
import CameraSensorOverlay, { isSensorActive, buildEntityMap, resolveSensorIds } from './CameraSensorOverlay';
import { cameraUsesHaFeed } from '../../services/appRole';

const HA_FIT_JS = `
  (function() {
    function fit() {
      var meta = document.querySelector('meta[name="viewport"]');
      if (!meta) {
        meta = document.createElement('meta');
        meta.setAttribute('name', 'viewport');
        meta.setAttribute('content', 'width=device-width, initial-scale=1, maximum-scale=1');
        (document.head || document.documentElement).appendChild(meta);
      }
      var style = document.getElementById('ha-fit');
      if (!style) {
        style = document.createElement('style');
        style.id = 'ha-fit';
        (document.head || document.documentElement).appendChild(style);
      }
      style.textContent = 'html,body{margin:0;padding:0;width:100%;height:100%;background:#000;overflow:hidden}img,video{position:fixed;inset:0;width:100%;height:100%;object-fit:contain;object-position:center;background:#000}';
      document.querySelectorAll('img,video').forEach(function(el) {
        el.style.width = '100%';
        el.style.height = '100%';
        el.style.objectFit = 'contain';
        el.style.objectPosition = 'center';
      });
    }
    fit();
    setTimeout(fit, 200);
    setTimeout(fit, 800);
  })();
  true;
`;
import { dedupeEventsById, paginationBeforeCursor, getEventThumbnailUrl, formatEventClock, formatEventDay, eventTimeAgo } from '../../utils/frigateEvents';
import FrigateEventImageModal from './FrigateEventImageModal';
import { endCameraWatch, fetchCameraWatchHistory, pulseCameraWatch } from '../../services/cameraWatch';

function formatWatchDuration(ms) {
    const sec = Math.max(0, Math.round((Number(ms) || 0) / 1000));
    if (sec < 60) return `${sec}s`;
    const min = Math.floor(sec / 60);
    const rem = sec % 60;
    if (min < 60) return rem ? `${min}m ${rem}s` : `${min}m`;
    const hours = Math.floor(min / 60);
    return `${hours}h ${min % 60}m`;
}

function formatWatchWhen(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function ZoomableLive({ children, resetKey }) {
    const scale = useSharedValue(1);
    const savedScale = useSharedValue(1);
    const translateX = useSharedValue(0);
    const translateY = useSharedValue(0);
    const savedTX = useSharedValue(0);
    const savedTY = useSharedValue(0);

    useEffect(() => {
        scale.value = 1;
        savedScale.value = 1;
        translateX.value = 0;
        translateY.value = 0;
        savedTX.value = 0;
        savedTY.value = 0;
    }, [resetKey, scale, savedScale, translateX, translateY, savedTX, savedTY]);

    const pinch = Gesture.Pinch()
        .onUpdate((e) => {
            const next = savedScale.value * e.scale;
            scale.value = Math.min(4, Math.max(1, next));
        })
        .onEnd(() => {
            savedScale.value = scale.value;
            if (scale.value <= 1.05) {
                scale.value = withTiming(1);
                savedScale.value = 1;
                translateX.value = withTiming(0);
                translateY.value = withTiming(0);
                savedTX.value = 0;
                savedTY.value = 0;
            }
        });

    const pan = Gesture.Pan()
        .averageTouches(true)
        .onUpdate((e) => {
            if (scale.value > 1.05) {
                translateX.value = savedTX.value + e.translationX;
                translateY.value = savedTY.value + e.translationY;
            }
        })
        .onEnd(() => {
            savedTX.value = translateX.value;
            savedTY.value = translateY.value;
        });

    const doubleTap = Gesture.Tap()
        .numberOfTaps(2)
        .onEnd(() => {
            if (scale.value > 1.2) {
                scale.value = withTiming(1);
                savedScale.value = 1;
                translateX.value = withTiming(0);
                translateY.value = withTiming(0);
                savedTX.value = 0;
                savedTY.value = 0;
            } else {
                scale.value = withTiming(2.5);
                savedScale.value = 2.5;
            }
        });

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [
            { translateX: translateX.value },
            { translateY: translateY.value },
            { scale: scale.value },
        ],
    }));

    const zoomBy = useCallback((factor) => {
        const next = Math.min(4, Math.max(1, savedScale.value * factor));
        scale.value = withTiming(next);
        savedScale.value = next;
        if (next <= 1.05) {
            translateX.value = withTiming(0);
            translateY.value = withTiming(0);
            savedTX.value = 0;
            savedTY.value = 0;
        }
    }, [scale, savedScale, translateX, translateY, savedTX, savedTY]);

    return (
        <GestureHandlerRootView style={styles.streamClip}>
            <GestureDetector gesture={Gesture.Simultaneous(pinch, pan, doubleTap)}>
                <Animated.View style={[styles.streamFill, animatedStyle]}>
                    {children}
                </Animated.View>
            </GestureDetector>
            <View style={styles.zoomBar}>
                <TouchableOpacity style={styles.zoomBtn} onPress={() => zoomBy(1.4)}>
                    <ZoomIn size={18} color="#fff" />
                </TouchableOpacity>
                <TouchableOpacity style={styles.zoomBtn} onPress={() => zoomBy(1 / 1.4)}>
                    <ZoomOut size={18} color="#fff" />
                </TouchableOpacity>
            </View>
        </GestureHandlerRootView>
    );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

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
    const thumbUrl = getEventThumbnailUrl(adminUrl, event.id);

    useEffect(() => {
        setThumbError(false);
    }, [thumbUrl]);
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
                    <AuthedCameraImage
                        uri={thumbUrl}
                        headers={authHeaders}
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
                    <Text style={styles.timeText}>{formatEventDay(event.start_time)} · {formatEventClock(event.start_time)}</Text>
                </View>
                <Text style={styles.agoText}>{eventTimeAgo(event.start_time)}</Text>
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

function LiveStream({ service, camera, sensorIds, entityMap, cameraToken = '' }) {
    const [hasFrame, setHasFrame] = useState(false);
    const [useFrigateFallback, setUseFrigateFallback] = useState(false);
    const [preferHaSnapshot, setPreferHaSnapshot] = useState(false);
    const [haStreamFailed, setHaStreamFailed] = useState(false);
    const haOnly = camera?.feed === 'ha' || camera?.source === 'ha';
    const isHACamera = (cameraUsesHaFeed(camera) || preferHaSnapshot) && !useFrigateFallback;
    const haStreamUrl = isHACamera
        ? (service?.getHAStreamUrl?.(camera.entity_id || camera.id || camera?.name) || '')
        : '';
    const liveStreamUrl = haStreamUrl && cameraToken
        ? `${haStreamUrl}${haStreamUrl.includes('?') ? '&' : '?'}token=${encodeURIComponent(cameraToken)}`
        : '';
    const showHaStream = !!liveStreamUrl && !haStreamFailed;
    const useSnapshot = !showHaStream && (Platform.OS === 'android' || isHACamera);
    const cameraName = String(camera?.name || camera?.id || '').replace(/^camera\./, '');
    const headers = service?.getMediaHeaders?.() || {};

    useEffect(() => {
        setUseFrigateFallback(false);
        setPreferHaSnapshot(false);
        setHaStreamFailed(false);
        setHasFrame(false);
    }, [camera?.id, camera?.entity_id, camera?.name]);

    if (!service || !cameraName) {
        return (
            <View style={[styles.streamContainer, { alignItems: 'center', justifyContent: 'center' }]}>
                <ActivityIndicator color="white" />
            </View>
        );
    }
    const streamUrl = showHaStream
        ? liveStreamUrl
        : isHACamera
            ? service.getHASnapshotUrl(camera.entity_id || camera.id || cameraName)
            : useSnapshot
                ? service.getSnapshotUrl(cameraName, { height: 720 })
                : service.getStreamUrl(cameraName);
    const directHa = isHACamera && service?.haUrl && cameraToken;
    return (
        <ZoomableLive resetKey={cameraName}>
            {directHa ? (
                <HaCameraView
                    haUrl={service.haUrl}
                    entityId={camera.entity_id || (String(camera.id || '').startsWith('camera.') ? camera.id : `camera.${cameraName}`)}
                    accessToken={cameraToken}
                    style={styles.streamImage}
                />
            ) : useSnapshot ? (
                <>
                    <AuthedCameraImage
                        uri={streamUrl}
                        headers={headers}
                        style={styles.streamImage}
                        contentFit={isHACamera ? 'contain' : 'cover'}
                        refreshMs={400}
                        onLoad={() => setHasFrame(true)}
                        onError={() => {
                            if (isHACamera && !haOnly) setUseFrigateFallback(true);
                            else if (!isHACamera) setPreferHaSnapshot(true);
                        }}
                    />
                    {!hasFrame ? (
                        <View style={styles.streamLoading} pointerEvents="none">
                            <ActivityIndicator color="white" />
                        </View>
                    ) : null}
                </>
            ) : (
                <WebView
                    source={{ uri: streamUrl, headers }}
                    style={{ flex: 1, backgroundColor: 'black' }}
                    pointerEvents="none"
                    scrollEnabled={false}
                    allowsInlineMediaPlayback
                    mediaPlaybackRequiresUserAction={false}
                    originWhitelist={['*']}
                    scalesPageToFit
                    javaScriptEnabled
                    onLoadEnd={() => setHasFrame(true)}
                    onError={() => {
                        if (showHaStream) setHaStreamFailed(true);
                    }}
                    onHttpError={() => {
                        if (showHaStream) setHaStreamFailed(true);
                    }}
                />
            )}
            <CameraSensorOverlay sensorIds={sensorIds} entityMap={entityMap} position="bl" />
        </ZoomableLive>
    );
}

// ── Main Modal ────────────────────────────────────────────────────────────────

export default function FrigateCameraModal({
    visible,
    camera,
    service,
    onClose,
    cameraSensors = {},
    haEntities = [],
    userId = '',
    userName = '',
}) {
    const insets = useSafeAreaInsets();
    const [events, setEvents] = useState([]);
    const [eventsLoaded, setEventsLoaded] = useState(false);
    const [loadingEvents, setLoadingEvents] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [selectedLabel, setSelectedLabel] = useState(null);
    const [availableLabels, setAvailableLabels] = useState([]);
    const [hasMore, setHasMore] = useState(true);
    const [selectedEvent, setSelectedEvent] = useState(null);
    const [showHistory, setShowHistory] = useState(false);
    const [watchHistory, setWatchHistory] = useState([]);
    const [historyLoading, setHistoryLoading] = useState(false);

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
        if (!visible || !ready || !service?.adminUrl) return undefined;
        const beat = () => pulseCameraWatch({
            adminUrl: service.adminUrl,
            camera,
            userId,
            userName,
        });
        beat();
        const timer = setInterval(beat, 5000);
        return () => {
            clearInterval(timer);
            endCameraWatch({ adminUrl: service.adminUrl, camera });
        };
    }, [visible, ready, service?.adminUrl, camera?.name, camera?.id, userId, userName]);

    const openHistory = async () => {
        setShowHistory(true);
        setHistoryLoading(true);
        const rows = await fetchCameraWatchHistory(service?.adminUrl, camera);
        setWatchHistory(rows);
        setHistoryLoading(false);
    };

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
        <Modal
            animationType="slide"
            transparent={false}
            visible={visible}
            onRequestClose={onClose}
            statusBarTranslucent
        >
            <FrigateEventImageModal
                visible={!!selectedEvent}
                event={selectedEvent}
                adminUrl={service?.adminUrl}
                authHeaders={service?.getMediaHeaders?.() || {}}
                onClose={() => setSelectedEvent(null)}
            />
            <View style={[styles.container, { paddingTop: insets.top }]}>
                <StatusBar style="light" />
                <View style={styles.header}>
                    <Text style={styles.title}>{formatCameraName(camera?.name) || 'Camera'}</Text>
                    <View style={styles.headerActions}>
                        <TouchableOpacity onPress={openHistory} style={styles.closeBtn}>
                            <Eye size={22} color="white" />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                            <X size={24} color="white" />
                        </TouchableOpacity>
                    </View>
                </View>
                {showHistory ? (
                    <View style={styles.historyPanel}>
                        <View style={styles.historyHead}>
                            <Text style={styles.sectionTitle}>Who watched</Text>
                            <TouchableOpacity onPress={() => setShowHistory(false)}>
                                <Text style={styles.historyClose}>Close</Text>
                            </TouchableOpacity>
                        </View>
                        {historyLoading ? (
                            <ActivityIndicator color="#fff" />
                        ) : watchHistory.length === 0 ? (
                            <Text style={styles.dimText}>No one has opened this camera yet.</Text>
                        ) : (
                            <ScrollView style={{ maxHeight: 220 }}>
                                {watchHistory.map((row) => (
                                    <View key={String(row.id)} style={styles.historyRow}>
                                        <Text style={styles.historyName}>
                                            {row.userName || 'Someone'} · {row.deviceName || row.platform || 'phone'}
                                        </Text>
                                        <Text style={styles.historyMeta}>
                                            {row.live ? 'Watching now · ' : `${formatWatchDuration(row.durationMs)} · `}
                                            {formatWatchWhen(row.startedAt)}
                                        </Text>
                                    </View>
                                ))}
                            </ScrollView>
                        )}
                    </View>
                ) : null}

                {/* Live stream lives OUTSIDE FlatList so it never remounts */}
                <LiveStream
                    service={service}
                    camera={camera}
                    sensorIds={assignedSensorIds}
                    entityMap={entityMap}
                    cameraToken={(() => {
                        const id = camera?.entity_id
                            || (String(camera?.id || '').startsWith('camera.') ? camera.id : '');
                        const entity = (haEntities || []).find((item) => item.entity_id === id);
                        if (camera?.access_token) return String(camera.access_token);
                        const direct = entity?.attributes?.access_token;
                        if (direct) return String(direct);
                        const picture = String(entity?.attributes?.entity_picture || '');
                        const match = picture.match(/[?&]token=([^&]+)/);
                        return match ? decodeURIComponent(match[1]) : '';
                    })()}
                />

                <FlatList
                    data={events}
                    keyExtractor={(item) => String(item.id)}
                    renderItem={({ item }) => (
                        <EventCard
                            event={item}
                            adminUrl={service?.adminUrl}
                            authHeaders={service?.getMediaHeaders?.() || {}}
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
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.1)',
    },
    headerActions: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    streamClip: {
        width: '100%',
        aspectRatio: 16 / 9,
        backgroundColor: 'black',
        overflow: 'hidden',
    },
    streamFill: {
        flex: 1,
    },
    zoomBar: {
        position: 'absolute',
        right: 10,
        bottom: 10,
        flexDirection: 'row',
        gap: 8,
        zIndex: 5,
    },
    zoomBtn: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: 'rgba(0,0,0,0.55)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    historyPanel: {
        paddingHorizontal: 16,
        paddingVertical: 12,
        backgroundColor: '#141414',
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.08)',
        gap: 8,
    },
    historyHead: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    historyClose: {
        color: '#c49ef0',
        fontSize: 14,
    },
    historyRow: {
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.06)',
    },
    historyName: {
        color: '#fff',
        fontSize: 14,
    },
    historyMeta: {
        color: 'rgba(255,255,255,0.5)',
        fontSize: 12,
        marginTop: 2,
    },
    title: {
        color: 'white',
        fontSize: 20,
        fontFamily: CF.bold,
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
    streamImage: {
        ...StyleSheet.absoluteFillObject,
        width: '100%',
        height: '100%',
    },
    streamLoading: {
        ...StyleSheet.absoluteFillObject,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#000',
    },
    eventsHeader: {
        paddingTop: 16,
        paddingBottom: 4,
    },
    sectionTitle: {
        color: 'white',
        fontSize: 17,
        fontFamily: CF.bold,
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
