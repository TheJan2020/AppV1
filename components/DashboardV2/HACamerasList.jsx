import React, { useEffect, useState, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Image, TouchableOpacity, AppState } from 'react-native';

const HACamera = ({ camera, allEntities, haUrl, haToken, timestamp }) => {
    if (!camera.attributes || !camera.attributes.entity_picture) return null;

    const imageUrl = `${haUrl}${camera.attributes.entity_picture}&t=${timestamp}`;

    const cameraName = camera.entity_id.replace('camera.', '');
    const motionEntityId = `binary_sensor.${cameraName}`;

    const motionSensor = allEntities ? allEntities.find(e => e.entity_id === motionEntityId) : null;
    const isMotionDetected = motionSensor && motionSensor.state === 'on';

    return (
        <View style={styles.cameraWrapper}>
            <View style={styles.imageContainer}>
                <Image
                    source={{
                        uri: imageUrl,
                        headers: {
                            Authorization: `Bearer ${haToken}`
                        },
                        cache: 'reload'
                    }}
                    style={styles.cameraImage}
                    resizeMode="cover"
                />

                {/* Live Badge */}
                <View style={styles.liveBadge}>
                    <Text style={styles.liveText}>LIVE</Text>
                </View>

                {/* Motion Badge */}
                {isMotionDetected && (
                    <View style={styles.motionBadge}>
                        <Text style={styles.motionText}>MOTION</Text>
                    </View>
                )}
            </View>
            <Text style={styles.cameraName} numberOfLines={1}>
                {camera.attributes.friendly_name || 'Camera'}
            </Text>
        </View>
    );
};

export default function HACamerasList({ cameras, allEntities, haUrl, haToken, onCameraPress }) {
    // Per-camera timestamps — only ONE camera refreshes per tick (round-robin)
    const [timestamps, setTimestamps] = useState({});
    const appStateRef = useRef(AppState.currentState);
    const currentIndexRef = useRef(0);

    const refreshNextCamera = useCallback(() => {
        if (!cameras || cameras.length === 0) return;
        if (appStateRef.current !== 'active') return;

        const idx = currentIndexRef.current % cameras.length;
        const entityId = cameras[idx].entity_id;
        currentIndexRef.current = idx + 1;

        setTimestamps(prev => ({ ...prev, [entityId]: Date.now() }));
    }, [cameras]);

    useEffect(() => {
        if (!cameras || cameras.length === 0) return;

        // Initialize all cameras with same timestamp on first mount
        const now = Date.now();
        const initial = {};
        cameras.forEach(c => { initial[c.entity_id] = now; });
        setTimestamps(initial);
        currentIndexRef.current = 0;

        // Refresh ONE camera every 3s (round-robin)
        // With N cameras, each camera refreshes every N*3 seconds
        // This ensures only 1 HTTP request at a time instead of N simultaneous
        const interval = setInterval(refreshNextCamera, 3000);

        const subscription = AppState.addEventListener('change', nextState => {
            appStateRef.current = nextState;
        });

        return () => {
            clearInterval(interval);
            subscription.remove();
        };
    }, [cameras?.length, refreshNextCamera]);

    if (!cameras || cameras.length === 0) return null;

    return (
        <View style={styles.container}>
            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.scrollContent}
            >
                {cameras.map((cam) => (
                    <TouchableOpacity
                        key={cam.entity_id}
                        onPress={() => onCameraPress && onCameraPress(cam)}
                    >
                        <HACamera
                            camera={cam}
                            allEntities={allEntities}
                            haUrl={haUrl}
                            haToken={haToken}
                            timestamp={timestamps[cam.entity_id] || 0}
                        />
                    </TouchableOpacity>
                ))}
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        marginBottom: 20,
    },
    scrollContent: {
        gap: 12,
        paddingRight: 20,
    },
    cameraWrapper: {
        width: 200,
    },
    imageContainer: {
        width: '100%',
        height: 120,
        borderRadius: 12,
        overflow: 'hidden',
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
        marginBottom: 8,
        position: 'relative',
    },
    cameraImage: {
        width: '100%',
        height: '100%',
    },
    cameraName: {
        color: 'rgba(255, 255, 255, 0.8)',
        fontSize: 13,
        fontWeight: '400',
        marginLeft: 4,
    },
    liveBadge: {
        position: 'absolute',
        top: 8,
        right: 8,
        backgroundColor: 'rgba(244, 67, 54, 0.8)',
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 4,
    },
    liveText: {
        color: 'white',
        fontSize: 10,
        fontWeight: 'bold',
    },
    motionBadge: {
        position: 'absolute',
        top: 8,
        left: 8,
        backgroundColor: 'rgba(255, 193, 7, 0.9)', // Amber/Yellow for Motion
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 4,
    },
    motionText: {
        color: '#000',
        fontSize: 10,
        fontWeight: 'bold',
    }
});
