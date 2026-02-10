import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Animated } from 'react-native';
import { useState, useEffect, useRef } from 'react';
import { Audio } from 'expo-av';
import { Mic, MicOff } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import * as SecureStore from 'expo-secure-store';
import * as FileSystem from 'expo-file-system/legacy';
import { Colors } from '../constants/Colors';

export default function VoiceAssistantButton({ onCommand, context }) {
    const [isRecording, setIsRecording] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [status, setStatus] = useState('idle'); // idle, recording, processing, speaking
    const [recording, setRecording] = useState(null);
    const [sound, setSound] = useState(null);
    const [conversationHistory, setConversationHistory] = useState([]); // Track conversation

    const pulseAnim = useRef(new Animated.Value(1)).current;

    useEffect(() => {
        if (isRecording) {
            // Pulse animation while recording
            Animated.loop(
                Animated.sequence([
                    Animated.timing(pulseAnim, {
                        toValue: 1.2,
                        duration: 800,
                        useNativeDriver: true,
                    }),
                    Animated.timing(pulseAnim, {
                        toValue: 1,
                        duration: 800,
                        useNativeDriver: true,
                    }),
                ])
            ).start();
        } else {
            pulseAnim.setValue(1);
        }
    }, [isRecording]);

    useEffect(() => {
        return () => {
            // Cleanup
            if (recording) {
                recording.stopAndUnloadAsync();
            }
            if (sound) {
                sound.unloadAsync();
            }
        };
    }, []);

    const startRecording = async () => {
        try {
            const permission = await Audio.requestPermissionsAsync();
            if (!permission.granted) {
                alert('Microphone permission required');
                return;
            }

            await Audio.setAudioModeAsync({
                allowsRecordingIOS: true,
                playsInSilentModeIOS: true,
            });

            const { recording: newRecording } = await Audio.Recording.createAsync(
                Audio.RecordingOptionsPresets.HIGH_QUALITY
            );

            setRecording(newRecording);
            setIsRecording(true);
            setStatus('recording');
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

        } catch (error) {
            console.error('[VoiceAssistant] Recording error:', error);
            alert('Failed to start recording');
        }
    };

    const stopRecording = async () => {
        if (!recording) return;

        try {
            setIsRecording(false);
            setStatus('processing');
            setIsProcessing(true);

            await recording.stopAndUnloadAsync();
            const uri = recording.getURI();
            setRecording(null);

            // Process voice command
            await processVoiceCommand(uri);

        } catch (error) {
            console.error('[VoiceAssistant] Stop recording error:', error);
            setStatus('idle');
            setIsProcessing(false);
        }
    };

    const processVoiceCommand = async (audioUri) => {
        try {
            const backendUrl = await SecureStore.getItemAsync('admin_url');
            const apiKey = await SecureStore.getItemAsync('api_key_openai');

            if (!backendUrl || !apiKey) {
                alert('Configuration missing');
                setStatus('idle');
                setIsProcessing(false);
                return;
            }

            // Step 1: Transcribe audio
            const formData = new FormData();
            formData.append('audio', {
                uri: audioUri,
                type: 'audio/m4a',
                name: 'audio.m4a',
            });
            formData.append('api_key', apiKey);
            formData.append('language', 'en');

            const transcribeResponse = await fetch(`${backendUrl}/api/voice/transcribe`, {
                method: 'POST',
                body: formData,
            });

            const transcribeData = await transcribeResponse.json();
            if (!transcribeData.success) {
                throw new Error(transcribeData.error || 'Transcription failed');
            }

            console.log('[VoiceAssistant] Transcript:', transcribeData.transcript);

            // Step 2: Process with LLM
            const processResponse = await fetch(`${backendUrl}/api/voice/process`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    transcript: transcribeData.transcript,
                    api_key: apiKey,
                    context: context || {},
                    history: conversationHistory // Include conversation history
                })
            });

            const processData = await processResponse.json();
            if (!processData.success) {
                throw new Error(processData.error || 'Processing failed');
            }

            console.log('[VoiceAssistant] Response:', processData.response);
            console.log('[VoiceAssistant] Commands:', processData.commands);

            // Update conversation history
            setConversationHistory(prev => [
                ...prev,
                { role: 'user', content: transcribeData.transcript },
                { role: 'assistant', content: processData.raw_response }
            ].slice(-10)); // Keep last 10 messages (5 turns)

            // Execute commands if any
            if (processData.commands && processData.commands.length > 0 && onCommand) {
                for (const cmd of processData.commands) {
                    await onCommand(cmd);
                }
            }

            // Step 3: Generate and play TTS
            const speakResponse = await fetch(`${backendUrl}/api/voice/speak`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    text: processData.response,
                    api_key: apiKey,
                    voice: 'alloy'
                })
            });

            const speakData = await speakResponse.json();
            if (!speakData.success) {
                throw new Error(speakData.error || 'TTS failed');
            }

            // Play audio
            setStatus('speaking');
            await playTTSAudio(speakData.audio);

            setStatus('idle');
            setIsProcessing(false);

        } catch (error) {
            console.error('[VoiceAssistant] Process error:', error);
            alert(`Voice command failed: ${error.message}`);
            setStatus('idle');
            setIsProcessing(false);
        }
    };

    const playTTSAudio = async (base64Audio) => {
        try {
            // Set audio mode to play on speaker
            await Audio.setAudioModeAsync({
                allowsRecordingIOS: false,
                playsInSilentModeIOS: true,
                staysActiveInBackground: false,
                shouldDuckAndroid: true,
                playThroughEarpieceAndroid: false, // Use speaker, not earpiece
            });

            // Save base64 to temp file
            const fileUri = `${FileSystem.cacheDirectory}tts_response.mp3`;
            await FileSystem.writeAsStringAsync(fileUri, base64Audio, {
                encoding: 'base64',
            });

            // Play audio
            const { sound: newSound } = await Audio.Sound.createAsync(
                { uri: fileUri },
                { shouldPlay: true }
            );

            setSound(newSound);

            newSound.setOnPlaybackStatusUpdate((status) => {
                if (status.didJustFinish) {
                    newSound.unloadAsync();
                    setSound(null);
                }
            });

        } catch (error) {
            console.error('[VoiceAssistant] TTS playback error:', error);
        }
    };

    const toggleRecording = () => {
        if (isRecording) {
            stopRecording();
        } else {
            startRecording();
        }
    };

    return (
        <View style={styles.container}>
            <TouchableOpacity
                style={[
                    styles.button,
                    isRecording && styles.buttonRecording,
                    isProcessing && styles.buttonProcessing
                ]}
                onPress={toggleRecording}
                activeOpacity={0.8}
                disabled={isProcessing}
            >
                <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
                    {isProcessing ? (
                        <ActivityIndicator size="large" color="#fff" />
                    ) : (
                        isRecording ? (
                            <MicOff size={32} color="#fff" />
                        ) : (
                            <Mic size={32} color="#fff" />
                        )
                    )}
                </Animated.View>
            </TouchableOpacity>

            {status !== 'idle' && (
                <Text style={styles.statusText}>
                    {status === 'recording' && 'Listening...'}
                    {status === 'processing' && 'Processing...'}
                    {status === 'speaking' && 'Speaking...'}
                </Text>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        alignItems: 'center',
        gap: 12,
    },
    button: {
        width: 70,
        height: 70,
        borderRadius: 35,
        backgroundColor: Colors.primary,
        justifyContent: 'center',
        alignItems: 'center',
        elevation: 8,
        shadowColor: Colors.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.4,
        shadowRadius: 8,
    },
    buttonRecording: {
        backgroundColor: '#FF3B30',
    },
    buttonProcessing: {
        backgroundColor: '#8E8E93',
    },
    statusText: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '600',
    },
});
