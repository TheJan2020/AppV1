/**
 * DevicesToggleModal — bottom-sheet for lights / ACs
 * Lights: "On" tab (all rooms, on only) + per-room tabs (on + off).
 * Same countable units as room cards: no master controllers; non-master groups as 1;
 * individual lights (including master members) count one each.
 * ACs: room filters + on/off rows.
 */
import {
    Modal, View, Text, StyleSheet,
    TouchableOpacity, ScrollView, Dimensions,
} from 'react-native';
import { X, Lightbulb, Snowflake, Minus, Plus } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import ModalBackdrop from '../ModalBackdrop';
import Animated, {
    useSharedValue, useAnimatedStyle, withTiming, withSpring, runOnJS,
} from 'react-native-reanimated';
import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { CF } from '../../utils/typography';
import { getClimateTempBounds, isClimateTemperatureValid } from '../../utils/haEntityMerge';
import { formatDisplayName } from '../../utils/formatDisplayName';
import { applyClimatePower, isClimatePoweredOn } from '../../utils/acPowerSwitch';
import { compareNaturalNames } from '../../utils/naturalSort';

const C_PRIMARY = '#8947ca';
const UNASSIGNED = '__unassigned__';
/** Lights modal: first tab — only lights that are currently on (all rooms). */
const ON_TAB = '__on__';
const SCREEN_H = Dimensions.get('window').height;
const LIST_MAX_H = Math.round(SCREEN_H * 0.5);
/** Keep optimistic UI until live state agrees for this long (avoids stale WS flicker). */
const CONFIRM_MS = 450;

function isDeviceOn(item, kind) {
    if (kind === 'lights') return item.state === 'on';
    return isClimatePoweredOn(item);
}

function deviceName(item) {
    return formatDisplayName(
        item.attributes?.friendly_name || item.entity_id,
    );
}

/** Keep filter chips readable — shorten long HA area names. */
function shortRoomLabel(name) {
    const n = String(name || '').trim();
    if (!n) return 'Room';
    if (n.length <= 16) return n;
    const parts = n.split(/\s+/);
    if (parts.length >= 2) {
        const last = parts[parts.length - 1];
        const prev = parts[parts.length - 2];
        const pair = `${prev} ${last}`;
        if (pair.length <= 16) return pair;
        return last.length <= 16 ? last : `${last.slice(0, 14)}…`;
    }
    return `${n.slice(0, 14)}…`;
}

function buildEntityAreaMap(registryEntities = [], registryDevices = []) {
    const deviceArea = {};
    registryDevices.forEach((d) => {
        if (d?.id && d.area_id) deviceArea[d.id] = d.area_id;
    });

    const map = {};
    registryEntities.forEach((re) => {
        if (!re?.entity_id) return;
        const areaId = re.area_id || (re.device_id ? deviceArea[re.device_id] : null);
        if (areaId) map[re.entity_id] = areaId;
    });
    return map;
}

export default function DevicesToggleModal({
    visible,
    kind = 'lights',
    devices = [],
    rooms = [],
    registryAreas = [],
    registryDevices = [],
    registryEntities = [],
    onClose,
    onToggle,
}) {
    const isLights = kind === 'lights';
    const accent = C_PRIMARY;
    const TitleIcon = isLights ? Lightbulb : Snowflake;
    // Lights: On tab first. ACs: 'all' keeps previous behavior.
    const [roomFilter, setRoomFilter] = useState(isLights ? ON_TAB : 'all');
    // Local optimistic overrides so toggles / temp update instantly in this modal.
    const [localById, setLocalById] = useState({});
    const matchSinceRef = useRef({});
    const confirmTimersRef = useRef({});

    const sheetY = useSharedValue(700);

    const clearConfirmTimer = useCallback((entityId) => {
        const t = confirmTimersRef.current[entityId];
        if (t) {
            clearTimeout(t);
            delete confirmTimersRef.current[entityId];
        }
    }, []);

    const clearAllConfirmTimers = useCallback(() => {
        Object.keys(confirmTimersRef.current).forEach((id) => {
            clearTimeout(confirmTimersRef.current[id]);
        });
        confirmTimersRef.current = {};
        matchSinceRef.current = {};
    }, []);

    useEffect(() => {
        if (visible) {
            sheetY.value = 700;
            sheetY.value = withTiming(0, { duration: 300 });
            setRoomFilter(isLights ? ON_TAB : 'all');
            setLocalById({});
            clearAllConfirmTimers();
        }
    }, [visible, kind, isLights, sheetY, clearAllConfirmTimers]);

    useEffect(() => () => clearAllConfirmTimers(), [clearAllConfirmTimers]);

    // Drop local overrides only after live state agrees continuously (CONFIRM_MS).
    // Immediate clear races with parent optimistic updates + stale HA events.
    useEffect(() => {
        if (!Object.keys(localById).length) return;

        for (const id of Object.keys(localById)) {
            const live = devices.find((d) => d.entity_id === id);
            const o = localById[id];

            if (!live) {
                clearConfirmTimer(id);
                delete matchSinceRef.current[id];
                setLocalById((cur) => {
                    if (!cur[id]) return cur;
                    const copy = { ...cur };
                    delete copy[id];
                    return copy;
                });
                continue;
            }

            const stateOk = o.state == null || live.state === o.state;
            const tempOk =
                o.attributes?.temperature == null
                || Number(live.attributes?.temperature) === Number(o.attributes.temperature);

            if (stateOk && tempOk) {
                if (!matchSinceRef.current[id] && !confirmTimersRef.current[id]) {
                    matchSinceRef.current[id] = Date.now();
                    confirmTimersRef.current[id] = setTimeout(() => {
                        setLocalById((cur) => {
                            if (!cur[id]) return cur;
                            const copy = { ...cur };
                            delete copy[id];
                            return copy;
                        });
                        delete matchSinceRef.current[id];
                        delete confirmTimersRef.current[id];
                    }, CONFIRM_MS);
                }
            } else if (matchSinceRef.current[id] || confirmTimersRef.current[id]) {
                // Live diverged (stale event) — keep override, reset confirm window.
                delete matchSinceRef.current[id];
                clearConfirmTimer(id);
            }
        }
    }, [devices, localById, clearConfirmTimer]);

    const applyLocal = useCallback((entityId, patch) => {
        delete matchSinceRef.current[entityId];
        clearConfirmTimer(entityId);
        setLocalById((prev) => {
            const cur = prev[entityId] || {};
            return {
                ...prev,
                [entityId]: {
                    ...cur,
                    ...patch,
                    attributes: {
                        ...(cur.attributes || {}),
                        ...(patch.attributes || {}),
                    },
                },
            };
        });
    }, [clearConfirmTimer]);

    const dismissGesture = Gesture.Pan()
        .activeOffsetY(5)
        .onUpdate((e) => {
            if (e.translationY > 0) sheetY.value = e.translationY;
        })
        .onEnd((e) => {
            if (e.translationY > 100 || e.velocityY > 600) {
                sheetY.value = withTiming(700, { duration: 250 }, () => {
                    runOnJS(onClose)();
                });
            } else {
                sheetY.value = withSpring(0, { damping: 20 });
            }
        });

    const sheetAnimStyle = useAnimatedStyle(() => ({
        transform: [{ translateY: sheetY.value }],
    }));

    const entityAreaMap = useMemo(() => {
        const map = buildEntityAreaMap(registryEntities, registryDevices);
        // Prefer room assignment from dashboard room lists (source of truth for counts)
        devices.forEach((d) => {
            if (d?.entity_id && d.area_id) map[d.entity_id] = d.area_id;
        });
        return map;
    }, [registryEntities, registryDevices, devices]);

    const areaNameById = useMemo(() => {
        const map = {};
        registryAreas.forEach((a) => {
            if (a?.area_id) map[a.area_id] = a.name || a.area_id;
        });
        return map;
    }, [registryAreas]);

    const climatePowerById = useMemo(() => {
        const map = {};
        (rooms || []).forEach((room) => {
            (room._entities?.climates || []).forEach((c) => {
                if (!c?.entity_id || !c.powerSwitchEntityId) return;
                map[c.entity_id] = {
                    powerSwitchEntityId: c.powerSwitchEntityId,
                    powerSwitchStateObj: c.powerSwitchStateObj,
                };
            });
        });
        return map;
    }, [rooms]);

    const availableDevices = useMemo(() => {
        return devices
            .filter((d) => d && d.state !== 'unavailable')
            .map((d) => {
                const power = !isLights ? climatePowerById[d.entity_id] : null;
                const withPower = power ? { ...d, ...power } : d;
                const o = localById[d.entity_id];
                if (!o) return withPower;
                return {
                    ...withPower,
                    ...o,
                    attributes: {
                        ...(withPower.attributes || {}),
                        ...(o.attributes || {}),
                    },
                    powerSwitchStateObj: o.powerSwitchStateObj || withPower.powerSwitchStateObj,
                };
            });
    }, [devices, localById, isLights, climatePowerById]);

    /** Same countable room lights as room cards — on and off. */
    const listDevices = availableDevices;

    const roomOrderIds = useMemo(() => {
        if (Array.isArray(rooms) && rooms.length) {
            return rooms.map((r) => r.area_id).filter(Boolean);
        }
        return Object.keys(areaNameById).sort((a, b) =>
            (areaNameById[a] || a).localeCompare(areaNameById[b] || b),
        );
    }, [rooms, areaNameById]);

    const roomLabelFor = useCallback((areaId) => {
        if (areaId === UNASSIGNED) return 'Other';
        if (areaId === ON_TAB) return 'On';
        const fromRooms = Array.isArray(rooms)
            ? rooms.find((r) => r.area_id === areaId)?.name
            : null;
        return formatDisplayName(fromRooms || areaNameById[areaId] || areaId);
    }, [rooms, areaNameById]);

    const onLights = useMemo(
        () => listDevices.filter((d) => isDeviceOn(d, kind)),
        [listDevices, kind],
    );

    const roomPills = useMemo(() => {
        const counts = new Map();
        listDevices.forEach((d) => {
            const areaId = entityAreaMap[d.entity_id] || UNASSIGNED;
            counts.set(areaId, (counts.get(areaId) || 0) + 1);
        });

        const pills = isLights
            ? [{ value: ON_TAB, label: 'On', count: onLights.length }]
            : [{ value: 'all', label: 'All', count: listDevices.length }];

        const orderedIds = [
            ...roomOrderIds.filter((id) => counts.has(id)),
            ...[...counts.keys()].filter(
                (id) => id !== UNASSIGNED && !roomOrderIds.includes(id),
            ),
        ];

        orderedIds.forEach((id) => {
            const roomLabel = roomLabelFor(id);
            pills.push({
                value: id,
                label: shortRoomLabel(roomLabel),
                fullLabel: roomLabel,
                count: counts.get(id) || 0,
            });
        });

        if (counts.has(UNASSIGNED)) {
            pills.push({
                value: UNASSIGNED,
                label: 'Other',
                fullLabel: 'Other',
                count: counts.get(UNASSIGNED) || 0,
            });
        }

        return pills;
    }, [listDevices, entityAreaMap, isLights, roomOrderIds, roomLabelFor, onLights.length]);

    const roomSections = useMemo(() => {
        const source = isLights && roomFilter === ON_TAB ? onLights : listDevices;
        const byRoom = new Map();
        source.forEach((d) => {
            const areaId = entityAreaMap[d.entity_id] || UNASSIGNED;
            if (!byRoom.has(areaId)) byRoom.set(areaId, []);
            byRoom.get(areaId).push(d);
        });

        const orderedIds = [
            ...roomOrderIds.filter((id) => byRoom.has(id)),
            ...[...byRoom.keys()].filter(
                (id) => id !== UNASSIGNED && !roomOrderIds.includes(id),
            ),
        ];
        if (byRoom.has(UNASSIGNED)) orderedIds.push(UNASSIGNED);

        return orderedIds.map((id) => {
            const data = [...(byRoom.get(id) || [])].sort((a, b) =>
                compareNaturalNames(deviceName(a), deviceName(b)),
            );
            return {
                areaId: id,
                title: roomLabelFor(id),
                data,
            };
        }).filter((s) => s.data.length > 0);
    }, [listDevices, onLights, entityAreaMap, roomOrderIds, roomLabelFor, isLights, roomFilter]);

    const filtered = useMemo(() => {
        let list = listDevices;
        if (isLights) {
            if (roomFilter === ON_TAB) {
                list = onLights;
            } else if (roomFilter) {
                list = list.filter((d) => {
                    const areaId = entityAreaMap[d.entity_id] || UNASSIGNED;
                    return areaId === roomFilter;
                });
            }
        } else if (roomFilter !== 'all') {
            list = list.filter((d) => {
                const areaId = entityAreaMap[d.entity_id] || UNASSIGNED;
                return areaId === roomFilter;
            });
        }
        // Stable alpha order — sorting by on/off would jump rows on toggle
        // and make the switch look like it didn't flip.
        list = [...list];
        list.sort((a, b) => compareNaturalNames(deviceName(a), deviceName(b)));
        return list;
    }, [listDevices, onLights, roomFilter, entityAreaMap, isLights]);

    const subtitleScope = filtered;
    const onCount = subtitleScope.filter((d) => isDeviceOn(d, kind)).length;
    const offCount = Math.max(0, subtitleScope.length - onCount);
    const selectedRoom = roomPills.find((p) => p.value === roomFilter);
    const showLightsSections = isLights && roomFilter === ON_TAB;

    const handleToggle = (item) => {
        if (!onToggle || !item?.entity_id) return;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

        if (kind === 'lights') {
            // Explicit turn_on / turn_off — `toggle` + dual optimistic updates
            // desyncs when taps are fast or HA events arrive out of order.
            const nextOn = !isDeviceOn(item, kind);
            const nextState = nextOn ? 'on' : 'off';
            applyLocal(item.entity_id, { state: nextState });
            onToggle('light', nextOn ? 'turn_on' : 'turn_off', { entity_id: item.entity_id });
            return;
        }

        // Same as ClimateCard — power switch (when paired) + set_hvac_mode
        const attrs = item.attributes || {};
        const hvacModes = Array.isArray(attrs.hvac_modes) ? attrs.hvac_modes : [];
        const currentlyOn = isDeviceOn(item, kind);
        const wrapUpdate = (id, domain, service, data) => {
            onToggle(domain, service, { entity_id: id, ...data });
        };

        if (currentlyOn) {
            applyLocal(item.entity_id, {
                state: 'off',
                attributes: { hvac_mode: 'off' },
                powerSwitchStateObj: item.powerSwitchEntityId
                    ? { ...(item.powerSwitchStateObj || {}), state: 'off' }
                    : item.powerSwitchStateObj,
            });
            applyClimatePower(item, false, wrapUpdate);
            return;
        }

        const last = attrs.last_on_operation;
        const mode =
            (last && hvacModes.includes(last) && last !== 'off')
                ? last
                : (hvacModes.find((m) => m && m !== 'off') || 'cool');

        applyLocal(item.entity_id, {
            state: mode,
            attributes: { hvac_mode: mode },
            powerSwitchStateObj: item.powerSwitchEntityId
                ? { ...(item.powerSwitchStateObj || {}), state: 'on' }
                : item.powerSwitchStateObj,
        });
        applyClimatePower(item, true, wrapUpdate, mode);
    };

    const changeTemp = (item, delta) => {
        if (!onToggle || !item?.entity_id || isLights) return;
        const attrs = item.attributes || {};
        const current = attrs.temperature;
        if (current == null || Number.isNaN(Number(current))) return;
        const next = Number(current) + delta;
        if (!isClimateTemperatureValid(next, attrs)) return;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        applyLocal(item.entity_id, { attributes: { temperature: next } });
        onToggle('climate', 'set_temperature', {
            entity_id: item.entity_id,
            temperature: next,
        });
    };

    const renderDeviceRow = (item) => {
        const on = isDeviceOn(item, kind);
        const targetTemp = item.attributes?.temperature;
        const hasTarget = Number.isFinite(Number(targetTemp));
        const { min: minTemp, max: maxTemp } = getClimateTempBounds(item.attributes || {});
        const atMin = hasTarget && minTemp != null && Number(targetTemp) <= minTemp;
        const atMax = hasTarget && maxTemp != null && Number(targetTemp) >= maxTemp;
        const metaParts = [on ? 'On' : 'Off'];
        if (!isLights && roomFilter === 'all') {
            const areaId = entityAreaMap[item.entity_id];
            if (areaId && areaNameById[areaId]) {
                metaParts.push(shortRoomLabel(formatDisplayName(areaNameById[areaId])));
            }
        }

        return (
            <View
                key={item.entity_id}
                style={[styles.row, on && { borderColor: `${accent}33` }]}
            >
                <TouchableOpacity
                    style={styles.rowMain}
                    onPress={() => handleToggle(item)}
                    activeOpacity={0.75}
                >
                    <View style={[
                        styles.iconWrap,
                        on
                            ? { backgroundColor: `${accent}18`, borderColor: `${accent}55` }
                            : null,
                    ]}>
                        <TitleIcon
                            size={15}
                            color={on ? accent : 'rgba(237,237,245,0.32)'}
                            fill={isLights && on ? accent : 'transparent'}
                        />
                    </View>

                    <View style={styles.rowBody}>
                        <Text style={styles.rowName} numberOfLines={1}>
                            {deviceName(item)}
                        </Text>
                        <Text
                            style={[styles.rowMeta, on && { color: accent }]}
                            numberOfLines={1}
                        >
                            {metaParts.join('  ·  ')}
                        </Text>
                    </View>
                </TouchableOpacity>

                {!isLights && hasTarget ? (
                    <View style={styles.tempControls}>
                        <TouchableOpacity
                            style={[styles.tempBtn, atMin && styles.tempBtnDisabled]}
                            onPress={() => changeTemp(item, -1)}
                            disabled={atMin}
                            activeOpacity={0.7}
                            hitSlop={{ top: 6, bottom: 6, left: 6, right: 4 }}
                        >
                            <Minus
                                size={14}
                                color={atMin ? 'rgba(255,255,255,0.22)' : '#fff'}
                                strokeWidth={2.5}
                            />
                        </TouchableOpacity>
                        <Text style={[styles.tempValue, on && { color: accent }]}>
                            {Math.round(Number(targetTemp))}°
                        </Text>
                        <TouchableOpacity
                            style={[styles.tempBtn, atMax && styles.tempBtnDisabled]}
                            onPress={() => changeTemp(item, 1)}
                            disabled={atMax}
                            activeOpacity={0.7}
                            hitSlop={{ top: 6, bottom: 6, left: 4, right: 6 }}
                        >
                            <Plus
                                size={14}
                                color={atMax ? 'rgba(255,255,255,0.22)' : '#fff'}
                                strokeWidth={2.5}
                            />
                        </TouchableOpacity>
                    </View>
                ) : null}

                <TouchableOpacity
                    onPress={() => handleToggle(item)}
                    activeOpacity={0.75}
                    hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                >
                    <View style={[styles.togglePill, on && { backgroundColor: accent }]}>
                        <View style={[styles.toggleKnob, on && styles.toggleKnobOn]} />
                    </View>
                </TouchableOpacity>
            </View>
        );
    };

    return (
        <Modal
            visible={visible}
            transparent
            animationType="none"
            onRequestClose={onClose}
        >
            <View style={styles.overlay}>
                <ModalBackdrop onPress={onClose} />
                <Animated.View style={[styles.sheet, sheetAnimStyle]}>
                    <GestureDetector gesture={dismissGesture}>
                        <View style={styles.handleTouchArea}>
                            <View style={styles.handle} />
                        </View>
                    </GestureDetector>

                    <View style={styles.header}>
                        <View style={[styles.headerIcon, { backgroundColor: `${accent}1F` }]}>
                            <TitleIcon size={16} color={accent} fill={isLights ? accent : 'transparent'} />
                        </View>
                        <View style={styles.headerText}>
                            <Text style={styles.title}>{isLights ? 'Lights' : 'Air Conditioning'}</Text>
                            <Text style={styles.subtitle}>
                                {subtitleScope.length === 0
                                    ? (isLights
                                        ? (roomFilter === ON_TAB ? 'No lights on' : 'No lights here')
                                        : 'Nothing in this room')
                                    : (isLights && roomFilter === ON_TAB
                                        ? `${onCount} on`
                                        : `${onCount} on  ·  ${offCount} off`)}
                                {selectedRoom && selectedRoom.value !== ON_TAB
                                    ? `  ·  ${selectedRoom.fullLabel || selectedRoom.label}`
                                    : ''}
                            </Text>
                        </View>
                        <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.7}>
                            <X size={16} color="rgba(255,255,255,0.55)" />
                        </TouchableOpacity>
                    </View>

                    {roomPills.length > 1 ? (
                        <View style={styles.filtersBar}>
                            <ScrollView
                                horizontal
                                showsHorizontalScrollIndicator={false}
                                contentContainerStyle={styles.pillsContent}
                                style={styles.pillsScroll}
                            >
                                {roomPills.map((pill) => {
                                    const active = roomFilter === pill.value;
                                    return (
                                        <TouchableOpacity
                                            key={pill.value}
                                            style={[
                                                styles.pill,
                                                active && {
                                                    backgroundColor: `${accent}22`,
                                                    borderColor: `${accent}99`,
                                                },
                                            ]}
                                            onPress={() => setRoomFilter(pill.value)}
                                            activeOpacity={0.75}
                                            accessibilityLabel={pill.fullLabel || pill.label}
                                        >
                                            <Text
                                                style={[styles.pillText, active && { color: accent }]}
                                                numberOfLines={1}
                                            >
                                                {pill.label}
                                            </Text>
                                            <View style={[
                                                styles.pillCountWrap,
                                                active && { backgroundColor: `${accent}33` },
                                            ]}>
                                                <Text style={[styles.pillCount, active && { color: accent }]}>
                                                    {pill.count}
                                                </Text>
                                            </View>
                                        </TouchableOpacity>
                                    );
                                })}
                            </ScrollView>
                        </View>
                    ) : null}

                    <View style={styles.listPane}>
                        {(showLightsSections ? roomSections.length === 0 : filtered.length === 0) ? (
                            <Text style={styles.emptyText}>
                                {isLights
                                    ? (roomFilter === ON_TAB ? 'No lights on' : 'No lights here')
                                    : 'No ACs here'}
                            </Text>
                        ) : (
                            <ScrollView
                                style={styles.scroll}
                                showsVerticalScrollIndicator={false}
                                contentContainerStyle={styles.scrollContent}
                                nestedScrollEnabled
                            >
                                {showLightsSections
                                    ? roomSections.map((section) => (
                                        <View key={section.areaId} style={styles.roomSection}>
                                            <Text style={styles.roomSectionTitle}>{section.title}</Text>
                                            {section.data.map((item) => renderDeviceRow(item))}
                                        </View>
                                    ))
                                    : filtered.map((item) => renderDeviceRow(item))}
                            </ScrollView>
                        )}
                    </View>
                </Animated.View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.65)',
        justifyContent: 'flex-end',
    },
    sheet: {
        backgroundColor: '#0f1028',
        borderTopLeftRadius: 28,
        borderTopRightRadius: 28,
        borderTopWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
        paddingBottom: 28,
        maxHeight: '82%',
        overflow: 'hidden',
    },
    handle: {
        width: 36,
        height: 4,
        borderRadius: 2,
        backgroundColor: 'rgba(255,255,255,0.15)',
        alignSelf: 'center',
    },
    handleTouchArea: {
        alignSelf: 'stretch',
        alignItems: 'center',
        paddingTop: 10,
        paddingBottom: 6,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 18,
        paddingBottom: 12,
        gap: 12,
    },
    headerIcon: {
        width: 34,
        height: 34,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerText: {
        flex: 1,
        minWidth: 0,
    },
    title: {
        color: '#fff',
        fontSize: 17,
        fontFamily: CF.bold,
        letterSpacing: 0.1,
    },
    subtitle: {
        color: 'rgba(255,255,255,0.38)',
        fontSize: 12,
        fontFamily: CF.regular,
        marginTop: 2,
    },
    closeBtn: {
        width: 30,
        height: 30,
        borderRadius: 15,
        backgroundColor: 'rgba(255,255,255,0.07)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    filtersBar: {
        backgroundColor: '#0f1028',
        borderTopWidth: StyleSheet.hairlineWidth,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderColor: 'rgba(255,255,255,0.14)',
        paddingVertical: 10,
        zIndex: 4,
        elevation: 4,
    },
    pillsScroll: {
        flexGrow: 0,
    },
    pillsContent: {
        paddingHorizontal: 18,
        paddingVertical: 2,
        gap: 7,
        alignItems: 'center',
    },
    pill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        maxWidth: 148,
        paddingLeft: 11,
        paddingRight: 6,
        paddingVertical: 6,
        borderRadius: 16,
        backgroundColor: 'rgba(255,255,255,0.045)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    pillText: {
        flexShrink: 1,
        color: 'rgba(237,237,245,0.72)',
        fontSize: 12,
        fontFamily: CF.medium,
    },
    pillCountWrap: {
        minWidth: 22,
        height: 22,
        borderRadius: 11,
        paddingHorizontal: 6,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(255,255,255,0.08)',
    },
    pillCount: {
        color: 'rgba(237,237,245,0.45)',
        fontSize: 10,
        fontFamily: CF.semibold,
    },
    listPane: {
        maxHeight: LIST_MAX_H,
        minHeight: 160,
    },
    scroll: {
        flexGrow: 0,
        maxHeight: LIST_MAX_H,
        paddingHorizontal: 14,
        paddingTop: 10,
    },
    scrollContent: {
        paddingBottom: 10,
        gap: 6,
    },
    roomSection: {
        gap: 6,
        marginBottom: 10,
    },
    roomSectionTitle: {
        color: 'rgba(237,237,245,0.45)',
        fontSize: 12,
        fontFamily: CF.semibold,
        letterSpacing: 0.4,
        textTransform: 'uppercase',
        marginTop: 4,
        marginBottom: 2,
        paddingHorizontal: 2,
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.035)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.055)',
        borderRadius: 14,
        paddingHorizontal: 12,
        paddingVertical: 10,
        gap: 8,
    },
    rowMain: {
        flex: 1,
        minWidth: 0,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 11,
    },
    iconWrap: {
        width: 32,
        height: 32,
        borderRadius: 9,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
        backgroundColor: 'rgba(255,255,255,0.03)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    rowBody: {
        flex: 1,
        minWidth: 0,
        gap: 2,
    },
    rowName: {
        color: '#ededf5',
        fontSize: 14,
        fontFamily: CF.medium,
    },
    rowMeta: {
        color: 'rgba(237,237,245,0.38)',
        fontSize: 11,
        fontFamily: CF.regular,
    },
    togglePill: {
        width: 42,
        height: 24,
        borderRadius: 12,
        backgroundColor: 'rgba(255,255,255,0.12)',
        justifyContent: 'center',
        paddingHorizontal: 2,
    },
    toggleKnob: {
        width: 20,
        height: 20,
        borderRadius: 10,
        backgroundColor: '#fff',
        alignSelf: 'flex-start',
    },
    toggleKnobOn: {
        alignSelf: 'flex-end',
    },
    tempControls: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        flexShrink: 0,
    },
    tempBtn: {
        width: 28,
        height: 28,
        borderRadius: 8,
        backgroundColor: 'rgba(255,255,255,0.08)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    tempBtnDisabled: {
        opacity: 0.45,
    },
    tempValue: {
        minWidth: 34,
        textAlign: 'center',
        color: '#ededf5',
        fontSize: 13,
        fontFamily: CF.semibold,
    },
    emptyText: {
        color: 'rgba(255,255,255,0.35)',
        fontSize: 14,
        fontFamily: CF.regular,
        textAlign: 'center',
        paddingVertical: 36,
    },
});
