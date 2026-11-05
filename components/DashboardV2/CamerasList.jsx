import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Platform, View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { WebView } from 'react-native-webview';
import { Eye } from 'lucide-react-native';
import { formatCameraName } from '../../utils/formatDisplayName';
import CameraSensorOverlay, { resolveSensorIds } from './CameraSensorOverlay';
import { cameraUsesHaFeed } from '../../services/appRole';
import AuthedCameraImage from './AuthedCameraImage';
import HaCameraView from './HaCameraView';
import { cameraWatchName, fetchLiveWatchers } from '../../services/cameraWatch';

const SNAPSHOT_MS = 450;

const STREAM_JS = `
  (function() {
    var style = document.createElement('style');
    style.textContent = 'html,body{margin:0;padding:0;background:#000;overflow:hidden;width:100%;height:100%}img,video{position:fixed;inset:0;width:100%;height:100%;object-fit:cover}';
    (document.head || document.documentElement).appendChild(style);
  })();
  true;
`;
const GRID_SNAPSHOT_H = 360;
const LOAD_TIMEOUT_MS = 10000;
const VIEWABILITY = { itemVisiblePercentThreshold: 1, minimumViewTime: 1 };
const PRELOAD_ROWS = 3;

function snapshotBase(cam, service, useHa) {
    if (!service || !cam) return '';
    if (useHa) return service.getHASnapshotUrl(cam.entity_id || cam.id);
    return service.getSnapshotUrl(cam.name || cam.id, { height: GRID_SNAPSHOT_H });
}

function buildRows(cameras, columns) {
    const list = Array.isArray(cameras) ? cameras : [];
    const rows = [];
    if (columns > 2) {
        for (let i = 0; i < list.length; i += columns) {
            rows.push({ key: `r-${i}`, full: false, cams: list.slice(i, i + columns), startIndex: i });
        }
        return rows;
    }
    list.forEach((cam, index) => {
        if (index < 2) {
            rows.push({ key: `r-${index}`, full: true, cams: [cam], startIndex: index });
            return;
        }
        if ((index - 2) % 2 === 0) {
            rows.push({ key: `r-${index}`, full: false, cams: [cam], startIndex: index });
            return;
        }
        rows[rows.length - 1].cams.push(cam);
    });
    return rows;
}

const CameraPreview = memo(function CameraPreview({
    cam,
    service,
    sensorIds = [],
    entityMap = {},
    active = true,
    startDelayMs = 0,
    itemWidth,
    viewerCount = 0,
}) {
    const [failed, setFailed] = useState(false);
    const [useHa, setUseHa] = useState(() => cameraUsesHaFeed(cam));
    const [streamFailed, setStreamFailed] = useState(false);
    const [hasFrame, setHasFrame] = useState(false);
    const haOnly = cam?.feed === 'ha' || cam?.source === 'ha';

    const base = snapshotBase(cam, service, useHa);
    const headers = service?.getMediaHeaders?.() || {};
    const frigateName = cameraWatchName(cam);
    const haLive = useHa && !!service?.haUrl && !!cam?.access_token;
    const useSnapshot = !haLive && (Platform.OS === 'android' || useHa || streamFailed);
    const streamUrl = !useSnapshot && service && frigateName ? service.getStreamUrl(frigateName) : '';

    useEffect(() => {
        setFailed(false);
        setHasFrame(false);
        setStreamFailed(false);
        setUseHa(cameraUsesHaFeed(cam));
    }, [cam?.id, cam?.entity_id, cam?.name]);

    useEffect(() => {
        if (!active || hasFrame || failed || haLive) return undefined;
        const timer = setTimeout(() => {
            if (useHa && !haOnly) {
                setUseHa(false);
                setFailed(false);
                return;
            }
            setFailed(true);
        }, LOAD_TIMEOUT_MS);
        return () => clearTimeout(timer);
    }, [active, hasFrame, failed, useHa, haOnly, haLive, cam?.id]);

    if (!service || !cam || !base) {
        return (
            <View style={[styles.cameraWrapper, itemWidth ? { width: itemWidth } : null]}>
                <View style={[styles.imageContainer, styles.centerFill]}>
                    <Text style={styles.placeholderText}>Loading...</Text>
                </View>
            </View>
        );
    }

    return (
        <View style={[styles.cameraWrapper, itemWidth ? { width: itemWidth } : null]}>
            <View style={styles.imageContainer}>
                {active && !failed && haLive ? (
                    <HaCameraView
                        haUrl={service.haUrl}
                        entityId={cam.entity_id || cam.id}
                        accessToken={cam.access_token}
                        style={StyleSheet.absoluteFill}
                        onFirstFrame={() => {
                            setHasFrame(true);
                            setFailed(false);
                        }}
                        onFail={() => {
                            if (!hasFrame) setFailed(true);
                        }}
                    />
                ) : null}
                {active && !failed && !haLive && useSnapshot ? (
                    <AuthedCameraImage
                        uri={base}
                        headers={headers}
                        refreshMs={SNAPSHOT_MS}
                        startDelayMs={startDelayMs}
                        onLoad={() => {
                            setHasFrame(true);
                            setFailed(false);
                        }}
                        onError={() => {
                            if (useHa && !haOnly) {
                                setUseHa(false);
                                setFailed(false);
                                return;
                            }
                            if (!hasFrame) setFailed(true);
                        }}
                    />
                ) : null}
                {active && !failed && !useSnapshot && streamUrl ? (
                    <WebView
                        source={{ uri: streamUrl, headers }}
                        style={StyleSheet.absoluteFill}
                        backgroundColor="black"
                        scrollEnabled={false}
                        allowsInlineMediaPlayback
                        mediaPlaybackRequiresUserAction={false}
                        originWhitelist={['*']}
                        javaScriptEnabled
                        injectedJavaScriptBeforeContentLoaded={STREAM_JS}
                        onLoadStart={() => setHasFrame(true)}
                        onLoadEnd={() => setHasFrame(true)}
                        onError={() => setStreamFailed(true)}
                        onHttpError={() => setStreamFailed(true)}
                    />
                ) : null}
                {viewerCount > 0 ? (
                    <View style={styles.eyeBadge} pointerEvents="none">
                        <Eye size={13} color="#fff" />
                        <Text style={styles.eyeText}>{viewerCount}</Text>
                    </View>
                ) : null}
                {failed && !hasFrame ? (
                    <View style={[StyleSheet.absoluteFill, styles.errorOverlay]}>
                        <Text style={styles.errorIcon}>📵</Text>
                        <Text style={styles.errorText}>Stream unavailable</Text>
                    </View>
                ) : null}
                <CameraSensorOverlay sensorIds={sensorIds} entityMap={entityMap} position="bl" />
            </View>
        </View>
    );
});

function CamerasList({
    frigateCameras,
    service,
    onCameraPress,
    columns = 2,
    cameraSensors = {},
    entityMap = {},
    active = true,
    scrollable = false,
    contentContainerStyle,
}) {
    const isTabletGrid = columns > 2;
    const tabletWidth = `${Math.floor(100 / columns) - 2}%`;
    const rows = useMemo(() => buildRows(frigateCameras, columns), [frigateCameras, columns]);
    const [visibleRows, setVisibleRows] = useState(() => new Set([0, 1, 2]));
    const [watchers, setWatchers] = useState([]);
    const visibleRef = useRef(visibleRows);
    visibleRef.current = visibleRows;

    useEffect(() => {
        const adminUrl = service?.adminUrl;
        if (!active || !adminUrl) return undefined;
        let stopped = false;
        const tick = async () => {
            const rows = await fetchLiveWatchers(adminUrl);
            if (!stopped) setWatchers(rows);
        };
        tick();
        const timer = setInterval(tick, 4000);
        return () => {
            stopped = true;
            clearInterval(timer);
        };
    }, [active, service?.adminUrl]);

    const viewerCountFor = useCallback((cam) => {
        const name = cameraWatchName(cam).toLowerCase();
        if (!name) return 0;
        return watchers.filter((row) => String(row.camera || '').replace(/^camera\./, '').trim().toLowerCase() === name).length;
    }, [watchers]);

    const onViewableItemsChanged = useCallback(({ viewableItems }) => {
        const next = new Set(visibleRef.current);
        viewableItems.forEach((item) => {
            if (item.index == null) return;
            next.add(item.index);
            next.add(item.index + 1);
        });
        if (next.size === visibleRef.current.size && [...next].every((i) => visibleRef.current.has(i))) return;
        setVisibleRows(next);
    }, []);

    const renderCam = (cam, index, live, itemWidth) => (
        <TouchableOpacity
            key={cam.id || cam.entity_id || cam.name || String(index)}
            onPress={() => onCameraPress && onCameraPress(cam)}
            activeOpacity={0.85}
            style={[
                styles.gridItem,
                itemWidth ? { width: itemWidth } : (index < 2 && !isTabletGrid ? styles.fullWidth : styles.halfWidth),
            ]}
        >
            <CameraPreview
                cam={cam}
                service={service}
                active={live}
                startDelayMs={Math.min(index * 80, 400)}
                sensorIds={resolveSensorIds(cam, cameraSensors)}
                entityMap={entityMap}
                viewerCount={viewerCountFor(cam)}
            />
            <View style={styles.cameraNameContainer}>
                <Text style={styles.cameraName} numberOfLines={1}>
                    {formatCameraName(cam.friendly_name || cam.name) || 'Camera'}
                </Text>
            </View>
        </TouchableOpacity>
    );

    const renderRow = ({ item, index }) => {
        const live = active && (!scrollable || index < PRELOAD_ROWS || visibleRows.has(index));
        const width = item.full ? '100%' : (isTabletGrid ? tabletWidth : '48%');
        return (
            <View style={styles.row}>
                {item.cams.map((cam, camIndex) => renderCam(cam, item.startIndex + camIndex, live, width))}
            </View>
        );
    };

    if (!frigateCameras || frigateCameras.length === 0) return null;

    if (scrollable) {
        return (
            <FlatList
                data={rows}
                keyExtractor={(item) => item.key}
                renderItem={renderRow}
                style={styles.list}
                contentContainerStyle={[styles.container, contentContainerStyle]}
                initialNumToRender={6}
                maxToRenderPerBatch={4}
                windowSize={8}
                removeClippedSubviews={false}
                onViewableItemsChanged={onViewableItemsChanged}
                viewabilityConfig={VIEWABILITY}
            />
        );
    }

    return (
        <View style={styles.container}>
            {rows.map((item) => (
                <View key={item.key} style={styles.row}>
                    {item.cams.map((cam, camIndex) => (
                        renderCam(cam, item.startIndex + camIndex, active, item.full ? '100%' : (isTabletGrid ? tabletWidth : '48%'))
                    ))}
                </View>
            ))}
        </View>
    );
}

const styles = StyleSheet.create({
    list: {
        flex: 1,
    },
    container: {
        marginBottom: 20,
    },
    row: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 12,
        marginBottom: 8,
    },
    gridItem: {
        marginBottom: 8,
    },
    fullWidth: {
        width: '100%',
    },
    halfWidth: {
        width: '48%',
    },
    cameraWrapper: {
        width: '100%',
    },
    eyeBadge: {
        position: 'absolute',
        top: 8,
        right: 8,
        zIndex: 4,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: 'rgba(0,0,0,0.62)',
        borderRadius: 12,
        paddingHorizontal: 8,
        paddingVertical: 4,
    },
    eyeText: {
        color: '#fff',
        fontSize: 12,
        fontWeight: '600',
    },
    imageContainer: {
        width: '100%',
        aspectRatio: 16 / 9,
        borderRadius: 12,
        overflow: 'hidden',
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
        marginBottom: 8,
    },
    centerFill: {
        justifyContent: 'center',
        alignItems: 'center',
    },
    placeholderText: {
        color: 'rgba(255,255,255,0.5)',
        fontSize: 12,
    },
    cameraNameContainer: {
        paddingHorizontal: 4,
    },
    cameraName: {
        color: 'rgba(255, 255, 255, 0.8)',
        fontSize: 13,
        fontWeight: '400',
    },
    errorOverlay: {
        backgroundColor: '#0d0d1a',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 6,
    },
    errorIcon: {
        fontSize: 28,
        opacity: 0.5,
    },
    errorText: {
        color: 'rgba(255,255,255,0.35)',
        fontSize: 12,
        fontWeight: '400',
    },
});

export default memo(CamerasList);
