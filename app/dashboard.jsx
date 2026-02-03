import { useRef, useState, useEffect } from 'react';
import { View, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { Colors } from '../constants/Colors';
import { HAService } from '../services/ha';
import Header from '../components/Dashboard/Header';
import FloorTabs from '../components/Dashboard/FloorTabs';
import QuickActions from '../components/Dashboard/QuickActions';
import RoomCard from '../components/Dashboard/RoomCard';
import CameraCard from '../components/Dashboard/CameraCard';
import ActiveEntitiesModal from '../components/Dashboard/ActiveEntitiesModal';
import RoomControlModal from '../components/Dashboard/RoomControlModal';
import SettingsModal from '../components/Dashboard/SettingsModal';

export default function Dashboard() {
    const [entities, setEntities] = useState([]);
    const [activeTab, setActiveTab] = useState('Default View');
    const [loading, setLoading] = useState(true);

    // Modal State
    const [modalVisible, setModalVisible] = useState(false);
    const [modalTitle, setModalTitle] = useState('');
    const [modalEntities, setModalEntities] = useState([]);

    // Room Control State
    const [roomModalVisible, setRoomModalVisible] = useState(false);
    const [selectedRoom, setSelectedRoom] = useState(null);

    // Settings State
    const [settingsVisible, setSettingsVisible] = useState(false);
    const [areas, setAreas] = useState([]);
    const [registryEntities, setRegistryEntities] = useState([]);
    const [registryDevices, setRegistryDevices] = useState([]);

    const service = useRef(null);

    const haUrl = process.env.EXPO_PUBLIC_HA_URL || 'http://homeassistant.local:8123';
    // ...

    const loadRegistries = async () => {
        try {
            const areaList = await service.current.getAreaRegistry();
            const entityList = await service.current.getEntityRegistry();
            const deviceList = await service.current.getDeviceRegistry();

            if (Array.isArray(areaList)) setAreas(areaList);
            if (Array.isArray(entityList)) setRegistryEntities(entityList);
            if (Array.isArray(deviceList)) setRegistryDevices(deviceList);
        } catch (e) {
            console.log('Error fetching registries', e);
        }
    };
    const haToken = process.env.EXPO_PUBLIC_HA_TOKEN;

    useEffect(() => {
        service.current = new HAService(haUrl, haToken);
        service.current.connect();

        const unsubscribe = service.current.subscribe((data) => {
            if (data.type === 'connected') {
                loadStates();
                loadRegistries();
            } else if (data.type === 'state_changed') {
                handleStateChange(data.event);
            }
        });

        return () => {
            unsubscribe();
            if (service.current.socket) service.current.socket.close();
        };
    }, []);

    const loadStates = async () => {
        try {
            const states = await service.current.getStates();
            if (Array.isArray(states)) {
                setEntities(states);
                setLoading(false);
            }
        } catch (e) {
            console.log('Error fetching states', e);
        }
    };



    // Helper to map room name to keyword
    const getRoomKeyword = (roomName) => {
        if (!roomName) return '';
        if (roomName === 'LuLu Room') return 'lulu';
        if (roomName === 'Living Room') return 'living';
        if (roomName === 'Master Bedroom') return 'master';
        if (roomName === 'Guest Room') return 'guest';
        return roomName.toLowerCase().replace(' ', '');
    };

    // Filter Logic helpers
    const getRoomLights = (roomKeyword, allEntities) => {
        if (!roomKeyword) return [];
        // Simple name matching strategy
        const normalized = roomKeyword.toLowerCase().replace(' ', '');
        return allEntities.filter(e =>
            e.entity_id.startsWith('light.') &&
            e.entity_id.toLowerCase().includes(normalized)
        );
    };

    const getRoomClimate = (roomKeyword, allEntities) => {
        if (!roomKeyword) return [];
        const normalized = roomKeyword.toLowerCase().replace(' ', '');
        return allEntities.filter(e =>
            e.entity_id.startsWith('climate.') &&
            e.entity_id.toLowerCase().includes(normalized)
        );
    };

    const getRoomActiveCount = (roomKeyword) => {
        return getRoomLights(roomKeyword, entities).filter(e => e.state === 'on').length;
    };

    const getRoomClimateState = (roomKeyword) => {
        const clim = getRoomClimate(roomKeyword, entities).find(e => e.state !== 'off');
        return clim ? clim.state : null;
    };

    // Derived State for Modal
    const roomLights = selectedRoom ? getRoomLights(getRoomKeyword(selectedRoom), entities) : [];
    const roomClimate = selectedRoom ? getRoomClimate(getRoomKeyword(selectedRoom), entities) : [];

    const handleRoomPress = (roomName) => {
        setSelectedRoom(roomName);
        setRoomModalVisible(true);
    };

    const handleToggleLight = (entity) => {
        const serviceName = entity.state === 'on' ? 'turn_off' : 'turn_on';
        service.current.callService('light', serviceName, { entity_id: entity.entity_id });
    };

    const handleSetHvac = (entity, mode) => {
        service.current.callService('climate', 'set_hvac_mode', {
            entity_id: entity.entity_id,
            hvac_mode: mode
        });
    };

    const handleSetTemp = (entity, temp) => {
        service.current.callService('climate', 'set_temperature', {
            entity_id: entity.entity_id,
            temperature: temp
        });
    };

    const weather = entities.find(e => e.entity_id.startsWith('weather.'));
    const activeLights = entities.filter(e => e.entity_id.startsWith('light.') && e.state === 'on');
    const activeClimate = entities.filter(e => e.entity_id.startsWith('climate.') && e.state !== 'off');
    const power = entities.find(e => e.entity_id.includes('power'))?.state;

    const showLights = () => {
        if (activeLights.length === 0) return;
        setModalTitle('Active Lights');
        setModalEntities(activeLights);
        setModalVisible(true);
    };

    const showClimate = () => {
        if (activeClimate.length === 0) return;
        setModalTitle('Active Climate');
        setModalEntities(activeClimate);
        setModalVisible(true);
    };

    const handleStateChange = (event) => {
        const newState = event.data.new_state;
        setEntities(prev => {
            return prev.map(e => e.entity_id === newState.entity_id ? newState : e);
        });
    };

    const handleSettingsPress = () => {
        setSettingsVisible(true);
    };

    if (loading) {
        return (
            <View style={styles.loading}>
                <ActivityIndicator size="large" color={Colors.primary} />
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <ScrollView contentContainerStyle={styles.scroll}>
                <Header
                    weather={weather ? { state: weather.state, temp: weather.attributes.temperature } : null}
                    power={power}
                    lightsOn={activeLights.length}
                    climateOn={activeClimate.length}
                    onLightsPress={showLights}
                    onClimatePress={showClimate}
                    onSettingsPress={handleSettingsPress}
                />

                <FloorTabs activeTab={activeTab} onTabChange={setActiveTab} />

                {activeTab === 'Default View' && (
                    <View style={styles.section}>
                        <QuickActions />
                        <View style={styles.cameraSection}>
                            <CameraCard
                                name="Lulu Bed"
                                entityId="camera.lulubed"
                                token={haToken}
                                url={haUrl}
                            />
                            <CameraCard
                                name="Lulu Playground"
                                entityId="camera.luluplayground"
                                token={haToken}
                                url={haUrl}
                            />
                        </View>
                    </View>
                )}

                {activeTab === 'GF' && (
                    <View style={styles.grid}>
                        <RoomCard
                            name="LuLu Room" type="lulu" color="#F48FB1" temp={21}
                            activeCount={getRoomActiveCount('lulu')}
                            climateState={getRoomClimateState('lulu')}
                            style={styles.gridItem}
                            onPress={() => handleRoomPress('LuLu Room')}
                        />
                        <RoomCard
                            name="Living Room" type="living" color="#81D4FA" temp={22}
                            activeCount={getRoomActiveCount('living')}
                            climateState={getRoomClimateState('living')}
                            style={styles.gridItem}
                            onPress={() => handleRoomPress('Living Room')}
                        />
                        <RoomCard
                            name="Master Bedroom" type="bedroom" color="#CE93D8" temp={20}
                            activeCount={getRoomActiveCount('master')}
                            climateState={getRoomClimateState('master')}
                            style={styles.gridItem}
                            onPress={() => handleRoomPress('Master Bedroom')}
                        />
                        <RoomCard
                            name="Kitchen" type="kitchen" color="#FFCC80"
                            activeCount={getRoomActiveCount('kitchen')}
                            climateState={getRoomClimateState('kitchen')}
                            style={styles.gridItem}
                            onPress={() => handleRoomPress('Kitchen')}
                        />
                        <RoomCard
                            name="Hallway" type="hallway" color="#B0BEC5"
                            activeCount={getRoomActiveCount('hallway')}
                            climateState={getRoomClimateState('hallway')}
                            style={styles.gridItem}
                            onPress={() => handleRoomPress('Hallway')}
                        />
                        <RoomCard
                            name="Guest Room" type="guest" color="#A5D6A7" temp={19}
                            activeCount={getRoomActiveCount('guest')}
                            climateState={getRoomClimateState('guest')}
                            style={styles.gridItem}
                            onPress={() => handleRoomPress('Guest Room')}
                        />
                        <RoomCard
                            name="Storage" type="storage" color="#FFAB91"
                            activeCount={getRoomActiveCount('storage')}
                            climateState={getRoomClimateState('storage')}
                            style={styles.gridItem}
                            onPress={() => handleRoomPress('Storage')}
                        />
                    </View>
                )}
            </ScrollView>

            <ActiveEntitiesModal
                visible={modalVisible}
                onClose={() => setModalVisible(false)}
                title={modalTitle}
                entities={modalEntities}
            />

            <RoomControlModal
                visible={roomModalVisible}
                onClose={() => setRoomModalVisible(false)}
                roomName={selectedRoom}
                lights={roomLights}
                climate={roomClimate}
                onToggleLight={handleToggleLight}
                onSetHvac={handleSetHvac}
                onSetTemp={handleSetTemp}
            />

            <SettingsModal
                visible={settingsVisible}
                onClose={() => setSettingsVisible(false)}
                areas={areas}
                entities={entities}
                registryEntities={registryEntities}
                registryDevices={registryDevices}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.background,
        paddingTop: 50,
    },
    loading: {
        flex: 1,
        backgroundColor: Colors.background,
        justifyContent: 'center',
        alignItems: 'center'
    },
    scroll: {
        paddingBottom: 40,
    },
    section: {
        paddingHorizontal: 20
    },
    cameraSection: {
        gap: 15,
    },
    grid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        paddingHorizontal: 20,
        gap: 12,
    },
    gridItem: {
        width: '48%', // Approx 2 columns
        marginBottom: 12,
    },
});
