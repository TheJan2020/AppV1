import { View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView } from 'react-native';
import {
    Monitor, Play, Pause, Volume2, VolumeX,
    ChevronDown, ChevronUp,
    Home, ChevronLeft, Plus, Minus, Check, X,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors } from '../../constants/Colors';
import { useState, useEffect, useRef } from 'react';
import { SvgUri } from 'react-native-svg';
import { CF, RoomDeviceStatus } from '../../utils/typography';

/** Inner TV card (nested inside room Media panel `#13132A`) */
const TV_CARD_BG = '#09091A';
/** D-pad tuned: slightly larger outer ring + slightly smaller inner disc */
const DPAD_OUTER_SCALE = 0.84;
const DPAD_INNER_SCALE = 0.76;
const DPAD_SIZE = 244 * DPAD_OUTER_SCALE;
const DPAD_INNER_W = 178.393798828125 * DPAD_INNER_SCALE;
const DPAD_INNER_H = 178.3676300048828 * DPAD_INNER_SCALE;
const DPAD_INNER_RADIUS = Math.min(DPAD_INNER_W, DPAD_INNER_H) / 2;
const DPAD_INNER_BG = 'rgba(19, 19, 42, 0.23)';
const DPAD_EDGE_INSET = Math.round(56 * DPAD_OUTER_SCALE);
const DPAD_HIT_DEPTH = Math.round(58 * DPAD_OUTER_SCALE);
const DPAD_HIT_PAD_V = Math.round(8 * DPAD_OUTER_SCALE);
const DPAD_HIT_PAD_H = Math.round(10 * DPAD_OUTER_SCALE);
const DPAD_DOT = Math.round(7 * DPAD_OUTER_SCALE);
/** App shortcuts: 2-col grid, wide pills (height fixed) */
const APP_ROW_HEIGHT = 68;
const APP_COL_GAP = 12;
const PROGRESS_FILL = '#00C2FF';
const TRACK_BG = '#2A2A40';
/** 90deg — D-pad, remote circles, volume pill (Figma system blues) */
const BTN_GRADIENT = ['#0066A7', '#0086CC'];
/** 90deg — primary play / pause disc (TV + music; matches Figma) */
const PLAY_BTN_GRADIENT = ['#245072', '#187FB2'];
const BTN_GRADIENT_START = { x: 0, y: 0.5 };
const BTN_GRADIENT_END = { x: 1, y: 0.5 };
const ICON_STROKE = 2;

/**
 * Expandable TV media card. Expanded area reserved for follow-up specs.
 *
 * @param {object} player — root media_player entity row { entity_id, displayName, stateObj }
 * @param {object[]} childPlayers — grouped cast / linked players (parentId → this player)
 */
export default function MediaCard({
    player,
    childPlayers = [],
    mapping,
    mediaMappings = [],
    onUpdate,
    needsChange,
    adminUrl,
    haUrl: _haUrl,
    haToken: _haToken,
    onShowSourceOverlay,
    onShowVolumeOverlay: _onShowVolumeOverlay,
}) {
    if (!player?.stateObj) return null;

    const activeChild =
        childPlayers.find(c => ['playing', 'buffering', 'on', 'paused'].includes(c.stateObj?.state)) ||
        null;
    const targetEntity = activeChild || player;
    const targetState = targetEntity.stateObj.state;
    const targetAttributes = targetEntity.stateObj.attributes || {};
    const parentAttributes = player.stateObj.attributes || {};

    const source_list = targetAttributes.source_list ?? parentAttributes.source_list;
    const source = targetAttributes.source ?? parentAttributes.source;
    const is_volume_muted = !!targetAttributes.is_volume_muted;

    const parentState = player.stateObj.state;
    const isOn =
        parentState !== 'off' &&
        parentState !== 'standby' &&
        parentState !== 'unavailable';
    const isPlaying = ['playing', 'buffering'].includes(targetState);

    /** Apple TV, etc.: play + volume whenever HA isn’t unavailable */
    const showTvTransport = parentState !== 'unavailable';

    const activeMapping = activeChild
        ? mediaMappings.find(m => m.entity_id === activeChild.entity_id)
        : mapping;
    const activeIconUrl =
        activeMapping?.mediaType?.icon_path && adminUrl
            ? `${adminUrl}${activeMapping.mediaType.icon_path}`
            : null;

    const accentColor = '#8947ca';
    const iconColor = isPlaying ? accentColor : isOn ? '#fff' : Colors.textDim;

    const [expanded, setExpanded] = useState(false);
    const [appsModalVisible, setAppsModalVisible] = useState(false);
    const [selectedAppSources, setSelectedAppSources] = useState([]);
    const [appsSaving, setAppsSaving] = useState(false);
    const [appsConfigLoaded, setAppsConfigLoaded] = useState(false);
    const volumeRepeatRef = useRef({ timeoutId: null, intervalId: null });
    const holdVolumeLevelRef = useRef(
        typeof targetAttributes.volume_level === 'number' ? targetAttributes.volume_level : null
    );

    const duration = targetAttributes.media_duration || 0;
    const [position, setPosition] = useState(targetAttributes.media_position || 0);
    const [isScrubbing, setIsScrubbing] = useState(false);

    useEffect(() => {
        if (!isScrubbing) setPosition(targetAttributes.media_position || 0);
    }, [targetAttributes.media_position, isScrubbing]);

    useEffect(() => {
        if (typeof targetAttributes.volume_level === 'number') {
            holdVolumeLevelRef.current = targetAttributes.volume_level;
        }
    }, [targetAttributes.volume_level]);

    useEffect(() => {
        let interval;
        if (targetState === 'playing' && !isScrubbing && duration > 0) {
            interval = setInterval(() => {
                setPosition(prev => Math.min(prev + 1, duration));
            }, 1000);
        }
        return () => clearInterval(interval);
    }, [targetState, isScrubbing, duration]);

    useEffect(() => {
        const stopVolumeRepeat = () => {
            if (volumeRepeatRef.current.timeoutId) clearTimeout(volumeRepeatRef.current.timeoutId);
            if (volumeRepeatRef.current.intervalId) clearInterval(volumeRepeatRef.current.intervalId);
            volumeRepeatRef.current.timeoutId = null;
            volumeRepeatRef.current.intervalId = null;
        };
        return stopVolumeRepeat;
    }, []);

    useEffect(() => {
        let cancelled = false;
        const loadAppSelection = async () => {
            if (!adminUrl || !player?.entity_id) return;
            try {
                const base = adminUrl.endsWith('/') ? adminUrl.slice(0, -1) : adminUrl;
                const headers = _haToken ? { Authorization: `Bearer ${_haToken}` } : {};
                const res = await fetch(`${base}/api/media-remote-apps?entity_id=${encodeURIComponent(player.entity_id)}`, { headers });
                if (!res.ok) return;
                const data = await res.json();
                if (cancelled || !data?.success) return;
                if (Array.isArray(data.selected_apps)) {
                    setSelectedAppSources(data.selected_apps);
                }
                setAppsConfigLoaded(true);
            } catch (e) {
                // keep fallback list if backend is unreachable
            }
        };
        loadAppSelection();
        return () => { cancelled = true; };
    }, [adminUrl, player?.entity_id, _haToken]);

    /** HH:MM:SS (e.g. 01:30:59) */
    const formatTime = secs => {
        if (secs == null || isNaN(secs)) return '00:00:00';
        const n = Math.max(0, Math.floor(secs));
        const h = Math.floor(n / 3600);
        const m = Math.floor((n % 3600) / 60);
        const s = n % 60;
        const hh = h < 10 ? `0${h}` : `${h}`;
        return `${hh}:${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
    };
    const fmtPos = formatTime(position);
    const fmtDur = formatTime(duration);

    const isLive = !duration && ['playing', 'buffering', 'paused', 'on'].includes(targetState);

    const handleAction = (entity, service, data = {}, options = {}) => {
        const { haptics = true } = options;
        if (haptics) {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        }

        if (service.startsWith('remote_')) {
            const command = service.replace('remote_', '');
            const mp = mediaMappings.find(m => m.entity_id === entity.entity_id);
            const strategy = mp?.remoteStrategy || 'default';
            if (strategy === 'webos') {
                const map = {
                    up: 'UP',
                    down: 'DOWN',
                    left: 'LEFT',
                    right: 'RIGHT',
                    select: 'ENTER',
                    home: 'HOME',
                    back: 'BACK',
                };
                onUpdate(entity.entity_id, 'webostv', 'button', { button: map[command] || command.toUpperCase() });
            } else {
                const remoteId = entity.entity_id.replace('media_player.', 'remote.');
                const map = {
                    up: 'up',
                    down: 'down',
                    left: 'left',
                    right: 'right',
                    select: 'select',
                    home: 'home',
                    back: 'menu',
                };
                onUpdate(remoteId, 'remote', 'send_command', { command: map[command] || command });
            }
            return;
        }

        if (service === 'turn_on') {
            const mp = mediaMappings.find(m => m.entity_id === entity.entity_id);
            const btn = mp?.turnOnButton;
            if (btn?.startsWith('button.')) {
                onUpdate(btn, 'button', 'press', {});
                return;
            }
        }

        onUpdate(entity.entity_id, 'media_player', service, data);
    };

    const toggleMute = () => {
        const newMute = !is_volume_muted;
        handleAction(targetEntity, 'volume_mute', { is_volume_muted: newMute });
        if (activeChild && activeChild.stateObj.attributes.is_volume_muted !== undefined) {
            handleAction(activeChild, 'volume_mute', { is_volume_muted: newMute });
        }
    };

    const handlePlayPause = () => {
        const currentlyPlaying = ['playing', 'buffering'].includes(targetState);
        const currentlyPaused = targetState === 'paused';
        if (currentlyPlaying) {
            handleAction(targetEntity, 'media_pause');
            return;
        }
        if (currentlyPaused || ['idle', 'off', 'on'].includes(targetState)) {
            handleAction(targetEntity, 'media_play');
            return;
        }
        handleAction(targetEntity, 'media_play_pause');
    };

    const stopVolumeRepeat = () => {
        if (volumeRepeatRef.current.timeoutId) clearTimeout(volumeRepeatRef.current.timeoutId);
        if (volumeRepeatRef.current.intervalId) clearInterval(volumeRepeatRef.current.intervalId);
        volumeRepeatRef.current.timeoutId = null;
        volumeRepeatRef.current.intervalId = null;
    };

    const startVolumeRepeat = direction => {
        stopVolumeRepeat();
        const step = direction === 'up' ? 0.04 : -0.04;
        const supportsAbsolute = typeof targetAttributes.volume_level === 'number';
        if (supportsAbsolute) {
            const baseLevel = typeof holdVolumeLevelRef.current === 'number'
                ? holdVolumeLevelRef.current
                : targetAttributes.volume_level;
            const next = Math.max(0, Math.min(1, baseLevel + step));
            holdVolumeLevelRef.current = next;
            handleAction(targetEntity, 'volume_set', { volume_level: next }, { haptics: false });
        } else {
            const service = direction === 'up' ? 'volume_up' : 'volume_down';
            handleAction(targetEntity, service, {}, { haptics: false });
        }

        volumeRepeatRef.current.timeoutId = setTimeout(() => {
            volumeRepeatRef.current.intervalId = setInterval(() => {
                if (supportsAbsolute) {
                    const baseLevel = typeof holdVolumeLevelRef.current === 'number'
                        ? holdVolumeLevelRef.current
                        : (typeof targetAttributes.volume_level === 'number' ? targetAttributes.volume_level : 0);
                    const next = Math.max(0, Math.min(1, baseLevel + step));
                    holdVolumeLevelRef.current = next;
                    handleAction(targetEntity, 'volume_set', { volume_level: next }, { haptics: false });
                } else {
                    const service = direction === 'up' ? 'volume_up' : 'volume_down';
                    handleAction(targetEntity, service, {}, { haptics: false });
                }
            }, 55);
        }, 90);
    };

    const handleSourceSelect = src => handleAction(player, 'select_source', { source: src });

    const toggleTvPower = () => {
        if (parentState === 'unavailable') return;
        if (isOn) handleAction(player, 'turn_off', {});
        else handleAction(player, 'turn_on', {});
    };

    const openSourcePicker = () => {
        if (!onShowSourceOverlay || !Array.isArray(source_list) || source_list.length === 0) return;
        onShowSourceOverlay({
            sourceList: source_list,
            currentSource: source,
            childPlayers,
            mediaMappings,
            onSelect: handleSourceSelect,
        });
    };

    /** App shortcut grid (HA `source_list`) — 2 columns; only real apps (no empty placeholder rows). */
    const APP_GRID_SLOTS = 8;
    const allAppSources = Array.isArray(source_list) ? source_list.filter(Boolean) : [];
    const effectiveSelectedApps = selectedAppSources.filter(app => allAppSources.includes(app));
    const appGridSources = (() => {
        const list = (appsConfigLoaded && effectiveSelectedApps.length > 0) ? [...effectiveSelectedApps] : [...allAppSources];
        return list.filter(Boolean).slice(0, APP_GRID_SLOTS);
    })();
    const appGridRows = (() => {
        const rows = [];
        for (let i = 0; i < appGridSources.length; i += 2) {
            rows.push(appGridSources.slice(i, i + 2));
        }
        return rows;
    })();

    const toggleAppInSelection = app => {
        setSelectedAppSources(prev => (
            prev.includes(app) ? prev.filter(v => v !== app) : [...prev, app]
        ));
    };

    const saveAppSelection = async () => {
        if (!adminUrl || !player?.entity_id) {
            setAppsModalVisible(false);
            return;
        }
        try {
            setAppsSaving(true);
            const base = adminUrl.endsWith('/') ? adminUrl.slice(0, -1) : adminUrl;
            const headers = {
                'Content-Type': 'application/json',
                ...(_haToken ? { Authorization: `Bearer ${_haToken}` } : {}),
            };
            await fetch(`${base}/api/media-remote-apps`, {
                method: 'PUT',
                headers,
                body: JSON.stringify({
                    entity_id: player.entity_id,
                    selected_apps: selectedAppSources.filter(app => allAppSources.includes(app)),
                }),
            });
            setAppsConfigLoaded(true);
            setAppsModalVisible(false);
        } catch (e) {
            setAppsModalVisible(false);
        } finally {
            setAppsSaving(false);
        }
    };

    return (
        <>
        <View style={[styles.container, needsChange && { borderColor: accentColor, borderWidth: 2 }]}>
            <View style={styles.topRow}>
                <TouchableOpacity
                    style={[styles.iconBox, parentState === 'unavailable' && styles.iconBoxDisabled]}
                    onPress={toggleTvPower}
                    disabled={parentState === 'unavailable'}
                    activeOpacity={0.75}
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    accessibilityRole="button"
                    accessibilityLabel={isOn ? 'Turn TV off' : 'Turn TV on'}
                >
                    {activeIconUrl ? (
                        <SvgUri width={24} height={24} uri={activeIconUrl} fill={iconColor} />
                    ) : (
                        <Monitor size={24} color={iconColor} strokeWidth={ICON_STROKE} />
                    )}
                </TouchableOpacity>
                <View style={{ flex: 1 }} />
                <TouchableOpacity
                    style={styles.chevronBtn}
                    onPress={() => setExpanded(e => !e)}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                    {expanded ? (
                        <ChevronUp size={20} color="rgba(255,255,255,0.35)" />
                    ) : (
                        <ChevronDown size={20} color="rgba(255,255,255,0.35)" />
                    )}
                </TouchableOpacity>
            </View>

            {parentState === 'unavailable' && (
                <Text style={styles.offHint} numberOfLines={1}>
                    Unavailable
                </Text>
            )}

            {isOn && duration > 0 && (
                <View style={styles.timelineBlock}>
                    <View style={styles.timelineTimesRow}>
                        <Text style={[styles.timeText, styles.timeTextTv]}>{fmtPos}</Text>
                        <Text style={[styles.timeText, styles.timeTextTv]}>{fmtDur}</Text>
                    </View>
                    <TimelineScrubber
                        duration={duration}
                        position={position}
                        onScrub={val => {
                            setIsScrubbing(true);
                            setPosition(val * duration);
                        }}
                        onCommit={val => {
                            handleAction(targetEntity, 'media_seek', { seek_position: val * duration });
                            setIsScrubbing(false);
                        }}
                    />
                </View>
            )}

            {showTvTransport && !expanded && (
                <View style={styles.controlsRow}>
                    <View style={styles.tvControlsBar}>
                        <View style={styles.tvPlayAbsolute} pointerEvents="box-none">
                            <TouchableOpacity
                                style={styles.playBtnWrap}
                                onPress={handlePlayPause}
                                activeOpacity={0.85}
                            >
                                <LinearGradient
                                    colors={PLAY_BTN_GRADIENT}
                                    start={BTN_GRADIENT_START}
                                    end={BTN_GRADIENT_END}
                                    style={styles.playBtn}
                                >
                                    {['playing', 'buffering'].includes(targetState) ? (
                                        <Pause size={28} color="#fff" fill="#fff" stroke="#fff" strokeWidth={2.5} />
                                    ) : (
                                        <Play size={28} color="#fff" fill="#fff" stroke="#fff" strokeWidth={0} style={{ marginLeft: 4 }} />
                                    )}
                                </LinearGradient>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            )}

            {expanded && (
                <View style={styles.expandedSection}>
                    {/* D-pad: gradient ring, inner #13132A @ 23%, cardinal dots only (no arrows / no center dot) */}
                    <View style={styles.dPadBlock}>
                        <View style={styles.dPadFrame}>
                            <LinearGradient
                                colors={BTN_GRADIENT}
                                start={BTN_GRADIENT_START}
                                end={BTN_GRADIENT_END}
                                style={styles.dPadRingFill}
                            />
                            <TouchableOpacity
                                style={styles.dPadHitUp}
                                onPress={() => handleAction(targetEntity, 'remote_up')}
                                hitSlop={{ bottom: 8, left: 20, right: 20 }}
                                accessibilityLabel="Up"
                            >
                                <View style={styles.dPadDirDot} />
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={styles.dPadHitDown}
                                onPress={() => handleAction(targetEntity, 'remote_down')}
                                hitSlop={{ top: 8, left: 20, right: 20 }}
                                accessibilityLabel="Down"
                            >
                                <View style={styles.dPadDirDot} />
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={styles.dPadHitLeft}
                                onPress={() => handleAction(targetEntity, 'remote_left')}
                                hitSlop={{ right: 8, top: 20, bottom: 20 }}
                                accessibilityLabel="Left"
                            >
                                <View style={styles.dPadDirDot} />
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={styles.dPadHitRight}
                                onPress={() => handleAction(targetEntity, 'remote_right')}
                                hitSlop={{ left: 8, top: 20, bottom: 20 }}
                                accessibilityLabel="Right"
                            >
                                <View style={styles.dPadDirDot} />
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={styles.dPadCenterDisc}
                                onPress={() => handleAction(targetEntity, 'remote_select')}
                                activeOpacity={0.88}
                                accessibilityLabel="Select"
                            />
                        </View>
                    </View>

                    {/*
                      Two columns: Back + Play/Mute share one vertical center; Home + volume pill share the other (Figma alignment).
                    */}
                    <View style={styles.expandedControlGrid}>
                        <View style={styles.expandedControlCol}>
                            <RemoteCircleBtn onPress={() => handleAction(targetEntity, 'remote_back')}>
                                <ChevronLeft size={24} color="#fff" strokeWidth={ICON_STROKE} />
                            </RemoteCircleBtn>
                            <View style={styles.expandedColMidGap} />
                            <View style={styles.expandedStackInCol}>
                                <RemoteCircleBtn onPress={handlePlayPause} gradientColors={PLAY_BTN_GRADIENT}>
                                    {['playing', 'buffering'].includes(targetState) ? (
                                        <Pause size={24} color="#fff" fill="#fff" stroke="#fff" strokeWidth={2} />
                                    ) : (
                                        <Play size={24} color="#fff" fill="#fff" stroke="#fff" strokeWidth={0} style={{ marginLeft: 4 }} />
                                    )}
                                </RemoteCircleBtn>
                                <RemoteCircleBtn onPress={toggleMute}>
                                    {is_volume_muted ? (
                                        <VolumeX size={22} color="#fff" strokeWidth={ICON_STROKE} />
                                    ) : (
                                        <Volume2 size={22} color="#fff" strokeWidth={ICON_STROKE} />
                                    )}
                                </RemoteCircleBtn>
                            </View>
                        </View>
                        <View style={styles.expandedControlCol}>
                            <RemoteCircleBtn onPress={() => handleAction(targetEntity, 'remote_home')}>
                                <Home size={24} color="#fff" strokeWidth={ICON_STROKE} />
                            </RemoteCircleBtn>
                            <View style={styles.expandedColMidGap} />
                            <View style={styles.volPillFigma}>
                                <LinearGradient
                                    colors={BTN_GRADIENT}
                                    start={BTN_GRADIENT_START}
                                    end={BTN_GRADIENT_END}
                                    style={styles.volPillGradientFill}
                                />
                                <TouchableOpacity
                                    style={styles.volPillHalf}
                                    onPressIn={() => startVolumeRepeat('up')}
                                    onPressOut={stopVolumeRepeat}
                                >
                                    <Plus size={20} color="#fff" strokeWidth={2.5} />
                                </TouchableOpacity>
                                <View style={styles.volPillDivider} />
                                <TouchableOpacity
                                    style={styles.volPillHalf}
                                    onPressIn={() => startVolumeRepeat('down')}
                                    onPressOut={stopVolumeRepeat}
                                >
                                    <Minus size={20} color="#fff" strokeWidth={2.5} />
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>

                    {appGridSources.length > 0 && (
                        <>
                            <View style={styles.appGridHeader}>
                                <Text style={styles.appGridHeading}>Apps</Text>
                                <TouchableOpacity hitSlop={8} onPress={() => setAppsModalVisible(true)} accessibilityLabel="Edit app shortcuts">
                                    <Text style={styles.appGridEdit}>Edit</Text>
                                </TouchableOpacity>
                            </View>
                            <View style={styles.appGrid}>
                                {appGridRows.map((row, rowIdx) => (
                                    <View key={`app-row-${rowIdx}`} style={styles.appGridRow}>
                                        {row.map(srcName => (
                                            <TouchableOpacity
                                                key={srcName}
                                                style={styles.appGridCellWide}
                                                onPress={() => handleSourceSelect(srcName)}
                                                activeOpacity={0.85}
                                            >
                                                <Text style={styles.appGridLabel} numberOfLines={1}>
                                                    {srcName}
                                                </Text>
                                            </TouchableOpacity>
                                        ))}
                                        {row.length === 1 ? <View style={styles.appGridCellSpacer} /> : null}
                                    </View>
                                ))}
                            </View>
                        </>
                    )}

                    <TouchableOpacity
                        style={styles.sourcePill}
                        onPress={openSourcePicker}
                        disabled={!source_list?.length}
                    >
                        <Text style={[styles.sourcePillText, !source_list?.length && styles.sourcePillTextDim]}>Source</Text>
                    </TouchableOpacity>
                </View>
            )}
        </View>
        <Modal
            visible={appsModalVisible}
            transparent
            animationType="slide"
            onRequestClose={() => setAppsModalVisible(false)}
        >
            <View style={styles.appsModalBackdrop}>
                <TouchableOpacity style={styles.appsModalBgPress} onPress={() => setAppsModalVisible(false)} />
                <View style={styles.appsModalSheet}>
                    <View style={styles.appsModalHandleTouchArea}>
                        <View style={styles.appsModalHandle} />
                    </View>
                    <View style={styles.appsModalHeader}>
                        <Text style={styles.appsModalTitle}>Edit Apps</Text>
                        <TouchableOpacity onPress={() => setAppsModalVisible(false)} style={styles.appsModalCloseBtn}>
                            <X size={18} color="#ededf5" />
                        </TouchableOpacity>
                    </View>
                    <Text style={styles.appsModalSub}>
                        {allAppSources.length} available · {selectedAppSources.filter(app => allAppSources.includes(app)).length} selected
                    </Text>
                    <ScrollView style={styles.appsModalList} showsVerticalScrollIndicator={false}>
                        {allAppSources.map(app => {
                            const selected = selectedAppSources.includes(app);
                            return (
                                <TouchableOpacity
                                    key={app}
                                    style={[styles.appsModalItem, selected && styles.appsModalItemSelected]}
                                    onPress={() => toggleAppInSelection(app)}
                                    activeOpacity={0.7}
                                >
                                    <Text style={[styles.appsModalItemText, selected && styles.appsModalItemTextSelected]} numberOfLines={1}>
                                        {app}
                                    </Text>
                                    <View style={[styles.appsModalCheck, selected && styles.appsModalCheckOn]}>
                                        {selected ? <Check size={12} color="#fff" strokeWidth={3} /> : null}
                                    </View>
                                </TouchableOpacity>
                            );
                        })}
                    </ScrollView>
                    <View style={styles.appsModalActions}>
                        <TouchableOpacity style={styles.appsModalBtnGhost} onPress={() => setAppsModalVisible(false)} activeOpacity={0.8}>
                            <Text style={styles.appsModalBtnGhostText}>Cancel</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.appsModalBtnSave, appsSaving && { opacity: 0.6 }]}
                            onPress={saveAppSelection}
                            disabled={appsSaving}
                            activeOpacity={0.8}
                        >
                            <Text style={styles.appsModalBtnSaveText}>{appsSaving ? 'Saving...' : 'Save'}</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
        </>
    );
}

function RemoteCircleBtn({ onPress, children, gradientColors = BTN_GRADIENT }) {
    return (
        <TouchableOpacity style={styles.remoteCircleBtnFigma} onPress={onPress} activeOpacity={0.88}>
            <LinearGradient
                colors={gradientColors}
                start={BTN_GRADIENT_START}
                end={BTN_GRADIENT_END}
                style={styles.remoteCircleGradientFill}
            />
            <View style={styles.remoteCircleChildren}>{children}</View>
        </TouchableOpacity>
    );
}

function TimelineScrubber({ duration, position, onScrub, onCommit }) {
    const [width, setWidth] = useState(0);
    const handle = (e, isEnd = false) => {
        if (width === 0 || !duration) return;
        const x = e.nativeEvent.locationX;
        const progress = Math.max(0, Math.min(x, width)) / width;
        if (isEnd) onCommit(progress);
        else onScrub(progress);
    };
    return (
        <View
            style={styles.timelineTrackFull}
            onLayout={e => setWidth(e.nativeEvent.layout.width)}
            onTouchMove={e => handle(e, false)}
            onTouchEnd={e => handle(e, true)}
        >
            <View
                style={[
                    styles.timelineFill,
                    {
                        width: `${Math.min(100, duration ? (position / duration) * 100 : 0)}%`,
                        backgroundColor: PROGRESS_FILL,
                    },
                ]}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        width: '100%',
        backgroundColor: TV_CARD_BG,
        borderRadius: 22,
        padding: 16,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
    },
    topRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    iconBox: {
        width: 42,
        height: 42,
        alignItems: 'center',
        justifyContent: 'center',
    },
    iconBoxDisabled: {
        opacity: 0.45,
    },
    chevronBtn: {
        width: 36,
        height: 36,
        alignItems: 'center',
        justifyContent: 'center',
    },
    timelineBlock: {
        width: '100%',
        marginTop: 12,
        paddingHorizontal: 2,
    },
    timelineTimesRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 8,
        paddingHorizontal: 2,
    },
    timeText: {
        color: '#FFFFFF',
        fontSize: 11,
        fontVariant: ['tabular-nums'],
        fontFamily: CF.light,
        letterSpacing: 0.8,
    },
    timeTextTv: {
        fontSize: 12,
        minWidth: 72,
    },
    timelineTrackFull: {
        width: '100%',
        height: 4,
        backgroundColor: TRACK_BG,
        borderRadius: 2,
        overflow: 'hidden',
    },
    timelineFill: {
        height: '100%',
        borderRadius: 2,
    },
    liveBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: 'rgba(255,0,0,0.15)',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 8,
    },
    liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#ff4444' },
    liveText: { color: '#ff6b6b', fontSize: 10, fontFamily: CF.semibold },
    controlsRow: {
        marginTop: 18,
    },
    /** Play is truly centered on the card; mute sits on the right rail */
    tvControlsBar: {
        width: '100%',
        height: 68,
        position: 'relative',
        justifyContent: 'center',
    },
    tvPlayAbsolute: {
        ...StyleSheet.absoluteFillObject,
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1,
    },
    tvMuteRail: {
        position: 'absolute',
        right: 0,
        top: 0,
        bottom: 0,
        justifyContent: 'center',
        alignItems: 'center',
        width: 48,
        zIndex: 2,
    },
    iconBtn: {
        width: 44,
        height: 44,
        alignItems: 'center',
        justifyContent: 'center',
    },
    playBtnWrap: {
        marginHorizontal: 4,
        shadowColor: '#187FB2',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.4,
        shadowRadius: 12,
        elevation: 8,
    },
    playBtn: {
        width: 64,
        height: 64,
        borderRadius: 32,
        alignItems: 'center',
        justifyContent: 'center',
    },
    offHint: {
        ...RoomDeviceStatus,
        marginTop: 12,
        color: Colors.textDim,
        fontSize: 13,
    },
    expandedSection: {
        marginTop: 10,
        paddingTop: 16,
        minHeight: 8,
    },
    dPadBlock: {
        alignItems: 'center',
        marginBottom: 22,
    },
    dPadFrame: {
        width: DPAD_SIZE,
        height: DPAD_SIZE,
        alignItems: 'center',
        justifyContent: 'center',
    },
    dPadRingFill: {
        position: 'absolute',
        width: DPAD_SIZE,
        height: DPAD_SIZE,
        borderRadius: DPAD_SIZE / 2,
    },
    dPadDirDot: {
        width: DPAD_DOT,
        height: DPAD_DOT,
        borderRadius: Math.ceil(DPAD_DOT / 2),
        backgroundColor: 'rgba(255,255,255,0.95)',
    },
    dPadHitUp: {
        position: 'absolute',
        top: 0,
        left: DPAD_EDGE_INSET,
        right: DPAD_EDGE_INSET,
        height: DPAD_HIT_DEPTH,
        alignItems: 'center',
        justifyContent: 'flex-start',
        paddingTop: DPAD_HIT_PAD_V,
        zIndex: 4,
    },
    dPadHitDown: {
        position: 'absolute',
        bottom: 0,
        left: DPAD_EDGE_INSET,
        right: DPAD_EDGE_INSET,
        height: DPAD_HIT_DEPTH,
        alignItems: 'center',
        justifyContent: 'flex-end',
        paddingBottom: DPAD_HIT_PAD_V,
        zIndex: 4,
    },
    dPadHitLeft: {
        position: 'absolute',
        left: 0,
        top: DPAD_EDGE_INSET,
        bottom: DPAD_EDGE_INSET,
        width: DPAD_HIT_DEPTH,
        justifyContent: 'center',
        alignItems: 'flex-start',
        paddingLeft: DPAD_HIT_PAD_H,
        zIndex: 4,
    },
    dPadHitRight: {
        position: 'absolute',
        right: 0,
        top: DPAD_EDGE_INSET,
        bottom: DPAD_EDGE_INSET,
        width: DPAD_HIT_DEPTH,
        justifyContent: 'center',
        alignItems: 'flex-end',
        paddingRight: DPAD_HIT_PAD_H,
        zIndex: 4,
    },
    dPadCenterDisc: {
        position: 'absolute',
        width: DPAD_INNER_W,
        height: DPAD_INNER_H,
        borderRadius: DPAD_INNER_RADIUS,
        left: (DPAD_SIZE - DPAD_INNER_W) / 2,
        top: (DPAD_SIZE - DPAD_INNER_H) / 2,
        backgroundColor: DPAD_INNER_BG,
        zIndex: 3,
    },
    expandedControlGrid: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'flex-start',
        gap: 36,
        marginBottom: 24,
        paddingHorizontal: 4,
    },
    /** Fixed width so top + bottom controls share one vertical center line */
    expandedControlCol: {
        width: 56,
        alignItems: 'center',
    },
    expandedColMidGap: {
        height: 20,
    },
    expandedStackInCol: {
        gap: 14,
        alignItems: 'center',
    },
    remoteCircleBtnFigma: {
        width: 56,
        height: 56,
        borderRadius: 28,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
    },
    remoteCircleGradientFill: {
        ...StyleSheet.absoluteFillObject,
        borderRadius: 28,
    },
    remoteCircleChildren: {
        ...StyleSheet.absoluteFillObject,
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1,
    },
    volPillFigma: {
        width: 52,
        height: 120,
        borderRadius: 26,
        overflow: 'hidden',
    },
    volPillGradientFill: {
        ...StyleSheet.absoluteFillObject,
        borderRadius: 26,
    },
    volPillHalf: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1,
    },
    volPillDivider: {
        height: StyleSheet.hairlineWidth,
        backgroundColor: 'rgba(0,0,0,0.25)',
        zIndex: 1,
    },
    appGridHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 10,
    },
    appGridHeading: {
        color: 'rgba(255,255,255,0.55)',
        fontSize: 12,
        fontFamily: CF.semibold,
        letterSpacing: 0.6,
        textTransform: 'uppercase',
    },
    appGridEdit: {
        color: 'rgba(255,255,255,0.42)',
        fontSize: 12,
        fontFamily: CF.medium,
    },
    appGrid: {
        width: '100%',
        marginBottom: 12,
    },
    appGridRow: {
        flexDirection: 'row',
        width: '100%',
        alignItems: 'center',
        gap: APP_COL_GAP,
        marginBottom: 10,
    },
    /** Two equal columns — wide, short pill */
    appGridCellWide: {
        flex: 1,
        minWidth: 0,
        height: APP_ROW_HEIGHT,
        borderRadius: APP_ROW_HEIGHT / 2,
        backgroundColor: '#13132A',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 10,
    },
    /** Balances the row when there is a single app (keeps pill half-width like two-column layout). */
    appGridCellSpacer: {
        flex: 1,
        minWidth: 0,
    },
    appGridLabel: {
        color: '#fff',
        fontSize: 11,
        fontFamily: CF.medium,
        textAlign: 'center',
    },
    sourcePill: {
        alignSelf: 'stretch',
        paddingVertical: 13,
        borderRadius: 28,
        backgroundColor: '#13132A',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    sourcePillText: {
        color: '#fff',
        fontSize: 13,
        fontFamily: CF.semibold,
        letterSpacing: 0.4,
    },
    sourcePillTextDim: {
        opacity: 0.4,
    },
    appsModalBackdrop: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'flex-end',
        zIndex: 100,
    },
    appsModalBgPress: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.6)',
    },
    appsModalSheet: {
        backgroundColor: '#12132a',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        borderWidth: 1,
        borderColor: '#212136',
        paddingHorizontal: 20,
        paddingTop: 0,
        paddingBottom: 28,
        maxHeight: '80%',
    },
    appsModalHandleTouchArea: {
        alignSelf: 'stretch',
        alignItems: 'center',
        paddingVertical: 10,
        marginTop: 4,
    },
    appsModalHandle: {
        width: 36,
        height: 4,
        borderRadius: 2,
        backgroundColor: 'rgba(255,255,255,0.15)',
    },
    appsModalHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 4,
    },
    appsModalTitle: {
        color: '#ededf5',
        fontSize: 18,
        fontFamily: CF.bold,
    },
    appsModalCloseBtn: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: 'rgba(237,237,245,0.1)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    appsModalSub: {
        color: '#4a4957',
        fontSize: 13,
        fontFamily: CF.regular,
        marginBottom: 12,
    },
    appsModalList: {
        maxHeight: 360,
    },
    appsModalItem: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderRadius: 14,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
        backgroundColor: 'rgba(255,255,255,0.03)',
        paddingHorizontal: 16,
        paddingVertical: 14,
        marginBottom: 8,
    },
    appsModalItemSelected: {
        backgroundColor: 'rgba(137,71,202,0.08)',
        borderColor: 'rgba(137,71,202,0.35)',
    },
    appsModalItemText: {
        color: '#ededf5',
        fontSize: 14,
        fontFamily: CF.medium,
        flex: 1,
        marginRight: 12,
        letterSpacing: 0.1,
    },
    appsModalItemTextSelected: {
        color: '#ededf5',
    },
    appsModalCheck: {
        width: 24,
        height: 24,
        borderRadius: 12,
        borderWidth: 1.5,
        borderColor: 'rgba(255,255,255,0.2)',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'transparent',
    },
    appsModalCheckOn: {
        backgroundColor: '#8947ca',
        borderColor: '#8947ca',
    },
    appsModalActions: {
        marginTop: 12,
        flexDirection: 'row',
        justifyContent: 'flex-end',
        gap: 10,
    },
    appsModalBtnGhost: {
        borderRadius: 14,
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderWidth: 1,
        borderColor: '#212136',
        backgroundColor: '#1a1b2e',
    },
    appsModalBtnGhostText: {
        color: '#ededf5',
        fontSize: 14,
        fontFamily: CF.medium,
    },
    appsModalBtnSave: {
        borderRadius: 14,
        paddingHorizontal: 16,
        paddingVertical: 12,
        backgroundColor: '#8947ca',
    },
    appsModalBtnSaveText: {
        color: '#fff',
        fontSize: 14,
        fontFamily: CF.bold,
    },
});
