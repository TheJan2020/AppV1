import { View, Text, StyleSheet } from 'react-native';
import { Thermometer, Droplets, Zap, Sun, Activity } from 'lucide-react-native';
import { Colors } from '../../constants/Colors';
import WidgetCard from './WidgetCard';

const SENSOR_CONFIG = {
    temperature: { icon: Thermometer, color: '#FF7043', unit: '°' },
    humidity: { icon: Droplets, color: '#42A5F5', unit: '%' },
    power: { icon: Zap, color: '#FFB74D', unit: ' W' },
    energy: { icon: Zap, color: '#FFA726', unit: ' kWh' },
    illuminance: { icon: Sun, color: '#FFD54F', unit: ' lx' },
};

const DEVICE_CLASSES = Object.keys(SENSOR_CONFIG);

export default function SensorOverviewWidget({
    entities,
    registryEntities,
    registryAreas,
    registryDevices,
    span = 2,
    totalColumns = 4,
}) {
    // Find sensor entities with supported device classes
    const sensors = entities
        .filter(e => {
            if (!e.entity_id.startsWith('sensor.')) return false;
            const dc = e.attributes?.device_class;
            return dc && DEVICE_CLASSES.includes(dc);
        })
        .filter(e => e.state !== 'unavailable' && e.state !== 'unknown');

    if (sensors.length === 0) return null;

    // Resolve area for each sensor
    const getAreaInfo = (entityId) => {
        const regEnt = registryEntities.find(re => re.entity_id === entityId);
        if (!regEnt) return { areaId: null, areaName: null };

        let areaId = regEnt.area_id;
        if (!areaId && regEnt.device_id) {
            const device = registryDevices.find(d => d.id === regEnt.device_id);
            areaId = device?.area_id || null;
        }

        if (!areaId) return { areaId: null, areaName: null };
        const area = registryAreas.find(a => a.area_id === areaId);
        return { areaId, areaName: area?.name || areaId };
    };

    // Group sensors by room
    const roomMap = {};
    sensors.forEach(sensor => {
        const { areaId, areaName } = getAreaInfo(sensor.entity_id);
        const key = areaId || '__unassigned';
        if (!roomMap[key]) {
            roomMap[key] = { name: areaName || 'Other', sensors: [] };
        }
        roomMap[key].sensors.push(sensor);
    });

    // Sort rooms alphabetically, limit to keep it compact
    const rooms = Object.values(roomMap)
        .sort((a, b) => a.name.localeCompare(b.name))
        .slice(0, 6);

    // Limit sensors per room
    rooms.forEach(room => {
        room.sensors = room.sensors.slice(0, 4);
    });

    return (
        <WidgetCard title="Sensors" icon={Activity} span={span} totalColumns={totalColumns}>
            <View style={styles.roomList}>
                {rooms.map((room, idx) => (
                    <View key={idx} style={styles.roomGroup}>
                        <Text style={styles.roomName}>{room.name}</Text>
                        <View style={styles.sensorRow}>
                            {room.sensors.map(sensor => {
                                const dc = sensor.attributes?.device_class;
                                const config = SENSOR_CONFIG[dc] || SENSOR_CONFIG.temperature;
                                const SensorIcon = config.icon;
                                const value = parseFloat(sensor.state);
                                const displayVal = isNaN(value) ? sensor.state : Math.round(value * 10) / 10;

                                return (
                                    <View key={sensor.entity_id} style={styles.pill}>
                                        <SensorIcon size={13} color={config.color} />
                                        <Text style={styles.pillValue}>
                                            {displayVal}{config.unit}
                                        </Text>
                                    </View>
                                );
                            })}
                        </View>
                    </View>
                ))}
            </View>
        </WidgetCard>
    );
}

const styles = StyleSheet.create({
    roomList: {
        gap: 12,
    },
    roomGroup: {
        gap: 6,
    },
    roomName: {
        color: Colors.textDim,
        fontSize: 11,
        fontWeight: '600',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    sensorRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 6,
    },
    pill: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.06)',
        paddingVertical: 5,
        paddingHorizontal: 9,
        borderRadius: 10,
        gap: 5,
    },
    pillValue: {
        color: Colors.text,
        fontSize: 12,
        fontWeight: '600',
    },
});
