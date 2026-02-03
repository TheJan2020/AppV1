import { useState } from 'react';
import { Modal, View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, ActivityIndicator } from 'react-native';
import { BlurView } from 'expo-blur';
import { X, Tv, Youtube, Play } from 'lucide-react-native';
import { extractYouTubeVideoId, isValidYouTubeUrl, formatYouTubeUrl, detectPlayerType } from '../../utils/youtubeHelpers';
import * as Haptics from 'expo-haptics';

export default function YouTubeLauncherModal({ visible, onClose, mediaPlayers, callService }) {
    const [youtubeUrl, setYoutubeUrl] = useState('');
    const [selectedPlayer, setSelectedPlayer] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);

    // Hardcoded TV entities
    const tvPlayers = [
        {
            entity_id: 'media_player.living_room_tv',
            attributes: { friendly_name: 'Living Room TV' },
            state: mediaPlayers.find(p => p.entity_id === 'media_player.living_room_tv')?.state || 'unknown'
        },
        {
            entity_id: 'media_player.living_room',
            attributes: { friendly_name: 'Apple TV' },
            state: mediaPlayers.find(p => p.entity_id === 'media_player.living_room')?.state || 'unknown'
        }
    ];

    const handleLaunch = async () => {
        setError('');
        setSuccess(false);

        // Validation
        if (!youtubeUrl.trim()) {
            setError('Please paste a YouTube URL');
            return;
        }

        if (!selectedPlayer) {
            setError('Please select a TV');
            return;
        }

        if (!isValidYouTubeUrl(youtubeUrl)) {
            setError('Invalid YouTube URL');
            return;
        }

        const videoId = extractYouTubeVideoId(youtubeUrl);
        if (!videoId) {
            setError('Could not extract video ID from URL');
            return;
        }

        setLoading(true);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

        try {
            const videoId = extractYouTubeVideoId(youtubeUrl);
            if (!videoId) {
                setError('Could not extract video ID from URL');
                setLoading(false);
                return;
            }

            // Determine which script to call based on selected player
            let scriptEntityId;
            if (selectedPlayer.entity_id === 'media_player.living_room_tv') {
                scriptEntityId = 'script.play_youtube_on_lg';
            } else if (selectedPlayer.entity_id === 'media_player.living_room') {
                scriptEntityId = 'script.play_youtube_on_apple_tv';
            } else {
                setError('Unknown TV selected');
                setLoading(false);
                return;
            }

            console.log('=== YouTube Launcher Debug ===');
            console.log('[YouTube Launcher] Video ID:', videoId);
            console.log('[YouTube Launcher] Selected TV:', selectedPlayer.attributes?.friendly_name);
            console.log('[YouTube Launcher] Entity ID:', selectedPlayer.entity_id);
            console.log('[YouTube Launcher] Calling script:', scriptEntityId);
            console.log('[YouTube Launcher] Script data:', {
                entity_id: scriptEntityId,
                variables: { video_id: videoId }
            });

            // Call Home Assistant script using script.turn_on service
            const result = await callService('script', 'turn_on', {
                entity_id: scriptEntityId,
                variables: {
                    video_id: videoId
                }
            });

            console.log('[YouTube Launcher] Script call result:', result);
            console.log('=== End Debug ===');

            setSuccess(true);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

            // Auto-close after success
            setTimeout(() => {
                handleClose();
            }, 1500);

        } catch (err) {
            console.error('[YouTube Launcher] Error:', err);
            console.error('[YouTube Launcher] Error details:', JSON.stringify(err, null, 2));
            setError(`Failed to launch video: ${err.message || 'Unknown error'}`);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        } finally {
            setLoading(false);
        }
    };

    const handleClose = () => {
        setYoutubeUrl('');
        setSelectedPlayer(null);
        setError('');
        setSuccess(false);
        onClose();
    };

    return (
        <Modal
            visible={visible}
            transparent={true}
            animationType="fade"
            onRequestClose={handleClose}
        >
            <BlurView intensity={30} style={styles.overlay}>
                <TouchableOpacity style={styles.backdrop} onPress={handleClose} />

                <View style={styles.modal}>
                    {/* Header */}
                    <View style={styles.header}>
                        <View style={styles.headerLeft}>
                            <Youtube size={24} color="#FF0000" />
                            <Text style={styles.title}>Launch YouTube Video</Text>
                        </View>
                        <TouchableOpacity onPress={handleClose} style={styles.closeBtn}>
                            <X size={24} color="#fff" />
                        </TouchableOpacity>
                    </View>

                    <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
                        {/* YouTube URL Input */}
                        <View style={styles.section}>
                            <Text style={styles.label}>YouTube URL</Text>
                            <TextInput
                                style={styles.input}
                                placeholder="Paste YouTube link here..."
                                placeholderTextColor="rgba(255,255,255,0.3)"
                                value={youtubeUrl}
                                onChangeText={setYoutubeUrl}
                                autoCapitalize="none"
                                autoCorrect={false}
                                keyboardType="url"
                            />
                        </View>

                        {/* TV Selection */}
                        <View style={styles.section}>
                            <Text style={styles.label}>Select TV</Text>
                            {tvPlayers.length === 0 ? (
                                <Text style={styles.noTvText}>No TVs found</Text>
                            ) : (
                                <View style={styles.tvList}>
                                    {tvPlayers.map((player) => {
                                        const isSelected = selectedPlayer?.entity_id === player.entity_id;
                                        const isOn = player.state !== 'off' && player.state !== 'standby';

                                        return (
                                            <TouchableOpacity
                                                key={player.entity_id}
                                                style={[
                                                    styles.tvItem,
                                                    isSelected && styles.tvItemSelected
                                                ]}
                                                onPress={() => {
                                                    setSelectedPlayer(player);
                                                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                                }}
                                            >
                                                <View style={styles.tvItemLeft}>
                                                    <Tv size={20} color={isSelected ? '#8947ca' : (isOn ? '#fff' : 'rgba(255,255,255,0.4)')} />
                                                    <View>
                                                        <Text style={[styles.tvName, isSelected && styles.tvNameSelected]}>
                                                            {player.attributes?.friendly_name || player.entity_id}
                                                        </Text>
                                                        <Text style={styles.tvStatus}>
                                                            {isOn ? 'On' : 'Off'}
                                                        </Text>
                                                    </View>
                                                </View>
                                                {isSelected && <View style={styles.selectedDot} />}
                                            </TouchableOpacity>
                                        );
                                    })}
                                </View>
                            )}
                        </View>

                        {/* Error Message */}
                        {error && (
                            <View style={styles.errorBox}>
                                <Text style={styles.errorText}>{error}</Text>
                            </View>
                        )}

                        {/* Success Message */}
                        {success && (
                            <View style={styles.successBox}>
                                <Text style={styles.successText}>✓ Video launched successfully!</Text>
                            </View>
                        )}
                    </ScrollView>

                    {/* Launch Button */}
                    <TouchableOpacity
                        style={[
                            styles.launchBtn,
                            (loading || !youtubeUrl.trim() || !selectedPlayer) && styles.launchBtnDisabled
                        ]}
                        onPress={handleLaunch}
                        disabled={loading || !youtubeUrl.trim() || !selectedPlayer}
                    >
                        {loading ? (
                            <ActivityIndicator color="#fff" />
                        ) : (
                            <>
                                <Play size={20} color="#fff" />
                                <Text style={styles.launchBtnText}>Launch Video</Text>
                            </>
                        )}
                    </TouchableOpacity>
                </View>
            </BlurView>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    backdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.6)',
    },
    modal: {
        width: '100%',
        maxWidth: 500,
        backgroundColor: '#1E1E24',
        borderRadius: 24,
        overflow: 'hidden',
        maxHeight: '80%',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 20,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.1)',
    },
    headerLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    title: {
        color: '#fff',
        fontSize: 20,
        fontWeight: 'bold',
    },
    closeBtn: {
        padding: 4,
    },
    content: {
        padding: 20,
    },
    section: {
        marginBottom: 24,
    },
    label: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '600',
        marginBottom: 12,
    },
    input: {
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 12,
        padding: 16,
        color: '#fff',
        fontSize: 16,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    tvList: {
        gap: 10,
    },
    tvItem: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 16,
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 12,
        borderWidth: 2,
        borderColor: 'transparent',
    },
    tvItemSelected: {
        backgroundColor: 'rgba(137,71,202,0.1)',
        borderColor: '#8947ca',
    },
    tvItemLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    tvName: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
    },
    tvNameSelected: {
        color: '#8947ca',
    },
    tvStatus: {
        color: 'rgba(255,255,255,0.4)',
        fontSize: 12,
        marginTop: 2,
    },
    selectedDot: {
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: '#8947ca',
    },
    noTvText: {
        color: 'rgba(255,255,255,0.4)',
        fontSize: 14,
        textAlign: 'center',
        padding: 20,
    },
    errorBox: {
        backgroundColor: 'rgba(239,68,68,0.1)',
        borderRadius: 12,
        padding: 12,
        borderWidth: 1,
        borderColor: 'rgba(239,68,68,0.3)',
        marginBottom: 16,
    },
    errorText: {
        color: '#EF4444',
        fontSize: 14,
        textAlign: 'center',
    },
    successBox: {
        backgroundColor: 'rgba(34,197,94,0.1)',
        borderRadius: 12,
        padding: 12,
        borderWidth: 1,
        borderColor: 'rgba(34,197,94,0.3)',
        marginBottom: 16,
    },
    successText: {
        color: '#22C55E',
        fontSize: 14,
        textAlign: 'center',
        fontWeight: '600',
    },
    launchBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        backgroundColor: '#8947ca',
        padding: 18,
        margin: 20,
        marginTop: 0,
        borderRadius: 12,
    },
    launchBtnDisabled: {
        backgroundColor: 'rgba(255,255,255,0.1)',
        opacity: 0.5,
    },
    launchBtnText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: 'bold',
    },
});
