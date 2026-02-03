import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Image, TouchableOpacity } from 'react-native';

const HACamera = ({ camera, allEntities, haUrl, haToken }) => {
    const [timestamp, setTimestamp] = useState(Date.now());

    useEffect(() => {
        // Auto-refresh snapshot every 3 seconds if it's not a stream
        const interval = setInterval(() => {
            setTimestamp(Date.now());
        }, 3000);
        return () => clearInterval(interval);
    }, []);

    if (!camera.attributes || !camera.attributes.entity_picture) return null;

    const imageUrl = `${haUrl}${camera.attributes.entity_picture}&t=${timestamp}`;

    // Motion Detection Logic
    // Assumption: camera.lulu -> binary_sensor.lulu
    const cameraName = camera.entity_id.replace('camera.', '');
    const motionEntityId = `binary_sensor.${cameraName}`; // e.g. binary_sensor.lulu
    // Alternative: Try to find binary_sensor with same friendy name or check device registry if available
    // But user specified strictly: camera.name -> binary_sensor.name

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
                        }
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
