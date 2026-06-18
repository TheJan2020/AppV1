import {
    View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, TextInput, Platform,
    Modal, Pressable, KeyboardAvoidingView, Keyboard,
} from 'react-native';
import {
    Wind, Flame, Snowflake, Fan, Zap, Droplets, Minus, Plus,
    ChevronDown, ChevronUp, Clock, Moon, Leaf, HeartPulse, AirVent,
} from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { CF, RoomDeviceStatus } from '../../utils/typography';
import {
    fetchClimateTimer,
    buildClimateTimer,
    syncClimateTimerRemote,
    cancelClimateTimerLocal,
    syncCancelClimateTimerRemote,
    saveLocalClimateTimer,
    loadLocalClimateTimer,
} from '../../utils/climateTimerApi';
import ServiceMessageToast from './ServiceMessageToast';
import RoomGroupIconButton, { ROOM_GROUP_ICON_GLYPH_SIZE } from './RoomGroupIconButton';
import { formatHaServiceError } from '../../utils/haErrorMessages';
import { getClimateTempBounds, isClimateTemperatureValid } from '../../utils/haEntityMerge';
import { isBadEntityState } from '../../utils/haEntityHealth';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Figma order — each slot maps one or more HA `hvac_modes` keys (e.g. Auto ← heat_cool). */
const CANONICAL_HVAC_SLOTS = [
    { slotId: 'cool', keys: ['cool'],      label: 'Cool', color: '#44C8CA' },
    { slotId: 'heat', keys: ['heat'],      label: 'Heat', color: '#FF7043' },
    { slotId: 'auto', keys: ['auto', 'heat_cool'], label: 'Auto', color: '#AB47BC' },
    { slotId: 'fan',  keys: ['fan_only'],  label: 'Fan',  color: '#66BB6A' },
    { slotId: 'dry',  keys: ['dry'],       label: 'Dry',  color: '#FFA726' },
];

const MODE_META = {
    cool:      { label: 'Cool',  Icon: Snowflake, color: '#44C8CA' },
    heat:      { label: 'Heat',  Icon: Flame,     color: '#FF7043' },
    auto:      { label: 'Auto',  Icon: Zap,       color: '#AB47BC' },
    heat_cool: { label: 'Auto',  Icon: Zap,       color: '#AB47BC' },
    fan_only:  { label: 'Fan',   Icon: Fan,       color: '#66BB6A' },
    dry:       { label: 'Dry',   Icon: Droplets,  color: '#FFA726' },
};

function normalizeHvacModes(raw) {
    if (Array.isArray(raw)) return raw.map(String);
    if (typeof raw === 'string') {
        const t = raw.trim();
        if (!t) return [];
        if (t.startsWith('[')) {
            try {
                const parsed = JSON.parse(t);
                if (Array.isArray(parsed)) return parsed.map(String);
            } catch (_) { /* fall through */ }
        }
        return t.split(/[,\s]+/).map((s) => s.trim().toLowerCase()).filter(Boolean);
    }
    return [];
}

const INVALID_HVAC_STATES = new Set(['off', 'unavailable', 'unknown', '']);

/** Prefer attribute hvac_mode; fall back to entity state when HA omits mode on temp updates. */
function resolveCurrentHvacMode(state, attributes) {
    const candidates = [
        attributes?.hvac_mode,
        state,
    ].filter((v) => v != null && String(v).trim() !== '');
    for (const raw of candidates) {
        const mode = String(raw).toLowerCase();
        if (!INVALID_HVAC_STATES.has(mode)) return mode;
    }
    return null;
}

/**
 * Build mode pills from HA `hvac_modes` only (excludes off).
 * Canonical slots use Figma labels/order when HA reports those keys.
 */
export function resolveDisplayModes(hvacModesRaw) {
    const hvacModes = normalizeHvacModes(hvacModesRaw);
    const reported = new Set(
        hvacModes.map((m) => m.toLowerCase()).filter((m) => m && m !== 'off'),
    );

    const slots = CANONICAL_HVAC_SLOTS
        .filter((slot) => slot.keys.some((k) => reported.has(k.toLowerCase())))
        .map((slot) => {
            const haKey = slot.keys.find((k) => reported.has(k.toLowerCase())) || slot.keys[0];
            return { ...slot, haKey };
        });

    const usedKeys = new Set(
        CANONICAL_HVAC_SLOTS.flatMap((s) => s.keys.map((k) => k.toLowerCase())),
    );
    const extras = [...reported]
        .filter((m) => !usedKeys.has(m))
        .map((m) => {
            const meta = MODE_META[m] || {
                label: String(m).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
                color: '#8947ca',
            };
            return {
                slotId: m,
                keys: [m],
                haKey: m,
                label: meta.label,
                color: meta.color,
            };
        });

    return [...slots, ...extras];
}

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

function formatTimerDuration(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${pad(h)}h ${pad(m)}m`;
}

function formatEndTimeLabel(ms) {
    return new Date(ms).toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
    }).toLowerCase();
}

// ─── Spinner ──────────────────────────────────────────────────────────────────
function clampTimerPart(n, max) {
    if (Number.isNaN(n)) return 0;
    return Math.min(max, Math.max(0, n));
}

function TimeSpinner({ value, max, onChange, label }) {
    const inputRef = useRef(null);
    const [editVisible, setEditVisible] = useState(false);
    const [draft, setDraft] = useState('');

    const commitAndClose = useCallback((text) => {
        const digits = String(text ?? '').replace(/\D/g, '');
        if (digits === '') {
            onChange(0);
        } else {
            onChange(clampTimerPart(parseInt(digits, 10), max));
        }
        setEditVisible(false);
        setDraft('');
        Keyboard.dismiss();
    }, [max, onChange]);

    const openEdit = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setDraft(pad(value));
        setEditVisible(true);
    };

    useEffect(() => {
        if (!editVisible) return undefined;
        const t = setTimeout(() => inputRef.current?.focus(), 100);
        return () => clearTimeout(t);
    }, [editVisible]);

    const handleChangeText = (text) => {
        const digits = text.replace(/\D/g, '').slice(0, 2);
        setDraft(digits);
        if (digits.length === 2) {
            commitAndClose(digits);
        }
    };

    return (
        <>
            <View style={sp.wrap}>
                <TouchableOpacity style={sp.arrowBtn} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onChange((value + 1) % (max + 1)); }}>
                    <ChevronUp size={20} color="#fff" />
                </TouchableOpacity>
                <Pressable
                    onPress={openEdit}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={`Edit ${label.toLowerCase()}`}
                >
                    <Text style={sp.value}>{pad(value)}</Text>
                </Pressable>
                <TouchableOpacity style={sp.arrowBtn} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onChange((value - 1 + max + 1) % (max + 1)); }}>
                    <ChevronDown size={20} color="#fff" />
                </TouchableOpacity>
                <Text style={sp.label}>{label}</Text>
            </View>

            <Modal
                visible={editVisible}
                transparent
                animationType="fade"
                onRequestClose={() => commitAndClose(draft)}
            >
                <KeyboardAvoidingView
                    style={sp.editRoot}
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                >
                    <Pressable style={sp.editBackdrop} onPress={() => commitAndClose(draft)} />
                    <View style={sp.editSheet}>
                        <Text style={sp.editTitle}>{label}</Text>
                        <TextInput
                            ref={inputRef}
                            style={sp.editInput}
                            value={draft}
                            onChangeText={handleChangeText}
                            keyboardType="number-pad"
                            inputMode="numeric"
                            maxLength={2}
                            selectTextOnFocus
                            autoFocus
                            showSoftInputOnFocus
                            placeholder="00"
                            placeholderTextColor="rgba(255,255,255,0.35)"
                            returnKeyType="done"
                            onSubmitEditing={() => commitAndClose(draft)}
                        />
                        <TouchableOpacity
                            style={sp.editDoneBtn}
                            onPress={() => commitAndClose(draft)}
                            activeOpacity={0.85}
                        >
                            <Text style={sp.editDoneText}>Done</Text>
                        </TouchableOpacity>
                    </View>
                </KeyboardAvoidingView>
            </Modal>
        </>
    );
}

const sp = StyleSheet.create({
    wrap:     { alignItems: 'center', gap: 4 },
    arrowBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
    value:    { fontSize: 28, fontFamily: CF.bold, color: '#fff', minWidth: 50, textAlign: 'center' },
    label:    { fontSize: 10, fontFamily: CF.medium, color: 'rgba(255,255,255,0.4)', letterSpacing: 1.5 },
    editRoot: {
        flex: 1,
        justifyContent: 'center',
        paddingHorizontal: 24,
    },
    editBackdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.55)',
    },
    editSheet: {
        backgroundColor: '#1a1a32',
        borderRadius: 20,
        borderWidth: 1,
        borderColor: 'rgba(137, 71, 202, 0.35)',
        padding: 20,
        alignItems: 'center',
    },
    editTitle: {
        fontSize: 12,
        fontFamily: CF.semibold,
        color: 'rgba(255,255,255,0.5)',
        letterSpacing: 1.5,
        marginBottom: 12,
    },
    editInput: {
        fontSize: 40,
        fontFamily: CF.bold,
        color: '#fff',
        minWidth: 100,
        textAlign: 'center',
        paddingVertical: 8,
        marginBottom: 16,
    },
    editDoneBtn: {
        backgroundColor: '#0066A7',
        borderRadius: 22,
        paddingHorizontal: 28,
        paddingVertical: 12,
    },
    editDoneText: {
        fontSize: 15,
        fontFamily: CF.semibold,
        color: '#fff',
    },
});

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function ClimateCard({
    climate,
    onUpdate,
    needsChange,
    /** Inside ClimateGroupCard — no own card chrome or header */
    embedded = false,
    /** Fan / presets / timer expanded (group card) */
    detailsExpanded = false,
    onToggleDetails,
}) {
    const [expandedInternal, setExpandedInternal] = useState(false);
    const expanded = embedded ? detailsExpanded : expandedInternal;

    const toggleExpand = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        if (embedded && onToggleDetails) {
            onToggleDetails();
        } else {
            setExpandedInternal((p) => !p);
        }
    };
    const [timerHours, setTimerHours] = useState(0);
    const [timerMins, setTimerMins] = useState(0);
    const [timerRunning, setTimerRunning] = useState(false);
    const [timerLeft, setTimerLeft] = useState(0);
    const [timerEndsAtMs, setTimerEndsAtMs] = useState(null);
    const [timerAction, setTimerAction] = useState('turn_off');
    const [timerStarting, setTimerStarting] = useState(false);
    const [serviceMessage, setServiceMessage] = useState(null);
    const tickRef = useRef(null);
    const expireHandledRef = useRef(false);
    const entityId = climate?.entity_id;
    const stateObj = climate?.stateObj || { state: 'off', attributes: {} };
    const { attributes, state } = stateObj;
    const targetTemp   = attributes.temperature;
    const hvacModesRaw = attributes.hvac_modes;
    const fanModes     = attributes.fan_modes  || [];
    const currentFan   = attributes.fan_mode;
    const presetModes  = (attributes.preset_modes || []).filter(p => p !== 'none');
    const currentPreset = attributes.preset_mode;
    const entityUnavailable = isBadEntityState(state);
    const realIsOn     = state !== 'off' && !entityUnavailable;
    const isOn         = realIsOn;
    const hvacModes = useMemo(() => normalizeHvacModes(hvacModesRaw), [hvacModesRaw]);
    const hvacModesKey = hvacModes.join('|');
    const displayModes = useMemo(
        () => resolveDisplayModes(hvacModesRaw),
        [hvacModesKey],
    );

    const activeMode = useMemo(
        () => resolveCurrentHvacMode(state, attributes),
        [state, attributes.hvac_mode],
    );

    const { min: minTemp, max: maxTemp } = useMemo(
        () => getClimateTempBounds(attributes),
        [attributes.min_temp, attributes.max_temp],
    );

    const atMinTemp = minTemp != null && targetTemp != null && Number(targetTemp) <= minTemp;
    const atMaxTemp = maxTemp != null && targetTemp != null && Number(targetTemp) >= maxTemp;

    const dismissServiceMessage = useCallback(() => setServiceMessage(null), []);

    const showServiceError = useCallback(
        (err, action) => {
            const formatted = formatHaServiceError(err?.message ?? err, {
                displayName: climate.displayName,
                action,
            });
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            setServiceMessage(formatted);
        },
        [climate.displayName],
    );

    const runUpdate = useCallback(
        async (entityId, domain, service, data, options = {}) => {
            const { showError = true } = options;
            if (entityUnavailable) return;
            if (!onUpdate) return;
            try {
                const result = onUpdate(entityId, domain, service, data);
                if (result != null && typeof result.then === 'function') await result;
            } catch (err) {
                if (showError) showServiceError(err, service);
            }
        },
        [onUpdate, showServiceError, entityUnavailable],
    );

    const togglePower = () => {
        if (entityUnavailable) return;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        if (isOn) {
            runUpdate(climate.entity_id, 'climate', 'set_hvac_mode', { hvac_mode: 'off' });
        } else {
            const last = attributes.last_on_operation;
            const mode = (last && hvacModes.includes(last) && last !== 'off')
                ? last
                : (displayModes[0]?.haKey || 'cool');
            runUpdate(climate.entity_id, 'climate', 'set_hvac_mode', { hvac_mode: mode });
        }
    };

    const setMode = (m) => {
        Haptics.selectionAsync();
        runUpdate(climate.entity_id, 'climate', 'set_hvac_mode', { hvac_mode: m });
    };
    const setFan = (f) => {
        Haptics.selectionAsync();
        runUpdate(climate.entity_id, 'climate', 'set_fan_mode', { fan_mode: f });
    };
    const setPreset = (p) => {
        Haptics.selectionAsync();
        runUpdate(climate.entity_id, 'climate', 'set_preset_mode', { preset_mode: currentPreset === p ? 'none' : p });
    };
    const changeTemp = (d) => {
        if (entityUnavailable || targetTemp == null) return;
        const next = Number(targetTemp) + d;
        if (d < 0 && atMinTemp) return;
        if (d > 0 && atMaxTemp) return;
        if (!isClimateTemperatureValid(next, attributes)) return;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        runUpdate(climate.entity_id, 'climate', 'set_temperature', { temperature: next });
    };

    const dispH = timerRunning ? Math.floor(timerLeft / 3600) : timerHours;
    const dispM = timerRunning ? Math.floor((timerLeft % 3600) / 60) : timerMins;
    const canResetTimer = dispH > 0 || dispM > 0;

    const hasFanOrPreset = fanModes.length > 0 || presetModes.length > 0;

    const clearTick = useCallback(() => {
        if (tickRef.current) {
            clearInterval(tickRef.current);
            tickRef.current = null;
        }
    }, []);

    const resetTimer = useCallback((cancelRemote = true) => {
        clearTick();
        expireHandledRef.current = false;
        setTimerRunning(false);
        setTimerLeft(0);
        setTimerEndsAtMs(null);
        setTimerAction('turn_off');
        setTimerHours(0);
        setTimerMins(0);
        if (cancelRemote && entityId) {
            cancelClimateTimerLocal(entityId);
            syncCancelClimateTimerRemote(entityId);
        }
    }, [entityId, clearTick]);

    /** Tap clock while running — open editor immediately; cancel server in background. */
    const editRunningTimer = useCallback(() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        const h = Math.floor(timerLeft / 3600);
        const m = Math.floor((timerLeft % 3600) / 60);
        clearTick();
        expireHandledRef.current = false;
        setTimerRunning(false);
        setTimerLeft(0);
        setTimerEndsAtMs(null);
        setTimerAction('turn_off');
        setTimerHours(h);
        setTimerMins(m);
        if (entityId) {
            cancelClimateTimerLocal(entityId);
            syncCancelClimateTimerRemote(entityId);
        }
    }, [timerLeft, entityId, clearTick]);

    const resolveTurnOnMode = useCallback(() => {
        const last = attributes.last_on_operation;
        if (last && hvacModes.includes(last) && last !== 'off') return last;
        return displayModes[0]?.haKey || 'cool';
    }, [attributes.last_on_operation, hvacModes, displayModes]);

    const handleTimerExpired = useCallback(async () => {
        if (expireHandledRef.current || !entityId) return;
        expireHandledRef.current = true;
        clearTick();
        if (timerAction === 'turn_on') {
            if (!realIsOn) {
                runUpdate(entityId, 'climate', 'set_hvac_mode', { hvac_mode: resolveTurnOnMode() }, { showError: false });
            }
        } else if (realIsOn) {
            runUpdate(entityId, 'climate', 'set_hvac_mode', { hvac_mode: 'off' }, { showError: false });
        }
        cancelClimateTimerLocal(entityId);
        syncCancelClimateTimerRemote(entityId);
        setTimerRunning(false);
        setTimerLeft(0);
        setTimerEndsAtMs(null);
        setTimerAction('turn_off');
    }, [entityId, timerAction, realIsOn, runUpdate, clearTick, resolveTurnOnMode]);

    const applyActiveTimer = useCallback((t) => {
        if (!t?.ends_at_ms) return;
        const left = Math.max(0, Math.floor((t.ends_at_ms - Date.now()) / 1000));
        if (left <= 0) return;
        expireHandledRef.current = false;
        setTimerEndsAtMs(t.ends_at_ms);
        setTimerAction(t.action === 'turn_on' ? 'turn_on' : 'turn_off');
        setTimerLeft(left);
        setTimerRunning(true);
    }, []);

    useEffect(() => {
        if (!entityId) return undefined;
        let cancelled = false;
        (async () => {
            const local = await loadLocalClimateTimer(entityId);
            if (!cancelled && local?.ends_at_ms && local.ends_at_ms > Date.now()) {
                applyActiveTimer(local);
            }
            const remote = await fetchClimateTimer(entityId);
            if (cancelled) return;
            if (remote) applyActiveTimer(remote);
        })();
        return () => { cancelled = true; };
    }, [entityId, applyActiveTimer]);

    useEffect(() => {
        clearTick();
        if (!timerRunning || timerLeft <= 0) return undefined;
        tickRef.current = setInterval(() => {
            setTimerLeft((prev) => {
                if (prev <= 1) return 0;
                return prev - 1;
            });
        }, 1000);
        return clearTick;
    }, [timerRunning, timerLeft > 0, clearTick]);

    useEffect(() => {
        if (timerRunning && timerLeft === 0) {
            handleTimerExpired();
        }
    }, [timerLeft, timerRunning, handleTimerExpired]);

    useEffect(() => {
        if (!timerRunning) return;
        if (timerAction === 'turn_off' && !realIsOn) resetTimer(true);
        if (timerAction === 'turn_on' && realIsOn) resetTimer(true);
    }, [realIsOn, timerRunning, timerAction, resetTimer]);

    const startTimer = async () => {
        if (!entityId || timerStarting) return;
        const total = timerHours * 3600 + timerMins * 60;
        if (total < 60) return;
        const action = realIsOn ? 'turn_off' : 'turn_on';

        const local = buildClimateTimer(entityId, total, action);
        applyActiveTimer(local);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        saveLocalClimateTimer(entityId, local).catch(() => {});

        setTimerStarting(true);
        try {
            const remote = await syncClimateTimerRemote(entityId, total, action);
            applyActiveTimer(remote);
            saveLocalClimateTimer(entityId, remote).catch(() => {});
        } catch (err) {
            console.warn('[ClimateCard] start timer sync:', err.message);
            resetTimer(true);
        } finally {
            setTimerStarting(false);
        }
    };

    if (!climate) return null;

    return (
        <View style={[
            embedded ? s.embedded : s.card,
            needsChange && { borderColor: '#8947ca', borderWidth: 1.5 },
            entityUnavailable && s.cardUnavailable,
        ]}>

            {entityUnavailable && (
                <Text style={s.unavailableBadge}>
                    {state === 'unknown' ? 'Unknown in Home Assistant' : 'Unavailable'}
                </Text>
            )}

            {!embedded && (
                <View style={s.header}>
                    <RoomGroupIconButton
                        active={isOn}
                        onPress={togglePower}
                        accessibilityLabel={isOn ? 'Turn climate off' : 'Turn climate on'}
                    >
                        <Wind size={ROOM_GROUP_ICON_GLYPH_SIZE} color="#fff" strokeWidth={2} />
                    </RoomGroupIconButton>
                    <Text style={s.name} numberOfLines={1}>{climate.displayName}</Text>
                </View>
            )}

            {/* Temperature */}
            <View style={[s.tempRow, embedded && s.tempRowEmbedded]}>
                <TouchableOpacity
                    style={[s.tempBtn, (atMinTemp || entityUnavailable) && s.tempBtnDisabled]}
                    onPress={() => changeTemp(-1)}
                    disabled={atMinTemp || entityUnavailable}
                    activeOpacity={atMinTemp || entityUnavailable ? 1 : 0.7}
                >
                    <Minus size={20} color={atMinTemp ? 'rgba(255,255,255,0.25)' : '#fff'} strokeWidth={2.5} />
                </TouchableOpacity>
                <View style={s.tempCenter}>
                    <Text style={s.tempNum}>{targetTemp != null ? targetTemp : '--'}</Text>
                    <Text style={s.tempUnit}>°C</Text>
                </View>
                <TouchableOpacity
                    style={[s.tempBtn, (atMaxTemp || entityUnavailable) && s.tempBtnDisabled]}
                    onPress={() => changeTemp(1)}
                    disabled={atMaxTemp || entityUnavailable}
                    activeOpacity={atMaxTemp || entityUnavailable ? 1 : 0.7}
                >
                    <Plus size={20} color={atMaxTemp ? 'rgba(255,255,255,0.25)' : '#fff'} strokeWidth={2.5} />
                </TouchableOpacity>
            </View>

            {/* Mode pills — only modes reported in HA hvac_modes */}
            {displayModes.length > 0 && (
            <View style={s.modeRow}>
                {displayModes.map((slot) => {
                    const isActive = isOn && activeMode != null && slot.keys.some(
                        (k) => k.toLowerCase() === activeMode,
                    );
                    return (
                        <TouchableOpacity
                            key={slot.slotId}
                            style={[
                                s.modePill,
                                isActive && { backgroundColor: slot.color },
                            ]}
                            onPress={() => {
                                if (!isOn) {
                                    runUpdate(climate.entity_id, 'climate', 'set_hvac_mode', { hvac_mode: slot.haKey });
                                    return;
                                }
                                setMode(slot.haKey);
                            }}
                            activeOpacity={0.75}
                        >
                            <Text style={[
                                s.modePillText,
                                isActive && s.modePillTextActive,
                            ]}>
                                {slot.label}
                            </Text>
                        </TouchableOpacity>
                    );
                })}
            </View>
            )}

            {/* Chevron between modes and details (fan / presets / timer) — Figma */}
            <TouchableOpacity
                style={s.expandToggle}
                onPress={toggleExpand}
                activeOpacity={0.7}
            >
                {expanded
                    ? <ChevronUp size={20} color="rgba(255,255,255,0.4)" />
                    : <ChevronDown size={20} color="rgba(255,255,255,0.4)" />}
            </TouchableOpacity>

            {/* Fan / presets / timer */}
            {expanded && (
                <View style={s.expanded}>

                    {/* Fan speed */}
                    {isOn && fanModes.length > 0 && (
                        <View style={s.fanSection}>
                            <View style={s.fanRow}>
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
                            </View>
                        </View>
                    )}

                    {/* Presets — second pill row (Figma) */}
                    {isOn && presetModes.length > 0 && (
                        <View style={s.presetSection}>
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
                        </View>
                    )}

                    <View style={s.divider} />
                    {timerRunning ? (
                        <View style={s.timerRunningWrap}>
                            <Text style={s.timerRunningTitle}>Timer</Text>
                            <View style={s.timerCard}>
                                <View style={s.timerCardLeft}>
                                    <Text style={s.timerDuration}>
                                        {formatTimerDuration(timerLeft)}
                                    </Text>
                                    {timerEndsAtMs != null && (
                                        <Text style={s.timerEndAt}>
                                            {formatEndTimeLabel(timerEndsAtMs)}
                                        </Text>
                                    )}
                                </View>
                                <TouchableOpacity
                                    style={s.timerClockBtn}
                                    onPress={editRunningTimer}
                                    activeOpacity={0.8}
                                    accessibilityRole="button"
                                    accessibilityLabel="Edit or reset timer"
                                >
                                    <LinearGradient
                                        colors={['#0066A7', '#0086CC']}
                                        style={s.timerClockGrad}
                                        start={{ x: 0, y: 0 }}
                                        end={{ x: 1, y: 0 }}
                                    >
                                        <Clock size={22} color="#fff" strokeWidth={2} />
                                    </LinearGradient>
                                </TouchableOpacity>
                            </View>
                        </View>
                    ) : (
                        <View style={s.timerBlock}>
                            <View style={s.timerHeader}>
                                <Clock size={14} color="rgba(255,255,255,0.4)" />
                                <Text style={s.timerHeaderText}>Timer</Text>
                            </View>
                            <View style={s.spinnerRow}>
                                <TimeSpinner
                                    value={dispH}
                                    max={23}
                                    onChange={setTimerHours}
                                    label="HOURS"
                                />
                                <Text style={s.spinnerColon}>:</Text>
                                <TimeSpinner
                                    value={dispM}
                                    max={59}
                                    onChange={setTimerMins}
                                    label="MIN"
                                />
                            </View>
                            <View style={s.timerBtnRow}>
                                <TouchableOpacity
                                    style={[s.timerBtnStart, timerStarting && { opacity: 0.7 }]}
                                    onPress={startTimer}
                                    disabled={timerStarting}
                                    activeOpacity={0.8}
                                >
                                    <LinearGradient
                                        colors={['#0066A7', '#0086CC']}
                                        style={s.timerGrad}
                                        start={{ x: 0, y: 0 }}
                                        end={{ x: 1, y: 0 }}
                                    >
                                        {timerStarting ? (
                                            <ActivityIndicator color="#fff" size="small" />
                                        ) : (
                                            <Text style={s.timerBtnText}>Start</Text>
                                        )}
                                    </LinearGradient>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[s.timerBtnReset, canResetTimer && s.timerBtnResetEnabled]}
                                    onPress={() => resetTimer(true)}
                                    disabled={!canResetTimer}
                                    activeOpacity={canResetTimer ? 0.8 : 1}
                                >
                                    <Text style={[s.timerResetText, canResetTimer && s.timerResetTextEnabled]}>
                                        Reset
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    )}
                </View>
            )}
            <ServiceMessageToast
                message={serviceMessage}
                onDismiss={dismissServiceMessage}
                Icon={Wind}
            />
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
    cardUnavailable: {
        opacity: 0.55,
    },
    unavailableBadge: {
        ...RoomDeviceStatus,
        alignSelf: 'center',
        fontSize: 11,
        color: '#EF5350',
        marginBottom: 10,
        letterSpacing: 0.3,
    },
    embedded: {
        width: '100%',
        backgroundColor: 'transparent',
        padding: 0,
        marginTop: 0,
    },
    // Header
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 24,
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
    tempRowEmbedded: {
        marginBottom: 16,
    },
    tempBtn: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: 'rgba(255,255,255,0.08)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    tempBtnDisabled: {
        backgroundColor: 'rgba(255,255,255,0.03)',
    },
    tempCenter: {
        flexDirection: 'row',
        alignItems: 'flex-start',
    },
    tempNum: {
        fontSize: 52,
        fontFamily: CF.semibold,
        color: '#fff',
        lineHeight: 58,
        fontWeight: '500',
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
        flexWrap: 'wrap',
        justifyContent: 'center',
        alignItems: 'center',
        alignSelf: 'center',
        width: '100%',
        gap: 8,
        marginBottom: 4,
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
    // Expand chevron — between modes and fan row
    expandToggle: {
        alignSelf: 'center',
        marginTop: 8,
        marginBottom: 8,
        width: 40,
        height: 28,
        alignItems: 'center',
        justifyContent: 'center',
    },
    // Expanded
    expanded: {
        width: '100%',
        alignItems: 'center',
    },
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
    timerRunningWrap: {
        width: '100%',
        alignSelf: 'stretch',
    },
    timerRunningTitle: {
        fontSize: 13,
        fontFamily: CF.semibold,
        color: 'rgba(255,255,255,0.45)',
        marginBottom: 10,
    },
    timerCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#09091A',
        borderRadius: 24,
        paddingVertical: 16,
        paddingHorizontal: 18,
        gap: 12,
        width: '100%',
    },
    timerCardLeft: {
        flex: 1,
    },
    timerDuration: {
        fontSize: 28,
        fontFamily: CF.bold,
        color: '#fff',
        letterSpacing: 0.3,
    },
    timerEndAt: {
        fontSize: 15,
        fontFamily: CF.medium,
        color: 'rgba(255,255,255,0.75)',
        marginTop: 4,
    },
    timerBlock: {
        width: '100%',
        alignSelf: 'stretch',
    },
    timerHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 14,
    },
    timerHeaderText: {
        fontSize: 13,
        fontFamily: CF.semibold,
        color: 'rgba(255,255,255,0.45)',
        lineHeight: 14,
        includeFontPadding: false,
    },
    timerClockBtn: {
        width: 52,
        height: 52,
        borderRadius: 26,
        overflow: 'hidden',
        flexShrink: 0,
    },
    timerClockGrad: {
        width: 52,
        height: 52,
        alignItems: 'center',
        justifyContent: 'center',
    },
    // Fan
    fanSection: {
        width: '100%',
        alignItems: 'center',
        marginBottom: 12,
    },
    presetSection: {
        width: '100%',
        alignItems: 'center',
        marginBottom: 12,
    },
    fanRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'center',
        alignItems: 'center',
        alignSelf: 'center',
        width: '100%',
        gap: 14,
        paddingBottom: 4,
    },
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
    presetRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'center',
        gap: 8,
    },
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
    timerBtnRow: { flexDirection: 'row', gap: 10 },
    timerBtnStart: { flex: 1, height: 48, borderRadius: 24, overflow: 'hidden' },
    timerGrad: {
        ...StyleSheet.absoluteFillObject,
        alignItems: 'center',
        justifyContent: 'center',
    },
    timerBtnText: { fontSize: 15, fontFamily: CF.semibold, color: '#fff' },
    timerBtnReset: {
        flex: 1,
        height: 48,
        borderRadius: 24,
        backgroundColor: 'rgba(255,255,255,0.05)',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: 0.45,
    },
    timerBtnResetEnabled: {
        backgroundColor: 'rgba(255,255,255,0.12)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.22)',
        opacity: 1,
    },
    timerResetText: { fontSize: 15, fontFamily: CF.semibold, color: 'rgba(255,255,255,0.35)' },
    timerResetTextEnabled: { color: '#fff' },
});
