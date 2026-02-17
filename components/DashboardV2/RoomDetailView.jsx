import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ImageBackground } from 'react-native';
import { BlurView } from 'expo-blur';
import { X, Lightbulb, Fan, ChevronLeft, Droplets, Thermometer, DoorOpen, DoorClosed, Lock, LockOpen, Power, Play, Zap, ChevronDown, ChevronUp } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { Colors } from '../../constants/Colors';
import { useState, useEffect, useRef } from 'react';
import { GestureHandlerRootView, PanGestureHandler, State } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing, cancelAnimation } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { SvgUri } from 'react-native-svg';

import LightControlModal from './LightControlModal';
import ClimateCard from './ClimateCard';
import CoverCard from './CoverCard';
import MediaCard from './MediaCard';
import HACamerasList from './HACamerasList';
import RoomClimateChart from './RoomClimateChart';
import ActivatePreferencesButton from './ActivatePreferencesButton';
import SlideAction from './SlideAction';

// Convert area_id-style names (e.g. "living_room") to proper display names ("Living Room")
const formatRoomName = (name) => {
    if (!name) return '';
    if (name.includes(' ')) return name;
    return name
        .replace(/_/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase());
};

// Switch Card Component
function SwitchCard({ switchEntity, onToggle, needsChange: switchCardNeedsChange }) {
    const isOn = switchEntity.stateObj.state === 'on';
    const activeColor = '#8947ca';
    const iconColor = isOn ? '#fff' : Colors.textDim;
    const iconBg = isOn ? activeColor : 'rgba(255,255,255,0.1)';

    return (
        <View style={styles.cardContainer}>
            <TouchableOpacity
                style={[
                    styles.card,
                    switchCardNeedsChange && { borderColor: '#8947ca', borderWidth: 2 }
                ]}
                onPress={() => onToggle(switchEntity.entity_id, switchEntity.stateObj.state)}
                activeOpacity={0.9}
            >
                {isOn && <View style={[styles.activeCurve, { backgroundColor: activeColor }]} />}

                <View style={styles.cardContent}>
                    <View style={[styles.iconContainer, { backgroundColor: iconBg }]}>
                        <Power size={24} color={iconColor} />
                    </View>

                    <View style={styles.textContainer}>
                        <Text style={styles.lightName} numberOfLines={1}>{switchEntity.displayName}</Text>
                        <Text style={styles.lightState}>
                            {isOn ? 'On' : 'Off'}
                        </Text>
                    </View>
                </View>
            </TouchableOpacity>
        </View>
    );
}

// Fan Card Component
function FanCard({ fan, onToggle, needsChange: fanCardNeedsChange }) {
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
                style={[
                    styles.card,
                    fanCardNeedsChange && { borderColor: '#8947ca', borderWidth: 2 }
                ]}
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
function LightCard({ light, onToggle, onBrightnessChange, onLongPress, needsChange: lightCardNeedsChange, mapping, adminUrl }) {
    const isLock = light.entity_id.startsWith('lock.');

    const colorModes = light.stateObj.attributes.supported_color_modes || [];
    const hasColorMode = colorModes.some(mode =>
        ['brightness', 'hs', 'xy', 'rgb', 'rgbw', 'rgbww', 'color_temp', 'white'].includes(mode)
    );
    const hasFeature = (light.stateObj.attributes.supported_features !== undefined && (light.stateObj.attributes.supported_features & 1) !== 0);
    const supportsBrightness = (hasColorMode || hasFeature) && !isLock;

    // Color capability from admin backend
    const colorCapability = mapping?.colorCapability || null; // 'normal' | 'dimmable' | 'cct' | 'rgb' | null
    const hasColorControl = colorCapability === 'cct' || colorCapability === 'rgb';

    const [isSliding, setIsSliding] = useState(false);
    const [localBrightness, setLocalBrightness] = useState(light.stateObj.attributes.brightness || 0);
    const slideStartBrightness = useRef(0);
    const isOn = isLock ? (light.stateObj.state === 'unlocked' || light.stateObj.state === 'open') : (light.stateObj.state === 'on');

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
        if (isLock && isOn) return '#FF7043'; // Yellow Reddish for unlocked doors
        return '#8947ca';
    };

    const pulseScale = useSharedValue(1);
    const pulseOpacity = useSharedValue(1);

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

    const iconUrl = (mapping?.lightType?.icon_path && adminUrl) ? `${adminUrl}${mapping.lightType.icon_path}` : null;

    return (
        <PanGestureHandler
            onGestureEvent={handleGestureEvent}
            onHandlerStateChange={handleStateChange}
            activeOffsetX={[-10, 10]}
        >
            <View style={styles.cardContainer}>
                <TouchableOpacity
                    style={[
                        styles.card,
                        lightCardNeedsChange && { borderColor: '#8947ca', borderWidth: 2 }
                    ]}
                    onPress={handlePress}
                    onLongPress={hasColorControl ? () => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
                        onLongPress(light);
                    } : undefined}
                    delayLongPress={500}
                    activeOpacity={0.9}
                >
                    {supportsBrightness && isOn && (
                        <View style={[styles.sliderFill, { width: fillWidth, backgroundColor: activeColor, opacity: 0.2 }]} />
                    )}
                    {isOn && <View style={[styles.activeCurve, { backgroundColor: activeColor }]} />}

                    <View style={styles.cardContent}>
                        {/* Color capability ring wrapper */}
                        {hasColorControl ? (
                            <View style={[styles.colorRingWrapper, !isOn && { opacity: 0.3 }]}>
                                <LinearGradient
                                    colors={colorCapability === 'rgb'
                                        ? ['#FF0000', '#FF8800', '#FFFF00', '#00FF00', '#0088FF', '#8800FF', '#FF0000']
                                        : ['#ffb74d', '#ffcc80', '#ffffff', '#e0f7fa', '#bbdefb']
                                    }
                                    start={{ x: 0, y: 0 }}
                                    end={{ x: 1, y: 1 }}
                                    style={styles.colorRingGradient}
                                />
                                <View style={[styles.colorRingInner, { backgroundColor: isOn ? iconBg : Colors.background }]}>
                                    {isOn && <Animated.View style={[
                                        StyleSheet.absoluteFill,
                                        { backgroundColor: activeColor, borderRadius: 17, zIndex: -1 },
                                        pulseStyle
                                    ]} />}
                                    {iconUrl ? (
                                        <SvgUri width={24} height={24} uri={iconUrl} fill={iconColor} stroke={iconColor} />
                                    ) : (
                                        <Lightbulb size={24} color={iconColor} fill={isOn ? '#fff' : 'transparent'} />
                                    )}
                                </View>
                            </View>
                        ) : (
                            <View style={[styles.iconContainer, { backgroundColor: iconBg, position: 'relative' }]}>
                                <Animated.View style={[
                                    StyleSheet.absoluteFill,
                                    { backgroundColor: activeColor, borderRadius: 20, zIndex: -1 },
                                    pulseStyle
                                ]} />
                                {iconUrl ? (
                                    <SvgUri width={24} height={24} uri={iconUrl} fill={iconColor} stroke={iconColor} />
                                ) : isLock ? (
                                    isOn ? <LockOpen size={24} color={iconColor} /> : <Lock size={24} color={iconColor} />
                                ) : (
                                    <Lightbulb size={24} color={iconColor} fill={isOn ? '#fff' : 'transparent'} />
                                )}
                            </View>
                        )}

                        <View style={styles.textContainer}>
                            <Text style={styles.lightName} numberOfLines={1}>{light.displayName}</Text>
                            <Text style={styles.lightState}>
                                {isOn && supportsBrightness && !isLock ? `${percentage}%` : (isLock ? (isOn ? 'Unlocked' : 'Locked') : (isOn ? 'On' : 'Off'))}
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
    switches = [],
    automations = [],
    scripts = [],
    onToggle,
    onClose,
    isModal = false,
    isInlinePanel = false,
    columns = 2,
    lightMappings = [],
    mediaMappings = [],
    adminUrl,
    haUrl,
    haToken,
    showPreferenceButton = true
}) {
    const cardWidth = columns > 2 ? `${Math.floor(100 / columns) - 2}%` : '48%';
    const [selectedLight, setSelectedLight] = useState(null);
    const [preferences, setPreferences] = useState([]);
    const [showAutomations, setShowAutomations] = useState(false);
    const [sourceOverlay, setSourceOverlay] = useState(null);
    const [volumeOverlay, setVolumeOverlay] = useState(null);

    const checkNeedsChange = (entityId) => {
        const pref = preferences.find(p => p.entity_id === entityId);
        return pref ? pref.needs_change : false;
    };

    const tempSensors = sensors.filter(s => s.sensorType === 'temperature');
    const humiditySensors = sensors.filter(s => s.sensorType === 'humidity');

    // Doors are pre-filtered in getRoomEntities, so just use passed 'doors' prop
    // But we double check to ensure no duplicates if 'sensors' still contains some
    const doorSensors = doors || [];

    const mainTemp = tempSensors.length > 0 ? tempSensors[0] : null;
    const mainHumidity = humiditySensors.length > 0 ? humiditySensors[0] : null;

    const handleUpdate = (entityId, payload) => {
        if (onToggle) onToggle('light', 'turn_on', { entity_id: entityId, ...payload });
    };

    const handleBrightness = (entityId, brightness) => {
        if (onToggle) onToggle('light', 'turn_on', { entity_id: entityId, brightness: brightness });
    };

    const handleActivatePreferences = async (entities) => {
        for (const entity of entities) {
            const domain = entity.entity_id.split('.')[0];
            let service = '';
            let data = { entity_id: entity.entity_id };

            switch (domain) {
                case 'light':
                    service = entity.preferred_state === 'on' ? 'turn_on' : 'turn_off';
                    break;
                case 'fan':
                    service = entity.preferred_state === 'on' ? 'turn_on' : 'turn_off';
                    break;
                case 'climate':
                    if (entity.preferred_state === 'off') {
                        service = 'turn_off';
                    } else {
                        service = 'set_hvac_mode';
                        data.hvac_mode = entity.preferred_state;
                    }
                    break;
                case 'media_player':
                    service = entity.preferred_state === 'on' || entity.preferred_state === 'playing' ? 'turn_on' : 'turn_off';
                    break;
                case 'cover':
                    service = entity.preferred_state === 'open' ? 'open_cover' : 'close_cover';
                    break;
                default:
                    continue;
            }

            if (service && onToggle) {
                onToggle(domain, service, data);
                await new Promise(resolve => setTimeout(resolve, 200));
            }
        }
    };

    const imageUrl = !isModal && !isInlinePanel && room.picture ? `${haUrl}${room.picture}` : null;

    return (
        <View style={[styles.container, isModal && styles.modalContainer, isInlinePanel && styles.inlinePanelContainer]}>
            {isInlinePanel ? (
                <View style={styles.inlineHeader}>
                    <Text style={styles.inlineTitle}>{formatRoomName(room.name)}</Text>
                    <View style={styles.headerStatsRow}>
                        <Text style={styles.subtitle}>{lights.length + fans.length} Devices</Text>
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
                            {doorSensors.map(d => {
                                const isOpen = d.stateObj.state.toLowerCase() === 'open' || d.stateObj.state.toLowerCase() === 'on';
                                return (
                                    <View key={d.entity_id} style={styles.sensorChip}>
                                        {isOpen ? <DoorOpen size={14} color="#EF5350" /> : <DoorClosed size={14} color="#4CAF50" />}
                                        <Text style={styles.sensorText}>
                                            {isOpen ? 'Open' : 'Closed'}
                                        </Text>
                                    </View>
                                );
                            })}
                        </View>
                    </View>
                </View>
            ) : isModal ? (
                <View style={styles.simpleHeader}>
                    <View style={styles.handle} />
                    <View style={styles.headerTop}>
                        <Text style={styles.title}>{formatRoomName(room.name)}</Text>
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
                            {doorSensors.map(d => {
                                const isOpen = d.stateObj.state.toLowerCase() === 'open' || d.stateObj.state.toLowerCase() === 'on';
                                return (
                                    <View key={d.entity_id} style={styles.sensorChip}>
                                        {isOpen ? <DoorOpen size={14} color="#EF5350" /> : <DoorClosed size={14} color="#4CAF50" />}
                                        <Text style={styles.sensorText}>
                                            {isOpen ? 'Open' : 'Closed'}
                                        </Text>
                                    </View>
                                );
                            })}
                        </View>
                    </View>
                </View>
            ) : (
                <View style={styles.headerContainer}>
                    {imageUrl ? (
                        <ImageBackground
                            source={{
                                uri: imageUrl,
                                headers: { Authorization: `Bearer ${haToken}` }
                            }}
                            style={styles.headerImage}
                            resizeMode="cover"
                        >
                            <LinearGradient
                                colors={['transparent', 'rgba(0,0,0,0.8)', '#14141e']}
                                style={styles.gradient}
                            />

                            <TouchableOpacity onPress={onClose} style={styles.backButton}>
                                <ChevronLeft size={28} color="#fff" />
                            </TouchableOpacity>

                            <View style={styles.headerContent}>
                                <View>
                                    <Text style={styles.title}>{formatRoomName(room.name)}</Text>
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
                                            {doorSensors.map(d => {
                                                const isOpen = d.stateObj.state.toLowerCase() === 'open' || d.stateObj.state.toLowerCase() === 'on';
                                                return (
                                                    <View key={d.entity_id} style={styles.sensorChip}>
                                                        {isOpen ? <DoorOpen size={14} color="#EF5350" /> : <DoorClosed size={14} color="#4CAF50" />}
                                                        <Text style={styles.sensorText}>
                                                            {isOpen ? 'Open' : 'Closed'}
                                                        </Text>
                                                    </View>
                                                );
                                            })}
                                        </View>
                                    </View>
                                </View>
                            </View>
                        </ImageBackground>
                    ) : (
                        <View style={[styles.headerImage, { backgroundColor: '#2a2a35' }]}>
                            <TouchableOpacity onPress={onClose} style={styles.backButton}>
                                <ChevronLeft size={28} color="#fff" />
                            </TouchableOpacity>

                            <View style={styles.headerContent}>
                                <View>
                                    <Text style={styles.title}>{formatRoomName(room.name)}</Text>
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
                                            {doorSensors.map(d => {
                                                const isOpen = d.stateObj.state.toLowerCase() === 'open' || d.stateObj.state.toLowerCase() === 'on';
                                                return (
                                                    <View key={d.entity_id} style={styles.sensorChip}>
                                                        {isOpen ? <DoorOpen size={14} color="#EF5350" /> : <DoorClosed size={14} color="#4CAF50" />}
                                                        <Text style={styles.sensorText}>
                                                            {isOpen ? 'Open' : 'Closed'}
                                                        </Text>
                                                    </View>
                                                );
                                            })}
                                        </View>
                                    </View>
                                </View>
                            </View>
                        </View>
                    )}
                </View>
            )}

            <View style={{ flex: 1 }}>
                <ScrollView contentContainerStyle={styles.content}>

                    {showPreferenceButton && (
                        <ActivatePreferencesButton
                            roomName={formatRoomName(room.name)}
                            onActivate={handleActivatePreferences}
                            onPreferencesLoaded={setPreferences}
                        />
                    )}

                    {automations.length > 0 && (
                        <View style={styles.automationSection}>
                            <TouchableOpacity
                                style={styles.automationToggleBtn}
                                onPress={() => {
                                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                    setShowAutomations(prev => !prev);
                                }}
                            >
                                <Zap size={18} color="#8947ca" />
                                <Text style={styles.automationToggleBtnText}>Automations ({automations.length})</Text>
                                {showAutomations
                                    ? <ChevronUp size={18} color={Colors.textDim} />
                                    : <ChevronDown size={18} color={Colors.textDim} />
                                }
                            </TouchableOpacity>

                            {showAutomations && (
                                <View style={styles.automationList}>
                                    {automations.map(auto => {
                                        const isOn = auto.stateObj.state === 'on';
                                        return (
                                            <View key={auto.entity_id} style={styles.automationItem}>
                                                <View style={styles.automationInfo}>
                                                    <Zap size={16} color={isOn ? '#8947ca' : Colors.textDim} />
                                                    <Text style={styles.automationName} numberOfLines={1}>{auto.displayName}</Text>
                                                </View>
                                                <TouchableOpacity
                                                    style={[styles.automationSwitch, isOn && styles.automationSwitchOn]}
                                                    onPress={() => {
                                                        Haptics.selectionAsync();
                                                        if (onToggle) onToggle('automation', isOn ? 'turn_off' : 'turn_on', { entity_id: auto.entity_id });
                                                    }}
                                                >
                                                    <View style={[styles.automationSwitchThumb, isOn && styles.automationSwitchThumbOn]} />
                                                </TouchableOpacity>
                                            </View>
                                        );
                                    })}
                                </View>
                            )}
                        </View>
                    )}

                    {(mainTemp || mainHumidity) && (
                        <RoomClimateChart
                            tempEntityId={mainTemp?.entity_id}
                            humidityEntityId={mainHumidity?.entity_id}
                            adminUrl={adminUrl}
                        />
                    )}

                    {scripts.length > 0 && (
                        <View>
                            <Text style={styles.sectionTitle}>Scripts</Text>
                            <View style={styles.scriptsRow}>
                                {scripts.map(script => {
                                    const isRunning = script.stateObj.state === 'on';
                                    return (
                                        <TouchableOpacity
                                            key={script.entity_id}
                                            style={[styles.scriptChip, isRunning && styles.scriptChipActive]}
                                            onPress={() => {
                                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                                if (onToggle) onToggle('script', 'turn_on', { entity_id: script.entity_id });
                                            }}
                                        >
                                            <Play size={14} color={isRunning ? '#fff' : Colors.textDim} />
                                            <Text style={[styles.scriptChipText, isRunning && styles.scriptChipTextActive]} numberOfLines={1}>
                                                {script.displayName}
                                            </Text>
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>
                            <View style={styles.divider} />
                        </View>
                    )}

                    {(() => {
                        const actualLights = lights.filter(l => !l.entity_id.startsWith('lock.'));
                        const locks = lights.filter(l => l.entity_id.startsWith('lock.'));
                        const hasDevices = actualLights.length > 0 || fans.length > 0 || locks.length > 0 || doorSensors.length > 0;

                        if (!hasDevices) {
                            return (
                                <View style={styles.emptyState}>
                                    <Lightbulb size={40} color={Colors.textDim} />
                                    <Text style={styles.emptyText}>No devices found in this room.</Text>
                                </View>
                            );
                        }

                        return (
                            <>
                                <View style={styles.grid}>
                                    {actualLights.map((light) => (
                                        <View key={light.entity_id} style={{ width: cardWidth }}>
                                            <LightCard
                                                light={light}
                                                needsChange={checkNeedsChange(light.entity_id)}
                                                mapping={lightMappings.find(m => m.entity_id === light.entity_id)}
                                                adminUrl={adminUrl}
                                                onToggle={(id, state) => {
                                                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                                    if (onToggle) onToggle('light', 'toggle', { entity_id: id });
                                                }}
                                                onBrightnessChange={handleBrightness}
                                                onLongPress={(l) => {
                                                    const m = lightMappings.find(m => m.entity_id === l.entity_id);
                                                    setSelectedLight({ ...l, colorCapability: m?.colorCapability || null });
                                                }}
                                            />
                                        </View>
                                    ))}
                                    {fans.map((fan) => (
                                        <View key={fan.entity_id} style={{ width: cardWidth }}>
                                            <FanCard
                                                fan={fan}
                                                needsChange={checkNeedsChange(fan.entity_id)}
                                                onToggle={(id, state) => {
                                                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                                    if (onToggle) onToggle('fan', 'toggle', { entity_id: id });
                                                }}
                                            />
                                        </View>
                                    ))}
                                </View>

                                {locks.length > 0 && (
                                    <View>
                                        <View style={styles.divider} />
                                        <View style={styles.lockSliderRow}>
                                            {locks.map(lock => {
                                                const isUnlocked = lock.stateObj.state === 'unlocked' || lock.stateObj.state === 'open';
                                                const name = lock.displayName || lock.entity_id;

                                                return (
                                                    <View key={lock.entity_id} style={styles.lockSliderContainer}>
                                                        {isUnlocked ? (
                                                            <TouchableOpacity
                                                                style={[styles.lockStatusCard, { backgroundColor: '#FF7043' }]}
                                                                onPress={() => {
                                                                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                                                                    if (onToggle) onToggle('lock', 'lock', { entity_id: lock.entity_id });
                                                                }}
                                                            >
                                                                <LockOpen size={24} color="#fff" />
                                                                <Text style={styles.lockStatusText}>Unlocked</Text>
                                                            </TouchableOpacity>
                                                        ) : (
                                                            <SlideAction
                                                                label={`Unlock ${name}`}
                                                                icon={LockOpen}
                                                                color="#8947ca"
                                                                onSlide={() => {
                                                                    if (onToggle) onToggle('lock', 'unlock', { entity_id: lock.entity_id });
                                                                }}
                                                            />
                                                        )}
                                                    </View>
                                                );
                                            })}
                                        </View>
                                    </View>
                                )}
                            </>
                        );
                    })()}

                    {cameras.length > 0 && (
                        <View>
                            <View style={styles.divider} />
                            <HACamerasList
                                cameras={cameras.map(c => c.stateObj)}
                                allEntities={allEntities}
                                haUrl={haUrl}
                                haToken={haToken}
                                onCameraPress={() => { }}
                            />
                        </View>
                    )}

                    {covers.length > 0 && (
                        <View>
                            <View style={styles.divider} />
                            <View style={styles.grid}>
                                {covers.map(cover => {
                                    const sensorId = cover.entity_id.replace('cover.', 'sensor.');
                                    const sensor = allEntities.find(e => e.entity_id === sensorId);
                                    return (
                                        <View key={cover.entity_id} style={{ width: cardWidth }}>
                                            <CoverCard
                                                cover={cover}
                                                sensor={sensor}
                                                needsChange={checkNeedsChange(cover.entity_id)}
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

                    {climates.length > 0 && (
                        <View>
                            <View style={styles.divider} />
                            {climates.map(climate => (
                                <ClimateCard
                                    key={climate.entity_id}
                                    climate={climate}
                                    needsChange={checkNeedsChange(climate.entity_id)}
                                    onUpdate={(id, domain, service, data) => {
                                        if (onToggle) onToggle(domain, service, { entity_id: id, ...data });
                                    }}
                                />
                            ))}
                        </View>
                    )}

                    {medias.length > 0 && (
                        <View style={{ marginBottom: 40 }}>
                            <View style={styles.divider} />
                            {medias
                                .filter(m => {
                                    const mapping = mediaMappings.find(map => map.entity_id === m.entity_id);
                                    return !mapping || !mapping.parentId;
                                })
                                .map(media => {
                                    const children = medias.filter(c => {
                                        const mapping = mediaMappings.find(map => map.entity_id === c.entity_id);
                                        return mapping && mapping.parentId === media.entity_id;
                                    });

                                    const mapping = mediaMappings.find(m => m.entity_id === media.entity_id);

                                    return (
                                        <MediaCard
                                            key={media.entity_id}
                                            player={media}
                                            childPlayers={children}
                                            mapping={mapping}
                                            mediaMappings={mediaMappings}
                                            needsChange={checkNeedsChange(media.entity_id)}
                                            onUpdate={(id, domain, service, data) => {
                                                if (onToggle) onToggle(domain, service, { entity_id: id, ...data });
                                            }}
                                            adminUrl={adminUrl}
                                            haUrl={haUrl}
                                            haToken={haToken}
                                            onShowSourceOverlay={setSourceOverlay}
                                            onShowVolumeOverlay={setVolumeOverlay}
                                        />
                                    );
                                })}
                        </View>
                    )}

                    {switches.length > 0 && (
                        <View>
                            <View style={styles.divider} />
                            <Text style={styles.sectionTitle}>Switches</Text>
                            <View style={styles.grid}>
                                {switches.map(sw => (
                                    <View key={sw.entity_id} style={{ width: cardWidth }}>
                                        <SwitchCard
                                            switchEntity={sw}
                                            needsChange={checkNeedsChange(sw.entity_id)}
                                            onToggle={(id, state) => {
                                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                                if (onToggle) onToggle('switch', 'toggle', { entity_id: id });
                                            }}
                                        />
                                    </View>
                                ))}
                            </View>
                        </View>
                    )}
                </ScrollView>
            </View>

            {selectedLight && (
                <LightControlModal
                    visible={!!selectedLight}
                    onClose={() => setSelectedLight(null)}
                    light={selectedLight}
                    colorCapability={selectedLight.colorCapability}
                    onUpdate={handleUpdate}
                />
            )}

            {/* Source Selection Overlay */}
            {sourceOverlay && (
                <View style={styles.fullOverlay}>
                    <TouchableOpacity style={styles.fullOverlayBg} onPress={() => setSourceOverlay(null)} />
                    <View style={styles.overlayContent}>
                        <Text style={styles.overlayTitle}>Select Source</Text>
                        <ScrollView style={{ maxHeight: 300 }}>
                            {sourceOverlay.sourceList?.map((s) => (
                                <TouchableOpacity
                                    key={s}
                                    style={[styles.sourceItem, sourceOverlay.currentSource === s && styles.sourceItemActive]}
                                    onPress={() => {
                                        sourceOverlay.onSelect(s);
                                        setSourceOverlay(null);
                                    }}
                                >
                                    <Text style={[styles.sourceItemText, sourceOverlay.currentSource === s && { color: '#8947ca' }]}>{s}</Text>
                                    {sourceOverlay.childPlayers?.find(c => {
                                        const m = sourceOverlay.mediaMappings?.find(map => map.entity_id === c.entity_id);
                                        return m && m.parentSource === s;
                                    }) && (
                                            <Text style={{ color: '#888', fontSize: 12 }}> • {sourceOverlay.childPlayers.find(c => {
                                                const m = sourceOverlay.mediaMappings.find(map => map.entity_id === c.entity_id);
                                                return m && m.parentSource === s;
                                            }).displayName}</Text>
                                        )}
                                    {sourceOverlay.currentSource === s && <View style={styles.sourceActiveDot} />}
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    </View>
                </View>
            )}

            {/* Volume Control Overlay */}
            {volumeOverlay && (
                <View style={styles.fullOverlay}>
                    <TouchableOpacity style={styles.fullOverlayBg} onPress={() => setVolumeOverlay(null)} />
                    <View style={[styles.overlayContent, { alignItems: 'center' }]}>
                        <Text style={styles.overlayTitle}>Volume Control</Text>
                        <Text style={styles.volumeLabel}>{volumeOverlay.player?.displayName}</Text>
                        <View style={styles.volumeSliderContainer}>
                            <View style={styles.volumeSliderTrack}>
                                <View style={[styles.volumeSliderFill, { width: `${(volumeOverlay.parentVolume || 0) * 100}%` }]} />
                            </View>
                            <TouchableOpacity style={styles.volumeSliderTouchLeft} onPress={() => volumeOverlay.onVolumeChange(Math.max(0, (volumeOverlay.parentVolume || 0) - 0.05), volumeOverlay.player)} />
                            <TouchableOpacity style={styles.volumeSliderTouchRight} onPress={() => volumeOverlay.onVolumeChange(Math.min(1, (volumeOverlay.parentVolume || 0) + 0.05), volumeOverlay.player)} />
                        </View>

                        {volumeOverlay.activeChild && volumeOverlay.activeChild.stateObj.attributes.volume_level !== undefined && (
                            <>
                                <Text style={[styles.volumeLabel, { marginTop: 20 }]}>{volumeOverlay.activeChild.displayName}</Text>
                                <View style={styles.volumeSliderContainer}>
                                    <View style={styles.volumeSliderTrack}>
                                        <View style={[styles.volumeSliderFill, { width: `${(volumeOverlay.activeChild.stateObj.attributes.volume_level || 0) * 100}%` }]} />
                                    </View>
                                    <TouchableOpacity style={styles.volumeSliderTouchLeft} onPress={() => volumeOverlay.onVolumeChange(Math.max(0, (volumeOverlay.activeChild.stateObj.attributes.volume_level || 0) - 0.05), volumeOverlay.activeChild)} />
                                    <TouchableOpacity style={styles.volumeSliderTouchRight} onPress={() => volumeOverlay.onVolumeChange(Math.min(1, (volumeOverlay.activeChild.stateObj.attributes.volume_level || 0) + 0.05), volumeOverlay.activeChild)} />
                                </View>
                            </>
                        )}
                        <TouchableOpacity style={{ marginTop: 20 }} onPress={() => setVolumeOverlay(null)}>
                            <Text style={{ color: Colors.textDim, fontSize: 16 }}>Done</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            )}
        </View >
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
    inlinePanelContainer: {
        backgroundColor: '#1a1a24',
        borderLeftWidth: 1,
        borderLeftColor: 'rgba(255,255,255,0.08)',
    },
    inlineHeader: {
        padding: 20,
        paddingBottom: 12,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.08)',
    },
    inlineTitle: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#fff',
        marginBottom: 6,
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
        width: '100%',
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
    colorRingWrapper: {
        width: 46,
        height: 46,
        borderRadius: 23,
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
    },
    colorRingGradient: {
        ...StyleSheet.absoluteFillObject,
        borderRadius: 23,
    },
    colorRingInner: {
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
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
    },
    lockSliderRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        marginTop: 12,
        gap: 12,
    },
    lockSliderContainer: {
        width: '48%',
        flexGrow: 1,
    },
    lockStatusCard: {
        height: 56,
        borderRadius: 28,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 3.84,
        elevation: 5,
    },
    lockStatusText: {
        color: '#fff',
        fontWeight: 'bold',
        fontSize: 16,
    },
    // ── Automations ──
    automationSection: {
        marginBottom: 8,
    },
    automationToggleBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        backgroundColor: 'rgba(137, 71, 202, 0.1)',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: 'rgba(137, 71, 202, 0.2)',
    },
    automationToggleBtnText: {
        color: '#fff',
        fontSize: 15,
        fontWeight: '600',
        flex: 1,
    },
    automationList: {
        marginTop: 10,
        gap: 8,
    },
    automationItem: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: 'rgba(255,255,255,0.05)',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderRadius: 14,
    },
    automationInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        flex: 1,
        marginRight: 12,
    },
    automationName: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '500',
        flex: 1,
    },
    automationSwitch: {
        width: 44,
        height: 26,
        borderRadius: 13,
        backgroundColor: 'rgba(255,255,255,0.15)',
        justifyContent: 'center',
        paddingHorizontal: 2,
    },
    automationSwitchOn: {
        backgroundColor: '#8947ca',
    },
    automationSwitchThumb: {
        width: 22,
        height: 22,
        borderRadius: 11,
        backgroundColor: '#888',
    },
    automationSwitchThumbOn: {
        backgroundColor: '#fff',
        alignSelf: 'flex-end',
    },
    // ── Scripts ──
    // ── Scripts ──
    scriptsRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 10,
        // justifyContent: 'space-between', // gap handles spacing better usually, but with fixed % width, let's rely on gap or specific calculations
    },
    scriptChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        backgroundColor: 'rgba(255,255,255,0.08)',
        paddingHorizontal: 14,
        height: 54, // Increased fixed height
        borderRadius: 14,
        width: '48%', // Force 2 columns roughly
        flexGrow: 1, // Allow filling remaining space if needed, but width constrains it
    },
    scriptChipActive: {
        backgroundColor: '#8947ca',
    },
    scriptChipText: {
        color: Colors.textDim,
        fontSize: 13,
        fontWeight: '500',
        flex: 1, // Essential for truncation to work in row layout
    },
    scriptChipTextActive: {
        color: '#fff',
    },
    // ── Media Overlays ──
    fullOverlay: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 100,
    },
    fullOverlayBg: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.8)',
    },
    overlayContent: {
        width: '85%',
        backgroundColor: '#1E1E24',
        borderRadius: 24,
        padding: 24,
        maxHeight: '70%',
    },
    overlayTitle: {
        color: '#fff',
        fontSize: 18,
        fontWeight: 'bold',
        marginBottom: 20,
        textAlign: 'center',
    },
    sourceItem: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 14,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.05)',
    },
    sourceItemActive: {
        backgroundColor: 'rgba(137, 71, 202, 0.1)',
        marginHorizontal: -10,
        paddingHorizontal: 10,
        borderRadius: 12,
        borderBottomWidth: 0,
    },
    sourceItemText: {
        color: '#ccc',
        fontSize: 16,
    },
    sourceActiveDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#8947ca',
    },
    volumeLabel: {
        color: '#fff',
        marginBottom: 10,
        alignSelf: 'flex-start',
        fontSize: 14,
        fontWeight: '600',
    },
    volumeSliderContainer: {
        width: '100%',
        height: 40,
        justifyContent: 'center',
        position: 'relative',
        marginBottom: 8,
    },
    volumeSliderTrack: {
        width: '100%',
        height: 12,
        borderRadius: 6,
        backgroundColor: 'rgba(255,255,255,0.1)',
        overflow: 'hidden',
    },
    volumeSliderFill: {
        height: '100%',
        backgroundColor: '#8947ca',
    },
    volumeSliderTouchLeft: {
        position: 'absolute',
        top: 0,
        bottom: 0,
        left: 0,
        width: '50%',
    },
    volumeSliderTouchRight: {
        position: 'absolute',
        top: 0,
        bottom: 0,
        right: 0,
        width: '50%',
    },
});
