import { memo, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { CF } from '../../utils/typography';
import { formatCameraName } from '../../utils/formatDisplayName';
import CameraSensorOverlay, { resolveSensorIds } from './CameraSensorOverlay';
import { cameraUsesHaFeed } from '../../services/appRole';
import AuthedCameraImage from './AuthedCameraImage';

const SNAPSHOT_MS = 600;

function snapshotBase(cam, service, useHa) {
    if (!service || !cam) return '';
    if (useHa) return service.getHASnapshotUrl(cam.entity_id || cam.id);
    return service.getSnapshotUrl(cam.name || cam.id);
}

const CameraPreview = memo(function CameraPreview({ cam, service, sensorIds = [], entityMap = {}, active = true }) {
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

    if (!service || !cam || !base) {
        return (
            <View style={styles.cameraWrapper}>
                <View style={[styles.imageContainer, styles.centerFill]}>
                    <Text style={styles.placeholderText}>Loading...</Text>
                </View>
            </View>
        );
    }

    return (
        <View style={styles.cameraWrapper}>
            <View style={styles.imageContainer}>
                {!failed ? (
                    <AuthedCameraImage
                        uri={base}
                        headers={headers}
                        refreshMs={active ? SNAPSHOT_MS : 0}
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

function CamerasList({ frigateCameras, service, onCameraPress, columns = 2, cameraSensors = {}, entityMap = {}, active = true }) {
    const isTabletGrid = columns > 2;
    const tabletWidth = `${Math.floor(100 / columns) - 2}%`;

    if (!frigateCameras || frigateCameras.length === 0) return null;

    return (
        <View style={styles.container}>
            <View style={styles.gridContainer}>
                {frigateCameras.map((cam, index) => (
                    <TouchableOpacity
                        key={cam.id || cam.entity_id || cam.name || String(index)}
                        onPress={() => onCameraPress && onCameraPress(cam)}
                        activeOpacity={0.85}
                        style={[
                            styles.gridItem,
                            isTabletGrid
                                ? { width: tabletWidth }
                                : [
                                    index < 2 && styles.fullWidth,
                                    index >= 2 && styles.halfWidth,
                                ],
                        ]}
                    >
                        <CameraPreview
                            cam={cam}
                            service={service}
                            active={active}
                            sensorIds={resolveSensorIds(cam, cameraSensors)}
                            entityMap={entityMap}
                        />
                        <View style={styles.cameraNameContainer}>
                            <Text style={styles.cameraName} numberOfLines={1}>
                                {formatCameraName(cam.name) || 'Camera'}
                            </Text>
                        </View>
                    </TouchableOpacity>
                ))}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        marginBottom: 20,
    },
    gridContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 12,
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
