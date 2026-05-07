import { View, Text, StyleSheet, TouchableOpacity, Switch, ScrollView } from 'react-native';
import {
    Wind, Flame, Snowflake, Fan, Zap, Droplets, Minus, Plus,
    ChevronDown, ChevronUp, Clock, Moon, Leaf, HeartPulse, AirVent,
} from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useState, useEffect, useRef } from 'react';
import { CF } from '../../utils/typography';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MODE_META = {
    cool:      { label: 'Cool',  Icon: Snowflake, color: '#44C8CA' },
    heat:      { label: 'Heat',  Icon: Flame,     color: '#FF7043' },
    auto:      { label: 'Auto',  Icon: Zap,       color: '#AB47BC' },
    heat_cool: { label: 'Auto',  Icon: Zap,       color: '#AB47BC' },
    fan_only:  { label: 'Fan',   Icon: Fan,       color: '#66BB6A' },
    dry:       { label: 'Dry',   Icon: Droplets,  color: '#FFA726' },
};

const getMeta = (mode) => MODE_META[mode] || { label: mode, Icon: Wind, color: '#8947ca' };
const getFanLabel = (f) => f.charAt(0).toUpperCase() + f.slice(1).replace(/_/g, ' ');

const getPresetIcon = (preset, size, color) => {
    const p = preset.toLowerCase();
    if (p.includes('eco') || p.includes('energy'))                         return <Leaf       size={size} color={color} />;
    if (p.includes('silent') || p.includes('sleep') || p.includes('quiet')) return <Moon      size={size} color={color} />;
    if (p.includes('health') || p.includes('comfort'))                     return <HeartPulse size={size} color={color} />;
    if (p.includes('wind') || p.includes('breeze'))                        return <AirVent    size={size} color={color} />;
    if (p.includes('boost') || p.includes('turbo') || p.includes('power')) return <Zap       size={size} color={color} />;
    return <Wind size={size} color={color} />;
};

const pad = (n) => String(n).padStart(2, '0');

// ─── Spinner ──────────────────────────────────────────────────────────────────
function TimeSpinner({ value, max, onChange, label }) {
    return (
        <View style={sp.wrap}>
            <TouchableOpacity style={sp.arrowBtn} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onChange((value + 1) % (max + 1)); }}>
                <ChevronUp size={20} color="#fff" />
            </TouchableOpacity>
            <Text style={sp.value}>{pad(value)}</Text>
            <TouchableOpacity style={sp.arrowBtn} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onChange((value - 1 + max + 1) % (max + 1)); }}>
                <ChevronDown size={20} color="#fff" />
            </TouchableOpacity>
            <Text style={sp.label}>{label}</Text>
        </View>
    );
}

const sp = StyleSheet.create({
    wrap:     { alignItems: 'center', gap: 4 },
    arrowBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
    value:    { fontSize: 28, fontFamily: CF.bold, color: '#fff', minWidth: 50, textAlign: 'center' },
    label:    { fontSize: 10, fontFamily: CF.medium, color: 'rgba(255,255,255,0.4)', letterSpacing: 1.5 },
});

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function ClimateCard({ climate, onUpdate, needsChange }) {
    const [expanded, setExpanded] = useState(false);
    const [timerHours,   setTimerHours]   = useState(0);
    const [timerMins,    setTimerMins]    = useState(0);
    const [timerRunning, setTimerRunning] = useState(false);
    const [timerLeft,    setTimerLeft]    = useState(0);
    const intervalRef   = useRef(null);
    const [optimisticOn, setOptimisticOn] = useState(null); // null = follow real state
    const optimisticTimer = useRef(null);

    useEffect(() => {
        if (timerRunning && timerLeft > 0) {
            intervalRef.current = setInterval(() => {
                setTimerLeft(s => {
                    if (s <= 1) { clearInterval(intervalRef.current); setTimerRunning(false); return 0; }
                    return s - 1;
                });
            }, 1000);
        }
        return () => clearInterval(intervalRef.current);
    }, [timerRunning]);

    if (!climate) return null;

    const { attributes, state } = climate.stateObj;
    const targetTemp   = attributes.temperature;
    const hvacMode     = state;
    const hvacModes    = attributes.hvac_modes || [];
    const fanModes     = attributes.fan_modes  || [];
    const currentFan   = attributes.fan_mode;
    const presetModes  = (attributes.preset_modes || []).filter(p => p !== 'none');
    const currentPreset = attributes.preset_mode;
    const realIsOn     = hvacMode !== 'off';
    // Use optimistic value immediately; fall back to real state once HA confirms
    const isOn         = optimisticOn !== null ? optimisticOn : realIsOn;
    const availModes   = hvacModes.filter(m => m !== 'off');

    // When real state catches up with what we optimistically set, clear optimistic override
    useEffect(() => {
        if (optimisticOn !== null && realIsOn === optimisticOn) {
            clearTimeout(optimisticTimer.current);
            setOptimisticOn(null);
        }
    }, [realIsOn, optimisticOn]);

    const togglePower = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        const next = !isOn;
        setOptimisticOn(next);
        // Safety: clear optimistic override after 5s if HA never responds
        clearTimeout(optimisticTimer.current);
        optimisticTimer.current = setTimeout(() => setOptimisticOn(null), 5000);
        if (!next) {
            onUpdate(climate.entity_id, 'climate', 'set_hvac_mode', { hvac_mode: 'off' });
        } else {
            const last = attributes.last_on_operation;
            const mode = (last && hvacModes.includes(last) && last !== 'off') ? last : (availModes[0] || 'cool');
            onUpdate(climate.entity_id, 'climate', 'set_hvac_mode', { hvac_mode: mode });
        }
    };

    const setMode   = (m) => { Haptics.selectionAsync(); onUpdate(climate.entity_id, 'climate', 'set_hvac_mode',  { hvac_mode:    m }); };
    const setFan    = (f) => { Haptics.selectionAsync(); onUpdate(climate.entity_id, 'climate', 'set_fan_mode',   { fan_mode:     f }); };
    const setPreset = (p) => {
        Haptics.selectionAsync();
        onUpdate(climate.entity_id, 'climate', 'set_preset_mode', { preset_mode: currentPreset === p ? 'none' : p });
    };
    const changeTemp = (d) => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        if (targetTemp == null) return;
        onUpdate(climate.entity_id, 'climate', 'set_temperature', { temperature: targetTemp + d });
    };

    const startTimer = () => {
        const total = timerHours * 3600 + timerMins * 60;
        if (total === 0) return;
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setTimerLeft(total);
        setTimerRunning(true);
    };
    const resetTimer = () => {
        clearInterval(intervalRef.current);
        setTimerRunning(false);
        setTimerLeft(0);
        setTimerHours(0);
        setTimerMins(0);
    };

    const dispH = timerRunning ? Math.floor(timerLeft / 3600) : timerHours;
    const dispM = timerRunning ? Math.floor((timerLeft % 3600) / 60) : timerMins;

    return (
        <View style={[s.card, needsChange && { borderColor: '#8947ca', borderWidth: 1.5 }]}>

            {/* Header */}
            <View style={s.header}>
                <LinearGradient colors={['#1de0e0', '#4A90D9']} style={s.iconBg} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                    <Wind size={22} color="#fff" strokeWidth={2} />
                </LinearGradient>
                <Text style={s.name} numberOfLines={1}>{climate.displayName}</Text>
                <Switch
                    value={isOn}
                    onValueChange={togglePower}
                    trackColor={{ false: 'rgba(255,255,255,0.12)', true: '#8947ca' }}
                    thumbColor="#fff"
                    ios_backgroundColor="rgba(255,255,255,0.12)"
                />
            </View>

            {/* Temperature */}
            <View style={s.tempRow}>
                <TouchableOpacity style={s.tempBtn} onPress={() => changeTemp(-1)} activeOpacity={0.7}>
                    <Minus size={20} color="#fff" strokeWidth={2.5} />
                </TouchableOpacity>
                <View style={s.tempCenter}>
                    <Text style={s.tempNum}>{targetTemp != null ? targetTemp : '--'}</Text>
                    <Text style={s.tempUnit}>°C</Text>
                </View>
                <TouchableOpacity style={s.tempBtn} onPress={() => changeTemp(1)} activeOpacity={0.7}>
                    <Plus size={20} color="#fff" strokeWidth={2.5} />
                </TouchableOpacity>
            </View>

            {/* Mode pills */}
            <View style={s.modeRow}>
                {availModes.map(mode => {
                    const meta = getMeta(mode);
                    const isActive = hvacMode === mode && isOn;
                    return (
                        <TouchableOpacity
                            key={mode}
                            style={[s.modePill, isActive && { backgroundColor: meta.color }]}
                            onPress={() => isOn ? setMode(mode) : null}
                            activeOpacity={0.75}
                        >
                            <Text style={[s.modePillText, isActive && s.modePillTextActive]}>
                                {meta.label}
                            </Text>
                        </TouchableOpacity>
                    );
                })}
            </View>

            {/* Expand toggle */}
            {isOn && (
                <TouchableOpacity
                    style={s.expandToggle}
                    onPress={() => { setExpanded(p => !p); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                    activeOpacity={0.7}
                >
                    {expanded
                        ? <ChevronUp   size={18} color="rgba(255,255,255,0.35)" />
                        : <ChevronDown size={18} color="rgba(255,255,255,0.35)" />}
                </TouchableOpacity>
            )}

            {/* Expanded section */}
            {isOn && expanded && (
                <View style={s.expanded}>

                    {/* Fan speed */}
                    {fanModes.length > 0 && (
                        <>
                            <Text style={s.secTitle}>Fan Speed</Text>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.fanRow}>
                                {fanModes.map(fm => {
                                    const active = currentFan === fm;
                                    return (
                                        <TouchableOpacity key={fm} style={s.fanItem} onPress={() => setFan(fm)} activeOpacity={0.75}>
                                            <View style={[s.fanCircle, active && s.fanCircleActive]}>
                                                <Fan size={20} color={active ? '#fff' : 'rgba(255,255,255,0.4)'} />
                                            </View>
                                            <Text style={[s.fanLabel, active && s.fanLabelActive]}>{getFanLabel(fm)}</Text>
                                        </TouchableOpacity>
                                    );
                                })}
                            </ScrollView>
                        </>
                    )}

                    {/* Presets */}
                    {presetModes.length > 0 && (
                        <>
                            <View style={s.divider} />
                            <Text style={s.secTitle}>Modes</Text>
                            <View style={s.presetRow}>
                                {presetModes.map(preset => {
                                    const active = currentPreset === preset;
                                    return (
                                        <TouchableOpacity
                                            key={preset}
                                            style={[s.presetPill, active && s.presetPillActive]}
                                            onPress={() => setPreset(preset)}
                                            activeOpacity={0.75}
                                        >
                                            {getPresetIcon(preset, 13, active ? '#fff' : 'rgba(255,255,255,0.5)')}
                                            <Text style={[s.presetText, active && s.presetTextActive]}>
                                                {preset.charAt(0).toUpperCase() + preset.slice(1)}
                                            </Text>
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>
                        </>
                    )}

                    {/* Timer */}
                    <View style={s.divider} />
                    <View style={s.timerHeader}>
                        <Clock size={14} color="rgba(255,255,255,0.4)" />
                        <Text style={s.secTitle}>Timer</Text>
                    </View>
                    <View style={s.spinnerRow}>
                        <TimeSpinner value={dispH} max={23} onChange={timerRunning ? () => {} : setTimerHours} label="HOURS" />
                        <Text style={s.spinnerColon}>:</Text>
                        <TimeSpinner value={dispM} max={59} onChange={timerRunning ? () => {} : setTimerMins}  label="MIN"   />
                    </View>
                    <View style={s.timerBtnRow}>
                        <TouchableOpacity
                            style={[s.timerBtnStart, timerRunning && { opacity: 0.55 }]}
                            onPress={timerRunning ? undefined : startTimer}
                            activeOpacity={0.8}
                        >
                            <LinearGradient colors={['#a259f7', '#44C8CA']} style={s.timerGrad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                                <Text style={s.timerBtnText}>{timerRunning ? `${pad(dispH)}:${pad(dispM)} left` : 'Start'}</Text>
                            </LinearGradient>
                        </TouchableOpacity>
                        <TouchableOpacity style={s.timerBtnReset} onPress={resetTimer} activeOpacity={0.8}>
                            <Text style={s.timerResetText}>Reset</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            )}
        </View>
    );
}

const BG = '#09091A';

const s = StyleSheet.create({
    card: {
        width: '100%',
        backgroundColor: BG,
        borderRadius: 24,
        padding: 20,
        marginTop: 10,
    },
    // Header
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginBottom: 24,
    },
    iconBg: {
        width: 48,
        height: 48,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
    },
    name: {
        flex: 1,
        fontSize: 17,
        fontFamily: CF.semibold,
        color: '#fff',
    },
    // Temperature
    tempRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 28,
        marginBottom: 24,
    },
    tempBtn: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: 'rgba(255,255,255,0.08)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    tempCenter: {
        flexDirection: 'row',
        alignItems: 'flex-start',
    },
    tempNum: {
        fontSize: 52,
        fontFamily: CF.bold,
        color: '#fff',
        lineHeight: 58,
    },
    tempUnit: {
        fontSize: 18,
        fontFamily: CF.medium,
        color: 'rgba(255,255,255,0.55)',
        marginTop: 8,
    },
    // Mode pills
    modeRow: {
        flexDirection: 'row',
        gap: 8,
        flexWrap: 'wrap',
    },
    modePill: {
        paddingHorizontal: 18,
        paddingVertical: 9,
        borderRadius: 22,
        backgroundColor: 'rgba(255,255,255,0.07)',
    },
    modePillText: {
        fontSize: 13,
        fontFamily: CF.medium,
        color: 'rgba(255,255,255,0.45)',
    },
    modePillTextActive: {
        color: '#fff',
        fontFamily: CF.semibold,
    },
    // Expand
    expandToggle: {
        alignSelf: 'center',
        marginTop: 16,
        width: 36,
        height: 24,
        alignItems: 'center',
        justifyContent: 'center',
    },
    // Expanded
    expanded: { marginTop: 4 },
    divider: {
        height: 1,
        backgroundColor: 'rgba(255,255,255,0.07)',
        marginVertical: 16,
    },
    secTitle: {
        fontSize: 12,
        fontFamily: CF.semibold,
        color: 'rgba(255,255,255,0.45)',
        letterSpacing: 0.8,
        marginBottom: 14,
        textTransform: 'uppercase',
    },
    timerHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    // Fan
    fanRow: { flexDirection: 'row', gap: 14, paddingBottom: 4 },
    fanItem: { alignItems: 'center', gap: 6 },
    fanCircle: {
        width: 52,
        height: 52,
        borderRadius: 26,
        backgroundColor: 'rgba(255,255,255,0.07)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    fanCircleActive: { backgroundColor: '#44C8CA' },
    fanLabel: { fontSize: 11, fontFamily: CF.medium, color: 'rgba(255,255,255,0.4)' },
    fanLabelActive: { color: '#fff', fontFamily: CF.semibold },
    // Presets
    presetRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    presetPill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 14,
        paddingVertical: 9,
        borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.07)',
    },
    presetPillActive: { backgroundColor: 'rgba(68,200,202,0.18)', borderWidth: 1, borderColor: '#44C8CA' },
    presetText: { fontSize: 12, fontFamily: CF.medium, color: 'rgba(255,255,255,0.5)' },
    presetTextActive: { color: '#fff', fontFamily: CF.semibold },
    // Timer spinners
    spinnerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        marginBottom: 20,
    },
    spinnerColon: {
        fontSize: 28,
        fontFamily: CF.bold,
        color: 'rgba(255,255,255,0.25)',
        marginBottom: 18,
    },
    // Timer buttons
    timerBtnRow: { flexDirection: 'row', gap: 10 },
    timerBtnStart: { flex: 1, height: 48, borderRadius: 14, overflow: 'hidden' },
    timerGrad: {
        ...StyleSheet.absoluteFillObject,
        alignItems: 'center',
        justifyContent: 'center',
    },
    timerBtnText: { fontSize: 15, fontFamily: CF.semibold, color: '#fff' },
    timerBtnReset: {
        flex: 1,
        height: 48,
        borderRadius: 14,
        backgroundColor: 'rgba(255,255,255,0.07)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    timerResetText: { fontSize: 15, fontFamily: CF.semibold, color: 'rgba(255,255,255,0.5)' },
});
