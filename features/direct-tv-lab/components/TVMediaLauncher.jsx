import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { Youtube, ExternalLink } from 'lucide-react-native';
import { Colors } from '../../../constants/Colors';
import * as Haptics from 'expo-haptics';

function extractYouTubeId(input) {
    const trimmed = input.trim();
    // Already a video ID (11 chars, no slashes)
    if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;

    // YouTube URL patterns
    const patterns = [
        /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/)([a-zA-Z0-9_-]{11})/,
        /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
    ];

    for (const pattern of patterns) {
        const match = trimmed.match(pattern);
        if (match) return match[1];
    }
    return null;
}

export default function TVMediaLauncher({ adapter, connected }) {
    const [youtubeUrl, setYoutubeUrl] = useState('');

    if (!connected || !adapter) return null;

    const handleLaunchYouTube = () => {
        const videoId = extractYouTubeId(youtubeUrl);
        if (!videoId) {
            Alert.alert('Invalid URL', 'Please enter a valid YouTube URL or video ID.');
            return;
        }

        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        adapter.openYouTube(videoId).catch(err => {
            Alert.alert('Error', err.message || 'Failed to launch YouTube');
        });
    };

    return (
        <View style={styles.container}>
            <Text style={styles.title}>Media</Text>

            <View style={styles.section}>
                <View style={styles.sectionHeader}>
                    <Youtube size={18} color="#FF0000" />
                    <Text style={styles.sectionTitle}>YouTube</Text>
                </View>
                <View style={styles.inputRow}>
                    <TextInput
                        style={styles.input}
                        value={youtubeUrl}
                        onChangeText={setYoutubeUrl}
                        placeholder="Paste YouTube URL or video ID"
                        placeholderTextColor={Colors.textDim}
                        autoCapitalize="none"
                        autoCorrect={false}
                    />
                    <TouchableOpacity
                        style={[styles.launchBtn, !youtubeUrl.trim() && styles.launchBtnDisabled]}
                        onPress={handleLaunchYouTube}
                        disabled={!youtubeUrl.trim()}
                    >
                        <ExternalLink size={16} color="white" />
                        <Text style={styles.launchText}>Play</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 16,
        padding: 16,
        marginBottom: 16,
    },
    title: {
        color: Colors.text,
        fontSize: 16,
        fontWeight: '600',
        marginBottom: 14,
    },
    section: {
        gap: 10,
    },
    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    sectionTitle: {
        color: Colors.text,
        fontSize: 14,
        fontWeight: '500',
    },
    inputRow: {
        flexDirection: 'row',
        gap: 10,
        alignItems: 'center',
    },
    input: {
        flex: 1,
        color: Colors.text,
        fontSize: 14,
        paddingVertical: 10,
        paddingHorizontal: 12,
        backgroundColor: 'rgba(255,255,255,0.08)',
        borderRadius: 10,
    },
    launchBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: '#8947ca',
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 10,
    },
    launchBtnDisabled: {
        opacity: 0.4,
    },
    launchText: {
        color: 'white',
        fontSize: 14,
        fontWeight: '600',
    },
});
