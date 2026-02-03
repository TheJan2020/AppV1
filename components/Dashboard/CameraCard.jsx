import { View, Text, Image, StyleSheet } from 'react-native';
import { Colors } from '../../constants/Colors';

export default function CameraCard({ name, entityId, token, url }) {
    // Construct auth-bypass URL for stream or snapshot
    // Standard HA streams usually need a robust player, but for MVP we might use the MJPEG proxy.
    // URL format: http://ha:8123/api/camera_proxy_stream/camera.id?token=TOKEN
    // Note: Using Long Lived Token in query param for image request is risky/not standard for all endpoints,
    // but for /api/camera_proxy_stream it often works if using `?token=` or sending header.
    // Creating a source object with headers is safer for React Native Image.

    const source = {
        uri: `${url}/api/camera_proxy_stream/${entityId}`,
        headers: {
            Authorization: `Bearer ${token}`
        }
    };

    return (
        <View style={styles.container}>
            <Text style={styles.title}>{name}</Text>
            <View style={styles.imageContainer}>
                <Image
                    source={source}
                    style={styles.image}
                    resizeMode="cover"
                />
                <View style={styles.liveBadge}>
                    <Text style={styles.liveText}>LIVE</Text>
                </View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        marginBottom: 20,
    },
    title: {
        color: Colors.text,
        fontSize: 16,
        marginBottom: 8,
        marginLeft: 4,
        fontWeight: '600'
    },
    imageContainer: {
        height: 200,
        borderRadius: 16,
        overflow: 'hidden',
        backgroundColor: Colors.surface,
        position: 'relative'
    },
    image: {
        width: '100%',
        height: '100%',
    },
    liveBadge: {
        position: 'absolute',
        top: 10,
        left: 10,
        backgroundColor: 'red',
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 4,
    },
    liveText: {
        color: 'white',
        fontWeight: 'bold',
        fontSize: 10
    }
});
