import { View, Text, StyleSheet } from 'react-native';
import { Camera } from 'lucide-react-native';
import CamerasList from '../DashboardV2/CamerasList';
import { Colors } from '../../constants/Colors';

export default function CamerasWidget({
    frigateCameras,
    frigateService,
    onCameraPress,
    columns = 3,
    span = 4,
    totalColumns = 4,
}) {
    const widthPercent = `${(span / totalColumns) * 100 - 1}%`;

    if (!frigateCameras || frigateCameras.length === 0) return null;

    return (
        <View style={[styles.container, { width: widthPercent }]}>
            <View style={styles.header}>
                <Camera size={16} color={Colors.textDim} />
                <Text style={styles.title}>Cameras</Text>
            </View>
            <CamerasList
                frigateCameras={frigateCameras}
                service={frigateService}
                onCameraPress={onCameraPress}
                columns={columns}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
        borderRadius: 20,
        padding: 16,
        marginBottom: 10,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 12,
    },
    title: {
        color: Colors.text,
        fontSize: 14,
        fontWeight: '600',
    },
});
