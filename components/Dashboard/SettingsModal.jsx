import { useState, useEffect } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, ScrollView, Pressable, FlatList } from 'react-native';
import { Colors } from '../../constants/Colors';
import { X, Map, Layers, ChevronRight, Lightbulb, Fan } from 'lucide-react-native';

export default function SettingsModal({ visible, onClose, areas = [], entities = [], registryEntities = [], registryDevices = [] }) {
    const [activeTab, setActiveTab] = useState('areas');
    const [selectedArea, setSelectedArea] = useState(null);

    // Combine Area Registry -> Device Registry -> Entity Registry
    const getAreaStats = () => {
        // console.log('DEBUG: Areas Count:', areas.length);
        // console.log('DEBUG: Registry Entities Count:', registryEntities.length);
        // console.log('DEBUG: State Entities Count:', entities.length);

        return areas.map(area => {
            // 1. Find all devices in this area
            const areaDevices = registryDevices.filter(d => d.area_id === area.area_id);
            const areaDeviceIds = areaDevices.map(d => d.id);

            // 2. Find all entities that:
            //    a) Are directly assigned to this area (re.area_id === area.area_id)
            //    b) Belong to a device that is in this area (areaDeviceIds.includes(re.device_id))
            const areaRegEntries = registryEntities.filter(re => {
                const directMatch = re.area_id === area.area_id;
                const deviceMatch = re.device_id && areaDeviceIds.includes(re.device_id);
                return directMatch || deviceMatch;
            });

            // Debugging first area
            if (area.name === 'Living Room' || area.area_id === 'living_room') {
                console.log(`DEBUG: Found ${areaRegEntries.length} entries for ${area.name}`);
                if (areaRegEntries.length > 0) console.log('Sample entry:', areaRegEntries[0]);
            }

            // Count how many of these exist in the actual state entities (optional, but good to know if they are available)
            // or just count the registry entries.
            // Let's count active devices for fun, or total devices.
            const totalDevices = areaRegEntries.length;

            return {
                ...area,
                totalDevices,
                devices: areaRegEntries
            };
        }).sort((a, b) => a.name.localeCompare(b.name));
    };

    const areaStats = getAreaStats();

    const renderAreaList = () => (
        <ScrollView contentContainerStyle={styles.listContent}>
            {areaStats.map((area) => (
                <TouchableOpacity
                    key={area.area_id}
                    style={styles.listItem}
                    onPress={() => setSelectedArea(area)}
                >
                    <View style={styles.itemInfo}>
                        <View style={styles.iconContainer}>
                            <Map size={20} color={Colors.text} />
                        </View>
                        <View>
                            <Text style={styles.itemName}>{area.name}</Text>
                            <Text style={styles.itemSub}>{area.totalDevices} devices</Text>
                        </View>
                    </View>
                    <ChevronRight size={20} color={Colors.textDim} />
                </TouchableOpacity>
            ))}
        </ScrollView>
    );

    const renderAreaDetails = () => {
        if (!selectedArea) return null;
        // Enrich devices with current state
        const areaDevices = selectedArea.devices.map(reg => {
            // Try to find state object
            const stateObj = entities.find(e => e.entity_id === reg.entity_id);
            // Fallback object to ensure we display something even if state is missing
            return {
                ...reg,
                stateObj: stateObj || { state: 'unknown' },
                displayName: reg.name || reg.original_name || reg.entity_id
            };
        });

        // Removed filtering of missing states for debugging visibility
        // .filter(d => d.stateObj); 

        return (
            <View style={{ flex: 1 }}>
                <TouchableOpacity onPress={() => setSelectedArea(null)} style={styles.backBtn}>
                    <Text style={styles.backText}>← Back to Areas</Text>
                </TouchableOpacity>
                <Text style={styles.detailTitle}>{selectedArea.name} Devices</Text>
                <ScrollView contentContainerStyle={styles.listContent}>
                    {areaDevices.length === 0 ? (
                        <Text style={styles.emptyText}>No active devices found.</Text>
                    ) : (
                        areaDevices.map((device) => (
                            <View key={device.entity_id} style={styles.deviceItem}>
                                <View style={styles.deviceInfo}>
                                    <Text style={styles.deviceName}>{device.name || device.original_name || device.entity_id}</Text>
                                    <Text style={styles.deviceEntity}>{device.entity_id}</Text>
                                </View>
                                <Text style={styles.deviceState}>{device.stateObj?.state}</Text>
                            </View>
                        ))
                    )}
                </ScrollView>
            </View>
        );
    };

    const renderEntitiesList = () => (
        <FlatList
            data={entities}
            keyExtractor={item => item.entity_id}
            renderItem={({ item }) => (
                <View style={styles.listItem}>
                    <View style={styles.itemInfo}>
                        <View style={styles.iconContainer}>
                            <Layers size={20} color={Colors.textDim} />
                        </View>
                        <View>
                            <Text style={styles.itemName} numberOfLines={1}>{item.attributes.friendly_name || item.entity_id}</Text>
                            <Text style={styles.itemSub}>{item.entity_id}</Text>
                        </View>
                    </View>
                    <Text style={styles.stateText}>{item.state}</Text>
                </View>
            )}
            contentContainerStyle={styles.listContent}
        />
    );

    return (
        <Modal
            animationType="slide"
            transparent={true}
            visible={visible}
            onRequestClose={onClose}
        >
            <View style={styles.centeredView}>
                <Pressable style={styles.backdrop} onPress={onClose} />
                <View style={styles.modalView}>
                    <View style={styles.header}>
                        <Text style={styles.modalTitle}>Settings</Text>
                        <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                            <X size={24} color={Colors.textDim} />
                        </TouchableOpacity>
                    </View>

                    {/* Tabs */}
                    <View style={styles.tabs}>
                        <TouchableOpacity
                            style={[styles.tab, activeTab === 'areas' && styles.activeTab]}
                            onPress={() => { setActiveTab('areas'); setSelectedArea(null); }}
                        >
                            <Text style={[styles.tabText, activeTab === 'areas' && styles.activeTabText]}>Areas</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.tab, activeTab === 'entities' && styles.activeTab]}
                            onPress={() => { setActiveTab('entities'); setSelectedArea(null); }}
                        >
                            <Text style={[styles.tabText, activeTab === 'entities' && styles.activeTabText]}>Entities</Text>
                        </TouchableOpacity>
                    </View>

                    <View style={styles.content}>
                        {activeTab === 'areas' ? (
                            selectedArea ? renderAreaDetails() : renderAreaList()
                        ) : (
                            renderEntitiesList()
                        )}
                    </View>
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    centeredView: {
        flex: 1,
        justifyContent: 'flex-end',
    },
    backdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.5)',
    },
    modalView: {
        backgroundColor: Colors.surface,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        padding: 20,
        height: '90%',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.25,
        shadowRadius: 4,
        elevation: 5,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20,
    },
    modalTitle: {
        fontSize: 24,
        fontWeight: 'bold',
        color: Colors.text,
    },
    closeBtn: {
        padding: 4,
    },
    tabs: {
        flexDirection: 'row',
        marginBottom: 20,
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 12,
        padding: 4,
    },
    tab: {
        flex: 1,
        paddingVertical: 10,
        alignItems: 'center',
        borderRadius: 8,
    },
    activeTab: {
        backgroundColor: 'rgba(255,255,255,0.1)',
    },
    tabText: {
        color: Colors.textDim,
        fontWeight: '600',
    },
    activeTabText: {
        color: Colors.text,
        fontWeight: 'bold',
    },
    content: {
        flex: 1,
    },
    listContent: {
        paddingBottom: 40,
    },
    listItem: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 16,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.05)',
    },
    itemInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        flex: 1,
    },
    iconContainer: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.05)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    itemName: {
        color: Colors.text,
        fontSize: 16,
        fontWeight: '500',
    },
    itemSub: {
        color: Colors.textDim,
        fontSize: 12,
    },
    stateText: {
        color: Colors.textDim,
        fontSize: 14,
    },
    // Detail View Styles
    backBtn: {
        marginBottom: 16,
    },
    backText: {
        color: Colors.primary,
        fontSize: 16,
        fontWeight: '600',
    },
    detailTitle: {
        color: Colors.text,
        fontSize: 20,
        fontWeight: 'bold',
        marginBottom: 16,
    },
    deviceItem: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.05)',
    },
    deviceInfo: {
        flex: 1,
    },
    deviceName: {
        color: Colors.text,
        fontSize: 16,
    },
    deviceEntity: {
        color: Colors.textDim,
        fontSize: 12,
    },
    deviceState: {
        color: Colors.text,
        fontWeight: '600',
    },
    emptyText: {
        color: Colors.textDim,
        textAlign: 'center',
        marginTop: 40,
        fontStyle: 'italic',
    }
});
