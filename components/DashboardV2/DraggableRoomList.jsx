import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ImageBackground } from 'react-native';
import DraggableFlatList, { ScaleDecorator } from 'react-native-draggable-flatlist';
import { Sofa, Bed, Bath, Utensils, Monitor, Lamp, Satellite, Thermometer, Droplets, Lightbulb, Fan, DoorOpen, GripVertical } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';

// Helper function (same as in RoomsList, should ideally be shared)
const getIconForRoom = (name) => {
    const lower = (name || '').toLowerCase();
    if (lower.includes('living')) return Sofa;
    if (lower.includes('bed')) return Bed;
    if (lower.includes('bath')) return Bath;
    if (lower.includes('kitchen') || lower.includes('dining')) return Utensils;
    if (lower.includes('office') || lower.includes('study')) return Monitor;
    return Lamp;
};

// Convert area_id-style names (e.g. "living_room") to proper display names ("Living Room")
const formatRoomName = (name) => {
    if (!name) return '';
    if (name.includes(' ')) return name;
    return name
        .replace(/_/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase());
};

export default function DraggableRoomList({ rooms, onOrderChange, registryEntities = [], allEntities = [] }) {
    const renderItem = ({ item, drag, isActive }) => {
        const room = item;
        const displayName = formatRoomName(room.name);
        const Icon = getIconForRoom(displayName);

        return (
            <ScaleDecorator>
                <TouchableOpacity
                    onLongPress={drag}
                    disabled={isActive}
                    style={[
                        styles.rowItem,
                        isActive && styles.activeRowItem
                    ]}
                >
                    <View style={styles.iconContainer}>
                        <Icon size={24} color="#fff" />
                    </View>

                    <Text style={styles.roomName}>{displayName}</Text>

                    {/* Drag Handle Indicator */}
                    <View style={styles.dragHandle}>
                        <GripVertical size={24} color="rgba(255,255,255,0.4)" />
                    </View>
                </TouchableOpacity>
            </ScaleDecorator>
        );
    };

    return (
        <DraggableFlatList
            data={rooms}
            onDragEnd={({ data }) => onOrderChange(data)}
            keyExtractor={(item) => item.area_id}
            renderItem={renderItem}
            contentContainerStyle={styles.listContent}
            containerStyle={{ flex: 1 }}
        />
    );
}

const styles = StyleSheet.create({
    listContent: {
        paddingBottom: 20,
        paddingHorizontal: 20,
    },
    rowItem: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#2a2a2a',
        padding: 16,
        marginBottom: 10,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.05)',
    },
    activeRowItem: {
        borderColor: '#8947ca',
        backgroundColor: '#3a3a3a',
        opacity: 0.9,
    },
    iconContainer: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.1)',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 16
    },
    roomName: {
        flex: 1,
        color: 'white',
        fontSize: 16,
        fontWeight: '600',
    },
    dragHandle: {
        padding: 8
    }
});
