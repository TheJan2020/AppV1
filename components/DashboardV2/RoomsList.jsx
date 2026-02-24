import { memo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ImageBackground } from 'react-native';
import { Sofa, Bed, Bath, Utensils, Monitor, Lamp, Settings, Lightbulb, Fan, GalleryVerticalEnd, DoorOpen, Thermometer, Droplets, Satellite } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';

// ... (getIconForRoom helper remains same)
// ... (getIconForRoom helper remains same)
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
        const imageUrl = room.picture ? `${haUrl}${room.picture}` : null;

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
                    layout === 'horizontal' && { width: horizontalCardWidth },
                    layout === 'grid' && { width: gridCardWidth, marginBottom: 4 }
                ]}
                onPress={() => onRoomPress && onRoomPress(room)}
            >
                {imageUrl ? (
                    <ImageBackground
                        source={{
                            uri: imageUrl,
                            headers: { Authorization: `Bearer ${haToken}` }
                        }}
                        style={styles.backgroundImage}
                        resizeMode="cover"
                    >
                        <View style={[
                            styles.darkOverlay,
                            { backgroundColor: overlayColor, opacity: overlayOpacity }
                        ]} />
                        <LinearGradient
                            colors={['transparent', 'rgba(0,0,0,0.4)', 'rgba(0,0,0,0.95)']}
                            style={styles.gradient}
                        />
                    </ImageBackground>
                ) : (
                    <View style={styles.placeholderBackground}>
                        <Icon size={32} color="rgba(255,255,255,0.2)" />
                        <View style={[
                            styles.darkOverlay,
                            { backgroundColor: overlayColor, opacity: overlayOpacity }
                        ]} />
                        <LinearGradient
                            colors={['transparent', 'rgba(0,0,0,0.4)', 'rgba(0,0,0,0.95)']}
                            style={styles.gradient}
                        />
                    </View>
                )}

                <View style={[styles.textContainer, { flexDirection: 'row', alignItems: 'center' }]}>
                    <Text style={styles.roomName} numberOfLines={1}>{displayName}</Text>
                    {room.hasPresenceSensor && (
                        <Satellite size={14} color="#4cd137" style={{ marginLeft: 6 }} />
                    )}
                </View>

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
                <Text style={styles.title}>Rooms</Text>
                <TouchableOpacity onPress={onSettingsPress} style={styles.settingsButton}>
                    <Settings size={14} color="rgba(255,255,255,0.4)" />
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
        marginBottom: 10,
        marginLeft: 4,
        gap: 8
    },
    title: {
        color: 'white',
        fontSize: 16,
        fontWeight: '300',
        letterSpacing: 0.5,
    },
    settingsButton: {
        padding: 4,
    },
    scrollContent: {
        gap: 12,
        paddingRight: 20,
    },
    card: {
        width: 112, // default, overridden dynamically
        aspectRatio: 8 / 5,
        alignSelf: 'flex-start',
        borderRadius: 16,
        overflow: 'hidden',
        backgroundColor: '#2a2a2a',
        borderWidth: 1.5,
        borderColor: '#8947ca', // Purple border
        position: 'relative',
        // Glow effect
        shadowColor: "#8947ca",
        shadowOffset: {
            width: 0,
            height: 0,
        },
        shadowOpacity: 0.4,
        shadowRadius: 8,
        elevation: 5,
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
        height: '80%',
    },
    textContainer: {
        position: 'absolute',
        bottom: 8,
        left: 10,
        right: 8,
    },
    roomName: {
        color: 'white',
        fontSize: 14,
        fontWeight: '600',
        textShadowColor: 'rgba(0, 0, 0, 0.75)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 3,
    },
    leftStatusRow: {
        position: 'absolute',
        top: 8,
        left: 8,
        flexDirection: 'column',
        alignItems: 'flex-start',
        gap: 6,
    },
    statusRow: {
        position: 'absolute',
        top: 8,
        right: 8,
        flexDirection: 'column', // Stack vertically
        alignItems: 'flex-end',
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
        fontWeight: '600'
    },
    gridContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 12,
        paddingBottom: 20
    },
    gridCard: {
        width: '48%', // Approx half with gap
        marginBottom: 4
    },
    emptyContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        height: 150
    }
});

export default memo(RoomsList);
