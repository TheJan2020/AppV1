import { View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView, Alert } from 'react-native';
import {
    Monitor, Volume2, VolumeX,
    ChevronDown, ChevronUp,
    Home, ChevronLeft, Plus, Minus, Check, X,
} from 'lucide-react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors } from '../../constants/Colors';
import { useState, useEffect, useRef } from 'react';
import { SvgUri } from 'react-native-svg';
import { CF, RoomDeviceStatus } from '../../utils/typography';
import {
    buildRemoteServiceCalls,
    buildPowerServiceCalls,
    resolveRemoteStrategy,
    remoteStrategyLabel,
    TV_REMOTE_STRATEGIES,
    mediaPlayerSupportsVolumeSet,
    mediaPlayerSupportsMute,
    findRoomVolumeCompanion,
} from '../../utils/tvRemote';
import { formatHaServiceError } from '../../utils/haErrorMessages';

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
const MEDIA_LOG = '[MediaCard]';

function logMedia(...args) {
    console.log(MEDIA_LOG, ...args);
}

function snapshotPlayer(entity, label = 'player') {
    if (!entity?.stateObj && !entity?.entity_id) {
        return { label, missing: true };
    }
    const stateObj = entity.stateObj || entity;
    const attrs = stateObj.attributes || {};
    return {
        label,
        entity_id: entity.entity_id || stateObj.entity_id,
        state: stateObj.state,
        app_name: attrs.app_name ?? null,
        media_title: attrs.media_title ?? null,
        media_artist: attrs.media_artist ?? null,
        volume_level: attrs.volume_level ?? null,
        is_volume_muted: attrs.is_volume_muted ?? null,
        supported_features: attrs.supported_features ?? null,
        source: attrs.source ?? null,
    };
}

/**
 * Expandable TV media card. Expanded area reserved for follow-up specs.
 *
 * @param {object} player — root media_player entity row { entity_id, displayName, stateObj }
 * @param {object[]} childPlayers — grouped cast / linked players (parentId → this player)
 */
export default function MediaCard({
    player,
    childPlayers = [],
    roomPlayers = [],
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

    const parentState = player.stateObj.state;
    const isOn =
        parentState !== 'off' &&
        parentState !== 'standby' &&
        parentState !== 'unavailable';
    const isPlaying = ['playing', 'buffering'].includes(targetState);
    const isPaused = targetState === 'paused';

    const activeMapping = activeChild
        ? mediaMappings.find(m => m.entity_id === activeChild.entity_id)
        : mapping;
    const rootStrategy = resolveRemoteStrategy(player.entity_id, mapping, player);
    const isSamsung = rootStrategy === TV_REMOTE_STRATEGIES.SAMSUNG;
    const isAppleTv = rootStrategy === TV_REMOTE_STRATEGIES.DEFAULT;
    const supportsVolumeSet = !isAppleTv && mediaPlayerSupportsVolumeSet(targetAttributes);

    const selectableSources = Array.isArray(source_list) ? source_list.filter(Boolean) : [];
    const showSourcePicker = selectableSources.length > 0;
    /**
     * Play/pause availability:
     * - playing / paused → always
     * - Samsung / Apple TV → allow when on (remote play/pause works without media attrs)
     * - Other TVs → only when media metadata exists (idle home screen is a no-op)
     */
    const hasMediaSignal = !!(
        targetAttributes.media_title ||
        targetAttributes.media_artist ||
        targetAttributes.media_content_id ||
        (typeof targetAttributes.media_duration === 'number' && targetAttributes.media_duration > 0)
    );
    const canPlayPause =
        parentState !== 'unavailable' &&
        isOn &&
        (isPlaying || isPaused || ((isSamsung || isAppleTv) && isOn) || hasMediaSignal);

    /** Collapsed: show transport when we can pause/play */
    const showTvTransport = parentState !== 'unavailable';
    const showCollapsedPlay = showTvTransport && canPlayPause;

    const brandLabel =
        mapping?.mediaType?.name ||
        remoteStrategyLabel(rootStrategy);
    const deviceTitle =
        player.displayName ||
        player.stateObj?.attributes?.friendly_name ||
        brandLabel ||
        'TV';
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
    /** When HA stays on idle/on (common for Apple/Samsung), track last play/pause intent. */
    const [assumePlaying, setAssumePlaying] = useState(true);
    /** Apple TV has no HA mute — optimistic icon only when volume_set mute is used. */
    const [appleMuteOptimistic, setAppleMuteOptimistic] = useState(null);
    const applePreMuteVolRef = useRef(null);
    const volumeRepeatRef = useRef({ timeoutId: null, intervalId: null });
    const holdVolumeLevelRef = useRef(
        typeof targetAttributes.volume_level === 'number' ? targetAttributes.volume_level : null
    );
    const is_volume_muted =
        isAppleTv && appleMuteOptimistic !== null
            ? appleMuteOptimistic
            : !!targetAttributes.is_volume_muted;

    const duration = targetAttributes.media_duration || 0;
    const [position, setPosition] = useState(targetAttributes.media_position || 0);
    const [isScrubbing, setIsScrubbing] = useState(false);

    /**
     * Prefer live HA state for play/pause:
     * - playing / buffering → show pause (next tap pauses)
     * - paused → show play (next tap plays)
     * - idle / on (Apple/Samsung often don't report playing) → use assumePlaying
     */
    const transportState = (isSamsung || isAppleTv ? player : targetEntity)?.stateObj?.state;
    const transportIsPlaying = ['playing', 'buffering'].includes(transportState);
    const transportIsPaused = transportState === 'paused';
    const showPauseIcon = transportIsPlaying
        ? true
        : transportIsPaused
          ? false
          : (isSamsung || isAppleTv) && isOn
            ? assumePlaying
            : isPlaying;

    useEffect(() => {
        if (!isScrubbing) setPosition(targetAttributes.media_position || 0);
    }, [targetAttributes.media_position, isScrubbing]);

    useEffect(() => {
        if (transportIsPlaying) setAssumePlaying(true);
        else if (transportIsPaused) setAssumePlaying(false);
    }, [transportIsPlaying, transportIsPaused]);

    useEffect(() => {
        if (typeof targetAttributes.volume_level === 'number') {
            holdVolumeLevelRef.current = targetAttributes.volume_level;
        }
    }, [targetAttributes.volume_level]);

    // Log TV playback / volume snapshot when the card mounts or the player entity changes.
    useEffect(() => {
        logMedia('TV state on load', {
            deviceTitle:
                player.displayName ||
                parentAttributes.friendly_name ||
                player.entity_id,
            strategy: rootStrategy,
            isAppleTv,
            isSamsung,
            root: snapshotPlayer(player, 'root'),
            target: snapshotPlayer(targetEntity, 'target'),
            children: (childPlayers || []).map((c, i) => snapshotPlayer(c, `child_${i}`)),
        });
        // Only re-log when switching to a different TV card, not on every HA state tick.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [player?.entity_id]);

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

    const runUpdate = (id, domain, service, data) => {
        const payload = { entity_id: id, domain, service, data };
        logMedia('HA request', payload);
        if (!onUpdate) {
            logMedia('HA skipped — onUpdate missing', payload);
            return Promise.resolve();
        }
        return Promise.resolve(onUpdate(id, domain, service, data)).then(
            result => {
                logMedia('HA response OK', {
                    entity_id: id,
                    domain,
                    service,
                    result: result ?? null,
                });
                return result;
            },
            err => {
                logMedia('HA response ERROR', {
                    entity_id: id,
                    domain,
                    service,
                    error: err?.message ?? String(err),
                    err,
                });
                return Promise.reject(err);
            }
        );
    };

    const alertTvServiceError = (err, action) => {
        const formatted = formatHaServiceError(err?.message ?? err, {
            displayName: deviceTitle,
            action,
        });
        Alert.alert(formatted.title, formatted.body);
    };

    const handleAction = (entity, service, data = {}, options = {}) => {
        const { haptics = true, showAlert = false } = options;
        logMedia('action', {
            entity_id: entity?.entity_id,
            service,
            data,
            options,
        });
        if (haptics) {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        }

        if (service.startsWith('remote_')) {
            const command = service.replace('remote_', '');
            const mp =
                mediaMappings.find(m => m.entity_id === entity.entity_id) ||
                (entity.entity_id === player.entity_id ? mapping : null);
            const calls = buildRemoteServiceCalls(entity, command, mp);
            logMedia('remote calls built', { command, calls });
            const tasks = calls.map(call =>
                runUpdate(call.entityId, call.domain, call.service, call.data)
            );
            // Dual media_player + remote calls: succeed if any path works.
            return Promise.allSettled(tasks).then(results => {
                logMedia('remote calls settled', {
                    command,
                    results: results.map(r =>
                        r.status === 'fulfilled'
                            ? { status: 'fulfilled', value: r.value ?? null }
                            : { status: 'rejected', reason: r.reason?.message ?? String(r.reason) }
                    ),
                });
                if (results.some(r => r.status === 'fulfilled')) return results;
                const err = results.find(r => r.status === 'rejected')?.reason;
                if (showAlert) alertTvServiceError(err, service);
                return Promise.reject(err || new Error('Remote command failed'));
            });
        }

        if (service === 'turn_on' || service === 'turn_off') {
            const mp =
                mediaMappings.find(m => m.entity_id === entity.entity_id) || mapping;
            const calls = buildPowerServiceCalls(entity, service === 'turn_on', mp);
            const tasks = calls.map(call =>
                runUpdate(call.entityId, call.domain, call.service, call.data)
            );
            return Promise.allSettled(tasks).then(results => {
                if (results.some(r => r.status === 'fulfilled')) return results;
                const err = results.find(r => r.status === 'rejected')?.reason;
                alertTvServiceError(err, service);
                return Promise.reject(err || new Error('Power command failed'));
            });
        }

        // Samsung / Apple TV play/pause: media_player + remote.send_command.
        if ((isSamsung || isAppleTv) && (service === 'media_play' || service === 'media_pause')) {
            const keyCmd = service === 'media_pause' ? 'pause' : 'play';
            const mp =
                mediaMappings.find(m => m.entity_id === entity.entity_id) || mapping;
            // Always drive the root TV entity — activeChild can be a different player.
            const tvEntity = entity.entity_id === player.entity_id ? entity : player;
            const calls = buildRemoteServiceCalls(tvEntity, keyCmd, mapping || mp);
            const tasks =
                calls.length > 0
                    ? calls.map(call =>
                          runUpdate(call.entityId, call.domain, call.service, call.data)
                      )
                    : [runUpdate(tvEntity.entity_id, 'media_player', service, data)];
            return Promise.allSettled(tasks).then(results => {
                logMedia('play/pause settled', {
                    service,
                    results: results.map(r =>
                        r.status === 'fulfilled'
                            ? { status: 'fulfilled', value: r.value ?? null }
                            : { status: 'rejected', reason: r.reason?.message ?? String(r.reason) }
                    ),
                });
                if (results.some(r => r.status === 'fulfilled')) return results;
                const err = results.find(r => r.status === 'rejected')?.reason;
                if (showAlert) alertTvServiceError(err, service);
                return Promise.reject(err || new Error('Play/pause failed'));
            });
        }

        return runUpdate(entity.entity_id, 'media_player', service, data).catch(err => {
            if (showAlert) alertTvServiceError(err, service);
            return Promise.reject(err);
        });
    };

    const toggleMute = () => {
        const newMute = !is_volume_muted;
        const muteEntity = isAppleTv || isSamsung ? player : targetEntity;
        logMedia('MUTE button pressed', {
            newMute,
            currentlyMuted: is_volume_muted,
            muteEntity: muteEntity?.entity_id,
            isAppleTv,
            supportsMute: mediaPlayerSupportsMute(parentAttributes),
            snapshot: snapshotPlayer(player, 'root'),
        });

        // HA apple_tv has no volume_mute (HTTP 500) and no mute remote command.
        if (isAppleTv && !mediaPlayerSupportsMute(parentAttributes)) {
            const level =
                typeof parentAttributes.volume_level === 'number'
                    ? parentAttributes.volume_level
                    : typeof targetAttributes.volume_level === 'number'
                      ? targetAttributes.volume_level
                      : null;

            if (level !== null) {
                logMedia('Apple mute via volume_set', { newMute, level });
                if (newMute) {
                    applePreMuteVolRef.current = level;
                    handleAction(muteEntity, 'volume_set', { volume_level: 0 });
                } else {
                    const restore =
                        typeof applePreMuteVolRef.current === 'number'
                            ? applePreMuteVolRef.current
                            : 0.4;
                    handleAction(muteEntity, 'volume_set', { volume_level: restore });
                }
                setAppleMuteOptimistic(newMute);
                return;
            }

            logMedia('Apple mute unavailable', {
                reason: 'HA apple_tv has no VOLUME_MUTE and volume_level is null',
                hint: 'Mute is not supported. Volume ± needs CEC or HomePod on the Apple TV.',
            });
            Alert.alert(
                'Mute unavailable',
                'Apple TV does not support mute in Home Assistant. Only volume up/down can work, and only if Apple TV Volume Control is set to Auto/TV (CEC) or HomePod — not IR.'
            );
            return;
        }

        handleAction(muteEntity, 'volume_mute', { is_volume_muted: newMute });
        if (activeChild && activeChild.stateObj.attributes.is_volume_muted !== undefined) {
            handleAction(activeChild, 'volume_mute', { is_volume_muted: newMute });
        }
    };

    const handlePlayPause = () => {
        if (!canPlayPause) return;

        // Prefer root Apple/Samsung player — child HDMI sources often lack transport.
        const transportEntity = isSamsung || isAppleTv ? player : targetEntity;
        const state = transportEntity?.stateObj?.state;
        const playingNow = ['playing', 'buffering'].includes(state);
        const pausedNow = state === 'paused';

        // Decide from HA state first; fall back to assumePlaying when idle/on.
        let shouldPause;
        if (playingNow) shouldPause = true;
        else if (pausedNow) shouldPause = false;
        else if ((isSamsung || isAppleTv) && isOn) shouldPause = assumePlaying;
        else shouldPause = isPlaying;

        logMedia('PLAY/PAUSE pressed', {
            entity_id: transportEntity?.entity_id,
            haState: state,
            playingNow,
            pausedNow,
            assumePlaying,
            action: shouldPause ? 'media_pause' : 'media_play',
        });

        if (shouldPause) {
            handleAction(transportEntity, 'media_pause');
            setAssumePlaying(false);
            return;
        }
        handleAction(transportEntity, 'media_play');
        setAssumePlaying(true);
    };

    const stopVolumeRepeat = () => {
        if (volumeRepeatRef.current.timeoutId) clearTimeout(volumeRepeatRef.current.timeoutId);
        if (volumeRepeatRef.current.intervalId) clearInterval(volumeRepeatRef.current.intervalId);
        volumeRepeatRef.current.timeoutId = null;
        volumeRepeatRef.current.intervalId = null;
    };

    const sendVolumeStep = direction => {
        const volCmd = direction === 'up' ? 'volume_up' : 'volume_down';
        const volEntity = isSamsung || isAppleTv ? player : targetEntity;

        logMedia('VOLUME button', {
            direction,
            volEntity: volEntity?.entity_id,
            isAppleTv,
            isSamsung,
            supportsVolumeSet,
            currentLevel: targetAttributes.volume_level ?? parentAttributes.volume_level ?? null,
        });

        // ── Apple TV ──────────────────────────────────────────────────────────
        // Apple TV volume is complex because it depends on HA apple_tv CEC config.
        // We fire ALL available paths simultaneously and whichever physically works wins.
        //
        // Path A: Apple TV remote.send_command volume_up/down
        //   → This goes over HDMI CEC to the connected TV (works when Apple TV
        //     Settings → Remotes and Devices → Volume Control is Auto/TV/HomePod)
        //
        // Path B: Companion TV in the same room (e.g. Samsung/LG panel)
        //   → Direct volume control on the physical display the Apple TV is plugged into
        //   → Useful when Apple TV CEC is not configured but Samsung/LG integration works
        //
        // If Apple TV reports volume_level (CEC fully active) use smooth volume_set instead.
        if (isAppleTv) {
            const appleVol = parentAttributes.volume_level;

            if (typeof appleVol === 'number') {
                // CEC is active and HA reports volume_level → smooth absolute volume step
                const step = direction === 'up' ? 0.05 : -0.05;
                const base = typeof holdVolumeLevelRef.current === 'number'
                    ? holdVolumeLevelRef.current
                    : appleVol;
                const next = Math.max(0, Math.min(1, base + step));
                holdVolumeLevelRef.current = next;
                handleAction(player, 'volume_set', { volume_level: next }, { haptics: false });
                return;
            }

            // CEC not reporting volume_level → fire all available paths simultaneously
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

            // Path A: Apple TV's own remote entity (CEC → connected TV over HDMI)
            const appleMapping = mediaMappings.find(m => m.entity_id === player.entity_id) || mapping;
            const appleCalls = buildRemoteServiceCalls(player, volCmd, appleMapping);

            // Path B: Companion TV (Samsung/LG) in the same room
            const companion = findRoomVolumeCompanion(player, roomPlayers, mediaMappings);
            const companionMapping = companion
                ? (mediaMappings.find(m => m.entity_id === companion.entity_id) || null)
                : null;
            const companionCalls = companion
                ? buildRemoteServiceCalls(companion, volCmd, companionMapping)
                : [];

            const allCalls = [...appleCalls, ...companionCalls];
            logMedia('Apple TV volume (multi-path)', {
                direction,
                appleCalls,
                companion: companion?.entity_id ?? null,
                companionCalls,
            });

            if (allCalls.length > 0) {
                Promise.allSettled(
                    allCalls.map(call => runUpdate(call.entityId, call.domain, call.service, call.data))
                );
            }
            return;
        }

        // ── Samsung / LG / generic ────────────────────────────────────────────
        // When the TV integration provides volume_level, use smooth absolute steps.
        // Otherwise fall back to relative volume_up / volume_down.
        if (supportsVolumeSet) {
            const step = direction === 'up' ? 0.04 : -0.04;
            const baseLevel = typeof holdVolumeLevelRef.current === 'number'
                ? holdVolumeLevelRef.current
                : (typeof targetAttributes.volume_level === 'number' ? targetAttributes.volume_level : 0);
            const next = Math.max(0, Math.min(1, baseLevel + step));
            holdVolumeLevelRef.current = next;
            handleAction(volEntity, 'volume_set', { volume_level: next }, { haptics: false });
            return;
        }

        handleAction(volEntity, volCmd, {}, { haptics: false });
    };

    const startVolumeRepeat = direction => {
        logMedia('VOLUME press start', { direction });
        stopVolumeRepeat();
        sendVolumeStep(direction);

        volumeRepeatRef.current.timeoutId = setTimeout(() => {
            volumeRepeatRef.current.intervalId = setInterval(() => {
                sendVolumeStep(direction);
            }, 120);
        }, 280);
    };

    const handleSourceSelect = src => {
        handleAction(player, 'select_source', { source: src });
    };

    const toggleTvPower = async () => {
        if (parentState === 'unavailable') {
            Alert.alert(
                'TV unavailable',
                `${deviceTitle} is unavailable in Home Assistant right now.`
            );
            return;
        }
        try {
            await handleAction(player, isOn ? 'turn_off' : 'turn_on', {});
        } catch (_) {
            // Alert already shown from handleAction power path
        }
    };

    const openSourcePicker = () => {
        if (!onShowSourceOverlay || !showSourcePicker) return;
        onShowSourceOverlay({
            title: 'Select Source',
            sourceList: selectableSources,
            currentSource: source,
            childPlayers: isSamsung ? [] : childPlayers,
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
                    accessibilityLabel={isOn ? `Turn ${deviceTitle} off` : `Turn ${deviceTitle} on`}
                >
                    {activeIconUrl ? (
                        <SvgUri width={24} height={24} uri={activeIconUrl} fill={iconColor} />
                    ) : (
                        <Monitor size={24} color={iconColor} strokeWidth={ICON_STROKE} />
                    )}
                </TouchableOpacity>
                <View style={styles.titleBlock}>
                    <Text style={styles.deviceName} numberOfLines={1}>
                        {deviceTitle}
                    </Text>
                    {brandLabel &&
                        String(brandLabel).toLowerCase() !== String(deviceTitle).toLowerCase() && (
                            <Text style={styles.brandInline} numberOfLines={1}>
                                {brandLabel}
                            </Text>
                        )}
                </View>
                <TouchableOpacity
                    style={styles.chevronBtn}
                    onPress={() => setExpanded(e => !e)}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    accessibilityLabel={expanded ? `Collapse ${deviceTitle}` : `Expand ${deviceTitle}`}
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

            {showCollapsedPlay && !expanded && (
                <View style={styles.controlsRow}>
                    <View style={styles.tvControlsBar}>
                        {/* Left spacer keeps the play button visually centered */}
                        <View style={styles.tvSideSlot} />
                        <TouchableOpacity
                            style={styles.playBtnWrap}
                            onPress={handlePlayPause}
                            activeOpacity={0.85}
                            accessibilityLabel={showPauseIcon ? 'Pause' : 'Play'}
                        >
                            <LinearGradient
                                colors={PLAY_BTN_GRADIENT}
                                start={BTN_GRADIENT_START}
                                end={BTN_GRADIENT_END}
                                style={styles.playBtn}
                            >
                                <MaterialCommunityIcons
                                    name="play-pause"
                                    size={30}
                                    color="#fff"
                                />
                            </LinearGradient>
                        </TouchableOpacity>
                        <View style={styles.tvSideSlot}>
                            <TouchableOpacity
                                style={styles.iconBtn}
                                onPress={toggleMute}
                                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                accessibilityLabel={is_volume_muted ? 'Unmute' : 'Mute'}
                            >
                                {is_volume_muted ? (
                                    <VolumeX size={22} color="#fff" strokeWidth={ICON_STROKE} />
                                ) : (
                                    <Volume2 size={22} color="#fff" strokeWidth={ICON_STROKE} />
                                )}
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
                                <RemoteCircleBtn
                                    onPress={handlePlayPause}
                                    disabled={!canPlayPause}
                                    accessibilityLabel={showPauseIcon ? 'Pause' : 'Play'}
                                >
                                    <MaterialCommunityIcons
                                        name="play-pause"
                                        size={26}
                                        color="#fff"
                                    />
                                </RemoteCircleBtn>
                                <RemoteCircleBtn onPress={toggleMute} accessibilityLabel={is_volume_muted ? 'Unmute' : 'Mute'}>
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
                                    pointerEvents="none"
                                />
                                <TouchableOpacity
                                    style={styles.volPillHalf}
                                    onPressIn={() => startVolumeRepeat('up')}
                                    onPressOut={stopVolumeRepeat}
                                    accessibilityLabel="Volume up"
                                >
                                    <Plus size={20} color="#fff" strokeWidth={2.5} />
                                </TouchableOpacity>
                                <View style={styles.volPillDivider} pointerEvents="none" />
                                <TouchableOpacity
                                    style={styles.volPillHalf}
                                    onPressIn={() => startVolumeRepeat('down')}
                                    onPressOut={stopVolumeRepeat}
                                    accessibilityLabel="Volume down"
                                >
                                    <Minus size={20} color="#fff" strokeWidth={2.5} />
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>

                    {isSamsung ? (
                        <>
                            <View style={styles.appGridHeader}>
                                <Text style={styles.appGridHeading}>Channels</Text>
                            </View>
                            <View style={styles.appGrid}>
                                <View style={styles.appGridRow}>
                                    <TouchableOpacity
                                        style={styles.appGridCellWide}
                                        onPress={() => handleAction(player, 'remote_channel_down')}
                                        activeOpacity={0.85}
                                        accessibilityLabel="Channel down"
                                    >
                                        <Text style={styles.appGridLabel} numberOfLines={1}>
                                            CH −
                                        </Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={styles.appGridCellWide}
                                        onPress={() => handleAction(player, 'remote_channel_up')}
                                        activeOpacity={0.85}
                                        accessibilityLabel="Channel up"
                                    >
                                        <Text style={styles.appGridLabel} numberOfLines={1}>
                                            CH +
                                        </Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        </>
                    ) : appGridSources.length > 0 ? (
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
                    ) : null}

                    {showSourcePicker ? (
                        <TouchableOpacity
                            style={styles.sourcePill}
                            onPress={openSourcePicker}
                            activeOpacity={0.85}
                        >
                            <Text style={styles.sourcePillText}>Source</Text>
                        </TouchableOpacity>
                    ) : null}
                </View>
            )}
        </View>
        <Modal
            visible={!isSamsung && appsModalVisible}
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

function RemoteCircleBtn({ onPress, children, gradientColors = BTN_GRADIENT, disabled = false, accessibilityLabel }) {
    return (
        <TouchableOpacity
            style={[styles.remoteCircleBtnFigma, disabled && styles.remoteCircleBtnDisabled]}
            onPress={onPress}
            activeOpacity={0.88}
            disabled={disabled}
            accessibilityLabel={accessibilityLabel}
            accessibilityState={{ disabled: !!disabled }}
        >
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
    titleBlock: {
        flex: 1,
        marginHorizontal: 10,
        justifyContent: 'center',
        minWidth: 0,
    },
    deviceName: {
        color: '#FFFFFF',
        fontSize: 15,
        fontFamily: CF.semibold,
        letterSpacing: 0.2,
    },
    brandInline: {
        marginTop: 2,
        color: 'rgba(255,255,255,0.42)',
        fontSize: 12,
        fontFamily: CF.medium,
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
    /** Play centered; volume sits immediately to its right (matching left spacer). */
    tvControlsBar: {
        width: '100%',
        height: 68,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
    },
    tvSideSlot: {
        width: 48,
        height: 68,
        alignItems: 'center',
        justifyContent: 'center',
    },
    tvPlayAbsolute: {
        ...StyleSheet.absoluteFillObject,
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1,
    },
    tvVolumeRail: {
        position: 'absolute',
        right: 0,
        top: 0,
        bottom: 0,
        justifyContent: 'center',
        alignItems: 'center',
        width: 48,
        zIndex: 2,
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
    remoteCircleBtnDisabled: {
        opacity: 0.32,
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
        zIndex: 2,
        elevation: 2,
    },
    volPillDivider: {
        height: StyleSheet.hairlineWidth,
        backgroundColor: 'rgba(0,0,0,0.25)',
        zIndex: 2,
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
