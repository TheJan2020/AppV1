import { memo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import { Sofa, Bed, Bath, Utensils, Monitor, Lamp, Settings, Lightbulb, Fan, GalleryVerticalEnd, DoorOpen, Thermometer, Droplets, Satellite } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { CF } from '../../utils/typography';

const getIconForRoom = (name) => {
    const lower = (name || '').toLowerCase();
    if (lower.includes('living')) return Sofa;
    if (lower.includes('bed')) return Bed;
    if (lower.includes('bath')) return Bath;
    if (lower.includes('kitchen') || lower.includes('dining')) return Utensils;
    if (lower.includes('office') || lower.includes('study')) return Monitor;
    return Lamp; // Default
};

// Convert area_id-style names (e.g. "living_room") to proper display names ("Living Room")
const formatRoomName = (name) => {
    if (!name) return '';
    // If already has spaces, it's a proper name — return as-is
    if (name.includes(' ')) return name;
    // Otherwise treat as slug: replace underscores with spaces and title-case each word
    return name
        .replace(/_/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase());
};


function RoomsList({
    rooms,
    onRoomPress,
    overlayColor = '#000000',
    overlayOpacity = 0.4,
    onSettingsPress,
    onAllRoomsPress,
    layout = 'horizontal', // 'horizontal' | 'grid',
    columns = 2,
    registryEntities = [],
    allEntities = [],
    haUrl,
    haToken,
    sensorMappings = []
}) {
    const gridCardWidth = `${Math.floor(96 / columns)}%`;
    // Increased by 10%
    const horizontalCardWidth = columns > 2 ? 211 : 157;

    if (!rooms || rooms.length === 0) {
        if (layout === 'grid') {
            return (
                <View style={[styles.container, styles.emptyContainer]}>
                    <Text style={{ color: 'rgba(255,255,255,0.4)' }}>No rooms found for this floor.</Text>
                </View>
            );
        }
        return null;
    }

    const safeSensorMappings = Array.isArray(sensorMappings) ? sensorMappings : [];

    const renderCard = (room, index) => {
        const displayName = formatRoomName(room.name);
        const Icon = getIconForRoom(displayName);
        const imageUrl = room.picture ? `${(haUrl || '').replace(/\/$/, '')}${room.picture}` : null;

        const hasActiveDevices = (room.activeLights > 0 || room.activeAC > 0 || room.activeCovers > 0 || room.activeDoors > 0);

        // Find room sensors
        const roomRegItems = registryEntities.filter(r => r.area_id === room.area_id);
        const roomSensors = roomRegItems
            .filter(r => r.entity_id.startsWith('sensor.'))
            .map(r => {
                const entity = allEntities.find(e => e.entity_id === r.entity_id);
                const mapping = safeSensorMappings.find(m => m.entity_id === r.entity_id);
                return { ...entity, sensorType: mapping?.sensorType };
            })
            .filter(e => e && e.entity_id);

        const temps = roomSensors.filter(s => s.sensorType === 'temperature');
        const humiditys = roomSensors.filter(s => s.sensorType === 'humidity');

        const avgTemp = temps.length > 0
            ? (temps.reduce((sum, s) => sum + parseFloat(s.state), 0) / temps.length).toFixed(1)
            : null;

        const avgHum = humiditys.length > 0
            ? (humiditys.reduce((sum, s) => sum + parseFloat(s.state), 0) / humiditys.length).toFixed(0)
            : null;

        return (
            <TouchableOpacity
                key={room.area_id}
                style={[
                    styles.card,
                    layout === 'grid' && styles.gridCard,
                ]}
                onPress={() => onRoomPress && onRoomPress(room)}
            >
                {imageUrl ? (
                    <View style={styles.backgroundImage}>
                        <Image
                            source={{ uri: imageUrl, headers: { Authorization: `Bearer ${haToken}` } }}
                            style={StyleSheet.absoluteFill}
                            contentFit="cover"
                        />
                        <View style={[
                            styles.darkOverlay,
                            { backgroundColor: overlayColor, opacity: overlayOpacity }
                        ]} />
                        <LinearGradient
                            colors={['transparent', 'rgba(0,0,0,0.15)', 'rgba(0,0,0,0.55)', 'rgba(0,0,0,0.97)']}
                            locations={[0, 0.4, 0.7, 1]}
                            style={styles.gradient}
                        />
                    </View>
                ) : (
                    <View style={styles.placeholderBackground}>
                        <Icon size={32} color="rgba(255,255,255,0.2)" />
                        <View style={[
                            styles.darkOverlay,
                            { backgroundColor: overlayColor, opacity: overlayOpacity }
                        ]} />
                        <LinearGradient
                            colors={['transparent', 'rgba(0,0,0,0.15)', 'rgba(0,0,0,0.55)', 'rgba(0,0,0,0.97)']}
                            locations={[0, 0.4, 0.7, 1]}
                            style={styles.gradient}
                        />
                    </View>
                )}

                <LinearGradient
                    colors={['transparent', 'rgba(0,0,0,0.90)']}
                    locations={[0, 1]}
                    style={styles.textContainer}
                >
                    <Text style={styles.roomName} numberOfLines={1}>{displayName}</Text>
                    {room.hasPresenceSensor && (
                        <Satellite size={14} color="#4cd137" style={{ marginLeft: 6 }} />
                    )}
                </LinearGradient>

                {/* Left Status - Sensors */}
                <View style={styles.leftStatusRow}>
                    {avgTemp && (
                        <View style={styles.statusItem}>
                            <Thermometer size={12} color="#ffffff" />
                            <Text style={styles.statusText}>{avgTemp}°</Text>
                        </View>
                    )}
                    {avgHum && (
                        <View style={styles.statusItem}>
                            <Droplets size={12} color="#ffffff" />
                            <Text style={styles.statusText}>{avgHum}%</Text>
                        </View>
                    )}
                </View>

                {/* Right Status - Active Devices */}
                <View style={styles.statusRow}>
                    {room.activeLights > 0 && (
                        <View style={[styles.statusItem, { backgroundColor: '#FFD54F' }]}>
                            <Lightbulb size={12} color="#1c1c1e" fill="#1c1c1e" />
                            <Text style={[styles.statusText, { color: '#1c1c1e' }]}>{room.activeLights}</Text>
                        </View>
                    )}
                    {room.activeAC > 0 && (
                        <View style={[styles.statusItem, { backgroundColor: '#42A5F5' }]}>
                            <Fan size={12} color="#fff" />
                            <Text style={styles.statusText}>{room.activeAC}</Text>
                        </View>
                    )}
                    {room.activeDoors > 0 && (
                        <View style={[styles.statusItem, { backgroundColor: '#EF5350' }]}>
                            <DoorOpen size={12} color="#fff" />
                            <Text style={styles.statusText}>{room.activeDoors}</Text>
                        </View>
                    )}
                </View>
            </TouchableOpacity>
        );
    };

    if (layout === 'grid') {
        return (
            <View style={styles.gridContainer}>
                {rooms.map((room, index) => renderCard(room, index))}
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <View style={styles.headerRow}>
                <Text style={styles.title}>ROOMS</Text>
                <TouchableOpacity onPress={onAllRoomsPress || onSettingsPress} style={styles.allBtn}>
                    <Text style={styles.allBtnText}>All Rooms</Text>
                </TouchableOpacity>
            </View>
            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.scrollContent}
            >
                {rooms.map((room, index) => renderCard(room, index))}
            </ScrollView>
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
    settingsButton: {
        padding: 4,
    },
    scrollContent: {
        gap: 12,
        paddingRight: 20,
    },
    card: {
        width: 145,
        height: 150,
        alignSelf: 'flex-start',
        borderRadius: 16,
        overflow: 'hidden',
        backgroundColor: '#1e1e2e',
        position: 'relative',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 14 },
        shadowOpacity: 0.75,
        shadowRadius: 28,
        elevation: 18,
    },
    backgroundImage: {
        width: '100%',
        height: '100%',
        position: 'absolute',
    },
    placeholderBackground: {
        width: '100%',
        height: '100%',
        backgroundColor: '#2a2a2a',
        justifyContent: 'center',
        alignItems: 'center',
        position: 'absolute',
    },
    darkOverlay: {
        ...StyleSheet.absoluteFillObject,
        // Background color and opacity are now dynamic
    },
    gradient: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        height: '45%',
    },
    textContainer: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: 70,
        flexDirection: 'row',
        alignItems: 'flex-end',
        paddingHorizontal: 10,
        paddingBottom: 10,
    },
    roomName: {
        color: 'white',
        fontSize: 14,
        fontFamily: CF.semibold,
        textShadowColor: 'rgba(0, 0, 0, 0.75)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 3,
    },
    leftStatusRow: {
        position: 'absolute',
        top: 8,
        right: 8,
        flexDirection: 'column',
        alignItems: 'flex-end',
        gap: 6,
    },
    statusRow: {
        position: 'absolute',
        top: 8,
        left: 8,
        flexDirection: 'column',
        alignItems: 'flex-start',
        gap: 6,
    },
    statusItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: 'rgba(0,0,0,0.6)', // Darker background for better visibility over image
        paddingHorizontal: 6,
        paddingVertical: 3,
        borderRadius: 8,
    },
    statusText: {
        color: 'white',
        fontSize: 10,
        fontFamily: CF.semibold,
    },
    gridContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        rowGap: 14,
        paddingBottom: 20,
    },
    gridCard: {
        width: '48.5%',
        height: 180,
    },
    emptyContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        height: 150
    }
});

export default memo(RoomsList);
