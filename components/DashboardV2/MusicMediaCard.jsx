import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Image,
    Modal,
    ScrollView,
    FlatList,
    ActivityIndicator,
} from 'react-native';
import {
    Music,
    Play,
    Pause,
    ChevronDown,
    ChevronUp,
    ListMusic,
    Speaker,
} from 'lucide-react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors } from '../../constants/Colors';
import { useState, useEffect, useCallback, useRef } from 'react';
import ServiceMessageToast from './ServiceMessageToast';
import {
    formatHaServiceError,
    getLastPlayedMedia,
    isEmptyQueueError,
} from '../../utils/haErrorMessages';
import { SvgUri } from 'react-native-svg';
import { CF, RoomDeviceStatus } from '../../utils/typography';
import { isMusicAssistantMediaPlayer } from '../../utils/roomHelpers';
import {
    getMediaPlayerDuration,
    getMediaPlayerPosition,
    isMediaPlayerPaused,
    isMediaPlayerPlaying,
    pickMediaControlTarget,
} from '../../utils/mediaPlayerHelpers';

const TV_CARD_BG = '#09091A';
const PROGRESS_FILL = '#00C2FF';
const TRACK_BG = '#2A2A40';
const BTN_GRADIENT = ['#0066A7', '#0086CC'];
/** 90deg — play / pause disc (Figma: linear-gradient(90deg, #245072 0%, #187FB2 100.03%)) */
const PLAY_BTN_GRADIENT = ['#245072', '#187FB2'];
const BTN_GRADIENT_START = { x: 0, y: 0.5 };
const BTN_GRADIENT_END = { x: 1, y: 0.5 };
const PILL_BG = '#13132A';
const SEEK_STEP_SEC = 15;
const ICON_STROKE = 2;

/**
 * Home Assistant `media_player` for music / speakers: uses standard services
 * (`media_play`, `media_pause`, `media_previous_track`, `media_next_track`,
 * `media_seek`, `volume_mute`, `select_source`, `join` when supported).
 *
 * @param {object} player — { entity_id, displayName, stateObj }
 * @param {object[]} speakerPeers — other music players in the same room (for grouping)
 * @param {string[]} [musicAssistantEntryIds] — HA config entry ids for domain `music_assistant`
 * @param {(entityId: string, mediaContentType?: string, mediaContentId?: string) => Promise<object|undefined>} [browseMedia] — HA `media_player/browse_media`
 * @param {(domain: string, service: string, data: object) => Promise<object|undefined>} [callServiceWithResponse] — `call_service` with `return_response`
 */
export default function MusicMediaCard({
    player,
    childPlayers = [],
    speakerPeers = [],
    mapping,
    mediaMappings = [],
    onUpdate,
    needsChange,
    adminUrl,
    haUrl,
    haToken,
    onShowSourceOverlay,
    musicAssistantEntryIds = [],
    browseMedia,
    callServiceWithResponse,
}) {
    if (!player?.stateObj) return null;

    const targetEntity = pickMediaControlTarget(player, childPlayers, musicAssistantEntryIds);
    const targetState = targetEntity.stateObj.state;
    const targetAttributes = targetEntity.stateObj.attributes || {};

    const targetStateRef = useRef(targetState);
    const targetAttributesRef = useRef(targetAttributes);
    targetStateRef.current = targetState;
    targetAttributesRef.current = targetAttributes;

    const isPlaying = isMediaPlayerPlaying(targetState, targetAttributes);
    const duration = getMediaPlayerDuration(targetAttributes);
    const mediaTitle =
        targetAttributes.media_title ||
        targetAttributes.media_content_id ||
        targetAttributes.friendly_name ||
        'Nothing playing';
    const mediaAlbum =
        [targetAttributes.media_artist, targetAttributes.media_album_name].filter(Boolean).join(' · ') ||
        '';

    const [expanded, setExpanded] = useState(false);
    const [speakersOpen, setSpeakersOpen] = useState(false);
    const [artFailed, setArtFailed] = useState(false);

    const [serviceMessage, setServiceMessage] = useState(null);
    const [tracksModalOpen, setTracksModalOpen] = useState(false);
    const [tracksLoading, setTracksLoading] = useState(false);
    const [tracksError, setTracksError] = useState(null);
    const [trackRows, setTrackRows] = useState([]);
    const [queueLabel, setQueueLabel] = useState(null);

  const [scrubPosition, setScrubPosition] = useState(null);
  const [isScrubbing, setIsScrubbing] = useState(false);
  /** Forces re-render while playing so timeline updates every frame (HA often leaves media_position at 0). */
  const [playClock, setPlayClock] = useState(0);

  const registryRowForMa = targetEntity;
    const isMassPlayer = isMusicAssistantMediaPlayer(
        registryRowForMa,
        registryRowForMa.stateObj,
        musicAssistantEntryIds
    );

  useEffect(() => {
    if (!isPlaying || isScrubbing || duration <= 0) {
      setPlayClock(0);
      return undefined;
    }
    let frameId;
    const onFrame = () => {
      setPlayClock(Date.now());
      frameId = requestAnimationFrame(onFrame);
    };
    frameId = requestAnimationFrame(onFrame);
    return () => cancelAnimationFrame(frameId);
  }, [isPlaying, isScrubbing, duration]);

  const livePosition = isScrubbing
    ? scrubPosition ?? 0
    : getMediaPlayerPosition(targetStateRef.current, targetAttributesRef.current);
  void playClock;

    useEffect(() => {
        setArtFailed(false);
    }, [targetAttributes.entity_picture]);

  useEffect(() => {
    if (!__DEV__) return;
    console.log('[Music HA] socket attrs', {
      entity: targetEntity.entity_id,
      state: targetState,
      media_position: targetAttributes.media_position,
      media_position_updated_at: targetAttributes.media_position_updated_at,
      media_duration: targetAttributes.media_duration,
    });
  }, [
    targetEntity.entity_id,
    targetState,
    targetAttributes.media_position,
    targetAttributes.media_position_updated_at,
    targetAttributes.media_duration,
  ]);

    const activeMapping =
        mediaMappings.find(m => m.entity_id === targetEntity.entity_id) || mapping;
    const activeIconUrl =
        activeMapping?.mediaType?.icon_path && adminUrl
            ? `${adminUrl}${activeMapping.mediaType.icon_path}`
            : null;

    const accentColor = '#8947ca';
    const iconColor = isPlaying ? accentColor : '#fff';

    const formatTimeShort = secs => {
        if (secs == null || isNaN(secs)) return '00:00';
        const n = Math.max(0, Math.floor(secs));
        const m = Math.floor(n / 60);
        const s = n % 60;
        return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
    };

  const fmtPos = formatTimeShort(livePosition);
  const fmtDur = formatTimeShort(duration);

    const source_list = targetAttributes.source_list ?? player.stateObj.attributes?.source_list;
    const source = targetAttributes.source ?? player.stateObj.attributes?.source;
    const songListEnabled =
        (isMassPlayer && !!browseMedia) || (Array.isArray(source_list) && source_list.length > 0);

    const dismissServiceMessage = useCallback(() => setServiceMessage(null), []);

    const showServiceError = useCallback(
        (err, action) => {
            const formatted = formatHaServiceError(err?.message ?? err, {
                displayName: player.displayName || targetEntity.displayName,
                action,
            });
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            setServiceMessage(formatted);
        },
        [player.displayName, targetEntity.displayName]
    );

    const handleAction = async (entity, service, data = {}, options = {}) => {
        const { haptics = true, showError = true } = options;
        if (haptics) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        if (!onUpdate) return;
        try {
            const result = onUpdate(entity.entity_id, 'media_player', service, data);
            if (result != null && typeof result.then === 'function') await result;
        } catch (err) {
            if (showError) showServiceError(err, service);
            throw err;
        }
    };

    const playLastTrack = async (last, options = {}) => {
        if (!last?.media_content_id) return false;
        await handleAction(
            targetEntity,
            'play_media',
            {
                media_content_id: last.media_content_id,
                media_content_type: last.media_content_type || 'music',
            },
            options
        );
        return true;
    };

    const queryQueueEmpty = async () => {
        if (!callServiceWithResponse || !isMassPlayer) return null;
        for (const domain of ['music_assistant', 'mass']) {
            try {
                const raw = await callServiceWithResponse(domain, 'get_queue', {
                    entity_id: targetEntity.entity_id,
                });
                const q = unwrapHaResponse(raw);
                if (q && typeof q.items === 'number') return q.items === 0;
            } catch (_) {
                /* try next domain */
            }
        }
        return null;
    };

    const resolveLastPlayed = () => {
        const fromTarget = getLastPlayedMedia(targetAttributes);
        if (fromTarget) return fromTarget;
        const fromParent = getLastPlayedMedia(player.stateObj?.attributes);
        if (fromParent) return fromParent;
        for (const child of childPlayers) {
            const fromChild = getLastPlayedMedia(child.stateObj?.attributes);
            if (fromChild) return fromChild;
        }
        return null;
    };

    /** Play / resume: empty queue → replay last track from HA entity attrs. */
    const tryStartPlayback = async () => {
        const last = resolveLastPlayed();
        const idleLike = ['idle', 'off', 'standby', 'on'].includes(targetState);

        if (idleLike && last) {
            const queueEmpty = await queryQueueEmpty();
            if (queueEmpty === true) {
                await playLastTrack(last, { showError: true });
                return;
            }
        }

        try {
            await handleAction(targetEntity, 'media_play', {}, { showError: false });
        } catch (err) {
            const msg = err?.message ?? String(err);
            if (last && isEmptyQueueError(msg)) {
                await playLastTrack(last, { showError: true });
                return;
            }
            showServiceError(err, 'media_play');
        }
    };

    const handlePlayPause = async () => {
        try {
            if (isPlaying) {
                await handleAction(targetEntity, 'media_pause', {}, { showError: true });
                return;
            }
            if (isMediaPlayerPaused(targetState)) {
                await handleAction(targetEntity, 'media_play', {}, { showError: true });
                return;
            }
            if (['idle', 'off', 'standby', 'on'].includes(targetState)) {
                await tryStartPlayback();
                return;
            }
            await handleAction(targetEntity, 'media_play_pause', {}, { showError: true });
        } catch (_) {
            /* toast already shown */
        }
    };

  const handleSeekDelta = delta => {
    if (!duration) return;
    const next = Math.max(0, Math.min(duration, livePosition + delta));
    setScrubPosition(next);
    handleAction(targetEntity, 'media_seek', { seek_position: next });
  };

    const handleSourceSelect = src => handleAction(player, 'select_source', { source: src });

    const openSourcePicker = (title = 'Select source') => {
        if (!onShowSourceOverlay || !Array.isArray(source_list) || source_list.length === 0) return;
        onShowSourceOverlay({
            title,
            sourceList: source_list,
            currentSource: source,
            childPlayers,
            mediaMappings,
            onSelect: handleSourceSelect,
        });
    };

    const unwrapHaResponse = res => {
        if (res != null && typeof res === 'object' && 'response' in res) return res.response;
        return res;
    };

    const loadTracksModalData = async () => {
        setTracksLoading(true);
        setTracksError(null);
        setTrackRows([]);
        setQueueLabel(null);
        const entityId = targetEntity.entity_id;
        try {
            if (callServiceWithResponse) {
                for (const domain of ['mass', 'music_assistant']) {
                    try {
                        const raw = await callServiceWithResponse(domain, 'get_queue', { entity_id: entityId });
                        const q = unwrapHaResponse(raw);
                        if (q && typeof q.items === 'number') {
                            setQueueLabel(`${q.items} in queue`);
                        }
                        break;
                    } catch (_) {
                        /* try alternate MA integration domain */
                    }
                }
            }
            if (!browseMedia) {
                setTracksError('Connection does not support media browse.');
                return;
            }
            let rows = [];
            try {
                const direct = await browseMedia(entityId, 'mass', 'tracks');
                rows = direct?.children || [];
            } catch (_) {
                /* fall through */
            }
            if (!rows.length) {
                try {
                    const root = await browseMedia(entityId);
                    const tracksNode = root?.children?.find(
                        c =>
                            c.media_content_id === 'tracks' ||
                            (c.title && String(c.title).toLowerCase().trim() === 'tracks')
                    );
                    if (tracksNode) {
                        const nested = await browseMedia(
                            entityId,
                            tracksNode.media_content_type,
                            tracksNode.media_content_id
                        );
                        rows = nested?.children || [];
                    }
                } catch (_) {
                    /* fall through */
                }
            }
            if (!rows.length) {
                try {
                    const direct = await browseMedia(entityId, 'music_assistant', 'tracks');
                    rows = direct?.children || [];
                } catch (e) {
                    throw e;
                }
            }
            setTrackRows(rows);
            if (!rows.length) {
                setTracksError(
                    'No tracks returned. Open Music Assistant and confirm the Tracks library has items.'
                );
            }
        } catch (e) {
            setTracksError(e?.message || 'Could not load tracks.');
        } finally {
            setTracksLoading(false);
        }
    };

    const openSongList = () => {
        if (isMassPlayer && browseMedia) {
            setTracksModalOpen(true);
            loadTracksModalData();
            return;
        }
        openSourcePicker('Song list');
    };

    const playBrowseTrack = item => {
        if (!item?.media_content_id) return;
        handleAction(targetEntity, 'play_media', {
            media_content_id: item.media_content_id,
            media_content_type: item.media_content_type || 'music',
        });
        setTracksModalOpen(false);
    };

    const joinPeer = peer => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        onUpdate(targetEntity.entity_id, 'media_player', 'join', {
            group_members: [peer.entity_id],
        });
        setSpeakersOpen(false);
    };

    const picturePath = targetAttributes.entity_picture;
    const baseHa = (haUrl || '').replace(/\/$/, '');
    const albumArtUri =
        picturePath && baseHa
            ? picturePath.startsWith('http')
                ? picturePath
                : `${baseHa}${picturePath}`
            : null;

    const showProgress = duration > 0;

    const TransportFive = ({ largeCenter = false }) => (
        <View style={styles.transportRow}>
            <TouchableOpacity
                style={styles.transportSide}
                onPress={() => handleAction(targetEntity, 'media_previous_track')}
                hitSlop={8}
                accessibilityLabel="Previous track"
            >
                <MaterialCommunityIcons name="skip-previous" size={22} color="#FFFFFF" />
            </TouchableOpacity>
            <TouchableOpacity
                style={styles.transportSide}
                onPress={() => handleSeekDelta(-SEEK_STEP_SEC)}
                hitSlop={8}
                accessibilityLabel="Rewind"
            >
                <MaterialCommunityIcons name="rewind" size={22} color="#FFFFFF" />
            </TouchableOpacity>
            <TouchableOpacity
                style={largeCenter ? styles.playBtnWrapLarge : styles.playBtnWrap}
                onPress={handlePlayPause}
                activeOpacity={0.85}
            >
                <LinearGradient
                    colors={PLAY_BTN_GRADIENT}
                    start={BTN_GRADIENT_START}
                    end={BTN_GRADIENT_END}
                    style={largeCenter ? styles.playBtnLarge : styles.playBtn}
                >
                    {isPlaying ? (
                        <Pause size={largeCenter ? 30 : 26} color="#fff" fill="#fff" stroke="#fff" strokeWidth={2.5} />
                    ) : (
                        <Play
                            size={largeCenter ? 30 : 26}
                            color="#fff"
                            fill="#fff"
                            stroke="#fff"
                            strokeWidth={0}
                            style={{ marginLeft: largeCenter ? 5 : 4 }}
                        />
                    )}
                </LinearGradient>
            </TouchableOpacity>
            <TouchableOpacity
                style={styles.transportSide}
                onPress={() => handleSeekDelta(SEEK_STEP_SEC)}
                hitSlop={8}
                accessibilityLabel="Fast forward"
            >
                <MaterialCommunityIcons name="fast-forward" size={22} color="#FFFFFF" />
            </TouchableOpacity>
            <TouchableOpacity
                style={styles.transportSide}
                onPress={() => handleAction(targetEntity, 'media_next_track')}
                hitSlop={8}
                accessibilityLabel="Next track"
            >
                <MaterialCommunityIcons name="skip-next" size={22} color="#FFFFFF" />
            </TouchableOpacity>
        </View>
    );

    return (
        <>
            <ServiceMessageToast message={serviceMessage} onDismiss={dismissServiceMessage} />
            <View style={[styles.wrap, needsChange && { borderColor: accentColor, borderWidth: 2 }]}>
                <Text style={styles.cardCaption} numberOfLines={1}>
                    {player.displayName || 'Music'}
                </Text>
                <View style={styles.container}>
                    <View style={styles.topRow}>
                        <View style={styles.iconBox}>
                            {activeIconUrl ? (
                                <SvgUri width={24} height={24} uri={activeIconUrl} fill={iconColor} />
                            ) : (
                                <Music size={24} color={iconColor} strokeWidth={ICON_STROKE} />
                            )}
                        </View>
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

                    {targetState === 'unavailable' && (
                        <Text style={styles.offHint} numberOfLines={1}>
                            Unavailable
                        </Text>
                    )}

                    {!expanded && showProgress && (
                        <View style={styles.timelineBlock}>
                            <View style={styles.timelineTimesRow}>
                                <Text style={styles.timeText}>{fmtPos}</Text>
                                <Text style={styles.timeText}>{fmtDur}</Text>
                            </View>
                            <TimelineScrubber
                                duration={duration}
                                position={livePosition}
                                onScrub={val => {
                                    setIsScrubbing(true);
                                    setScrubPosition(val * duration);
                                }}
                                onCommit={val => {
                                    handleAction(targetEntity, 'media_seek', { seek_position: val * duration });
                                    setIsScrubbing(false);
                                    setScrubPosition(null);
                                }}
                            />
                        </View>
                    )}

                    {!expanded && targetState !== 'unavailable' && <TransportFive />}

                    {expanded && targetState !== 'unavailable' && (
                        <View style={styles.expandedBlock}>
                            <View style={styles.albumFrame}>
                                {albumArtUri && !artFailed ? (
                                    <Image
                                        source={{
                                            uri: albumArtUri,
                                            headers: haToken ? { Authorization: `Bearer ${haToken}` } : undefined,
                                        }}
                                        style={styles.albumImage}
                                        resizeMode="cover"
                                        onError={() => setArtFailed(true)}
                                    />
                                ) : (
                                    <LinearGradient
                                        colors={BTN_GRADIENT}
                                        start={BTN_GRADIENT_START}
                                        end={BTN_GRADIENT_END}
                                        style={styles.albumPlaceholder}
                                    >
                                        <Music size={56} color="rgba(255,255,255,0.9)" strokeWidth={1.8} />
                                    </LinearGradient>
                                )}
                            </View>
                            <Text style={styles.trackTitle} numberOfLines={2}>
                                {mediaTitle}
                            </Text>
                            {!!mediaAlbum && (
                                <Text style={styles.trackAlbum} numberOfLines={2}>
                                    {mediaAlbum}
                                </Text>
                            )}

                            {showProgress && (
                                <View style={styles.timelineBlockExpanded}>
                                    <View style={styles.timelineTimesRow}>
                                        <Text style={styles.timeText}>{fmtPos}</Text>
                                        <Text style={styles.timeText}>{fmtDur}</Text>
                                    </View>
                                    <TimelineScrubber
                                        duration={duration}
                                        position={livePosition}
                                        onScrub={val => {
                                            setIsScrubbing(true);
                                            setScrubPosition(val * duration);
                                        }}
                                        onCommit={val => {
                                            handleAction(targetEntity, 'media_seek', { seek_position: val * duration });
                                            setIsScrubbing(false);
                                            setScrubPosition(null);
                                        }}
                                    />
                                </View>
                            )}

                            <TransportFive largeCenter />

                            <View style={styles.navRow}>
                                <TouchableOpacity
                                    style={styles.navHalf}
                                    onPress={openSongList}
                                    disabled={!songListEnabled}
                                    activeOpacity={0.85}
                                >
                                    <Music size={18} color="#fff" strokeWidth={ICON_STROKE} />
                                    <Text style={[styles.navHalfText, !songListEnabled && styles.navDisabled]}>
                                        Song List
                                    </Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={styles.navHalf}
                                    onPress={() => openSourcePicker('Playlists')}
                                    disabled={!source_list?.length}
                                    activeOpacity={0.85}
                                >
                                    <ListMusic size={18} color="#fff" strokeWidth={ICON_STROKE} />
                                    <Text style={[styles.navHalfText, !source_list?.length && styles.navDisabled]}>
                                        Playlists
                                    </Text>
                                </TouchableOpacity>
                            </View>

                            <TouchableOpacity
                                style={styles.speakersPill}
                                onPress={() => setSpeakersOpen(true)}
                                activeOpacity={0.85}
                            >
                                <Speaker size={20} color="#fff" strokeWidth={ICON_STROKE} />
                                <Text style={styles.speakersPillText}>Active Speakers</Text>
                            </TouchableOpacity>
                        </View>
                    )}
                </View>
            </View>

            <Modal
                visible={speakersOpen}
                transparent
                animationType="fade"
                onRequestClose={() => setSpeakersOpen(false)}
            >
                <TouchableOpacity
                    style={styles.modalBackdrop}
                    activeOpacity={1}
                    onPress={() => setSpeakersOpen(false)}
                >
                    <View style={styles.modalSheet} onStartShouldSetResponder={() => true}>
                        <Text style={styles.modalTitle}>Group with speaker</Text>
                        <Text style={styles.modalSub}>
                            Pairs this player with another speaker using Home Assistant grouping when your integration supports it.
                        </Text>
                        <ScrollView style={styles.modalList} keyboardShouldPersistTaps="handled">
                            {speakerPeers.length === 0 ? (
                                <Text style={styles.modalEmpty}>No other music players in this room.</Text>
                            ) : (
                                speakerPeers.map(peer => (
                                    <TouchableOpacity
                                        key={peer.entity_id}
                                        style={styles.modalItem}
                                        onPress={() => joinPeer(peer)}
                                        activeOpacity={0.8}
                                    >
                                        <Speaker size={18} color="#fff" strokeWidth={ICON_STROKE} />
                                        <Text style={styles.modalItemText} numberOfLines={1}>
                                            {peer.displayName || peer.entity_id}
                                        </Text>
                                    </TouchableOpacity>
                                ))
                            )}
                        </ScrollView>
                        <TouchableOpacity style={styles.modalDone} onPress={() => setSpeakersOpen(false)}>
                            <Text style={styles.modalDoneText}>Done</Text>
                        </TouchableOpacity>
                    </View>
                </TouchableOpacity>
            </Modal>

            <Modal
                visible={tracksModalOpen}
                transparent
                animationType="slide"
                onRequestClose={() => setTracksModalOpen(false)}
            >
                <TouchableOpacity
                    style={styles.modalBackdrop}
                    activeOpacity={1}
                    onPress={() => setTracksModalOpen(false)}
                >
                    <View style={styles.tracksModalSheet} onStartShouldSetResponder={() => true}>
                        <View style={styles.tracksModalHeader}>
                            <Text style={styles.modalTitle}>Tracks library</Text>
                            <TouchableOpacity
                                onPress={() => setTracksModalOpen(false)}
                                hitSlop={12}
                                accessibilityLabel="Close"
                            >
                                <Text style={styles.tracksModalClose}>Close</Text>
                            </TouchableOpacity>
                        </View>
                        {queueLabel ? (
                            <Text style={styles.tracksQueueHint}>{queueLabel}</Text>
                        ) : null}
                        {tracksLoading ? (
                            <ActivityIndicator color="#8947ca" style={{ paddingVertical: 24 }} />
                        ) : tracksError ? (
                            <Text style={styles.tracksErrorText}>{tracksError}</Text>
                        ) : (
                            <FlatList
                                data={trackRows}
                                keyExtractor={(item, index) =>
                                    `${item.media_content_id || item.title || 't'}_${index}`
                                }
                                style={styles.tracksList}
                                keyboardShouldPersistTaps="handled"
                                renderItem={({ item }) => (
                                    <TouchableOpacity
                                        style={styles.trackRow}
                                        onPress={() => playBrowseTrack(item)}
                                        activeOpacity={0.75}
                                        disabled={item.can_play === false}
                                    >
                                        <Text style={styles.trackRowTitle} numberOfLines={2}>
                                            {item.title || item.name || 'Track'}
                                        </Text>
                                        {item.media_content_type ? (
                                            <Text style={styles.trackRowMeta} numberOfLines={1}>
                                                {item.media_content_type}
                                            </Text>
                                        ) : null}
                                    </TouchableOpacity>
                                )}
                                ListEmptyComponent={
                                    !tracksError ? (
                                        <Text style={styles.tracksEmpty}>No rows to show.</Text>
                                    ) : null
                                }
                            />
                        )}
                    </View>
                </TouchableOpacity>
            </Modal>
        </>
    );
}

function TimelineScrubber({ duration, position, onScrub, onCommit }) {
    const [trackWidth, setTrackWidth] = useState(0);
    const progress = duration > 0 ? Math.max(0, Math.min(1, position / duration)) : 0;
    const fillWidth = trackWidth > 0 ? Math.round(trackWidth * progress) : 0;

    const handle = (e, isEnd = false) => {
        if (trackWidth === 0 || !duration) return;
        const x = e.nativeEvent.locationX;
        const ratio = Math.max(0, Math.min(x, trackWidth)) / trackWidth;
        if (isEnd) onCommit(ratio);
        else onScrub(ratio);
    };

    return (
        <View
            style={styles.timelineTrackFull}
            onLayout={e => setTrackWidth(e.nativeEvent.layout.width)}
            onTouchMove={e => handle(e, false)}
            onTouchEnd={e => handle(e, true)}
        >
            <View
                style={[
                    styles.timelineFill,
                    {
                        width: fillWidth,
                        backgroundColor: PROGRESS_FILL,
                    },
                ]}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    wrap: {
        marginTop: 12,
        width: '100%',
    },
    cardCaption: {
        color: 'rgba(255,255,255,0.42)',
        fontSize: 12,
        fontFamily: CF.medium,
        marginBottom: 8,
        paddingHorizontal: 2,
    },
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
    timelineBlockExpanded: {
        width: '100%',
        marginTop: 14,
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
        letterSpacing: 0.6,
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
    transportRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: 18,
        paddingHorizontal: 4,
    },
    transportSide: {
        width: 40,
        height: 44,
        alignItems: 'center',
        justifyContent: 'center',
    },
    playBtnWrap: {
        shadowColor: '#187FB2',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.35,
        shadowRadius: 10,
        elevation: 6,
    },
    playBtnWrapLarge: {
        shadowColor: '#187FB2',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.4,
        shadowRadius: 12,
        elevation: 8,
    },
    playBtn: {
        width: 56,
        height: 56,
        borderRadius: 28,
        alignItems: 'center',
        justifyContent: 'center',
    },
    playBtnLarge: {
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
    expandedBlock: {
        marginTop: 14,
        alignItems: 'center',
    },
    albumFrame: {
        width: '72%',
        aspectRatio: 1,
        maxWidth: 280,
        borderRadius: 20,
        overflow: 'hidden',
        marginBottom: 16,
    },
    albumImage: {
        width: '100%',
        height: '100%',
    },
    albumPlaceholder: {
        width: '100%',
        height: '100%',
        alignItems: 'center',
        justifyContent: 'center',
    },
    trackTitle: {
        color: '#fff',
        fontSize: 17,
        fontFamily: CF.semibold,
        textAlign: 'center',
        paddingHorizontal: 8,
    },
    trackAlbum: {
        color: 'rgba(255,255,255,0.45)',
        fontSize: 13,
        fontFamily: CF.regular,
        textAlign: 'center',
        marginTop: 6,
        paddingHorizontal: 10,
    },
    navRow: {
        flexDirection: 'row',
        gap: 12,
        alignSelf: 'stretch',
        marginTop: 22,
    },
    navHalf: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        backgroundColor: PILL_BG,
        borderRadius: 14,
        paddingVertical: 12,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    navHalfText: {
        color: '#fff',
        fontSize: 13,
        fontFamily: CF.semibold,
    },
    navDisabled: {
        opacity: 0.4,
    },
    speakersPill: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        alignSelf: 'stretch',
        marginTop: 12,
        backgroundColor: PILL_BG,
        borderRadius: 14,
        paddingVertical: 14,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    speakersPillText: {
        color: '#fff',
        fontSize: 14,
        fontFamily: CF.semibold,
    },
    modalBackdrop: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.55)',
        justifyContent: 'flex-end',
    },
    modalSheet: {
        backgroundColor: '#12132a',
        borderTopLeftRadius: 22,
        borderTopRightRadius: 22,
        paddingHorizontal: 20,
        paddingTop: 16,
        paddingBottom: 28,
        borderWidth: 1,
        borderColor: '#212136',
        maxHeight: '56%',
    },
    modalTitle: {
        color: '#ededf5',
        fontSize: 17,
        fontFamily: CF.bold,
        marginBottom: 6,
    },
    modalSub: {
        color: 'rgba(255,255,255,0.38)',
        fontSize: 12,
        fontFamily: CF.regular,
        marginBottom: 12,
        lineHeight: 18,
    },
    modalList: {
        maxHeight: 220,
    },
    modalEmpty: {
        color: Colors.textDim,
        fontSize: 14,
        fontFamily: CF.regular,
        paddingVertical: 20,
        textAlign: 'center',
    },
    modalItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 14,
        paddingHorizontal: 12,
        borderRadius: 12,
        backgroundColor: 'rgba(255,255,255,0.04)',
        marginBottom: 8,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
    },
    modalItemText: {
        flex: 1,
        color: '#fff',
        fontSize: 15,
        fontFamily: CF.medium,
    },
    modalDone: {
        marginTop: 12,
        alignSelf: 'center',
        paddingVertical: 10,
    },
    modalDoneText: {
        color: Colors.textDim,
        fontSize: 16,
        fontFamily: CF.medium,
    },
    tracksModalSheet: {
        width: '100%',
        backgroundColor: '#12132a',
        borderTopLeftRadius: 22,
        borderTopRightRadius: 22,
        paddingHorizontal: 20,
        paddingTop: 16,
        paddingBottom: 28,
        borderWidth: 1,
        borderColor: '#212136',
        maxHeight: '78%',
    },
    tracksModalHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 6,
    },
    tracksModalClose: {
        color: 'rgba(255,255,255,0.5)',
        fontSize: 15,
        fontFamily: CF.medium,
    },
    tracksQueueHint: {
        color: 'rgba(255,255,255,0.4)',
        fontSize: 12,
        fontFamily: CF.regular,
        marginBottom: 8,
    },
    tracksErrorText: {
        color: '#c77dff',
        fontSize: 14,
        fontFamily: CF.regular,
        paddingVertical: 20,
    },
    tracksList: {
        maxHeight: 480,
    },
    trackRow: {
        paddingVertical: 12,
        paddingHorizontal: 4,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: 'rgba(255,255,255,0.08)',
    },
    trackRowTitle: {
        color: '#fff',
        fontSize: 15,
        fontFamily: CF.medium,
    },
    trackRowMeta: {
        color: 'rgba(255,255,255,0.35)',
        fontSize: 12,
        fontFamily: CF.regular,
        marginTop: 4,
    },
    tracksEmpty: {
        color: Colors.textDim,
        textAlign: 'center',
        paddingVertical: 16,
        fontFamily: CF.regular,
    },
});
