import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { BlurView } from 'expo-blur';
import { Power, Flame, Snowflake, Fan, ChevronUp, ChevronDown, Droplets, Wind, Zap } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { Colors } from '../../constants/Colors';

export default function ClimateCard({ climate, onUpdate, needsChange }) {
    if (!climate) return null;

    const { attributes, state } = climate.stateObj;
    const currentTemp = attributes.current_temperature;
    const targetTemp = attributes.temperature;
    const humidity = attributes.humidity;
    const hvacMode = state;
    const hvacModes = attributes.hvac_modes || [];
    const fanModes = attributes.fan_modes || [];
    const currentFanMode = attributes.fan_mode;

    // Check if ON (anything other than off)
    const isOn = hvacMode !== 'off';
    const activeColor = '#8947ca';

    // Filter out 'off' for the mode buttons list
    const availableModes = hvacModes.filter(mode => mode !== 'off');

    const handlePower = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        if (isOn) {
            onUpdate(climate.entity_id, 'climate', 'set_hvac_mode', { hvac_mode: 'off' });
        } else {
            // Restore last mode logic
            const lastMode = attributes.last_on_operation;
            const targetMode = (lastMode && hvacModes.includes(lastMode) && lastMode !== 'off')
                ? lastMode
                : (availableModes[0] || 'heat');
            onUpdate(climate.entity_id, 'climate', 'set_hvac_mode', { hvac_mode: targetMode });
        }
    };

    const handleModeSelect = (mode) => {
        Haptics.selectionAsync();
        onUpdate(climate.entity_id, 'climate', 'set_hvac_mode', { hvac_mode: mode });
    };

    const handleFanSpeed = () => {
        Haptics.selectionAsync();
        if (!fanModes.length) return;

        let currentIndex = fanModes.indexOf(currentFanMode);
        let nextIndex = currentIndex + 1;
        if (nextIndex >= fanModes.length) nextIndex = 0;

        onUpdate(climate.entity_id, 'climate', 'set_fan_mode', { fan_mode: fanModes[nextIndex] });
    };

    const handleTempChange = (delta) => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        if (targetTemp === null || targetTemp === undefined) return;
        const newTemp = targetTemp + delta;
        onUpdate(climate.entity_id, 'climate', 'set_temperature', { temperature: newTemp });
    };

    const getModeIcon = (mode, isActive) => {
        // Active = Purple, Inactive = Grey. No background fill.
        const color = isActive ? activeColor : Colors.textDim;
        const size = 20;
        switch (mode) {
            case 'heat': return <Flame size={size} color={color} />;
            case 'cool': return <Snowflake size={size} color={color} />;
            case 'dry': return <Droplets size={size} color={color} />;
            case 'fan_only': return <Wind size={size} color={color} />;
            case 'auto': return <Zap size={size} color={color} />;
            default: return <Text style={{ color: color, fontWeight: 'bold', fontSize: 10 }}>{mode.slice(0, 2).toUpperCase()}</Text>;
        }
    };

    const formatTemp = (t) => (t !== null && t !== undefined) ? `${t}°` : '--';

    // Show Current Temp if known, else Target Temp
    const displayTemp = currentTemp !== null ? currentTemp : targetTemp;
    const isShowingTargetAsMain = currentTemp === null && targetTemp !== null;

    return (
        <View style={[
            styles.container,
            needsChange && { borderColor: '#8947ca', borderWidth: 2 }
        ]}>
            {/* Left Side: Status */}
            <View style={styles.leftSide}>
                <View style={styles.tempRow}>
                    <Text style={styles.currentTemp}>{formatTemp(displayTemp)}</Text>
                    {isShowingTargetAsMain && <Text style={styles.label}>Set</Text>}
                    {humidity && <Text style={styles.humidity}>{humidity}%</Text>}
                </View>
                <Text style={styles.roomName} numberOfLines={1}>{climate.displayName}</Text>

                {/* Active Mode/Fan Details */}
                <Text style={styles.statusText} numberOfLines={1}>
                    {isOn ? hvacMode.toUpperCase().replace('_', ' ') : 'OFF'}
                    {isOn && currentFanMode ? ` • ${currentFanMode.toUpperCase()}` : ''}
                </Text>
            </View>

            {/* Right Side: Controls */}
            {/* Using justifyContent flex-end to push to right, and flex to separate from left */}
            <View style={styles.controlsArea}>

                {/* 1. Power Button (Always visible) */}
                <TouchableOpacity
                    style={[styles.powerBtn, isOn && { backgroundColor: activeColor, borderColor: activeColor }]}
                    onPress={handlePower}
                >
                    <Power size={20} color={isOn ? "#fff" : Colors.textDim} />
                </TouchableOpacity>

                {isOn && (
                    <>
                        {/* 2. Middle Controls (Modes + Fan) */}
                        <View style={styles.middleControls}>
                            {/* Modes */}
                            {availableModes.map((mode) => {
                                const isModeActive = hvacMode === mode;
                                return (
                                    <TouchableOpacity
                                        key={mode}
                                        style={styles.modeBtn}
                                        onPress={() => handleModeSelect(mode)}
                                    >
                                        {getModeIcon(mode, isModeActive)}
                                    </TouchableOpacity>
                                );
                            })}

                            {/* Divider if we have Fan Modes */}
                            {fanModes.length > 0 && <View style={styles.separator} />}

                            {/* Fan Logic: Button to cycle active fan mode */}
                            {fanModes.length > 0 && (
                                <TouchableOpacity
                                    style={styles.modeBtn}
                                    onPress={handleFanSpeed}
                                >
                                    {/* Icon color highlights if fan_only, but fan speed is property of all modes usually. 
                                        Let's just keep it dim unless specific condition, or always dim? 
                                        User asked for curve color option, so lets make it purple if fan mode is set? 
                                        No, just static icon for cycling is standard unless 'fan_only' mode. 
                                    */}
                                    <Fan size={20} color={Colors.textDim} />
                                </TouchableOpacity>
                            )}
                        </View>

                        {/* 3. Temp Control (Far Right) */}
                        <View style={styles.tempControlPill}>
                            <TouchableOpacity
                                style={styles.tempBtn}
                                onPress={() => handleTempChange(1)}
                            >
                                <ChevronUp size={20} color="#fff" />
                            </TouchableOpacity>

                            {/* Raw number only, no degree symbol as requested */}
                            <Text style={styles.targetTemp}>{targetTemp}</Text>

                            <TouchableOpacity
                                style={styles.tempBtn}
                                onPress={() => handleTempChange(-1)}
                            >
                                <ChevronDown size={20} color="#fff" />
                            </TouchableOpacity>
                        </View>
                    </>
                )}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        width: '100%',
        height: 110,
        backgroundColor: 'rgba(30, 30, 40, 0.95)',
        borderRadius: 24,
        flexDirection: 'row',
        paddingHorizontal: 20,
        alignItems: 'center',
        justifyContent: 'space-between', // Push Left/Right apart
        marginTop: 10,
        borderWidth: 0, // Default no border
    },
    leftSide: {
        flex: 1, // Allow text to take space
        justifyContent: 'center',
        marginRight: 10, // Avoid touching controls
    },
    tempRow: {
        flexDirection: 'row',
        alignItems: 'baseline',
        gap: 8,
    },
    currentTemp: {
        fontSize: 36,
        fontWeight: '300',
        color: '#fff',
    },
    label: {
        fontSize: 12,
        color: Colors.textDim,
        alignSelf: 'flex-start',
        marginTop: 6
    },
    humidity: {
        fontSize: 14,
        color: Colors.textDim,
    },
    roomName: {
        fontSize: 14,
        color: Colors.textDim,
        marginTop: 4,
    },
    statusText: {
        fontSize: 10,
        color: 'rgba(255,255,255,0.4)',
        marginTop: 2,
        fontWeight: 'bold',
        letterSpacing: 1
    },
    controlsArea: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        // Removes specific maxWidth to allow flex layout to handle overflow naturally or wrap if strictly needed,
        // but here row is best.
    },
    powerBtn: {
        width: 44,
        height: 44,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)'
    },
    middleControls: {
        flexDirection: 'row',
        backgroundColor: 'rgba(0,0,0,0.3)',
        borderRadius: 14,
        padding: 4,
        gap: 2,
        alignItems: 'center',
    },
    modeBtn: {
        width: 36,
        height: 36,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
    },
    separator: {
        width: 1,
        height: 20,
        backgroundColor: 'rgba(255,255,255,0.1)',
        marginHorizontal: 2
    },
    tempControlPill: {
        width: 48,
        backgroundColor: 'rgba(255,255,255,0.1)',
        borderRadius: 24,
        paddingVertical: 6,
        alignItems: 'center',
        justifyContent: 'space-between',
        height: 80, // Fixed height specifically for alignment
    },
    tempBtn: {
        width: 48,
        height: 28,
        alignItems: 'center',
        justifyContent: 'center', // Fixes arrow alignment
    },
    targetTemp: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#fff',
        textAlign: 'center', // Ensures number is centered
    }
});
