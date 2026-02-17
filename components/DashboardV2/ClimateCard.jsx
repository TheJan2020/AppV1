import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Flame, Snowflake, Fan, Droplets, Wind, Zap, Minus, Plus, MoreVertical, Moon, Leaf, HeartPulse, AirVent, PowerOff, ChevronUp } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { Colors } from '../../constants/Colors';
import { useState } from 'react';

const getModeIcon = (mode, size, color) => {
    switch (mode) {
        case 'heat': return <Flame size={size} color={color} />;
        case 'cool': return <Snowflake size={size} color={color} />;
        case 'dry': return <Droplets size={size} color={color} />;
        case 'fan_only': return <Fan size={size} color={color} />;
        case 'auto': return <Zap size={size} color={color} />;
        case 'heat_cool': return <Flame size={size} color={color} />;
        case 'humid': return <Droplets size={size} color={color} />;
        default: return <Text style={{ color, fontWeight: 'bold', fontSize: 12 }}>{mode.slice(0, 3).toUpperCase()}</Text>;
    }
};

const getModeLabel = (mode) => {
    switch (mode) {
        case 'heat': return 'Heat';
        case 'cool': return 'Cool';
        case 'dry': return 'Dry';
        case 'fan_only': return 'Fan';
        case 'auto': return 'Auto';
        case 'heat_cool': return 'Auto';
        case 'humid': return 'Humid';
        default: return mode.charAt(0).toUpperCase() + mode.slice(1).replace('_', ' ');
    }
};

const getPresetIcon = (preset, size, color) => {
    const lower = preset.toLowerCase();
    if (lower.includes('silent') || lower.includes('sleep') || lower.includes('quiet')) return <Moon size={size} color={color} />;
    if (lower.includes('eco') || lower.includes('energy')) return <Leaf size={size} color={color} />;
    if (lower.includes('health') || lower.includes('comfort')) return <HeartPulse size={size} color={color} />;
    if (lower.includes('wind') || lower.includes('breeze')) return <AirVent size={size} color={color} />;
    if (lower.includes('boost') || lower.includes('turbo') || lower.includes('power')) return <Zap size={size} color={color} />;
    return <Text style={{ color, fontWeight: 'bold', fontSize: 12 }}>{preset.slice(0, 3).toUpperCase()}</Text>;
};

const getFanIcon = (fanMode, size, color) => {
    const lower = fanMode.toLowerCase();
    if (lower === 'auto') return <Zap size={size} color={color} />;
    if (lower === 'low' || lower === 'quiet' || lower === 'silent' || lower === 'sleep') return <Wind size={size} color={color} />;
    if (lower === 'medium' || lower === 'mid' || lower === 'middle') return <AirVent size={size} color={color} />;
    if (lower === 'high' || lower === 'strong' || lower === 'turbo') return <Fan size={size} color={color} />;
    if (lower === 'diffuse') return <Droplets size={size} color={color} />;
    return <Wind size={size} color={color} />;
};

const getFanLabel = (fanMode) => {
    return fanMode.charAt(0).toUpperCase() + fanMode.slice(1).replace('_', ' ');
};

const getModeColor = (mode) => {
    switch (mode) {
        case 'heat': return '#FF7043';
        case 'cool': return '#42A5F5';
        case 'dry': return '#FFA726';
        case 'fan_only': return '#66BB6A';
        case 'auto': return '#AB47BC';
        case 'heat_cool': return '#AB47BC';
        case 'humid': return '#29B6F6';
        default: return '#8947ca';
    }
};

export default function ClimateCard({ climate, onUpdate, needsChange }) {
    const [expanded, setExpanded] = useState(false);

    if (!climate) return null;

    const { attributes, state } = climate.stateObj;
    const targetTemp = attributes.temperature;
    const hvacMode = state;
    const hvacModes = attributes.hvac_modes || [];
    const fanModes = attributes.fan_modes || [];
    const currentFanMode = attributes.fan_mode;
    const presetModes = (attributes.preset_modes || []).filter(p => p !== 'none');
    const currentPreset = attributes.preset_mode;

    const isOn = hvacMode !== 'off';
    const availableModes = hvacModes.filter(mode => mode !== 'off');

    const toggleExpanded = () => {
        setExpanded(prev => !prev);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    };

    const handlePower = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        if (isOn) {
            onUpdate(climate.entity_id, 'climate', 'set_hvac_mode', { hvac_mode: 'off' });
        } else {
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

    const handleFanSelect = (fanMode) => {
        Haptics.selectionAsync();
        onUpdate(climate.entity_id, 'climate', 'set_fan_mode', { fan_mode: fanMode });
    };

    const handlePresetSelect = (preset) => {
        Haptics.selectionAsync();
        const newPreset = currentPreset === preset ? 'none' : preset;
        onUpdate(climate.entity_id, 'climate', 'set_preset_mode', { preset_mode: newPreset });
    };

    const handleTempChange = (delta) => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        if (targetTemp === null || targetTemp === undefined) return;
        const newTemp = targetTemp + delta;
        onUpdate(climate.entity_id, 'climate', 'set_temperature', { temperature: newTemp });
    };

    const activeIcon = isOn ? getModeIcon(hvacMode, 28, '#fff') : <PowerOff size={28} color={Colors.textDim} />;
    const modeRingColor = isOn ? getModeColor(hvacMode) : 'transparent';

    return (
        <View style={[
            styles.container,
            needsChange && { borderColor: '#8947ca', borderWidth: 2 }
        ]}>
            {/* Top Row: Icon + Name/State + Temp Control */}
            <View style={styles.topRow}>
                <TouchableOpacity
                    style={[
                        styles.iconCircle,
                        isOn && { borderWidth: 2.5, borderColor: modeRingColor }
                    ]}
                    onPress={handlePower}
                >
                    {activeIcon}
                </TouchableOpacity>

                <View style={styles.nameArea}>
                    <Text style={styles.name} numberOfLines={1}>{climate.displayName}</Text>
                    <Text style={styles.state}>
                        {isOn ? getModeLabel(hvacMode) : 'Off'}
                    </Text>
                </View>

                <View style={styles.tempPill}>
                    <TouchableOpacity style={styles.tempPillBtn} onPress={() => handleTempChange(-1)}>
                        <Minus size={18} color="#fff" />
                    </TouchableOpacity>
                    <Text style={styles.tempText}>
                        {targetTemp !== null && targetTemp !== undefined ? `${targetTemp}°` : '--'}
                    </Text>
                    <TouchableOpacity style={styles.tempPillBtn} onPress={() => handleTempChange(1)}>
                        <Plus size={18} color="#fff" />
                    </TouchableOpacity>
                </View>
            </View>

            {/* Bottom Row: Fan Speed Buttons + More */}
            {isOn && (
                <View style={styles.bottomRow}>
                    <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.fanRow}
                        style={styles.fanScroll}
                    >
                        {fanModes.map(fm => {
                            const isActive = currentFanMode === fm;
                            return (
                                <TouchableOpacity
                                    key={fm}
                                    style={styles.fanItem}
                                    onPress={() => handleFanSelect(fm)}
                                >
                                    <View style={[
                                        styles.fanCircle,
                                        isActive && styles.fanCircleActive
                                    ]}>
                                        {getFanIcon(fm, 22, isActive ? '#fff' : Colors.textDim)}
                                    </View>
                                    <Text style={[
                                        styles.fanLabel,
                                        isActive && styles.fanLabelActive
                                    ]}>
                                        {getFanLabel(fm)}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </ScrollView>

                    <TouchableOpacity style={styles.moreBtn} onPress={toggleExpanded}>
                        {expanded
                            ? <ChevronUp size={22} color={Colors.textDim} />
                            : <MoreVertical size={22} color={Colors.textDim} />
                        }
                    </TouchableOpacity>
                </View>
            )}

            {/* Expanded Inline Section */}
            {isOn && expanded && (
                <View style={styles.expandedSection}>
                    {/* Mode */}
                    <View style={styles.expandedDivider} />
                    <Text style={styles.expandedTitle}>Mode</Text>
                    <View style={styles.expandedIconRow}>
                        {availableModes.map(mode => {
                            const isActive = hvacMode === mode;
                            return (
                                <TouchableOpacity
                                    key={mode}
                                    style={styles.expandedIconItem}
                                    onPress={() => handleModeSelect(mode)}
                                >
                                    <View style={[
                                        styles.expandedIconCircle,
                                        isActive && styles.expandedIconCircleActive
                                    ]}>
                                        {getModeIcon(mode, 24, isActive ? '#000' : Colors.textDim)}
                                    </View>
                                    <Text style={[
                                        styles.expandedIconLabel,
                                        isActive && styles.expandedIconLabelActive
                                    ]}>
                                        {getModeLabel(mode)}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>

                    {/* Custom Features */}
                    {presetModes.length > 0 && (
                        <>
                            <View style={styles.expandedDivider} />
                            <Text style={styles.expandedTitle}>Custom features</Text>
                            <View style={styles.expandedIconRow}>
                                {presetModes.map(preset => {
                                    const isActive = currentPreset === preset;
                                    return (
                                        <TouchableOpacity
                                            key={preset}
                                            style={styles.expandedIconItem}
                                            onPress={() => handlePresetSelect(preset)}
                                        >
                                            <View style={[
                                                styles.expandedIconCircle,
                                                isActive && styles.expandedIconCircleActive
                                            ]}>
                                                {getPresetIcon(preset, 24, isActive ? '#000' : Colors.textDim)}
                                            </View>
                                            <Text style={[
                                                styles.expandedIconLabel,
                                                isActive && styles.expandedIconLabelActive
                                            ]}>
                                                {preset.charAt(0).toUpperCase() + preset.slice(1)}
                                            </Text>
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>
                        </>
                    )}

                    {/* Close button */}
                    <TouchableOpacity style={styles.collapseBtn} onPress={toggleExpanded}>
                        <ChevronUp size={20} color={Colors.textDim} />
                    </TouchableOpacity>
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    // ── Main Card ──
    container: {
        width: '100%',
        backgroundColor: 'rgba(30, 30, 40, 0.95)',
        borderRadius: 24,
        padding: 18,
        marginTop: 10,
        overflow: 'hidden',
    },
    topRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    iconCircle: {
        width: 52,
        height: 52,
        borderRadius: 26,
        backgroundColor: 'rgba(255,255,255,0.08)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    nameArea: {
        flex: 1,
        justifyContent: 'center',
    },
    name: {
        fontSize: 17,
        fontWeight: '600',
        color: '#fff',
    },
    state: {
        fontSize: 13,
        color: Colors.textDim,
        marginTop: 2,
    },
    tempPill: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.1)',
        borderRadius: 22,
        height: 44,
        paddingHorizontal: 4,
        gap: 2,
    },
    tempPillBtn: {
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
    },
    tempText: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#fff',
        minWidth: 44,
        textAlign: 'center',
    },

    // ── Bottom Row (Fan Speeds + More) ──
    bottomRow: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        marginTop: 16,
    },
    fanScroll: {
        flex: 1,
        marginRight: 4,
    },
    fanRow: {
        flexDirection: 'row',
        gap: 16,
    },
    fanItem: {
        alignItems: 'center',
        gap: 6,
    },
    fanCircle: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: 'rgba(255,255,255,0.08)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    fanCircleActive: {
        backgroundColor: '#8947ca',
    },
    fanLabel: {
        fontSize: 11,
        color: Colors.textDim,
        fontWeight: '500',
    },
    fanLabelActive: {
        color: '#fff',
    },
    moreBtn: {
        width: 40,
        height: 40,
        alignItems: 'center',
        justifyContent: 'center',
    },

    // ── Expanded Inline Section ──
    expandedSection: {
        marginTop: 4,
    },
    expandedDivider: {
        height: 1,
        backgroundColor: 'rgba(255,255,255,0.08)',
        marginVertical: 16,
    },
    expandedTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: '#fff',
        marginBottom: 12,
    },
    expandedIconRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 16,
    },
    expandedIconItem: {
        alignItems: 'center',
        gap: 6,
    },
    expandedIconCircle: {
        width: 52,
        height: 52,
        borderRadius: 26,
        backgroundColor: 'rgba(255,255,255,0.08)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    expandedIconCircleActive: {
        backgroundColor: '#fff',
    },
    expandedIconLabel: {
        fontSize: 11,
        color: Colors.textDim,
        fontWeight: '500',
    },
    expandedIconLabelActive: {
        color: '#fff',
        fontWeight: '600',
    },
    collapseBtn: {
        alignSelf: 'center',
        marginTop: 16,
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.08)',
        alignItems: 'center',
        justifyContent: 'center',
    },
});
