import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { formatCameraName } from '../../utils/formatDisplayName';
import CameraSensorOverlay, { resolveSensorIds } from './CameraSensorOverlay';
import { cameraUsesHaFeed } from '../../services/appRole';
import AuthedCameraImage from './AuthedCameraImage';

const SNAPSHOT_MS = 1500;
const GRID_SNAPSHOT_H = 360;
const VIEWABILITY = { itemVisiblePercentThreshold: 15, minimumViewTime: 50 };

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
}) {
    const [failed, setFailed] = useState(false);
    const [useHa, setUseHa] = useState(() => cameraUsesHaFeed(cam));
    const [hasFrame, setHasFrame] = useState(false);

    const base = snapshotBase(cam, service, useHa);
    const headers = service?.getMediaHeaders?.() || {};

    useEffect(() => {
        setFailed(false);
        setHasFrame(false);
        setUseHa(cameraUsesHaFeed(cam));
    }, [cam?.id, cam?.entity_id, cam?.name]);

    useEffect(() => {
        if (!active) setHasFrame(false);
    }, [active]);

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
                {active && !failed ? (
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
                            if (useHa) {
                                setUseHa(false);
                                setFailed(false);
                                return;
                            }
                            if (!hasFrame) setFailed(true);
                        }}
                    />
                ) : null}
                {!hasFrame && !failed ? (
                    <View style={[StyleSheet.absoluteFill, styles.loadingOverlay]} pointerEvents="none">
                        <ActivityIndicator color="rgba(255,255,255,0.45)" />
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
    const visibleRef = useRef(visibleRows);
    visibleRef.current = visibleRows;

    const onViewableItemsChanged = useCallback(({ viewableItems }) => {
        const next = new Set(viewableItems.map((item) => item.index).filter((i) => i != null));
        if (next.size === 0) return;
        const prev = visibleRef.current;
        if (prev.size === next.size && [...next].every((i) => prev.has(i))) return;
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
            />
            <View style={styles.cameraNameContainer}>
                <Text style={styles.cameraName} numberOfLines={1}>
                    {formatCameraName(cam.name) || 'Camera'}
                </Text>
            </View>
        </TouchableOpacity>
    );

    const renderRow = ({ item, index }) => {
        const live = active && (!scrollable || visibleRows.has(index));
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
                initialNumToRender={3}
                maxToRenderPerBatch={2}
                windowSize={5}
                removeClippedSubviews
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
    loadingOverlay: {
        backgroundColor: 'rgba(0,0,0,0.25)',
        justifyContent: 'center',
        alignItems: 'center',
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
