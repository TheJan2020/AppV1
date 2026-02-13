import { View, Text, StyleSheet, TouchableOpacity, Image, Modal, ScrollView, Dimensions } from 'react-native';
import { BlurView } from 'expo-blur';
import { Tv, Speaker, Play, Pause, Power, Volume2, VolumeX, List, Monitor, Smartphone, ChevronRight, SkipBack, SkipForward, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Circle } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { Colors } from '../../constants/Colors';
import { useState, useEffect, useRef } from 'react';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, withSequence } from 'react-native-reanimated';
import { SvgUri } from 'react-native-svg';

const HA_URL = process.env.EXPO_PUBLIC_HA_URL || 'http://homeassistant.local:8123';

export default function MediaCard({ player, childPlayers = [], mapping, mediaMappings = [], onUpdate, needsChange, adminUrl }) {
    if (!player) return null;

    const { attributes, state } = player.stateObj;
    const {
        source_list,
        source,
        media_title,
        media_artist,
        app_name: parentAppName,
        entity_picture: parentPicture,
        device_class,
        is_volume_muted: parentMuted,
        volume_level: parentVolume
    } = attributes;

    const isOn = state !== 'off' && state !== 'standby';
    const isPlaying = ['playing', 'buffering', 'on'].includes(state) || childPlayers.some(c => ['playing', 'buffering', 'on'].includes(c.stateObj.state));
    const activeColor = '#8947ca';

    // --- Active Child Logic ---
    // Find if the currently selected source on the parent corresponds to a mapped child
    const activeChild = childPlayers.find(c => {
        const cMap = mediaMappings.find(m => m.entity_id === c.entity_id);
        return cMap && cMap.parentSource === source; // Simple exact match for now
    });

    // The entity we target for media controls (Play/Pause/Seek)
    // If a child is active (e.g. Apple TV on HDMI 1), we control the child.
    // If no child is active (e.g. Live TV), we control the TV.
    const targetEntity = activeChild || player;
    const targetAttributes = targetEntity.stateObj.attributes;
    const targetState = targetEntity.stateObj.state;

    // --- Display Info ---
    const appName = targetAttributes.app_name || parentAppName;
    const title = targetAttributes.media_title || media_title || targetEntity.displayName;
    const artist = targetAttributes.media_artist || media_artist;

    // Construct Subtitle: "Main TV . YouTube" or "Apple TV . MBC Shahid"
    let subtitle = player.displayName;
    if (activeChild) {
        subtitle = `${activeChild.displayName}`;
        if (appName) subtitle += ` • ${appName}`;
    } else {
        if (source) subtitle += ` • ${source}`;
        else if (appName) subtitle += ` • ${appName}`;
    }
    if (!isOn) subtitle = "Off";

    // Icon handling
    // If activeChild has a custom icon, use it. Else use parent icon.
    // We assume mappings might have icon paths in future, but for now relying on child entity definition
    const activeChildMapping = activeChild ? mediaMappings.find(m => m.entity_id === activeChild.entity_id) : null;
    const activeIconUrl = activeChildMapping?.mediaType?.icon_path
        ? `${adminUrl}${activeChildMapping.mediaType.icon_path}`
        : null;

    // Thumbnail
    const entityPicture = targetAttributes.entity_picture || parentPicture;
    const thumbUrl = entityPicture ? {
        uri: `${HA_URL}${entityPicture}`,
        headers: { Authorization: `Bearer ${process.env.EXPO_PUBLIC_HA_TOKEN}` }
    } : null;

    const [showSources, setShowSources] = useState(false);
    const [showVolume, setShowVolume] = useState(false);
    const [showRemote, setShowRemote] = useState(false);

    // Animation for Icon
    const scale = useSharedValue(1);
    useEffect(() => {
        if (isPlaying) {
            scale.value = withRepeat(withSequence(withTiming(1.1, { duration: 800 }), withTiming(1, { duration: 800 })), -1, true);
        } else {
            scale.value = withTiming(1);
        }
    }, [isPlaying]);
    const animatedIconStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

    const handleAction = (entity, service, data = {}) => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

        // Remote Commands
        if (service.startsWith('remote_')) {
            const command = service.replace('remote_', '');

            // Determine Strategy
            const mapping = mediaMappings.find(m => m.entity_id === entity.entity_id);
            const strategy = mapping?.remoteStrategy || 'default';

            if (strategy === 'webos') {
                // LG WebOS Strategy: Call webostv.button on the media_player entity
                const webOSCmdMap = {
                    'up': 'UP', 'down': 'DOWN', 'left': 'LEFT', 'right': 'RIGHT',
                    'select': 'ENTER', 'home': 'HOME', 'back': 'BACK'
                };
                onUpdate(entity.entity_id, 'webostv', 'button', { button: webOSCmdMap[command] || command.toUpperCase() });
                return;
            } else {
                // Default Strategy: Infer remote.xyz and call remote.send_command
                const remoteId = entity.entity_id.replace('media_player.', 'remote.');
                const cmdMap = {
                    'up': 'up', 'down': 'down', 'left': 'left', 'right': 'right',
                    'select': 'select', 'home': 'home', 'back': 'menu'
                };
                onUpdate(remoteId, 'remote', 'send_command', { command: cmdMap[command] || command });
                return;
            }
        }

        onUpdate(entity.entity_id, 'media_player', service, data);
    };

    const handleSourceSelect = (selectedSource) => {
        handleAction(player, 'select_source', { source: selectedSource });
        setShowSources(false);
    };

    const handleVolumeChange = (val, entity) => {
        onUpdate(entity.entity_id, 'media_player', 'volume_set', { volume_level: val });
    };

    const toggleMute = () => {
        const newMute = !parentMuted;
        handleAction(player, 'volume_mute', { is_volume_muted: newMute });
        // Try mute child too if applicable
        if (activeChild && activeChild.stateObj.attributes.is_volume_muted !== undefined) {
            handleAction(activeChild, 'volume_mute', { is_volume_muted: newMute });
        }
    };

    // Timeline Logic
    const duration = targetAttributes.media_duration || 0;
    const [position, setPosition] = useState(targetAttributes.media_position || 0);
    const [isScrubbing, setIsScrubbing] = useState(false);

    useEffect(() => {
        if (!isScrubbing) setPosition(targetAttributes.media_position || 0);
    }, [targetAttributes.media_position, isScrubbing]);

    useEffect(() => {
        let interval;
        if (targetState === 'playing' && !isScrubbing && duration > 0) {
            interval = setInterval(() => {
                setPosition(prev => {
                    const next = prev + 1;
                    return next > duration ? duration : next;
                });
            }, 1000);
        }
        return () => clearInterval(interval);
    }, [targetState, isScrubbing, duration]);

    const formatTime = (secs) => {
        if (!secs || isNaN(secs)) return "0:00";
        const m = Math.floor(secs / 60);
        const s = Math.floor(secs % 60);
        return `${m}:${s < 10 ? '0' : ''}${s}`;
    };

    const isLive = !duration && ['playing', 'buffering', 'paused', 'on'].includes(targetState);

    return (
        <View style={[styles.container, needsChange && { borderColor: '#8947ca', borderWidth: 2 }]}>
            {/* Background Image */}
            {thumbUrl && (
                <View style={[StyleSheet.absoluteFillObject, { borderRadius: 24, overflow: 'hidden' }]}>
                    <Image source={thumbUrl} style={[StyleSheet.absoluteFillObject, { opacity: 0.3 }]} resizeMode="cover" blurRadius={40} />
                    <View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(20,20,30,0.6)' }]} />
                </View>
            )}

            {/* Top Row: Icon + Info + Power */}
            <View style={styles.mainRow}>
                <View style={[styles.iconBox, thumbUrl && styles.artBox]}>
                    {activeIconUrl ? (
                        <SvgUri width={24} height={24} uri={activeIconUrl} fill={isOn ? '#fff' : Colors.textDim} />
                    ) : (
                        thumbUrl ? (
                            <Image source={thumbUrl} style={styles.thumbnail} resizeMode="cover" />
                        ) : (
                            <Animated.View style={animatedIconStyle}>
                                {device_class === 'tv' ?
                                    <Tv size={24} color={isPlaying ? activeColor : (isOn ? "#fff" : Colors.textDim)} /> :
                                    <Speaker size={24} color={isPlaying ? activeColor : (isOn ? "#fff" : Colors.textDim)} />
                                }
                            </Animated.View>
                        )
                    )}
                </View>

                <View style={styles.infoCol}>
                    <Text style={styles.title} numberOfLines={1}>{title}</Text>
                    <Text style={[styles.status, { color: isPlaying ? activeColor : Colors.textDim }]} numberOfLines={1}>
                        {subtitle}
                    </Text>
                </View>

                <TouchableOpacity
                    style={[styles.ctrlBtn, isOn && { backgroundColor: 'rgba(255,255,255,0.1)' }]}
                    onPress={() => handleAction(player, isOn ? 'turn_off' : 'turn_on')}
                >
                    <Power size={20} color={isOn ? activeColor : Colors.textDim} />
                </TouchableOpacity>
            </View>

            {/* Timeline Row */}
            {isOn && (
                <View style={styles.timelineRow}>
                    {isLive ? (
                        <View style={styles.liveBadge}>
                            <View style={styles.liveDot} />
                            <Text style={styles.liveText}>LIVE</Text>
                        </View>
                    ) : (
                        duration > 0 && (
                            <>
                                <Text style={styles.timeText}>{formatTime(position)}</Text>
                                <TimelineScrubber
                                    duration={duration}
                                    position={position}
                                    onScrub={(val) => setPosition(val * duration)}
                                    onCommit={(val) => {
                                        handleAction(targetEntity, 'media_seek', { seek_position: val * duration });
                                        setIsScrubbing(false);
                                    }}
                                    activeColor={activeColor}
                                />
                                <Text style={styles.timeText}>{formatTime(duration)}</Text>
                            </>
                        )
                    )}
                </View>
            )}


            {/* Controls Row */}
            {isOn && (
                <View style={styles.controlsRow}>
                    {/* Left: Volume */}
                    <View style={styles.leftGroup}>
                        <View style={styles.volGroup}>
                            <TouchableOpacity style={styles.muteSmallBtn} onPress={toggleMute}>
                                {parentMuted ? <VolumeX size={18} color={Colors.textDim} /> : <Volume2 size={18} color={Colors.textDim} />}
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.volBtn} onPress={() => setShowVolume(true)}>
                                <Text style={styles.volText}>
                                    {parentVolume !== undefined ? `${Math.round(parentVolume * 100)}%` : '--'}
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </View>

                    {/* Center: Transport */}
                    <View style={styles.transportGroup}>
                        <TouchableOpacity onPress={() => handleAction(targetEntity, 'media_previous_track')} style={styles.miniTransportBtn}>
                            <SkipBack size={20} color="#fff" />
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={[styles.playBtn, !isPlaying && { backgroundColor: 'rgba(255,255,255,0.1)' }]}
                            onPress={() => handleAction(targetEntity, 'media_play_pause')}
                        >
                            {['playing', 'buffering', 'on'].includes(targetState) ? <Pause size={20} color="#fff" /> : <Play size={20} color="#fff" style={{ marginLeft: 2 }} />}
                        </TouchableOpacity>

                        <TouchableOpacity onPress={() => handleAction(targetEntity, 'media_next_track')} style={styles.miniTransportBtn}>
                            <SkipForward size={20} color="#fff" />
                        </TouchableOpacity>
                    </View>

                    {/* Right: Remote & Source */}
                    <View style={styles.rightGroup}>
                        <TouchableOpacity style={[styles.remoteBtn, showRemote && { backgroundColor: activeColor }]} onPress={() => setShowRemote(!showRemote)}>
                            <Smartphone size={18} color="#fff" />
                        </TouchableOpacity>

                        {source_list && (
                            <TouchableOpacity style={styles.sourceBtn} onPress={() => setShowSources(true)}>
                                <List size={18} color="#fff" />
                            </TouchableOpacity>
                        )}
                    </View>
                </View>
            )}

            {/* Remote Control Area (Expandable) */}
            {showRemote && isOn && (
                <View style={styles.remoteArea}>
                    <View style={styles.dpad}>
                        <TouchableOpacity style={styles.dpadUp} onPress={() => handleAction(targetEntity, 'remote_up')}><ArrowUp size={24} color="#fff" /></TouchableOpacity>
                        <TouchableOpacity style={styles.dpadLeft} onPress={() => handleAction(targetEntity, 'remote_left')}><ArrowLeft size={24} color="#fff" /></TouchableOpacity>
                        <TouchableOpacity style={styles.dpadCenter} onPress={() => handleAction(targetEntity, 'remote_select')}><Circle size={16} color="#fff" fill="#fff" /></TouchableOpacity>
                        <TouchableOpacity style={styles.dpadRight} onPress={() => handleAction(targetEntity, 'remote_right')}><ArrowRight size={24} color="#fff" /></TouchableOpacity>
                        <TouchableOpacity style={styles.dpadDown} onPress={() => handleAction(targetEntity, 'remote_down')}><ArrowDown size={24} color="#fff" /></TouchableOpacity>
                    </View>
                    <View style={styles.remoteRow}>
                        <TouchableOpacity style={styles.remoteActBtn} onPress={() => handleAction(targetEntity, 'remote_back')}><Text style={styles.remoteText}>Back</Text></TouchableOpacity>
                        <TouchableOpacity style={styles.remoteActBtn} onPress={() => handleAction(targetEntity, 'remote_home')}><Text style={styles.remoteText}>Home</Text></TouchableOpacity>
                    </View>
                    <Text style={styles.remoteHint}>Controlling: {targetEntity.displayName}</Text>
                </View>
            )}


            {/* Modals */}
            <Modal visible={showSources} transparent={true} animationType="fade" onRequestClose={() => setShowSources(false)}>
                <BlurView intensity={20} style={styles.modalOverlay}>
                    <TouchableOpacity style={styles.modalBg} onPress={() => setShowSources(false)} />
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>Select Source</Text>
                        <ScrollView style={{ maxHeight: 300 }}>
                            {source_list?.map((s) => (
                                <TouchableOpacity key={s} style={[styles.sourceItem, source === s && styles.sourceActive]} onPress={() => handleSourceSelect(s)}>
                                    <Text style={[styles.sourceItemText, source === s && { color: activeColor }]}>{s}</Text>
                                    {/* Show connected child name if mapped */}
                                    {childPlayers.find(c => {
                                        const m = mediaMappings.find(map => map.entity_id === c.entity_id);
                                        return m && m.parentSource === s;
                                    }) && (
                                            <Text style={{ color: '#888', fontSize: 12 }}> • {childPlayers.find(c => {
                                                const m = mediaMappings.find(map => map.entity_id === c.entity_id);
                                                return m && m.parentSource === s;
                                            }).displayName}</Text>
                                        )}
                                    {source === s && <View style={styles.activeDot} />}
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    </View>
                </BlurView>
            </Modal>

            <Modal visible={showVolume} transparent={true} animationType="fade" onRequestClose={() => setShowVolume(false)}>
                <BlurView intensity={30} style={styles.modalOverlay}>
                    <TouchableOpacity style={styles.modalBg} onPress={() => setShowVolume(false)} />
                    <View style={styles.volumeModalContent}>
                        <Text style={styles.modalTitle}>Volume Control</Text>
                        {/* Parent Volume */}
                        <Text style={styles.volumeLabel}>{player.displayName}</Text>
                        <View style={styles.sliderContainer}>
                            <View style={styles.sliderTrack}><View style={[styles.sliderFill, { width: `${(parentVolume || 0) * 100}%` }]} /></View>
                            <TouchableOpacity style={styles.sliderTouchLeft} onPress={() => handleVolumeChange(Math.max(0, (parentVolume || 0) - 0.05), player)} />
                            <TouchableOpacity style={styles.sliderTouchRight} onPress={() => handleVolumeChange(Math.min(1, (parentVolume || 0) + 0.05), player)} />
                        </View>

                        {/* Child Volume if active and supported */}
                        {activeChild && activeChild.stateObj.attributes.volume_level !== undefined && (
                            <>
                                <Text style={[styles.volumeLabel, { marginTop: 20 }]}>{activeChild.displayName}</Text>
                                <View style={styles.sliderContainer}>
                                    <View style={styles.sliderTrack}><View style={[styles.sliderFill, { width: `${(activeChild.stateObj.attributes.volume_level || 0) * 100}%` }]} /></View>
                                    <TouchableOpacity style={styles.sliderTouchLeft} onPress={() => handleVolumeChange(Math.max(0, (activeChild.stateObj.attributes.volume_level || 0) - 0.05), activeChild)} />
                                    <TouchableOpacity style={styles.sliderTouchRight} onPress={() => handleVolumeChange(Math.min(1, (activeChild.stateObj.attributes.volume_level || 0) + 0.05), activeChild)} />
                                </View>
                            </>
                        )}
                        <TouchableOpacity style={styles.closeBtn} onPress={() => setShowVolume(false)}><Text style={styles.closeText}>Done</Text></TouchableOpacity>
                    </View>
                </BlurView>
            </Modal>

        </View>
    );
}

function TimelineScrubber({ duration, position, onScrub, onCommit, activeColor }) {
    const [width, setWidth] = useState(0);
    const handleNative = (e, isEnd = false) => {
        if (width === 0) return;
        const x = e.nativeEvent.locationX;
        const progress = Math.max(0, Math.min(x, width)) / width;
        isEnd ? onCommit(progress) : onScrub(progress);
    };
    return (
        <View style={styles.timelineTrack} onLayout={(e) => setWidth(e.nativeEvent.layout.width)} onTouchMove={(e) => handleNative(e, false)} onTouchEnd={(e) => handleNative(e, true)}>
            <View style={[styles.timelineFill, { width: `${Math.min(100, (position / duration) * 100)}%` }]} />
        </View>
    );
}

const styles = StyleSheet.create({
    container: { width: '100%', backgroundColor: 'rgba(30, 30, 40, 0.95)', borderRadius: 24, padding: 16, marginBottom: 12, overflow: 'hidden' },
    mainRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
    iconBox: { width: 50, height: 50, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.05)', alignItems: 'center', justifyContent: 'center' },
    artBox: { overflow: 'hidden', padding: 0, backgroundColor: '#000' },
    thumbnail: { width: '100%', height: '100%' },
    infoCol: { flex: 1, justifyContent: 'center' },
    title: { color: '#fff', fontSize: 16, fontWeight: '600', marginBottom: 2 },
    status: { fontSize: 13 },
    ctrlBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },

    controlsRow: { flexDirection: 'row', alignItems: 'center', paddingTop: 14, marginTop: 14, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)' },
    leftGroup: { flex: 1, flexDirection: 'row', justifyContent: 'flex-start' },
    rightGroup: { flex: 1, flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
    transportGroup: { flexDirection: 'row', alignItems: 'center', gap: 16 },

    volGroup: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: 20, padding: 4 },
    muteSmallBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
    volBtn: { paddingHorizontal: 10, paddingVertical: 6 },
    volText: { color: '#ccc', fontSize: 12, fontWeight: '500' },

    playBtn: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#8947ca', alignItems: 'center', justifyContent: 'center' },
    miniTransportBtn: { padding: 8 },
    remoteBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },
    sourceBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },

    timelineRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 12, paddingHorizontal: 4 },
    timeText: { color: '#eee', fontSize: 11, fontVariant: ['tabular-nums'], minWidth: 35, textAlign: 'center' },
    timelineTrack: { flex: 1, height: 4, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 2, overflow: 'hidden' },
    timelineFill: { height: '100%', backgroundColor: '#8947ca' },
    liveBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,0,0,0.2)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
    liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#ff4444' },
    liveText: { color: '#ff4444', fontSize: 10, fontWeight: 'bold' },

    remoteArea: { marginTop: 20, alignItems: 'center', paddingBottom: 10 },
    remoteRow: { flexDirection: 'row', gap: 40, marginTop: 20 },
    remoteActBtn: { padding: 10, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 12 },
    remoteText: { color: '#fff', fontWeight: 'bold' },
    dpad: { width: 140, height: 140, position: 'relative' },
    dpadUp: { position: 'absolute', top: 0, left: 46, padding: 12 },
    dpadDown: { position: 'absolute', bottom: 0, left: 46, padding: 12 },
    dpadLeft: { position: 'absolute', top: 46, left: 0, padding: 12 },
    dpadRight: { position: 'absolute', top: 46, right: 0, padding: 12 },
    dpadCenter: { position: 'absolute', top: 46, left: 46, width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
    remoteHint: { color: Colors.textDim, fontSize: 12, marginTop: 10 },

    // Modals
    modalOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
    modalBg: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.6)' },
    modalContent: { width: '80%', backgroundColor: '#1E1E24', borderRadius: 24, padding: 24, maxHeight: '60%' },
    volumeModalContent: { width: '85%', backgroundColor: '#1E1E24', borderRadius: 30, padding: 30, alignItems: 'center' },
    modalTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold', marginBottom: 20, textAlign: 'center' },

    sourceItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
    sourceActive: { backgroundColor: 'rgba(137, 71, 202, 0.1)', marginHorizontal: -10, paddingHorizontal: 10, borderRadius: 12, borderBottomWidth: 0 },
    sourceItemText: { color: '#ccc', fontSize: 16 },
    activeDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#8947ca' },

    volumeLabel: { color: '#fff', marginBottom: 10, alignSelf: 'flex-start', fontSize: 14, fontWeight: '600' },
    sliderContainer: { width: '100%', height: 40, justifyContent: 'center', position: 'relative', marginBottom: 8 },
    sliderTrack: { width: '100%', height: 12, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.1)', overflow: 'hidden' },
    sliderFill: { height: '100%', backgroundColor: '#8947ca' },
    sliderTouchLeft: { position: 'absolute', top: 0, bottom: 0, left: 0, width: '50%' },
    sliderTouchRight: { position: 'absolute', top: 0, bottom: 0, right: 0, width: '50%' },
    closeBtn: { marginTop: 20 },
    closeText: { color: Colors.textDim, fontSize: 16 }
});
