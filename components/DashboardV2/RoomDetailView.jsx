import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ImageBackground } from 'react-native';
import { BlurView } from 'expo-blur';
import { X, Lightbulb, Fan, ChevronLeft, Droplets, Thermometer, DoorOpen, DoorClosed } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { Colors } from '../../constants/Colors';
import { useState, useEffect, useRef } from 'react';
import { GestureHandlerRootView, PanGestureHandler, State } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing, cancelAnimation } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';

import LightControlModal from './LightControlModal';
import ClimateCard from './ClimateCard';
import CoverCard from './CoverCard';
import MediaCard from './MediaCard';
import HACamerasList from './HACamerasList';
import RoomClimateChart from './RoomClimateChart';

// Fan Card Component
function FanCard({ fan, onToggle }) {
    const isOn = fan.stateObj.state === 'on';
    const rotation = useSharedValue(0);

    const animatedStyle = useAnimatedStyle(() => {
        return {
            transform: [{ rotate: `${rotation.value}deg` }],
        };
    });

    useEffect(() => {
        if (isOn) {
            rotation.value = withRepeat(
                withTiming(360, {
                    duration: 1000,
                    easing: Easing.linear,
                }),
                -1,
                false
            );
        } else {
            cancelAnimation(rotation);
            rotation.value = withTiming(0);
        }
    }, [isOn]);

    const activeColor = '#8947ca';
    const iconColor = isOn ? '#fff' : Colors.textDim;
    const iconBg = isOn ? activeColor : 'rgba(255,255,255,0.1)';

    return (
        <View style={styles.cardContainer}>
            <TouchableOpacity
                style={styles.card}
                onPress={() => onToggle(fan.entity_id, fan.stateObj.state)}
                activeOpacity={0.9}
            >
                {isOn && <View style={[styles.activeCurve, { backgroundColor: activeColor }]} />}

                <View style={styles.cardContent}>
                    <View style={[styles.iconContainer, { backgroundColor: iconBg }]}>
                        <Animated.View style={animatedStyle}>
                            <Fan size={24} color={iconColor} fill={isOn ? '#fff' : 'transparent'} />
                        </Animated.View>
                    </View>

                    <View style={styles.textContainer}>
                        <Text style={styles.lightName} numberOfLines={1}>{fan.displayName}</Text>
                        <Text style={styles.lightState}>
                            {isOn ? 'On' : 'Off'}
                        </Text>
                    </View>
                </View>
            </TouchableOpacity>
        </View>
    );
}

// Light Card Component
function LightCard({ light, onToggle, onBrightnessChange, onLongPress }) {
    const colorModes = light.stateObj.attributes.supported_color_modes || [];
    const hasColorMode = colorModes.some(mode =>
        ['brightness', 'hs', 'xy', 'rgb', 'rgbw', 'rgbww', 'color_temp', 'white'].includes(mode)
    );
    const hasFeature = (light.stateObj.attributes.supported_features !== undefined && (light.stateObj.attributes.supported_features & 1) !== 0);
    const supportsBrightness = hasColorMode || hasFeature;

    const [isSliding, setIsSliding] = useState(false);
    const [localBrightness, setLocalBrightness] = useState(light.stateObj.attributes.brightness || 0);
    const slideStartBrightness = useRef(0);

    const isOn = light.stateObj.state === 'on';

    useEffect(() => {
        if (!isSliding && isOn) {
            setLocalBrightness(light.stateObj.attributes.brightness || 255);
        } else if (!isOn && !isSliding) {
            setLocalBrightness(0);
        }
    }, [light.stateObj.state, light.stateObj.attributes.brightness, isOn, isSliding]);

    const handleGestureEvent = (event) => {
        if (!supportsBrightness || !isOn) return;
        const width = 160;
        const delta = event.nativeEvent.translationX;
        const change = (delta / width) * 255;
        let newB = slideStartBrightness.current + change;
        newB = Math.max(1, Math.min(255, newB));
        setLocalBrightness(newB);
    };

    const handleStateChange = (event) => {
        if (!supportsBrightness) return;
        if (event.nativeEvent.state === State.ACTIVE) {
            setIsSliding(true);
            slideStartBrightness.current = localBrightness;
        } else if (event.nativeEvent.state === State.END || event.nativeEvent.state === State.CANCELLED || event.nativeEvent.state === State.FAILED) {
            setIsSliding(false);
            if (isOn && event.nativeEvent.state === State.END) {
                onBrightnessChange(light.entity_id, Math.round(localBrightness));
            }
        }
    };

    const getDynamicColor = () => {
        const attrs = light.stateObj.attributes;
        if (attrs.rgb_color) return `rgb(${attrs.rgb_color.join(',')})`;
        if (attrs.color_mode === 'color_temp' && attrs.color_temp_kelvin) {
            const k = attrs.color_temp_kelvin;
            if (k < 3000) return '#ffb74d';
            if (k < 4500) return '#ffcc80';
            if (k < 6000) return '#ffffff';
            return '#e0f7fa';
        }
        return '#8947ca';
    };

    const pulseScale = useSharedValue(1);
    const pulseOpacity = useSharedValue(1); // Start visible for pulse? Logic check: original was 0.

    useEffect(() => {
        if (isOn) {
            pulseScale.value = 1;
            pulseOpacity.value = 0.6;
            pulseScale.value = withTiming(1.6, { duration: 1200, easing: Easing.out(Easing.ease) });
            pulseOpacity.value = withTiming(0, { duration: 1200, easing: Easing.out(Easing.ease) });
        } else {
            pulseScale.value = 1;
            pulseOpacity.value = 0;
        }
    }, [isOn]);

    const pulseStyle = useAnimatedStyle(() => {
        return {
            transform: [{ scale: pulseScale.value }],
            opacity: pulseOpacity.value,
        };
    });

    const activeColor = getDynamicColor();
    const percentage = isOn ? Math.round((localBrightness / 255) * 100) : 0;
    const fillWidth = `${percentage}%`;
    const iconColor = isOn ? '#fff' : Colors.textDim;
    const iconBg = isOn ? activeColor : 'rgba(255,255,255,0.1)';

    const handlePress = () => {
        if (isSliding) return;
        onToggle(light.entity_id, light.stateObj.state);
    };

    return (
        <PanGestureHandler
            onGestureEvent={handleGestureEvent}
            onHandlerStateChange={handleStateChange}
            activeOffsetX={[-10, 10]}
        >
            <View style={styles.cardContainer}>
                <TouchableOpacity
                    style={styles.card}
                    onPress={handlePress}
                    onLongPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
                        onLongPress(light);
                    }}
                    delayLongPress={500}
                    activeOpacity={0.9}
                >
                    {supportsBrightness && isOn && (
                        <View style={[styles.sliderFill, { width: fillWidth, backgroundColor: activeColor, opacity: 0.2 }]} />
                    )}
                    {isOn && <View style={[styles.activeCurve, { backgroundColor: activeColor }]} />}

                    <View style={styles.cardContent}>
                        <View style={[styles.iconContainer, { backgroundColor: iconBg, position: 'relative' }]}>
                            <Animated.View style={[
                                StyleSheet.absoluteFill,
                                {
                                    backgroundColor: activeColor,
                                    borderRadius: 20,
                                    zIndex: -1
                                },
                                pulseStyle
                            ]} />
                            <Lightbulb size={24} color={iconColor} fill={isOn ? '#fff' : 'transparent'} />
                        </View>

                        <View style={styles.textContainer}>
                            <Text style={styles.lightName} numberOfLines={1}>{light.displayName}</Text>
                            <Text style={styles.lightState}>
                                {isOn && supportsBrightness ? `${percentage}%` : (isOn ? 'On' : 'Off')}
                            </Text>
                        </View>
                    </View>
                </TouchableOpacity>
            </View>
        </PanGestureHandler>
    );
}

export default function RoomDetailView({
    room,
    lights = [],
    fans = [],
    covers = [],
    climates = [],
    medias = [],
    cameras = [],
    sensors = [],
    allEntities = [],
    doors = [],
    onToggle,
    onClose,
    isModal = false // To adjust header style slightly if needed
}) {
    const [selectedLight, setSelectedLight] = useState(null);

    const tempSensors = sensors.filter(s => s.entity_id.includes('temperature') && !s.entity_id.includes('battery'));
    const humiditySensors = sensors.filter(s => s.entity_id.includes('humidity') && !s.entity_id.includes('battery'));
    // Use the processed doors list if available, else fallback
    const doorSensors = (doors || []).concat(sensors.filter(s => s.entity_id.startsWith('sensor.door_') && !(doors || []).find(d => d.entity_id === s.entity_id)));

    // Select Main Sensors for Charts
    const mainTemp = tempSensors.length > 0 ? tempSensors[0] : null;
    const mainHumidity = humiditySensors.length > 0 ? humiditySensors[0] : null;

    const handleUpdate = (entityId, payload) => {
        if (onToggle) onToggle('light', 'turn_on', { entity_id: entityId, ...payload });
    };

    const handleBrightness = (entityId, brightness) => {
        if (onToggle) onToggle('light', 'turn_on', { entity_id: entityId, brightness: brightness });
    };

    const haUrl = process.env.EXPO_PUBLIC_HA_URL;
    // Don't show image in Modal mode
    const imageUrl = !isModal && room.picture ? `${haUrl}${room.picture}` : null;

    return (
        <View style={[styles.container, isModal && styles.modalContainer]}>
            {/* Conditional Header Section */}
            {isModal ? (
                /* Simple Header for Modal */
                <View style={styles.simpleHeader}>
                    <View style={styles.handle} />
                    <View style={styles.headerTop}>
                        <Text style={styles.title}>{room.name}</Text>
                        <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                            <X size={24} color={Colors.textDim} />
                        </TouchableOpacity>
                    </View>
                    <View style={styles.headerStatsRow}>
                        <Text style={styles.subtitle}>{lights.length + fans.length} Devices available</Text>
                        <View style={styles.sensorRow}>
                            {tempSensors.map(s => (
                                <View key={s.entity_id} style={styles.sensorChip}>
                                    <Thermometer size={14} color={Colors.textDim} />
                                    <Text style={styles.sensorText}>{s.stateObj.state}{s.stateObj.attributes.unit_of_measurement}</Text>
                                </View>
                            ))}
                            {humiditySensors.map(s => (
                                <View key={s.entity_id} style={styles.sensorChip}>
                                    <Droplets size={14} color={Colors.textDim} />
                                    <Text style={styles.sensorText}>{s.stateObj.state}{s.stateObj.attributes.unit_of_measurement}</Text>
                                </View>
                            ))}
                        </View>
                    </View>
                </View>
            ) : (
                /* Full Image Header for Room Page */
                <View style={styles.headerContainer}>
                    {imageUrl ? (
                        <ImageBackground
                            source={{
                                uri: imageUrl,
                                headers: { Authorization: `Bearer ${process.env.EXPO_PUBLIC_HA_TOKEN}` }
                            }}
                            style={styles.headerImage}
                            resizeMode="cover"
                        >
                            <LinearGradient
                                colors={['transparent', 'rgba(0,0,0,0.8)', '#14141e']}
                                style={styles.gradient}
                            />

                            {/* Back Button - Top Left */}
                            <TouchableOpacity onPress={onClose} style={styles.backButton}>
                                <ChevronLeft size={28} color="#fff" />
                            </TouchableOpacity>

                            <View style={styles.headerContent}>
                                <View>
                                    <Text style={styles.title}>{room.name}</Text>
                                    <View style={styles.headerStatsRow}>
                                        <Text style={styles.subtitle}>{lights.length + fans.length} Devices available</Text>
                                        <View style={styles.sensorRow}>
                                            {tempSensors.map(s => (
                                                <View key={s.entity_id} style={styles.sensorChip}>
                                                    <Thermometer size={14} color="rgba(255,255,255,0.7)" />
                                                    <Text style={styles.sensorText}>{s.stateObj.state}{s.stateObj.attributes.unit_of_measurement}</Text>
                                                </View>
                                            ))}
                                            {humiditySensors.map(s => (
                                                <View key={s.entity_id} style={styles.sensorChip}>
                                                    <Droplets size={14} color="rgba(255,255,255,0.7)" />
                                                    <Text style={styles.sensorText}>{s.stateObj.state}{s.stateObj.attributes.unit_of_measurement}</Text>
                                                </View>
                                            ))}
                                        </View>
                                    </View>
                                </View>
                            </View>
                        </ImageBackground>
                    ) : (
                        <View style={[styles.headerImage, { backgroundColor: '#2a2a35' }]}>
                            {/* Back Button - Top Left */}
                            <TouchableOpacity onPress={onClose} style={styles.backButton}>
                                <ChevronLeft size={28} color="#fff" />
                            </TouchableOpacity>

                            <View style={styles.headerContent}>
                                <View>
                                    <Text style={styles.title}>{room.name}</Text>
                                    <View style={styles.headerStatsRow}>
                                        <Text style={styles.subtitle}>{lights.length + fans.length} Devices available</Text>
                                        <View style={styles.sensorRow}>
                                            {tempSensors.map(s => (
                                                <View key={s.entity_id} style={styles.sensorChip}>
                                                    <Thermometer size={14} color="rgba(255,255,255,0.7)" />
                                                    <Text style={styles.sensorText}>{s.stateObj.state}{s.stateObj.attributes.unit_of_measurement}</Text>
                                                </View>
                                            ))}
                                            {humiditySensors.map(s => (
                                                <View key={s.entity_id} style={styles.sensorChip}>
                                                    <Droplets size={14} color="rgba(255,255,255,0.7)" />
                                                    <Text style={styles.sensorText}>{s.stateObj.state}{s.stateObj.attributes.unit_of_measurement}</Text>
                                                </View>
                                            ))}
                                        </View>
                                    </View>
                                </View>
                            </View>
                        </View>
                    )}
                </View>
            )}

            <GestureHandlerRootView style={{ flex: 1 }}>
                <ScrollView contentContainerStyle={styles.content}>

                    {/* Charts Section */}
                    {(mainTemp || mainHumidity) && (
                        <RoomClimateChart
                            tempEntityId={mainTemp?.entity_id}
                            humidityEntityId={mainHumidity?.entity_id}
                        />
                    )}

                    {/* Doors Section (Top Placement) */}
                    {doorSensors.length > 0 && (
                        <View style={{ marginBottom: 20 }}>
                            <Text style={styles.sectionTitle}>Doors</Text>
                            <View style={[styles.grid, { gap: 10 }]}>
                                {doorSensors.map(door => {
                                    // State: 'Open', 'Closed', 'open', 'closed'
                                    const isOpen = door.stateObj.state.toLowerCase() === 'open' || door.stateObj.state.toLowerCase() === 'on';
                                    const activeColor = isOpen ? '#EF5350' : '#4CAF50';

                                    return (
                                        <View key={door.entity_id} style={[styles.card, { height: 60, width: '48%', backgroundColor: 'rgba(255,255,255,0.05)' }]}>
                                            <View style={styles.cardContent}>
                                                <View style={[styles.iconContainer, { backgroundColor: isOpen ? 'rgba(239, 83, 80, 0.2)' : 'rgba(76, 175, 80, 0.2)' }]}>
                                                    {isOpen ? <DoorOpen size={20} color={activeColor} /> : <DoorClosed size={20} color={activeColor} />}
                                                </View>
                                                <View style={styles.textContainer}>
                                                    <Text style={[styles.lightName, { fontSize: 13 }]} numberOfLines={1}>{door.displayName.replace('sensor.door_', '').replace('Door', '').trim() || door.displayName}</Text>
                                                    <Text style={[styles.lightState, { color: activeColor }]}>{isOpen ? 'Open' : 'Closed'}</Text>
                                                </View>
                                            </View>
                                        </View>
                                    );
                                })}
                            </View>
                            <View style={styles.divider} />
                        </View>
                    )}

                    {lights.length === 0 && fans.length === 0 && doorSensors.length === 0 ? (
                        <View style={styles.emptyState}>
                            <Lightbulb size={40} color={Colors.textDim} />
                            <Text style={styles.emptyText}>No devices found in this room.</Text>
                        </View>
                    ) : (
                        <View style={styles.grid}>
                            {lights.map((light) => (
                                <LightCard
                                    key={light.entity_id}
                                    light={light}
                                    onToggle={(id, state) => {
                                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                        if (onToggle) onToggle('light', 'toggle', { entity_id: id });
                                    }}
                                    onBrightnessChange={handleBrightness}
                                    onLongPress={setSelectedLight}
                                />
                            ))}
                            {fans.map((fan) => (
                                <FanCard
                                    key={fan.entity_id}
                                    fan={fan}
                                    onToggle={(id, state) => {
                                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                        if (onToggle) onToggle('fan', 'toggle', { entity_id: id });
                                    }}
                                />
                            ))}
                        </View>
                    )}

                    {/* Cameras Section */}
                    {cameras.length > 0 && (
                        <View>
                            <View style={styles.divider} />
                            <HACamerasList
                                cameras={cameras.map(c => c.stateObj)}
                                allEntities={allEntities}
                                haUrl={process.env.EXPO_PUBLIC_HA_URL}
                                haToken={process.env.EXPO_PUBLIC_HA_TOKEN}
                                onCameraPress={() => { }}
                            />
                        </View>
                    )}

                    {/* Covers Section */}
                    {covers.length > 0 && (
                        <View>
                            <View style={styles.divider} />
                            <View style={styles.grid}>
                                {covers.map(cover => {
                                    // Binding Sensor Automatically: sensor.<shutter_name>
                                    // Assuming cover.entity_id is 'cover.shutter_name', we look for 'sensor.shutter_name'
                                    const sensorId = cover.entity_id.replace('cover.', 'sensor.');
                                    const sensor = allEntities.find(e => e.entity_id === sensorId);

                                    return (
                                        <View key={cover.entity_id} style={styles.cardContainer}>
                                            <CoverCard
                                                cover={cover}
                                                sensor={sensor}
                                                onUpdate={(id, domain, service, data) => {
                                                    if (onToggle) onToggle(domain, service, { entity_id: id, ...data });
                                                }}
                                            />
                                        </View>
                                    );
                                })}
                            </View>
                        </View>
                    )}

                    {/* Climate Section */}
                    {climates.length > 0 && (
                        <View>
                            <View style={styles.divider} />
                            {climates.map(climate => (
                                <ClimateCard
                                    key={climate.entity_id}
                                    climate={climate}
                                    onUpdate={(id, domain, service, data) => {
                                        if (onToggle) onToggle(domain, service, { entity_id: id, ...data });
                                    }}
                                />
                            ))}
                        </View>
                    )}

                    {/* Media Section */}
                    {medias.length > 0 && (
                        <View style={{ marginBottom: 40 }}>
                            <View style={styles.divider} />
                            {medias.map(media => (
                                <MediaCard
                                    key={media.entity_id}
                                    player={media}
                                    onUpdate={(id, domain, service, data) => {
                                        if (onToggle) onToggle(domain, service, { entity_id: id, ...data });
                                    }}
                                />
                            ))}
                        </View>
                    )}
                </ScrollView>
            </GestureHandlerRootView>

            <LightControlModal
                visible={!!selectedLight}
                onClose={() => setSelectedLight(null)}
                light={selectedLight}
                onUpdate={handleUpdate}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#16161e',
    },
    modalContainer: {
        backgroundColor: 'transparent',
    },
    headerContainer: {
        height: 250,
        backgroundColor: '#000',
    },
    simpleHeader: {
        padding: 20,
        paddingBottom: 10,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.1)',
    },
    handle: {
        width: 40,
        height: 4,
        backgroundColor: 'rgba(255,255,255,0.2)',
        borderRadius: 2,
        alignSelf: 'center',
        marginBottom: 10,
    },
    headerTop: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    closeBtn: {
        padding: 4,
    },
    headerImage: {
        width: '100%',
        height: '100%',
        justifyContent: 'flex-end',
    },
    gradient: {
        ...StyleSheet.absoluteFillObject,
    },
    headerContent: {
        padding: 20,
        paddingBottom: 20,
    },
    backButton: {
        position: 'absolute',
        top: 60,
        left: 20,
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(0,0,0,0.5)',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10,
    },
    title: {
        fontSize: 32,
        fontWeight: 'bold',
        color: '#fff',
        marginBottom: 4,
    },
    subtitle: {
        fontSize: 14,
        color: 'rgba(255,255,255,0.7)',
    },
    headerStatsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: 4,
        flexWrap: 'wrap',
        gap: 10
    },
    sensorRow: {
        flexDirection: 'row',
        gap: 8,
        flexWrap: 'wrap'
    },
    sensorChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 8,
        paddingVertical: 4,
        backgroundColor: 'rgba(255,255,255,0.1)',
        borderRadius: 12,
    },
    sensorText: {
        fontSize: 12,
        fontWeight: '600',
        color: 'rgba(255,255,255,0.8)'
    },
    divider: {
        height: 1,
        backgroundColor: 'rgba(255,255,255,0.1)',
        marginVertical: 20,
        width: '100%',
    },
    content: {
        padding: 20,
        paddingBottom: 40,
        paddingTop: 10,
    },
    grid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 12,
    },
    cardContainer: {
        width: '48%',
    },
    card: {
        width: '100%',
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 20,
        height: 80,
        overflow: 'hidden',
        position: 'relative',
    },
    sliderFill: {
        position: 'absolute',
        left: 0,
        top: 0,
        bottom: 0,
        backgroundColor: 'rgba(137, 71, 202, 0.2)',
    },
    cardContent: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        gap: 12,
    },
    activeCurve: {
        position: 'absolute',
        left: 0,
        top: '5%',
        bottom: '5%',
        width: 4,
        borderTopRightRadius: 4,
        borderBottomRightRadius: 4,
        backgroundColor: '#8947ca',
    },
    iconContainer: {
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
    },
    textContainer: {
        flex: 1,
        justifyContent: 'center',
    },
    lightName: {
        color: '#fff',
        fontSize: 15,
        fontWeight: '600',
        marginBottom: 2,
    },
    lightState: {
        color: Colors.textDim,
        fontSize: 13,
        fontWeight: '500',
    },
    emptyState: {
        alignItems: 'center',
        paddingVertical: 60,
        gap: 12,
    },
    emptyText: {
        color: Colors.textDim,
        fontSize: 16,
    },
    sectionTitle: {
        color: Colors.text,
        fontSize: 18,
        fontWeight: 'bold',
        marginBottom: 12
    }
});
