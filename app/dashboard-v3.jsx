import { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, SafeAreaView, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import useDeviceType from '../hooks/useDeviceType';
import useHAConnection from '../hooks/useHAConnection';
import { Colors } from '../constants/Colors';

// Widgets
import WidgetGrid from '../components/DashboardV3/WidgetGrid';
import ClockWidget from '../components/DashboardV3/ClockWidget';
import WeatherWidget from '../components/DashboardV3/WeatherWidget';
import StatusWidget from '../components/DashboardV3/StatusWidget';
import CalendarWidget from '../components/DashboardV3/CalendarWidget';
import TodoWidget from '../components/DashboardV3/TodoWidget';
import SensorOverviewWidget from '../components/DashboardV3/SensorOverviewWidget';
import QuickControlsWidget from '../components/DashboardV3/QuickControlsWidget';
import FamilyWidget from '../components/DashboardV3/FamilyWidget';
import RoomsWidget from '../components/DashboardV3/RoomsWidget';
import CamerasWidget from '../components/DashboardV3/CamerasWidget';

// V2 components for modals
import RoomSheet from '../components/DashboardV2/RoomSheet';
import FrigateCameraModal from '../components/DashboardV2/FrigateCameraModal';
import ActiveDevicesModal from '../components/DashboardV2/ActiveDevicesModal';
import SecurityControlModal from '../components/DashboardV2/SecurityControlModal';

export default function DashboardV3() {
    const router = useRouter();
    const { isTablet, isLandscape, columns } = useDeviceType();

    const {
        service,
        frigateService,
        connectionConfig,
        loading,
        cityName,
        entities,
        registryDevices,
        registryEntities,
        registryAreas,
        registryFloors,
        badgeConfig,
        lightMappings,
        mediaMappings,
        alertRules,
        frigateCameras,
        callService,
        sendMessage,
    } = useHAConnection();

    // Modal state
    const [roomSheetVisible, setRoomSheetVisible] = useState(false);
    const [selectedRoom, setSelectedRoom] = useState(null);
    const [showFrigateModal, setShowFrigateModal] = useState(false);
    const [selectedFrigateCamera, setSelectedFrigateCamera] = useState(null);
    const [frigateInitialView, setFrigateInitialView] = useState('live');

    // Status badge modals
    const [activeDevicesModalVisible, setActiveDevicesModalVisible] = useState(false);
    const [activeBadgeType, setActiveBadgeType] = useState(null);
    const [securityModalVisible, setSecurityModalVisible] = useState(false);

    // Total columns for widget grid
    const totalCols = isTablet ? (isLandscape ? 4 : 3) : 2;

    // ─── Derived data ────────────────────────────────────────────
    const weather = entities.find(e => e.entity_id.startsWith('weather.'));

    // Badge counts
    const lightsOn = entities.filter(e => e.entity_id.startsWith('light.') && e.state === 'on').length;
    const acOn = entities.filter(e => e.entity_id.startsWith('climate.') && e.state !== 'off' && e.state !== 'unavailable').length;
    const doorsOpen = entities.filter(e => {
        const isSensorDoor = e.entity_id.startsWith('sensor.door_');
        const isBinaryDoor = e.entity_id.startsWith('binary_sensor.') && (
            e.attributes?.device_class === 'door' ||
            e.attributes?.device_class === 'garage' ||
            e.attributes?.device_class === 'window' ||
            e.attributes?.device_class === 'opening' ||
            e.entity_id.includes('door')
        );
        if (!isSensorDoor && !isBinaryDoor) return false;
        const s = e.state.toLowerCase();
        return s === 'open' || s === 'on' || s === 'true' || s === '1';
    }).length;

    let power = null;
    let securityState = 'Unknown';
    if (badgeConfig) {
        const pEntity = entities.find(e => e.entity_id === badgeConfig.power_entity);
        power = pEntity ? pEntity.state : null;
        const sEntity = entities.find(e => e.entity_id === badgeConfig.security_entity);
        securityState = sEntity ? sEntity.state : 'Unknown';
    } else {
        const pEntity = entities.find(e => e.entity_id.includes('power'));
        power = pEntity ? pEntity.state : null;
        const sEntity = entities.find(e => e.entity_id.startsWith('alarm_control_panel.'));
        securityState = sEntity ? sEntity.state : 'Unknown';
    }

    // Active devices grouped by room (for status badge popups)
    const getAllActiveDevices = (type) => {
        if (!registryAreas.length) return [];
        const grouped = [];
        registryAreas.forEach(area => {
            const areaDevices = registryDevices.filter(d => d.area_id === area.area_id);
            const areaDeviceIds = areaDevices.map(d => d.id);
            const activeInRoom = registryEntities.filter(re => {
                return re.area_id === area.area_id || (re.device_id && areaDeviceIds.includes(re.device_id));
            }).map(re => entities.find(e => e.entity_id === re.entity_id))
                .filter(e => {
                    if (!e) return false;
                    if (type === 'lights') return e.entity_id.startsWith('light.') && e.state === 'on';
                    if (type === 'ac') return e.entity_id.startsWith('climate.') && e.state !== 'off' && e.state !== 'unavailable';
                    if (type === 'doors') {
                        const isDoor = e.entity_id.startsWith('sensor.door_') ||
                            (e.entity_id.startsWith('binary_sensor.') && (
                                e.attributes?.device_class === 'door' || e.entity_id.includes('door')
                            ));
                        if (!isDoor) return false;
                        const s = e.state.toLowerCase();
                        return s === 'open' || s === 'on' || s === 'true' || s === '1';
                    }
                    return false;
                });
            if (activeInRoom.length > 0) {
                grouped.push({ title: area.name, data: activeInRoom });
            }
        });
        return grouped;
    };

    const handleBadgePress = (type) => {
        if (type === 'security') {
            setSecurityModalVisible(true);
        } else {
            setActiveBadgeType(type);
            setActiveDevicesModalVisible(true);
        }
    };

    const getModalData = () => {
        if (!activeBadgeType) return { title: '', devices: [] };
        const titles = { lights: 'Active Lights', ac: 'Active ACs', doors: 'Open Doors' };
        return { title: titles[activeBadgeType] || '', devices: getAllActiveDevices(activeBadgeType) };
    };

    const securityEntity = entities.find(e =>
        badgeConfig?.security_entity ? e.entity_id === badgeConfig.security_entity : e.entity_id.startsWith('alarm_control_panel.')
    );

    // Rooms with counts
    const getRoomsWithCounts = useCallback(() => {
        const sourceAreas = (badgeConfig?.selected_areas?.length > 0)
            ? badgeConfig.selected_areas.filter(sa => registryAreas.some(ra => ra.area_id === sa.area_id))
            : registryAreas;

        if (!sourceAreas || sourceAreas.length === 0) return [];

        const resolveDisplayName = (areaId, currentName) => {
            const regArea = registryAreas.find(ra => ra.area_id === areaId);
            if (regArea?.name) return regArea.name;
            const configArea = badgeConfig?.selected_areas?.find(sa => sa.area_id === areaId);
            if (configArea?.name) return configArea.name;
            if (currentName && currentName !== areaId) return currentName;
            return (areaId || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        };

        return sourceAreas.map(area => {
            const areaDevices = registryDevices.filter(d => d.area_id === area.area_id);
            const areaDeviceIds = areaDevices.map(d => d.id);
            const areaRegEntries = registryEntities.filter(re => {
                return re.area_id === area.area_id || (re.device_id && areaDeviceIds.includes(re.device_id));
            });

            const activeLights = areaRegEntries.filter(re => {
                if (!re.entity_id.startsWith('light.')) return false;
                const s = entities.find(e => e.entity_id === re.entity_id);
                return s && s.state === 'on';
            }).length;

            const activeAC = areaRegEntries.filter(re => {
                if (!re.entity_id.startsWith('climate.')) return false;
                const s = entities.find(e => e.entity_id === re.entity_id);
                return s && s.state !== 'off' && s.state !== 'unavailable';
            }).length;

            const activeCovers = areaRegEntries.filter(re => {
                if (!re.entity_id.startsWith('cover.')) return false;
                const s = entities.find(e => e.entity_id === re.entity_id);
                return s && (s.state === 'open' || (s.attributes?.current_position > 0));
            }).length;

            const activeDoors = areaRegEntries.filter(re => {
                const s = entities.find(e => e.entity_id === re.entity_id);
                if (!s) return false;
                const isSensorDoor = re.entity_id.startsWith('sensor.door_');
                const isBinaryDoor = re.entity_id.startsWith('binary_sensor.') && (
                    s.attributes?.device_class === 'door' ||
                    s.attributes?.device_class === 'garage' ||
                    s.attributes?.device_class === 'window' ||
                    s.attributes?.device_class === 'opening' ||
                    re.entity_id.includes('door')
                );
                if (!isSensorDoor && !isBinaryDoor) return false;
                const st = s.state.toLowerCase();
                return st === 'open' || st === 'on' || st === 'true' || st === '1';
            }).length;

            return {
                ...area,
                name: resolveDisplayName(area.area_id, area.name),
                deviceCount: areaRegEntries.length,
                activeLights,
                activeAC,
                activeCovers,
                activeDoors,
            };
        });
    }, [entities, registryAreas, registryDevices, registryEntities, badgeConfig]);

    const roomsWithCounts = getRoomsWithCounts();

    // ─── Handlers ────────────────────────────────────────────────
    const handleRoomPress = (room) => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        setSelectedRoom(room);
        setRoomSheetVisible(true);
    };

    const handleCameraPress = (camera, mode = 'live') => {
        setSelectedFrigateCamera(camera);
        setFrigateInitialView(mode);
        setShowFrigateModal(true);
    };

    const haUrl = connectionConfig.url?.replace('ws', 'http')?.replace('/api/websocket', '') || '';

    return (
        <View style={styles.container}>
            <Stack.Screen options={{ headerShown: false }} />
            <LinearGradient colors={['#1a1b2e', '#16161e', '#000000']} style={StyleSheet.absoluteFill} />
            <StatusBar style="light" />

            <SafeAreaView style={{ flex: 1 }}>
                {/* Header */}
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                        <Ionicons name="arrow-back" size={24} color="white" />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Dashboard</Text>
                    <View style={{ width: 40 }} />
                </View>

                {/* Widget Grid */}
                <ScrollView
                    style={{ flex: 1 }}
                    contentContainerStyle={styles.scrollContent}
                    showsVerticalScrollIndicator={false}
                >
                    <WidgetGrid>
                        {/* Row 1: Clock + Weather + Status */}
                        <ClockWidget span={1} totalColumns={totalCols} />
                        <WeatherWidget weather={weather} cityName={cityName} span={totalCols >= 4 ? 2 : 2} totalColumns={totalCols} />
                        {totalCols >= 4 && (
                            <StatusWidget
                                securityState={securityState}
                                lightsOn={lightsOn}
                                acOn={acOn}
                                doorsOpen={doorsOpen}
                                power={power}
                                onBadgePress={handleBadgePress}
                                span={1}
                                totalColumns={totalCols}
                            />
                        )}

                        {/* Row 2: Todo + Calendar + Sensors */}
                        <TodoWidget
                            entities={entities}
                            sendMessage={sendMessage}
                            callService={callService}
                            span={1}
                            totalColumns={totalCols}
                        />
                        <CalendarWidget
                            entities={entities}
                            sendMessage={sendMessage}
                            span={2}
                            totalColumns={totalCols}
                        />
                        {totalCols >= 4 && (
                            <SensorOverviewWidget
                                entities={entities}
                                registryEntities={registryEntities}
                                registryAreas={registryAreas}
                                registryDevices={registryDevices}
                                span={1}
                                totalColumns={totalCols}
                            />
                        )}

                        {/* Row 2.5 (portrait only): Status + Sensors */}
                        {totalCols < 4 && (
                            <>
                                <StatusWidget
                                    securityState={securityState}
                                    lightsOn={lightsOn}
                                    acOn={acOn}
                                    doorsOpen={doorsOpen}
                                    power={power}
                                    span={totalCols >= 3 ? 2 : totalCols}
                                    totalColumns={totalCols}
                                />
                                <SensorOverviewWidget
                                    entities={entities}
                                    registryEntities={registryEntities}
                                    registryAreas={registryAreas}
                                    registryDevices={registryDevices}
                                    span={totalCols >= 3 ? 1 : totalCols}
                                    totalColumns={totalCols}
                                />
                            </>
                        )}

                        {/* Row 3: QuickControls + Family */}
                        <QuickControlsWidget
                            entities={entities}
                            callService={callService}
                            span={2}
                            totalColumns={totalCols}
                        />
                        <FamilyWidget
                            entities={entities}
                            alertRules={alertRules}
                            haUrl={haUrl}
                            span={totalCols >= 4 ? 2 : totalCols >= 3 ? 1 : totalCols}
                            totalColumns={totalCols}
                        />

                        {/* Full-width: Rooms */}
                        <RoomsWidget
                            rooms={roomsWithCounts}
                            onRoomPress={handleRoomPress}
                            registryEntities={registryEntities}
                            allEntities={entities}
                            haUrl={haUrl}
                            haToken={connectionConfig.token}
                            columns={totalCols >= 4 ? 4 : totalCols >= 3 ? 3 : 2}
                            span={totalCols}
                            totalColumns={totalCols}
                        />

                        {/* Full-width: Cameras */}
                        <CamerasWidget
                            frigateCameras={frigateCameras}
                            frigateService={frigateService}
                            onCameraPress={handleCameraPress}
                            columns={totalCols >= 4 ? 4 : totalCols >= 3 ? 3 : 2}
                            span={totalCols}
                            totalColumns={totalCols}
                        />
                    </WidgetGrid>

                    <View style={{ height: 40 }} />
                </ScrollView>
            </SafeAreaView>

            {/* Room Sheet Modal */}
            {roomSheetVisible && (
                <RoomSheet
                    visible={roomSheetVisible}
                    onClose={() => {
                        setRoomSheetVisible(false);
                        setSelectedRoom(null);
                    }}
                    room={selectedRoom}
                    registryDevices={registryDevices}
                    registryEntities={registryEntities}
                    allEntities={entities}
                    onToggle={callService}
                    lightMappings={lightMappings}
                    mediaMappings={mediaMappings}
                    adminUrl={connectionConfig.adminUrl}
                    haUrl={connectionConfig.url}
                    haToken={connectionConfig.token}
                />
            )}

            {/* Frigate Camera Modal */}
            {showFrigateModal && selectedFrigateCamera && (
                <FrigateCameraModal
                    visible={showFrigateModal}
                    camera={selectedFrigateCamera}
                    service={frigateService}
                    onClose={() => {
                        setShowFrigateModal(false);
                        setSelectedFrigateCamera(null);
                    }}
                    initialView={frigateInitialView}
                />
            )}

            {/* Active Devices Modal (lights/ac/doors) */}
            {activeDevicesModalVisible && (
                <ActiveDevicesModal
                    visible={activeDevicesModalVisible}
                    title={getModalData().title}
                    devices={getModalData().devices}
                    onClose={() => {
                        setActiveDevicesModalVisible(false);
                        setActiveBadgeType(null);
                    }}
                    onToggle={callService}
                />
            )}

            {/* Security Control Modal */}
            {securityModalVisible && (
                <SecurityControlModal
                    visible={securityModalVisible}
                    onClose={() => setSecurityModalVisible(false)}
                    entity={securityEntity}
                    onCallService={callService}
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingVertical: 12,
    },
    backBtn: {
        padding: 6,
        backgroundColor: 'rgba(255,255,255,0.1)',
        borderRadius: 20,
    },
    headerTitle: {
        color: 'white',
        fontSize: 18,
        fontWeight: '600',
    },
    scrollContent: {
        paddingBottom: 20,
    },
});
