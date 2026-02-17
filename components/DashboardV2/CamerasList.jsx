import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { WebView } from 'react-native-webview';

const LiveCamera = ({ cam, service }) => {
    if (!service || !cam) {
        return (
            <View style={styles.cameraWrapper}>
                <View style={[styles.imageContainer, { justifyContent: 'center', alignItems: 'center' }]}>
                    <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>Loading...</Text>
                </View>
                <Text style={styles.cameraName}>Camera</Text>
            </View>
        );
    }

    // Use backend proxy - no authentication needed!
    const streamUrl = service.getStreamUrl(cam.name);

    const htmlContent = `
      <html>
        <body style="margin:0;padding:0;background:black;display:flex;justify-content:center;align-items:center;height:100%;">
          <img src="${streamUrl}" style="width:100%;height:100%;object-fit:cover;" />
        </body>
      </html>
    `;

    return (
        <View style={styles.cameraWrapper}>
            <View style={styles.imageContainer}>
                <WebView
                    source={{ html: htmlContent }}
                    style={{ flex: 1, backgroundColor: 'black' }}
                    scrollEnabled={false}
                    allowsInlineMediaPlayback={true}
                    mediaPlaybackRequiresUserAction={false}
                    originWhitelist={['*']}
                    scalesPageToFit={true}
                />
            </View>
        </View>
    );
};

export default function CamerasList({ frigateCameras, service, onCameraPress, columns = 2 }) {
    if (!frigateCameras || frigateCameras.length === 0) return null;

    // On tablets (columns > 2), show all cameras in equal-width grid
    // On phones (columns <= 2), keep original layout: first 2 full-width, rest half-width
    const isTabletGrid = columns > 2;
    const tabletWidth = `${Math.floor(100 / columns) - 2}%`;

    return (
        <View style={styles.container}>
            <Text style={styles.title}>Live Feeds</Text>
            <View style={styles.gridContainer}>
                {frigateCameras.map((cam, index) => (
                    <TouchableOpacity
                        key={cam.id}
                        onPress={() => onCameraPress && onCameraPress(cam)}
                        style={[
                            styles.gridItem,
                            isTabletGrid
                                ? { width: tabletWidth }
                                : [
                                    index < 2 && styles.fullWidth,
                                    index >= 2 && styles.halfWidth
                                ]
                        ]}
                    >
                        <LiveCamera cam={cam} service={service} />
                        <View style={styles.cameraNameContainer}>
                            <Text style={styles.cameraName} numberOfLines={1}>
                                {cam.name || 'Camera'}
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
    title: {
        color: 'white',
        fontSize: 16,
        fontWeight: '300',
        marginBottom: 10,
        marginLeft: 4,
        letterSpacing: 0.5,
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
        width: '48%', // Approximately 50% minus gap
    },
    cameraWrapper: {
        width: '100%',
    },
    imageContainer: {
        width: '100%',
        aspectRatio: 16 / 9, // Maintain 16:9 aspect ratio
        borderRadius: 12,
        overflow: 'hidden',
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
        marginBottom: 8,
    },
    cameraNameContainer: {
        paddingHorizontal: 4,
    },
    cameraName: {
        color: 'rgba(255, 255, 255, 0.8)',
        fontSize: 13,
        fontWeight: '400',
    }
});
