import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ImageBackground, Image } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { BlurView } from 'expo-blur';
import { X, Fan, ChevronLeft, Droplets, Thermometer, DoorOpen, DoorClosed, Lock, LockOpen, Power, Play, Zap, ChevronDown, ChevronUp, Monitor, Edit2 } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { Colors } from '../../constants/Colors';
import { CF, Heading } from '../../utils/typography';
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { authFetch } from '../../utils/authFetch';
import { useParentScrollLock } from '../../hooks/useParentScrollLock';
import { GestureHandlerRootView, PanGestureHandler, State } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, withSpring, Easing, cancelAnimation } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import LightTypeIcon from './LightTypeIcon';

import LightControlModal from './LightControlModal';
import ClimateGroupCard from './ClimateGroupCard';
import HaSystemBanner from './HaSystemBanner';
import RoomAreasNavBar from './RoomAreasNavBar';
import { isBadEntityState } from '../../utils/haEntityHealth';
import CoverCard from './CoverCard';
import MediaCard from './MediaCard';
import MusicMediaCard from './MusicMediaCard';
import ActivatePreferencesButton from './ActivatePreferencesButton';
import SlideAction from './SlideAction';
import SceneCard from './SceneCard';
import { EditScenesModal, MAX_QUICK_SCENES } from './QuickScenes';
import LightsGroupCard from './LightsGroupCard';
import CoversGroupCard from './CoversGroupCard';
import RoomGroupIconButton, { ROOM_GROUP_ICON_GLYPH_SIZE } from './RoomGroupIconButton';
import { LockPill } from './HomeAccess';
import useDeviceType from '../../hooks/useDeviceType';
import { lightSupportsBrightness } from '../../utils/lightCapabilities';
import { findAdaptiveLightingForRoom, isAdaptiveLightingMainEntity } from '../../utils/adaptiveLighting';
import { buildLightColorTempPayload, buildLightRgbPayload } from '../../utils/lightServicePayload';
import { windowsForRoom } from '../../utils/coverWindows';
import { filterCamerasForRole } from '../../services/appRole';
import { getLightMapping } from '../../utils/lightMappingsClient';
import { formatCameraName, formatDisplayName } from '../../utils/formatDisplayName';

// Convert area_id-style names (e.g. "living_room") to proper display names ("Living Room")
const roomScenesPrefsKey = (areaId) => `room_scenes_show_prefs_${areaId}`;

const formatRoomName = (name) => formatDisplayName(name);

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
const LIGHT_CARD_ICON_SIZE = 30;
const LIGHT_CARD_DEFAULT_ICON_SIZE = 20;

function LightCard({ light, onToggle, onBrightnessChange, onLongPress, needsChange: lightCardNeedsChange, mapping, adminUrl }) {
    const isLock = light.entity_id.startsWith('lock.');

    const supportsBrightness = !isLock && lightSupportsBrightness(light.stateObj.attributes, mapping);

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
    const pressScale = useSharedValue(1);

    const pressAnimStyle = useAnimatedStyle(() => ({
        transform: [{ scale: pressScale.value }],
    }));

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
    const iconColor = isOn ? '#000000' : '#ffffff';
    const iconBg = isOn ? activeColor : 'rgba(255,255,255,0.1)';

    const handlePress = () => {
        if (isSliding) return;
        // Press-down → spring bounce back
        pressScale.value = withTiming(0.93, { duration: 80 }, () => {
            pressScale.value = withSpring(1, { damping: 6, stiffness: 300 });
        });
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        // Color-capable lights: tap opens the color control modal
        if (hasColorControl) {
            onLongPress?.(light);
        } else {
            onToggle(light.entity_id, light.stateObj.state);
        }
    };

    const typeName = mapping?.lightType?.name;

    return (
        <PanGestureHandler
            onGestureEvent={handleGestureEvent}
            onHandlerStateChange={handleStateChange}
            activeOffsetX={[-10, 10]}
        >
            <Animated.View style={[styles.cardContainer, pressAnimStyle]}>
                <TouchableOpacity
                    style={[
                        styles.card,
                        lightCardNeedsChange && { borderColor: '#8947ca', borderWidth: 2 }
                    ]}
                    onPress={handlePress}
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
                                    <LightTypeIcon
                                        typeName={typeName}
                                        size={LIGHT_CARD_ICON_SIZE}
                                        color={iconColor}
                                    />
                                </View>
                            </View>
                        ) : (
                            <View style={[styles.iconContainer, { backgroundColor: iconBg, position: 'relative' }]}>
                                <Animated.View style={[
                                    StyleSheet.absoluteFill,
                                    { backgroundColor: activeColor, borderRadius: 20, zIndex: -1 },
                                    pulseStyle
                                ]} />
                                {isLock ? (
                                    isOn ? <LockOpen size={LIGHT_CARD_DEFAULT_ICON_SIZE} color={iconColor} /> : <Lock size={LIGHT_CARD_DEFAULT_ICON_SIZE} color={iconColor} />
                                ) : (
                                    <LightTypeIcon
                                        typeName={typeName}
                                        size={LIGHT_CARD_ICON_SIZE}
                                        color={iconColor}
                                    />
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
            </Animated.View>
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
    musicMedias = [],
    cameras = [],
    sensors = [],
    allEntities = [],
    doors = [],
    windows = [],
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
    showPreferenceButton = true,
    musicAssistantEntryIds = [],
    browseMedia,
    callServiceWithResponse,
    systemHealthBanner = null,
    canControlHa = true,
    coverMappings = [],
    coverWindows = [],
    areaTabs = [],
    activeAreaKey,
    onSelectArea,
    appRole = null,
}) {
    const { isTablet } = useDeviceType();
    const isTabletModal = isModal && isTablet;
    const cardWidth = columns > 2 ? `${Math.floor(100 / columns) - 2}%` : '48%';
    const [selectedLight, setSelectedLight] = useState(null);
    const [lightsPanelWidth, setLightsPanelWidth] = useState(0);
    const [coversPanelWidth, setCoversPanelWidth] = useState(0);
    const [roomScenesEditVisible, setRoomScenesEditVisible] = useState(false);
    const [roomScenesConfigured, setRoomScenesConfigured] = useState(false);
    const [allowedRoomSceneIds, setAllowedRoomSceneIds] = useState([]);
    const [roomShowPreferences, setRoomShowPreferences] = useState(null);

    const sceneAreaId = activeAreaKey || room?.area_id;

    useEffect(() => {
        if (!sceneAreaId) return;

        SecureStore.getItemAsync(roomScenesPrefsKey(sceneAreaId)).then((val) => {
            setRoomShowPreferences(val !== null ? val === 'true' : null);
        });
    }, [sceneAreaId]);

    useEffect(() => {
        if (!adminUrl || !sceneAreaId) return;

        const base = adminUrl.endsWith('/') ? adminUrl : `${adminUrl}/`;
        authFetch(`${base}api/room-scenes?area_id=${encodeURIComponent(sceneAreaId)}`)
            .then((res) => res.json())
            .then((data) => {
                if (data?.configured) {
                    setRoomScenesConfigured(true);
                    setAllowedRoomSceneIds(
                        Array.isArray(data.entity_ids) ? data.entity_ids : []
                    );
                } else {
                    setRoomScenesConfigured(false);
                    setAllowedRoomSceneIds([]);
                }
            })
            .catch((e) => console.warn('[RoomDetailView] room-scenes fetch failed:', e));
    }, [adminUrl, sceneAreaId]);

    const effectiveShowPreferences = roomShowPreferences !== null
        ? roomShowPreferences
        : showPreferenceButton;

    const displayScripts = useMemo(() => {
        // Reserve slots: 1 for preferences button (if shown), 1 for Movie Mode (if exists)
        // Total visible = MAX_QUICK_SCENES (4)
        const movieSlot = movieModeEntity ? 1 : 0;
        const prefsSlot = effectiveShowPreferences ? 1 : 0;
        const maxSceneSlots = MAX_QUICK_SCENES - prefsSlot - movieSlot;
        let list;
        if (!roomScenesConfigured) {
            list = scripts;
        } else {
            const allowed = new Set(allowedRoomSceneIds);
            list = scripts.filter((s) => allowed.has(s.entity_id));
        }
        return list.slice(0, maxSceneSlots);
    }, [scripts, roomScenesConfigured, allowedRoomSceneIds, effectiveShowPreferences, movieModeEntity]);

    const showScenesSection =
        scripts.length > 0 || effectiveShowPreferences || roomScenesConfigured || !!movieModeEntity;

    // Dynamically find Movie Mode entity from allEntities
    // Matches: switch.*movie*, input_boolean.*movie*, switch.*cinema*, input_boolean.*cinema*
    const movieModeEntity = useMemo(() => {
        if (!allEntities || allEntities.length === 0) return null;
        return allEntities.find(e => {
            const id = (e.entity_id || '').toLowerCase();
            const name = (e.attributes?.friendly_name || '').toLowerCase();
            const isToggleable = id.startsWith('switch.') || id.startsWith('input_boolean.');
            const hasMovieKeyword = id.includes('movie') || id.includes('cinema') ||
                name.includes('movie') || name.includes('cinema');
            return isToggleable && hasMovieKeyword;
        }) || null;
    }, [allEntities]);
    const [preferences, setPreferences] = useState([]);
    const [showAutomations, setShowAutomations] = useState(false);
    const [sourceOverlay, setSourceOverlay] = useState(null);
    const [volumeOverlay, setVolumeOverlay] = useState(null);
    const { scrollEnabled, onSliderDragStart, onSliderDragEnd } = useParentScrollLock();

    const guardedToggle = (domain, serviceName, data) => {
        if (!canControlHa) return undefined;
        return onToggle?.(domain, serviceName, data);
    };

    const checkNeedsChange = (entityId) => {
        const pref = preferences.find(p => p.entity_id === entityId);
        return pref ? pref.needs_change : false;
    };

    const tempSensors = sensors.filter(s => s.sensorType === 'temperature');
    const humiditySensors = sensors.filter(s => s.sensorType === 'humidity');

    // Doors only in the header. Window contacts are mapped on Cover Mapping and stay off this row.
    const groupingRoom = useMemo(() => {
        const tab = (areaTabs || []).find((t) => t.key === activeAreaKey);
        return tab?.area || room;
    }, [areaTabs, activeAreaKey, room]);

    const assignedWindowIds = new Set(
        (coverWindows || []).flatMap((w) => (Array.isArray(w.sensor_ids) ? w.sensor_ids : [])),
    );
    const doorSensors = (doors || []).filter((d) => (
        d.sensorType !== 'window'
        && !assignedWindowIds.has(d.entity_id)
    ));

    const roomCoverEntityIds = useMemo(() => {
        const ids = [];
        for (const list of [covers, windows, doors, sensors]) {
            for (const entity of list || []) {
                if (entity?.entity_id) ids.push(entity.entity_id);
            }
        }
        return ids;
    }, [covers, windows, doors, sensors]);

    const namedWindowsForRoom = useMemo(
        () => windowsForRoom(coverWindows, groupingRoom, { covers, roomEntityIds: roomCoverEntityIds }),
        [coverWindows, groupingRoom, covers, roomCoverEntityIds],
    );

    const mainTemp = tempSensors.length > 0 ? tempSensors[0] : null;
    const mainHumidity = humiditySensors.length > 0 ? humiditySensors[0] : null;

    // Prefer dedicated temp/humidity sensors; fall back to climate entity readings
    const resolveIndoorTemp = () => {
        if (mainTemp?.stateObj?.state != null && !isNaN(Number(mainTemp.stateObj.state))) {
            return Math.round(Number(mainTemp.stateObj.state));
        }
        const climate = (climates || []).find(c => c.stateObj?.attributes?.current_temperature != null);
        const t = climate?.stateObj?.attributes?.current_temperature;
        return t != null && !isNaN(Number(t)) ? Math.round(Number(t)) : null;
    };
    const resolveIndoorHumidity = () => {
        if (mainHumidity?.stateObj?.state != null && !isNaN(Number(mainHumidity.stateObj.state))) {
            return Math.round(Number(mainHumidity.stateObj.state));
        }
        const climate = (climates || []).find(c => c.stateObj?.attributes?.current_humidity != null);
        const h = climate?.stateObj?.attributes?.current_humidity;
        return h != null && !isNaN(Number(h)) ? Math.round(Number(h)) : null;
    };

    // Split locks out of the lights array (they arrive merged from roomHelpers)
    const lockEntities = lights.filter(l => l.entity_id.startsWith('lock.'));
    const actualLightEntities = lights.filter(l => !l.entity_id.startsWith('lock.'));

    const resolveLightEntity = useCallback((entityId) => {
        const fromAll = allEntities.find((e) => e.entity_id === entityId);
        if (fromAll) return fromAll;
        const fromRoom = actualLightEntities.find((l) => l.entity_id === entityId);
        return fromRoom?.stateObj || null;
    }, [allEntities, actualLightEntities]);

    const handleUpdate = (entityId, payload) => {
        if (payload.toggle) {
            // Power toggle from modal header
            const light = lights.find(l => l.entity_id === entityId);
            if (onToggle) onToggle('light', 'toggle', { entity_id: entityId });
            return;
        }
        if (!onToggle) return;
        const entity = resolveLightEntity(entityId);
        if (payload.brightness !== undefined) {
            onToggle('light', 'turn_on', { entity_id: entityId, brightness: payload.brightness });
            return;
        }
        if (payload.kelvin !== undefined) {
            onToggle('light', 'turn_on', buildLightColorTempPayload(entityId, entity, payload.kelvin));
            return;
        }
        if (payload.rgb_color !== undefined) {
            onToggle('light', 'turn_on', buildLightRgbPayload(entityId, entity, payload.rgb_color));
        }
    };

    const handleBrightness = (entityId, brightness) => {
        if (onToggle) onToggle('light', 'turn_on', { entity_id: entityId, brightness: brightness });
    };

    const handleColorTemp = (entityId, kelvin) => {
        if (!onToggle) return;
        const entity = resolveLightEntity(entityId);
        onToggle('light', 'turn_on', buildLightColorTempPayload(entityId, entity, kelvin));
    };

    const handleRgb = (entityId, rgb) => {
        if (!onToggle) return;
        const entity = resolveLightEntity(entityId);
        onToggle('light', 'turn_on', buildLightRgbPayload(entityId, entity, rgb));
    };

    const adaptiveLighting = useMemo(() => {
        const lightIds = actualLightEntities.map((l) => l.entity_id);
        return findAdaptiveLightingForRoom(allEntities, lightIds, room?.name, sceneAreaId, switches);
    }, [allEntities, actualLightEntities, room?.name, sceneAreaId, switches]);

    const handleAdaptiveToggle = useCallback(() => {
        const entityId = adaptiveLighting?.main?.entity_id;
        if (!entityId || !canControlHa) return;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        guardedToggle('switch', 'toggle', { entity_id: entityId });
    }, [adaptiveLighting, canControlHa]);

    const handleAdaptiveManualColor = useCallback(() => {
        const entityId = adaptiveLighting?.main?.entity_id;
        if (!entityId || !canControlHa) return;
        const current = allEntities.find((e) => e.entity_id === entityId);
        if (current?.state === 'on') {
            guardedToggle('switch', 'turn_off', { entity_id: entityId });
        }
    }, [adaptiveLighting, allEntities, canControlHa]);

    const visibleSwitches = useMemo(
        () => switches.filter((sw) => {
            const entity = {
                entity_id: sw.entity_id,
                attributes: sw.stateObj?.attributes || {},
                displayName: sw.displayName,
                name: sw.name,
                original_name: sw.original_name,
            };
            return !isAdaptiveLightingMainEntity(entity);
        }),
        [switches],
    );

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
                    {
                        const climate = (climates || []).find((c) => c.entity_id === entity.entity_id);
                        const switchId = climate?.powerSwitchEntityId;
                        if (switchId && onToggle) {
                            onToggle(
                                'switch',
                                entity.preferred_state === 'off' ? 'turn_off' : 'turn_on',
                                { entity_id: switchId },
                            );
                            await new Promise((resolve) => setTimeout(resolve, 200));
                        }
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

    const visibleRoomCameras = useMemo(
        () => filterCamerasForRole(cameras, appRole),
        [cameras, appRole],
    );

    const hasLightsBlock = actualLightEntities.length > 0 || fans.length > 0;
    const hasCoversBlock = covers.length > 0 || namedWindowsForRoom.length > 0;
    const useTabletLightsCoversSplit = isTabletModal && hasLightsBlock && hasCoversBlock;
    const hasAnyRoomDevices =
        actualLightEntities.length > 0
        || fans.length > 0
        || covers.length > 0
        || climates.length > 0
        || medias.length > 0
        || musicMedias.length > 0
        || visibleRoomCameras.length > 0
        || lockEntities.length > 0
        || doorSensors.length > 0
        || automations.length > 0
        || displayScripts.length > 0
        || !!movieModeEntity;

    const lightsAndFansSection = (() => {
        if (!hasLightsBlock) return null;
        return (
            <>
                {actualLightEntities.length > 0 && (
                    <LightsGroupCard
                        lights={actualLightEntities}
                        lightMappings={lightMappings}
                        adminUrl={adminUrl}
                        roomName={room.name}
                        allEntities={allEntities}
                        adaptiveLighting={adaptiveLighting}
                        onAdaptiveToggle={handleAdaptiveToggle}
                        onAdaptiveManualColor={handleAdaptiveManualColor}
                        contentWidth={useTabletLightsCoversSplit && lightsPanelWidth > 0 ? lightsPanelWidth : undefined}
                        gridColumns={useTabletLightsCoversSplit ? 1 : 2}
                        variant={useTabletLightsCoversSplit ? 'tabletSplit' : 'default'}
                        onSliderDragStart={onSliderDragStart}
                        onSliderDragEnd={onSliderDragEnd}
                        onToggle={(id) => {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            guardedToggle('light', 'toggle', { entity_id: id });
                        }}
                        onTurnOn={(id, params) => {
                            guardedToggle('light', 'turn_on', { entity_id: id, ...params });
                        }}
                        onBrightnessChange={handleBrightness}
                        onColorTempChange={handleColorTemp}
                        onRgbChange={handleRgb}
                        onLongPress={(l) => {
                            const m = getLightMapping(l.entity_id, lightMappings, null, l.displayName);
                            setSelectedLight({ ...l, colorCapability: m?.colorCapability || null });
                        }}
                    />
                )}
                {fans.length > 0 && (
                    <View style={styles.grid}>
                        {fans.map((fan) => (
                            <View key={fan.entity_id} style={{ width: useTabletLightsCoversSplit ? '100%' : cardWidth }}>
                                <FanCard
                                    fan={fan}
                                    needsChange={checkNeedsChange(fan.entity_id)}
                                    onToggle={(id) => {
                                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                        if (onToggle) onToggle('fan', 'toggle', { entity_id: id });
                                    }}
                                />
                            </View>
                        ))}
                    </View>
                )}
            </>
        );
    })();

    const coversSection = hasCoversBlock ? (
        <CoversGroupCard
            covers={covers}
            allEntities={allEntities}
            gridColumns={useTabletLightsCoversSplit ? 1 : 2}
            variant={useTabletLightsCoversSplit ? 'tabletSplit' : 'default'}
            contentWidth={useTabletLightsCoversSplit && coversPanelWidth > 0 ? coversPanelWidth : undefined}
            coverWindows={coverWindows}
            room={groupingRoom}
            roomEntityIds={roomCoverEntityIds}
            onSliderDragStart={onSliderDragStart}
            onSliderDragEnd={onSliderDragEnd}
            onUpdate={(id, domain, service, data) => {
                guardedToggle(domain, service, { entity_id: id, ...data });
            }}
        />
    ) : null;

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
                    <View style={styles.headerTop}>
                        <Text style={styles.title}>{formatRoomName(room.name)}</Text>
                        <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                            <X size={24} color={Colors.textDim} />
                        </TouchableOpacity>
                    </View>
                    {/* Weather / humidity / indoor temp row (compact) + sensors */}
                    <View style={styles.headerStatsRow}>
                        {(() => {
                            const weatherEntity = allEntities?.find(e => e.entity_id && e.entity_id.startsWith('weather.'));
                            const outdoorTemp = weatherEntity?.attributes?.temperature ?? null;
                            const outdoorHumidity = weatherEntity?.attributes?.humidity != null ? Math.round(weatherEntity.attributes.humidity) : null;
                            const indoorTemp = resolveIndoorTemp();
                            const indoorHumidity = resolveIndoorHumidity();

                            return (
                                <>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                        <Text style={styles.subtitleLabel}>Outdoor</Text>
                                        <Thermometer size={13} color={Colors.textDim} />
                                        <Text style={styles.subtitle}>{outdoorTemp != null ? `${outdoorTemp} °C` : '--'}</Text>
                                        <Droplets size={13} color={Colors.textDim} />
                                        <Text style={styles.subtitle}>{outdoorHumidity != null ? `${outdoorHumidity}%` : '--'}</Text>
                                    </View>
                                    {(indoorTemp != null || indoorHumidity != null) && (
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 8 }}>
                                            <Text style={styles.subtitleLabel}>Indoor</Text>
                                            <Thermometer size={13} color={Colors.textDim} />
                                            <Text style={styles.subtitle}>{indoorTemp != null ? `${indoorTemp} °C` : '--'}</Text>
                                            <Droplets size={13} color={Colors.textDim} />
                                            <Text style={styles.subtitle}>{indoorHumidity != null ? `${indoorHumidity}%` : '--'}</Text>
                                        </View>
                                    )}
                                </>
                            );
                        })()}

                        <View style={styles.sensorRow}>
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
                                    {(() => {
                                        const weatherEntity = allEntities?.find(e => e.entity_id && e.entity_id.startsWith('weather.'));
                                        const outdoorTemp = weatherEntity?.attributes?.temperature ?? null;
                                        const outdoorHumidity = weatherEntity?.attributes?.humidity != null ? Math.round(weatherEntity.attributes.humidity) : null;
                                        const indoorTemp = resolveIndoorTemp();
                                        const indoorHumidity = resolveIndoorHumidity();
                                        return (
                                            <View style={styles.headerStatsRow}>
                                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                                    <Text style={styles.subtitleLabel}>Outdoor</Text>
                                                    <Thermometer size={13} color="rgba(255,255,255,0.7)" />
                                                    <Text style={styles.subtitle}>{outdoorTemp != null ? `${outdoorTemp} °C` : '--'}</Text>
                                                    <Droplets size={13} color="rgba(255,255,255,0.7)" />
                                                    <Text style={styles.subtitle}>{outdoorHumidity != null ? `${outdoorHumidity}%` : '--'}</Text>
                                                </View>
                                                {(indoorTemp != null || indoorHumidity != null) && (
                                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 8 }}>
                                                        <Text style={styles.subtitleLabel}>Indoor</Text>
                                                        <Thermometer size={13} color="rgba(255,255,255,0.7)" />
                                                        <Text style={styles.subtitle}>{indoorTemp != null ? `${indoorTemp} °C` : '--'}</Text>
                                                        <Droplets size={13} color="rgba(255,255,255,0.7)" />
                                                        <Text style={styles.subtitle}>{indoorHumidity != null ? `${indoorHumidity}%` : '--'}</Text>
                                                    </View>
                                                )}
                                                <View style={styles.sensorRow}>
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
                                        );
                                    })()}
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
                                    {(() => {
                                        const weatherEntity = allEntities?.find(e => e.entity_id && e.entity_id.startsWith('weather.'));
                                        const outdoorTemp = weatherEntity?.attributes?.temperature ?? null;
                                        const outdoorHumidity = weatherEntity?.attributes?.humidity != null ? Math.round(weatherEntity.attributes.humidity) : null;
                                        const indoorTemp = resolveIndoorTemp();
                                        const indoorHumidity = resolveIndoorHumidity();
                                        return (
                                            <View style={styles.headerStatsRow}>
                                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                                    <Text style={styles.subtitleLabel}>Outdoor</Text>
                                                    <Thermometer size={13} color="rgba(255,255,255,0.7)" />
                                                    <Text style={styles.subtitle}>{outdoorTemp != null ? `${outdoorTemp} °C` : '--'}</Text>
                                                    <Droplets size={13} color="rgba(255,255,255,0.7)" />
                                                    <Text style={styles.subtitle}>{outdoorHumidity != null ? `${outdoorHumidity}%` : '--'}</Text>
                                                </View>
                                                {(indoorTemp != null || indoorHumidity != null) && (
                                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 8 }}>
                                                        <Text style={styles.subtitleLabel}>Indoor</Text>
                                                        <Thermometer size={13} color="rgba(255,255,255,0.7)" />
                                                        <Text style={styles.subtitle}>{indoorTemp != null ? `${indoorTemp} °C` : '--'}</Text>
                                                        <Droplets size={13} color="rgba(255,255,255,0.7)" />
                                                        <Text style={styles.subtitle}>{indoorHumidity != null ? `${indoorHumidity}%` : '--'}</Text>
                                                    </View>
                                                )}
                                                <View style={styles.sensorRow}>
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
                                        );
                                    })()}
                                </View>
                            </View>
                        </View>
                    )}
                </View>
            )}

            <View style={{ flex: 1 }}>
                <ScrollView
                    style={{ flex: 1 }}
                    contentContainerStyle={styles.content}
                    scrollEventThrottle={16}
                    scrollEnabled={scrollEnabled}
                    keyboardShouldPersistTaps="handled"
                    keyboardDismissMode="on-drag"
                >
                    <HaSystemBanner banner={systemHealthBanner} />

                    {areaTabs.length > 0 && activeAreaKey && onSelectArea ? (
                        <RoomAreasNavBar
                            tabs={areaTabs}
                            activeKey={activeAreaKey}
                            onSelect={onSelectArea}
                        />
                    ) : null}

                    {!hasAnyRoomDevices && (
                        <View style={styles.emptyState}>
                            <Text style={styles.emptyText}>No devices in this room.</Text>
                            <Text style={styles.emptySubText}>
                                Assign lights, AC, covers, or other devices to this area in Home Assistant.
                            </Text>
                        </View>
                    )}
                    {showScenesSection && (
                        <View>
                            <View style={styles.roomSectionHeaderRow}>
                                <Text style={styles.roomSectionHeading}>SCENES</Text>
                                {adminUrl && sceneAreaId && (scripts.length > 0 || roomScenesConfigured) && (
                                    <TouchableOpacity
                                        style={styles.roomSectionEditBtn}
                                        onPress={() => setRoomScenesEditVisible(true)}
                                        activeOpacity={0.7}
                                    >
                                        <Edit2 size={12} color="#9199BA" />
                                        <Text style={styles.roomSectionEditText}>Edit</Text>
                                    </TouchableOpacity>
                                )}
                            </View>
                            {displayScripts.length === 0 && !effectiveShowPreferences && !movieModeEntity ? (
                                <View style={styles.scenesEmptyBox}>
                                    <Text style={styles.scenesEmptyText}>
                                        No scenes — tap Edit to add some
                                    </Text>
                                </View>
                            ) : (
                                <View style={styles.grid}>
                                    {/* Movie Mode — uses SceneCard with active border */}
                                    {movieModeEntity && (() => {
                                        const isOn = movieModeEntity.state === 'on';
                                        const label = movieModeEntity.attributes?.friendly_name || 'Movie Mode';
                                        const domain = movieModeEntity.entity_id.startsWith('input_boolean.') ? 'input_boolean' : 'switch';
                                        return (
                                            <View key={movieModeEntity.entity_id} style={{ width: cardWidth }}>
                                                <SceneCard
                                                    id={movieModeEntity.entity_id}
                                                    label={label}
                                                    active={isOn}
                                                    onPress={() => {
                                                        guardedToggle(domain, isOn ? 'turn_off' : 'turn_on', { entity_id: movieModeEntity.entity_id });
                                                    }}
                                                />
                                            </View>
                                        );
                                    })()}
                                    {displayScripts.map(s => {
                                        const scene = { id: s.entity_id, label: s.displayName };
                                        return (
                                            <View key={scene.id} style={{ width: cardWidth }}>
                                                <SceneCard
                                                    id={scene.id}
                                                    label={scene.label}
                                                    onPress={(id) => {
                                                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                                        if (onToggle) onToggle('script', 'turn_on', { entity_id: id });
                                                    }}
                                                />
                                            </View>
                                        );
                                    })}
                                    {effectiveShowPreferences && (
                                        <View style={{ width: cardWidth }}>
                                            <ActivatePreferencesButton
                                                roomName={formatRoomName(room.name)}
                                                onActivate={handleActivatePreferences}
                                                onPreferencesLoaded={setPreferences}
                                            />
                                        </View>
                                    )}
                                </View>
                            )}
                            {adminUrl && sceneAreaId && (
                                <EditScenesModal
                                    visible={roomScenesEditVisible}
                                    onClose={() => setRoomScenesEditVisible(false)}
                                    adminUrl={adminUrl}
                                    scope="room"
                                    areaId={sceneAreaId}
                                    roomScripts={scripts}
                                    initialShowPreferences={
                                        roomShowPreferences !== null
                                            ? roomShowPreferences
                                            : showPreferenceButton
                                    }
                                    onSave={async (ids, opts) => {
                                        setRoomScenesConfigured(true);
                                        setAllowedRoomSceneIds(ids);
                                        if (opts?.show_preferences !== undefined) {
                                            setRoomShowPreferences(opts.show_preferences);
                                            await SecureStore.setItemAsync(
                                                roomScenesPrefsKey(sceneAreaId),
                                                opts.show_preferences ? 'true' : 'false',
                                            );
                                        }
                                    }}
                                />
                            )}
                        </View>
                    )}

                    {/* ── 3. Home Access (locks) ── */}
                    {lockEntities.length > 0 && (
                        <View>
                            <View style={styles.divider} />
                            <View style={styles.roomSectionHeaderRow}>
                                <Text style={styles.roomSectionHeading}>HOME ACCESS</Text>
                            </View>
                            <View style={styles.lockPillsRow}>
                                {lockEntities.map(lock => {
                                    const lockState = lock.stateObj.state;
                                    const lockUnavailable = isBadEntityState(lockState);
                                    const isUnlocked = lockState === 'unlocked' || lockState === 'open';
                                    return (
                                        <View
                                            key={lock.entity_id}
                                            style={[
                                                styles.lockPillCell,
                                                lockEntities.length === 1 && styles.lockPillCellFull,
                                            ]}
                                        >
                                            <LockPill
                                                name={lock.displayName || lock.entity_id}
                                                isUnlocked={isUnlocked}
                                                isLocking={lockState === 'locking'}
                                                isUnlocking={lockState === 'unlocking'}
                                                isPassage={false}
                                                isUnavailable={lockUnavailable}
                                                entityState={lockState}
                                                focusKey={lock.entity_id}
                                                onToggle={() => {
                                                    if (lockUnavailable || !canControlHa) return;
                                                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                                                    guardedToggle('lock', isUnlocked ? 'lock' : 'unlock', { entity_id: lock.entity_id });
                                                }}
                                            />
                                        </View>
                                    );
                                })}
                            </View>
                        </View>
                    )}

                    {useTabletLightsCoversSplit ? (
                        <View>
                            <View style={styles.divider} />
                            <View style={styles.tabletSplitRow}>
                                <View
                                    style={styles.tabletSplitPanel}
                                    onLayout={(e) => {
                                        const w = e.nativeEvent.layout.width;
                                        if (w > 0 && w !== lightsPanelWidth) setLightsPanelWidth(w);
                                    }}
                                >
                                    <ScrollView
                                        style={styles.tabletSplitScroll}
                                        contentContainerStyle={styles.tabletSplitScrollContent}
                                        showsVerticalScrollIndicator={false}
                                        nestedScrollEnabled
                                        scrollEnabled={scrollEnabled}
                                        keyboardShouldPersistTaps="handled"
                                    >
                                        {lightsAndFansSection}
                                    </ScrollView>
                                </View>
                                <View style={styles.tabletSplitDivider} />
                                <View
                                    style={styles.tabletSplitPanel}
                                    onLayout={(e) => {
                                        const w = e.nativeEvent.layout.width;
                                        if (w > 0 && w !== coversPanelWidth) setCoversPanelWidth(w);
                                    }}
                                >
                                    <ScrollView
                                        style={styles.tabletSplitScroll}
                                        contentContainerStyle={styles.tabletSplitScrollContent}
                                        showsVerticalScrollIndicator={false}
                                        nestedScrollEnabled
                                        scrollEnabled={scrollEnabled}
                                        keyboardShouldPersistTaps="handled"
                                    >
                                        {coversSection}
                                    </ScrollView>
                                </View>
                            </View>
                        </View>
                    ) : (
                        <>
                            {hasLightsBlock && (
                                <>
                                    <View style={styles.divider} />
                                    {lightsAndFansSection}
                                </>
                            )}
                        </>
                    )}

                    {/* ── 4. Cameras ── */}
                    {visibleRoomCameras.length > 0 && (
                        <View>
                            <View style={styles.divider} />
                            <Text style={styles.roomSectionHeading}>CAMERAS</Text>
                            <View style={styles.grid}>
                                {visibleRoomCameras.map(cam => {
                                    const stateObj = cam.stateObj || {};
                                    const attrs = stateObj.attributes || {};
                                    const name = formatCameraName(
                                        attrs.friendly_name || cam.displayName || cam.entity_id,
                                    );
                                    const pictureUrl = attrs.entity_picture
                                        ? `${(haUrl || '').replace(/\/$/, '')}${attrs.entity_picture}`
                                        : null;
                                    const isUnavailable = stateObj.state === 'unavailable';
                                    const cameraName = cam.entity_id.replace('camera.', '');
                                    const motionEntityId = `binary_sensor.${cameraName}`;
                                    const motionSensor = allEntities?.find(e => e.entity_id === motionEntityId);
                                    const hasMotion = motionSensor?.state === 'on';
                                    return (
                                        <View key={cam.entity_id} style={{ width: cardWidth }}>
                                            <View style={styles.cameraCard}>
                                                {pictureUrl && !isUnavailable ? (
                                                    <Image
                                                        source={{ uri: pictureUrl, headers: { Authorization: `Bearer ${haToken}` } }}
                                                        style={styles.cameraThumb}
                                                        resizeMode="cover"
                                                    />
                                                ) : (
                                                    <View style={[styles.cameraThumb, styles.cameraThumbPlaceholder]}>
                                                        <Text style={styles.cameraOffText}>{isUnavailable ? 'Unavailable' : 'No feed'}</Text>
                                                    </View>
                                                )}
                                                <View style={styles.cameraGradientOverlay} />
                                                {!isUnavailable && (
                                                    <View style={styles.cameraLiveBadge}>
                                                        <View style={styles.cameraLiveDot} />
                                                    </View>
                                                )}
                                                {hasMotion && (
                                                    <View style={styles.cameraMotionBadge}>
                                                        <Text style={styles.cameraMotionText}>MOTION</Text>
                                                    </View>
                                                )}
                                                <Text style={styles.cameraCardName} numberOfLines={1}>{name}</Text>
                                            </View>
                                        </View>
                                    );
                                })}
                            </View>
                        </View>
                    )}

                    {/* ── 5. Covers (stacked layout only — tablet split renders above) ── */}
                    {!useTabletLightsCoversSplit && hasCoversBlock && (
                        <View>
                            <View style={styles.divider} />
                            {coversSection}
                        </View>
                    )}

                    {/* ── 6. Climate (group card — same shell as lights / covers) ── */}
                    {climates.length > 0 && (
                        <View>
                            <View style={styles.divider} />
                            <ClimateGroupCard
                                climates={climates}
                                variant={useTabletLightsCoversSplit ? 'tabletSplit' : 'default'}
                                checkNeedsChange={checkNeedsChange}
                                onUpdate={(id, domain, service, data) => {
                                    if (onToggle) {
                                        return onToggle(domain, service, { entity_id: id, ...data });
                                    }
                                }}
                            />
                        </View>
                    )}

                    {/* ── 7. Media ── */}
                    {(medias.length > 0 || musicMedias.length > 0) && (() => {
                        const rootRows = medias
                            .filter(m => {
                                const map = mediaMappings.find(x => x.entity_id === m.entity_id);
                                return !map || !map.parentId;
                            })
                            .map(media => {
                                const map = mediaMappings.find(x => x.entity_id === media.entity_id);
                                const children = medias.filter(c => {
                                    const cm = mediaMappings.find(x => x.entity_id === c.entity_id);
                                    return cm && cm.parentId === media.entity_id;
                                });
                                return { media, mapping: map, children };
                            });

                        const musicRoots = musicMedias
                            .filter(m => {
                                const map = mediaMappings.find(x => x.entity_id === m.entity_id);
                                return !map || !map.parentId;
                            })
                            .map(media => {
                                const map = mediaMappings.find(x => x.entity_id === media.entity_id);
                                const children = musicMedias.filter(c => {
                                    const cm = mediaMappings.find(x => x.entity_id === c.entity_id);
                                    return cm && cm.parentId === media.entity_id;
                                });
                                return { media, mapping: map, children };
                            });

                        if (rootRows.length === 0 && musicRoots.length === 0) return null;

                        return (
                            <View style={{ marginBottom: 20, marginTop: 12 }}>
                                <View style={styles.mediaSectionPanel}>
                                    <View style={styles.mediaSectionWrap}>
                                        <View style={styles.mediaSectionHeader}>
                                            <RoomGroupIconButton
                                                accessibilityLabel="Media section"
                                            >
                                                <Monitor
                                                    size={ROOM_GROUP_ICON_GLYPH_SIZE}
                                                    color="#fff"
                                                    strokeWidth={1.5}
                                                />
                                            </RoomGroupIconButton>
                                            <Text style={styles.mediaSectionTitle}>Media</Text>
                                        </View>
                                        {rootRows.map(row => (
                                            <MediaCard
                                                key={row.media.entity_id}
                                                player={row.media}
                                                childPlayers={row.children}
                                                roomPlayers={medias}
                                                mapping={row.mapping}
                                                mediaMappings={mediaMappings}
                                                needsChange={checkNeedsChange(row.media.entity_id)}
                                                onUpdate={(id, domain, service, data) => {
                                                    if (onToggle) {
                                                        return onToggle(domain, service, { entity_id: id, ...data });
                                                    }
                                                }}
                                                adminUrl={adminUrl}
                                                haUrl={haUrl}
                                                haToken={haToken}
                                                onShowSourceOverlay={setSourceOverlay}
                                                onShowVolumeOverlay={setVolumeOverlay}
                                            />
                                        ))}
                                        {musicRoots.map(row => (
                                            <MusicMediaCard
                                                key={row.media.entity_id}
                                                player={row.media}
                                                childPlayers={row.children}
                                                speakerPeers={musicMedias.filter(
                                                    m => m.entity_id !== row.media.entity_id
                                                )}
                                                mapping={row.mapping}
                                                mediaMappings={mediaMappings}
                                                needsChange={checkNeedsChange(row.media.entity_id)}
                                                onUpdate={(id, domain, service, data) =>
                                                    onToggle?.(domain, service, { entity_id: id, ...data })
                                                }
                                                adminUrl={adminUrl}
                                                haUrl={haUrl}
                                                haToken={haToken}
                                                onShowSourceOverlay={setSourceOverlay}
                                                musicAssistantEntryIds={musicAssistantEntryIds}
                                                browseMedia={browseMedia}
                                                callServiceWithResponse={callServiceWithResponse}
                                            />
                                        ))}
                                    </View>
                                </View>
                            </View>
                        );
                    })()}

                    {/* ── 9. Switches — temporarily hidden ── */}
                    {/*
                    {visibleSwitches.length > 0 && (
                        <View>
                            <View style={styles.divider} />
                            <Text style={styles.roomSectionHeading}>SWITCHES</Text>
                            <View style={styles.grid}>
                                {visibleSwitches.map(sw => (
                                    <View key={sw.entity_id} style={{ width: cardWidth }}>
                                        <SwitchCard
                                            switchEntity={sw}
                                            needsChange={checkNeedsChange(sw.entity_id)}
                                            onToggle={(id) => {
                                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                                if (onToggle) onToggle('switch', 'toggle', { entity_id: id });
                                            }}
                                        />
                                    </View>
                                ))}
                            </View>
                        </View>
                    )}
                    */}

                    {/* ── 11. Automations — at the end ── */}
                    {automations.length > 0 && (
                        <View style={styles.automationSection}>
                            <View style={styles.divider} />
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

                    <View style={{ height: 40 }} />
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
                        <Text style={styles.overlayTitle}>{sourceOverlay.title || 'Select Source'}</Text>
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
        ...Heading.lg24,
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
        ...Heading.xl,
        color: '#fff',
        marginBottom: 4,
    },
    subtitle: {
        ...Heading.sub,
        color: 'rgba(255,255,255,0.7)',
    },
    subtitleLabel: {
        ...Heading.sub,
        color: 'rgba(255,255,255,0.5)',
        fontWeight: '600',
        marginRight: 2,
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
    tabletSplitRow: {
        flexDirection: 'row',
        alignItems: 'stretch',
        minHeight: 280,
        gap: 0,
    },
    tabletSplitPanel: {
        flex: 1,
        minWidth: 0,
        backgroundColor: '#13132A',
        borderRadius: 20,
        overflow: 'hidden',
    },
    tabletSplitScroll: {
        flex: 1,
    },
    tabletSplitScrollContent: {
        flexGrow: 1,
        padding: 14,
        paddingBottom: 10,
    },
    tabletSplitDivider: {
        width: 1,
        backgroundColor: 'rgba(255,255,255,0.08)',
        marginHorizontal: 10,
    },
    /** Whole Media block — outer surface; inner TV UI stays `#09091A` in `MediaCard` */
    mediaSectionPanel: {
        backgroundColor: '#13132A',
        borderRadius: 22,
        padding: 16,
    },
    mediaSectionWrap: {
        gap: 12,
    },
    mediaSectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginBottom: 4,
    },
    mediaSectionTitle: {
        color: '#fff',
        fontSize: 17,
        fontFamily: CF.semibold,
        letterSpacing: 0.2,
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
        width: 44,
        height: 44,
        borderRadius: 22,
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
        fontFamily: CF.semibold,
        marginBottom: 2,
    },
    lightState: {
        color: Colors.textDim,
        fontSize: 13,
        fontFamily: CF.medium,
    },
    emptyState: {
        alignItems: 'center',
        paddingVertical: 60,
        gap: 12,
    },
    emptyText: {
        color: Colors.textDim,
        fontSize: 16,
        textAlign: 'center',
    },
    emptySubText: {
        color: 'rgba(255,255,255,0.35)',
        fontSize: 13,
        textAlign: 'center',
        paddingHorizontal: 24,
        lineHeight: 18,
    },
    sectionTitle: {
        ...Heading.section,
        color: Colors.text,
        marginBottom: 12,
    },
    roomSectionHeaderRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 12,
        marginHorizontal: 2,
    },
    roomSectionHeading: {
        color: '#9199BA',
        fontSize: 12,
        fontFamily: CF.semibold,
        letterSpacing: 1.4,
    },
    roomSectionEditBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    roomSectionEditText: {
        color: '#9199BA',
        fontSize: 12,
        fontFamily: CF.semibold,
        letterSpacing: 1.4,
    },
    scenesEmptyBox: {
        padding: 20,
        alignItems: 'center',
        backgroundColor: '#12132a',
        borderRadius: 14,
        borderWidth: 1,
        borderColor: '#212136',
        marginBottom: 8,
    },
    scenesEmptyText: {
        color: 'rgba(237,237,245,0.35)',
        fontSize: 13,
        fontStyle: 'italic',
    },
    // ── Camera cards ──
    cameraCard: {
        borderRadius: 14,
        overflow: 'hidden',
        backgroundColor: '#1a1a2e',
        aspectRatio: 16 / 9,
        position: 'relative',
        marginBottom: 4,
    },
    cameraThumb: {
        width: '100%',
        height: '100%',
    },
    cameraThumbPlaceholder: {
        backgroundColor: '#0f0f1a',
        justifyContent: 'center',
        alignItems: 'center',
    },
    cameraOffText: {
        color: 'rgba(255,255,255,0.3)',
        fontSize: 12,
    },
    cameraGradientOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'transparent',
    },
    cameraLiveBadge: {
        position: 'absolute',
        top: 7,
        right: 7,
        backgroundColor: 'rgba(244,67,54,0.85)',
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 5,
    },
    cameraLiveDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#fff',
    },
    cameraMotionBadge: {
        position: 'absolute',
        top: 7,
        left: 7,
        backgroundColor: 'rgba(255,193,7,0.9)',
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 5,
    },
    cameraMotionText: {
        color: '#000',
        fontSize: 9,
        fontWeight: '700',
        letterSpacing: 0.5,
    },
    cameraCardName: {
        position: 'absolute',
        bottom: 7,
        left: 9,
        right: 9,
        color: '#fff',
        fontSize: 12,
        fontWeight: '600',
        textShadowColor: 'rgba(0,0,0,0.8)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 3,
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
    // ── LockPill row (HomeAccess-style pills below scenes) ──
    lockPillsRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 10,
        marginBottom: 4,
    },
    lockPillCell: {
        width: '48%',
    },
    lockPillCellFull: {
        width: '100%',
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
    // QuickScenes exact styles copied from QuickScenes.jsx modal.row definitions
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.03)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
        borderRadius: 14,
        paddingHorizontal: 16,
        paddingVertical: 14,
        marginBottom: 8,
    },
    rowSelected: {
        backgroundColor: 'rgba(137,71,202,0.08)',
        borderColor: 'rgba(137,71,202,0.35)',
    },
    rowLabel: {
        flex: 1,
        color: '#ededf5',
        fontSize: 14,
        fontFamily: CF.medium,
        letterSpacing: 0.1,
    },
    checkCircle: {
        width: 24,
        height: 24,
        borderRadius: 12,
        borderWidth: 1.5,
        borderColor: 'rgba(255,255,255,0.2)',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'transparent',
    },
    checkCircleOn: {
        backgroundColor: '#8947ca',
        borderColor: '#8947ca',
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
        ...Heading.section,
        color: '#fff',
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
    prefButtonContainer: {
        alignItems: 'stretch',
        marginTop: 10,
        marginBottom: 20,
        width: '100%',
    },
});
