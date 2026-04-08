import { memo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { WebView } from 'react-native-webview';
import { LinearGradient } from 'expo-linear-gradient';

// Camera card — same design language as RoomsList card but wider + taller
const CameraCard = ({ cam, frigateService, onPress }) => {
    // If the camera came from HA (has entity_id like "camera.doorstep"), use HA proxy.
    // If it came from Frigate config (name only), use Frigate snapshot proxy.
    const isHACamera = !!(cam.entity_id);
    const snapshotUrl = isHACamera
        ? frigateService?.getHASnapshotUrl(cam.entity_id || cam.id)
        : frigateService?.getSnapshotUrl(cam.name || cam.id);
    const headers = frigateService?.headers || {};

    return (
        <TouchableOpacity
            style={styles.card}
            onPress={() => onPress && onPress(cam)}
            activeOpacity={0.85}
        >
            {snapshotUrl ? (
                <WebView
                    source={{ uri: snapshotUrl, headers }}
                    style={StyleSheet.absoluteFill}
                    scrollEnabled={false}
                    allowsInlineMediaPlayback={false}
                    mediaPlaybackRequiresUserAction={true}
                    originWhitelist={['*']}
                    scalesPageToFit={true}
                    pointerEvents="none"
                />
            ) : (
                <View style={styles.placeholder}>
                    <Text style={styles.placeholderIcon}>📷</Text>
                </View>
            )}

            {/* Same gradient as room card */}
            <LinearGradient
                colors={['transparent', 'rgba(0,0,0,0.4)', 'rgba(0,0,0,0.92)']}
                style={styles.gradient}
            />

            {/* Camera name at bottom — same as room card */}
            <View style={styles.textContainer}>
                <Text style={styles.cameraName} numberOfLines={1}>
                    {cam.name || cam.id}
                </Text>
            </View>

            {/* Live dot top-right */}
            <View style={styles.liveBadge}>
                <View style={styles.liveDot} />
                <Text style={styles.liveText}>LIVE</Text>
            </View>
        </TouchableOpacity>
    );
};

function HomeCameraStrip({ frigateCameras = [], selectedCameraNames = [], frigateService, onCameraPress }) {
    // selectedCameraNames may be HA entity IDs like "camera.doorstep"
    // frigateCameras have name like "doorstep" (without prefix)
    // Normalise both sides: strip "camera." prefix before comparing
    const normalise = s => (s || '').toLowerCase().replace(/^camera\./, '');
    const selectedNormalised = selectedCameraNames.map(normalise);
    const cameras = frigateCameras.filter(c => selectedNormalised.includes(normalise(c.name || c.id)));

    if (cameras.length === 0) return null;

    return (
        <View style={styles.container}>
            <View style={styles.headerRow}>
                <Text style={styles.title}>Cameras</Text>
            </View>
            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.scrollContent}
            >
                {cameras.map(cam => (
                    <CameraCard
                        key={cam.id || cam.name}
                        cam={cam}
                        frigateService={frigateService}
                        onPress={onCameraPress}
                    />
                ))}
            </ScrollView>
        </View>
    );
}

const CARD_WIDTH = 220;   // wider than room card (157)
const CARD_HEIGHT = 148;  // taller than room card (~98)

const styles = StyleSheet.create({
    container: {
        marginBottom: 20,
    },
    headerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 10,
        marginLeft: 4,
    },
    title: {
        color: 'white',
        fontSize: 16,
        fontWeight: '300',
        letterSpacing: 0.5,
    },
    scrollContent: {
        gap: 12,
        paddingRight: 20,
    },
    card: {
        width: CARD_WIDTH,
        height: CARD_HEIGHT,
        borderRadius: 16,
        overflow: 'hidden',
        backgroundColor: '#2a2a2a',
        borderWidth: 1.5,
        borderColor: '#8947ca',     // same purple border as room card
        position: 'relative',
        // same glow as room card
        shadowColor: '#8947ca',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.4,
        shadowRadius: 8,
        elevation: 5,
    },
    placeholder: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: '#1a1a2e',
        justifyContent: 'center',
        alignItems: 'center',
    },
    placeholderIcon: {
        fontSize: 36,
        opacity: 0.4,
    },
    gradient: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        height: '70%',
    },
    textContainer: {
        position: 'absolute',
        bottom: 8,
        left: 10,
        right: 8,
    },
    cameraName: {
        color: 'white',
        fontSize: 14,
        fontWeight: '600',
        textShadowColor: 'rgba(0,0,0,0.75)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 3,
    },
    liveBadge: {
        position: 'absolute',
        top: 8,
        right: 8,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: 'rgba(0,0,0,0.6)',
        paddingHorizontal: 6,
        paddingVertical: 3,
        borderRadius: 8,
    },
    liveDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: '#4ade80',
    },
    liveText: {
        color: 'white',
        fontSize: 10,
        fontWeight: '600',
        letterSpacing: 0.5,
    },
});

export default memo(HomeCameraStrip);
