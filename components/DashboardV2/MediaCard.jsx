import { View, Text, StyleSheet, TouchableOpacity, Image, Modal, ScrollView, Dimensions } from 'react-native';
import { BlurView } from 'expo-blur';
import { Tv, Speaker, Play, Pause, Power, Volume2, VolumeX, List, Monitor, Smartphone } from 'lucide-react-native'; // Added Smartphone for Remote
import * as Haptics from 'expo-haptics';
import { Colors } from '../../constants/Colors';
import { useState, useEffect, useRef } from 'react';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, withSequence } from 'react-native-reanimated';
import RemoteControlModal from './RemoteControlModal';
import AppleTVRemoteModal from './AppleTVRemoteModal';

const HA_URL = process.env.EXPO_PUBLIC_HA_URL || 'http://homeassistant.local:8123';

export default function MediaCard({ player, onUpdate }) {
    if (!player) return null;

    const { attributes, state } = player.stateObj;
    const {
        volume_level,
        is_volume_muted,
        source_list,
        source,
        media_title,
        media_artist,
        app_name,
        entity_picture,
        device_class
    } = attributes;

    const [showSources, setShowSources] = useState(false);
    const [showVolume, setShowVolume] = useState(false);
    const [showRemote, setShowRemote] = useState(false);

    // Heuristics
    const isTv = device_class === 'tv' || attributes.app_id !== undefined || source_list?.some(s => s.includes('HDMI'));
    const isPlaying = state === 'playing';
    const isOn = state !== 'off' && state !== 'standby';
    const activeColor = '#8947ca';

    // Animation for Icon (Pulse when playing)
    const scale = useSharedValue(1);

    useEffect(() => {
        if (isPlaying) {
            scale.value = withRepeat(
                withSequence(
                    withTiming(1.1, { duration: 800 }),
                    withTiming(1, { duration: 800 })
                ),
                -1,
                true
            );
        } else {
            scale.value = withTiming(1);
        }
    }, [isPlaying]);

    const animatedIconStyle = useAnimatedStyle(() => ({
        transform: [{ scale: scale.value }]
    }));

    // Thumbnail Logic with AUTH
    const thumbUrl = entity_picture ? {
        uri: `${HA_URL}${entity_picture}`,
        headers: { Authorization: `Bearer ${process.env.EXPO_PUBLIC_HA_TOKEN}` }
    } : null;

    const handleAction = (service, data = {}) => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        onUpdate(player.entity_id, 'media_player', service, data);
    };

    const handleSourceSelect = (selectedSource) => {
        handleAction('select_source', { source: selectedSource });
        setShowSources(false);
    };

    const handleVolumeChange = (val) => {
        // val is 0-1
        onUpdate(player.entity_id, 'media_player', 'volume_set', { volume_level: val });
    };

    // Timeline Logic
    const duration = attributes.media_duration || 0;
    const [position, setPosition] = useState(attributes.media_position || 0);
    const [isScrubbing, setIsScrubbing] = useState(false);
    // Keep a local ref to latest position to avoid stale closures in interval
    const positionRef = useRef(position);
    const lastUpdateRef = useRef(Date.now());

    // Sync state to ref
    useEffect(() => {
        if (!isScrubbing) {
            setPosition(attributes.media_position || 0);
            positionRef.current = attributes.media_position || 0;
            // Also account for "media_position_updated_at" if we wanted perfect sync, 
            // but for now just resetting on prop change is good.
        }
    }, [attributes.media_position, isScrubbing]);

    useEffect(() => {
        let interval;
        if (isPlaying && !isScrubbing && duration > 0) {
            interval = setInterval(() => {
                setPosition(prev => {
                    const next = prev + 1;
                    if (next > duration) return duration;
                    return next;
                });
            }, 1000);
        }
        return () => clearInterval(interval);
    }, [isPlaying, isScrubbing, duration]); // Removed 'position' dependency to prevent re-interval

    // Scrubbing Logic
    const handleScrub = (val) => { // val is 0-1 progress
        const time = val * duration;
        setPosition(time);
    };

    // Format time mm:ss
    const formatTime = (secs) => {
        if (!secs || isNaN(secs)) return "0:00";
        const m = Math.floor(secs / 60);
        const s = Math.floor(secs % 60);
        return `${m}:${s < 10 ? '0' : ''}${s}`;
    };

    const commitSeek = (val) => {
        const time = val * duration;
        onUpdate(player.entity_id, 'media_player', 'media_seek', { seek_position: time });
        setIsScrubbing(false);
    };


    // Construct Display Strings
    const displayTitle = media_title || player.displayName;
    const displaySubtitle = app_name || source || media_artist || (isOn ? "Playing" : "Off");


    return (
        <View style={styles.container}>
            {/* Background Image - Full Card */}
            {thumbUrl && (
                <View style={[StyleSheet.absoluteFillObject, { borderRadius: 24, overflow: 'hidden' }]}>
                    <Image
                        source={thumbUrl}
                        style={[StyleSheet.absoluteFillObject, { opacity: 0.5 }]} // Increased Opacity
                        resizeMode="cover"
                        blurRadius={40}
                        onError={(e) => console.log('IMG_ERR', e.nativeEvent.error)}
                    />
                    {/* Gradient Overlay for text readability */}
                    <View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(20,20,30,0.5)' }]} />
                    {/* DEBUG: Remove later */}
                    <Text style={{ position: 'absolute', top: 5, right: 5, color: 'yellow', fontSize: 10, width: 100, opacity: 0.5 }}>
                        {thumbUrl.uri}
                    </Text>
                </View>
            )}

            {/* Active Indicator Curve - Only when PLAYING */}
            {isPlaying && <View style={styles.activeCurve} />}

            {/* Top Row: Icon/Art + Info + Power */}
            <View style={styles.mainRow}>
                {/* Icon / Thumbnail Box */}
                <View style={[styles.iconBox, thumbUrl && styles.artBox]}>
                    {thumbUrl ? (
                        <Image
                            source={thumbUrl}
                            style={styles.thumbnail}
                            resizeMode="cover"
                        />
                    ) : (
                        <Animated.View style={animatedIconStyle}>
                            {isTv ?
                                <Tv size={24} color={isPlaying ? activeColor : (isOn ? "#fff" : Colors.textDim)} /> :
                                <Speaker size={24} color={isPlaying ? activeColor : (isOn ? "#fff" : Colors.textDim)} />
                            }
                        </Animated.View>
                    )}
                </View>

                {/* Text Info */}
                <View style={styles.infoCol}>
                    <Text style={styles.title} numberOfLines={1}>{displayTitle}</Text>
                    <Text style={[styles.status, { color: isPlaying ? activeColor : Colors.textDim }]} numberOfLines={1}>
                        {displaySubtitle}
                    </Text>
                </View>

                {/* Power Toggle */}
                <TouchableOpacity
                    style={[styles.ctrlBtn, isOn && { backgroundColor: 'rgba(255,255,255,0.1)' }]}
                    onPress={() => handleAction('toggle')}
                >
                    <Power size={20} color={isOn ? activeColor : Colors.textDim} />
                </TouchableOpacity>
            </View>

            {/* Timeline Slider (If duration exists & ON) */}
            {isOn && duration > 0 && (
                <View style={styles.timelineRow}>
                    <Text style={styles.timeText}>{formatTime(position)}</Text>

                    <TimelineScrubber
                        duration={duration}
                        position={position}
                        onScrub={handleScrub}
                        onCommit={commitSeek}
                        activeColor={activeColor}
                    />

                    <Text style={styles.timeText}>{formatTime(duration)}</Text>
                </View>
            )}

            {/* Bottom Controls Row (Only if ON) */}
            {isOn && (
                <View style={styles.controlsRow}>

                    {/* Left: Volume Group */}
                    <View style={styles.leftGroup}>
                        <View style={styles.volGroup}>
                            {/* Mute Button */}
                            <TouchableOpacity
                                style={[styles.muteSmallBtn, is_volume_muted && { backgroundColor: 'rgba(255,255,255,0.1)' }]}
                                onPress={() => onUpdate(player.entity_id, 'media_player', 'volume_mute', { is_volume_muted: !is_volume_muted })}
                            >
                                {is_volume_muted ?
                                    <VolumeX size={18} color={Colors.textDim} /> :
                                    <Volume2 size={18} color={Colors.textDim} />
                                }
                            </TouchableOpacity>

                            {/* Volume Button -> Opens Slider Modal */}
                            <TouchableOpacity
                                style={styles.volBtn}
                                onPress={() => setShowVolume(true)}
                            >
                                <Text style={styles.volText}>
                                    {volume_level !== undefined ? `${Math.round(volume_level * 100)}%` : '--'}
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </View>

                    {/* Center: Play/Pause */}
                    <View style={styles.transportContainer}>
                        <TouchableOpacity
                            style={[styles.playBtn, !isPlaying && { backgroundColor: 'rgba(255,255,255,0.1)' }]}
                            onPress={() => handleAction('media_play_pause')}
                        >
                            {isPlaying ?
                                <Pause size={20} color="#fff" /> :
                                <Play size={20} color="#fff" style={{ marginLeft: 2 }} />
                            }
                        </TouchableOpacity>
                    </View>

                    {/* Right: Remote & Source buttons */}
                    <View style={styles.rightGroup}>
                        {/* Remote Button (if TV) */}
                        {isTv && (
                            <TouchableOpacity
                                style={styles.remoteBtn}
                                onPress={() => setShowRemote(true)}
                            >
                                <Smartphone size={18} color="#fff" />
                            </TouchableOpacity>
                        )}

                        {/* Source Button */}
                        {source_list && source_list.length > 0 && (
                            <TouchableOpacity
                                style={styles.sourceBtn}
                                onPress={() => setShowSources(true)}
                            >
                                <List size={18} color="#fff" />
                                {/* <Text style={styles.sourceText} numberOfLines={1}>{source || 'Input'}</Text> - Removing text for better alignment/space */}
                            </TouchableOpacity>
                        )}
                    </View>
                </View>
            )}

            {/* --- Modals --- */}
            {/* Apple TV Remote Modal */}
            {player.entity_id === 'media_player.living_room' ? (
                <AppleTVRemoteModal
                    visible={showRemote}
                    onClose={() => setShowRemote(false)}
                    remoteEntityId="remote.living_room"
                    callService={(domain, service, data) => onUpdate(player.entity_id, domain, service, data)}
                />
            ) : (
                <RemoteControlModal
                    visible={showRemote}
                    onClose={() => setShowRemote(false)}
                    player={player}
                    remoteEntity={player.linkedRemote}
                    onUpdate={onUpdate}
                />
            )}

            {/* 1. Source Selection Modal */}
            <Modal
                visible={showSources}
                transparent={true}
                animationType="fade"
                onRequestClose={() => setShowSources(false)}
            >
                <BlurView intensity={20} style={styles.modalOverlay}>
                    <TouchableOpacity style={styles.modalBg} onPress={() => setShowSources(false)} />
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>Select Source</Text>
                        <ScrollView style={{ maxHeight: 300 }}>
                            {source_list?.map((s) => (
                                <TouchableOpacity
                                    key={s}
                                    style={[styles.sourceItem, source === s && styles.sourceActive]}
                                    onPress={() => handleSourceSelect(s)}
                                >
                                    <Text style={[styles.sourceItemText, source === s && { color: activeColor }]}>{s}</Text>
                                    {source === s && <View style={styles.activeDot} />}
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    </View>
                </BlurView>
            </Modal>

            {/* 2. Volume Control Slider Modal */}
            <Modal
                visible={showVolume}
                transparent={true}
                animationType="fade"
                onRequestClose={() => setShowVolume(false)}
            >
                <BlurView intensity={30} style={styles.modalOverlay}>
                    <TouchableOpacity style={styles.modalBg} onPress={() => setShowVolume(false)} />

                    <View style={styles.volumeModalContent}>
                        <Text style={styles.modalTitle}>Volume Control</Text>

                        <Text style={styles.bigVolText}>
                            {volume_level !== undefined ? `${Math.round(volume_level * 100)}%` : '--'}
                        </Text>

                        {/* Custom Slider Bar */}
                        <View style={styles.sliderContainer}>
                            <View style={styles.sliderTrack}>
                                <View style={[styles.sliderFill, { width: `${(volume_level || 0) * 100}%` }]} />
                            </View>
                            {/* Invisible touch areas for simplified stepping since native slider missing */}
                            <TouchableOpacity
                                style={styles.sliderTouchLeft}
                                onPress={() => handleVolumeChange(Math.max(0, (volume_level || 0) - 0.05))}
                            />
                            <TouchableOpacity
                                style={styles.sliderTouchRight}
                                onPress={() => handleVolumeChange(Math.min(1, (volume_level || 0) + 0.05))}
                            />
                        </View>
                        <Text style={styles.sliderHint}>Tap left/right to adjust</Text>

                        <TouchableOpacity style={styles.closeBtn} onPress={() => setShowVolume(false)}>
                            <Text style={styles.closeText}>Done</Text>
                        </TouchableOpacity>
                    </View>
                </BlurView>
            </Modal>
        </View>
    );
}

// Helper Component for Scrubbing (needs to measure width)
function TimelineScrubber({ duration, position, onScrub, onCommit, activeColor }) {
    const [width, setWidth] = useState(0);

    const handleNative = (e, isEnd = false) => {
        if (width === 0) return;
        const x = e.nativeEvent.locationX;
        const constrainedX = Math.max(0, Math.min(x, width));
        const progress = constrainedX / width;

        if (isEnd) onCommit(progress);
        else onScrub(progress);
    };

    return (
        <View
            style={styles.timelineTrack}
            onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
            onTouchStart={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
            onTouchMove={(e) => handleNative(e, false)}
            onTouchEnd={(e) => handleNative(e, true)}
        >
            <View style={[styles.timelineFill, { width: `${Math.min(100, (position / duration) * 100)}%` }]} />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        width: '100%',
        backgroundColor: 'rgba(30, 30, 40, 0.95)',
        borderRadius: 24,
        padding: 16,
        marginBottom: 12,
        gap: 12,
        overflow: 'hidden' // Ensure background image clips
    },
    mainRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14
    },
    iconBox: {
        width: 50,
        height: 50,
        borderRadius: 16,
        backgroundColor: 'rgba(255,255,255,0.05)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    artBox: {
        overflow: 'hidden',
        padding: 0,
        backgroundColor: '#000'
    },
    thumbnail: {
        width: '100%',
        height: '100%'
    },
    infoCol: {
        flex: 1,
        justifyContent: 'center'
    },
    title: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
        marginBottom: 2
    },
    status: {
        fontSize: 13,
    },
    ctrlBtn: {
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: 'center',
        justifyContent: 'center',
    },
    controlsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingTop: 10,
        borderTopWidth: 1,
        borderTopColor: 'rgba(255,255,255,0.08)'
    },
    // New Flex Layout for Alignment
    leftGroup: {
        flex: 1,
        flexDirection: 'row',
        justifyContent: 'flex-start',
    },
    rightGroup: {
        flex: 1,
        flexDirection: 'row',
        justifyContent: 'flex-end',
        gap: 8
    },
    volGroup: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.2)',
        borderRadius: 20,
        padding: 4
    },
    muteSmallBtn: {
        width: 32,
        height: 32,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
    },
    volBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 20
    },
    volText: {
        color: '#ccc',
        fontSize: 12,
        fontWeight: '500'
    },
    transportContainer: {
        width: 50, // Fixed width for center anchor or use flex
        alignItems: 'center',
        justifyContent: 'center'
    },
    playBtn: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: '#8947ca',
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#000',
        shadowOpacity: 0.2,
        shadowRadius: 4,
        shadowOffset: { width: 0, height: 2 }
    },
    remoteBtn: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.1)',
        alignItems: 'center',
        justifyContent: 'center'
    },
    sourceBtn: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.1)',
        alignItems: 'center',
        justifyContent: 'center'
    },
    sourceText: {
        color: '#fff',
        fontSize: 12,
        fontWeight: '500'
    },

    // Modals
    modalOverlay: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20
    },
    modalBg: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.6)'
    },
    modalContent: {
        width: '80%',
        backgroundColor: '#1E1E24',
        borderRadius: 24,
        padding: 24,
        maxHeight: '60%'
    },
    volumeModalContent: {
        width: '85%',
        backgroundColor: '#1E1E24',
        borderRadius: 30,
        padding: 30,
        alignItems: 'center'
    },
    modalTitle: {
        color: '#fff',
        fontSize: 18,
        fontWeight: 'bold',
        marginBottom: 20,
        textAlign: 'center'
    },
    sourceItem: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 14,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.05)'
    },
    sourceActive: {
        backgroundColor: 'rgba(137, 71, 202, 0.1)',
        marginHorizontal: -10,
        paddingHorizontal: 10,
        borderRadius: 12,
        borderBottomWidth: 0
    },
    sourceItemText: {
        color: '#ccc',
        fontSize: 16
    },
    activeDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#8947ca'
    },

    // Custom Slider Styles
    bigVolText: {
        fontSize: 48,
        fontWeight: '200',
        color: '#fff',
        marginBottom: 20
    },
    sliderContainer: {
        width: '100%',
        height: 40,
        justifyContent: 'center',
        position: 'relative',
        marginBottom: 8
    },
    sliderTrack: {
        width: '100%',
        height: 12,
        borderRadius: 6,
        backgroundColor: 'rgba(255,255,255,0.1)',
        overflow: 'hidden'
    },
    sliderFill: {
        height: '100%',
        backgroundColor: '#8947ca',
    },
    sliderTouchLeft: {
        position: 'absolute',
        top: 0, bottom: 0, left: 0, width: '50%',
    },
    sliderTouchRight: {
        position: 'absolute',
        top: 0, bottom: 0, right: 0, width: '50%',
    },
    sliderHint: {
        color: Colors.textDim,
        fontSize: 12,
        marginBottom: 30
    },
    muteBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingVertical: 12,
        paddingHorizontal: 24,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.2)',
        marginBottom: 20
    },
    muteText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600'
    },
    // Timeline styles - Fixed layout
    timelineRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginTop: 6,
        paddingHorizontal: 12,
        width: '100%',
        justifyContent: 'space-between'
    },
    timeText: {
        color: '#eee',
        fontSize: 11,
        fontVariant: ['tabular-nums'],
        minWidth: 35,
        textAlign: 'center'
    },
    timelineTrack: {
        flex: 1, // Take remaining space
        height: 4,
        backgroundColor: 'rgba(255,255,255,0.2)', // More visible track
        borderRadius: 2,
        overflow: 'hidden'
    },
    timelineFill: {
        height: '100%',
        backgroundColor: '#8947ca',
    },
    scrubOverlay: {
        position: 'absolute',
        top: -10, bottom: -10, left: 40, right: 40, // Match track area roughly
        zIndex: 10
    },

    // --- Restored Styles ---
    activeCurve: {
        position: 'absolute',
        left: 0,
        top: 16, // Match padding
        bottom: 16,
        width: 4,
        borderTopRightRadius: 4,
        borderBottomRightRadius: 4,
        backgroundColor: '#8947ca',
    },
    closeBtn: {
        marginTop: 10
    },
    closeText: {
        color: Colors.textDim,
        fontSize: 16
    }
});
