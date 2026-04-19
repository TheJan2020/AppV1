import { memo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions } from 'react-native';
import { WebView } from 'react-native-webview';
import { LinearGradient } from 'expo-linear-gradient';
import { CF } from '../../utils/typography';

// 2 columns, parent has paddingHorizontal:20 on each side → usable width = screen - 40
const SCREEN_W = Dimensions.get('window').width;
const COL_GAP = 10;
const H_PAD = 40;
const CARD_W = (SCREEN_W - H_PAD - COL_GAP) / 2;
const CARD_H = 174;

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

function HomeCameraStrip({ frigateCameras = [], selectedCameraNames = [], frigateService, onCameraPress, onAllCamerasPress }) {
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
                <Text style={styles.title}>CAMERAS</Text>
                <TouchableOpacity onPress={onAllCamerasPress} style={styles.allBtn}>
                    <Text style={styles.allBtnText}>All Cameras</Text>
                </TouchableOpacity>
            </View>
            <View style={styles.grid}>
                {cameras.map(cam => (
                    <CameraCard
                        key={cam.id || cam.name}
                        cam={cam}
                        frigateService={frigateService}
                        onPress={onCameraPress}
                    />
                ))}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        marginBottom: 20,
    },
    headerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 10,
        marginHorizontal: 2,
    },
    title: {
        color: '#9199BA',
        fontSize: 12,
        fontFamily: CF.semibold,
        letterSpacing: 1.4,
    },
    allBtn: {
        paddingVertical: 2,
        paddingHorizontal: 4,
    },
    allBtnText: {
        color: '#9199BA',
        fontSize: 12,
        fontFamily: CF.semibold,
        letterSpacing: 0.3,
    },
    scrollContent: {
        gap: 12,
        paddingRight: 20,
    },
    grid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        rowGap: COL_GAP,
    },
    card: {
        width: CARD_W,
        height: CARD_H,
        borderRadius: 16,
        overflow: 'hidden',
        backgroundColor: '#1e1f35',
        position: 'relative',
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
        fontFamily: CF.semibold,
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
        fontFamily: CF.semibold,
        letterSpacing: 0.5,
    },
});

export default memo(HomeCameraStrip);
