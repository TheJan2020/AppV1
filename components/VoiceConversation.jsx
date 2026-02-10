import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, Volume2, Sparkles } from 'lucide-react-native';
import { Colors } from '../constants/Colors';
import { WakeWordManager } from '../services/WakeWordManager';
import { ConversationManager } from '../services/ConversationManager';
import * as Haptics from 'expo-haptics';

export default function VoiceConversation({ onCommand, context }) {
    const [status, setStatus] = useState('idle'); // idle, wake_listening, listening, processing, speaking, ended
    const [isEnabled, setIsEnabled] = useState(false);

    const wakeWordManager = useRef(new WakeWordManager()).current;
    const conversationManager = useRef(new ConversationManager()).current;
    const pulseAnim = useRef(new Animated.Value(1)).current;
    const glowAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        // Pulse animation for listening states
        if (status === 'listening' || status === 'wake_listening') {
            Animated.loop(
                Animated.sequence([
                    Animated.timing(pulseAnim, {
                        toValue: 1.3,
                        duration: 1000,
                        useNativeDriver: true,
                    }),
                    Animated.timing(pulseAnim, {
                        toValue: 1,
                        duration: 1000,
                        useNativeDriver: true,
                    }),
                ])
            ).start();
        } else {
            pulseAnim.setValue(1);
        }

        // Glow animation for speaking
        if (status === 'speaking') {
            Animated.loop(
                Animated.sequence([
                    Animated.timing(glowAnim, {
                        toValue: 0.5,
                        duration: 800,
                        useNativeDriver: true,
                    }),
                    Animated.timing(glowAnim, {
                        toValue: 1,
                        duration: 800,
                        useNativeDriver: true,
                    }),
                ])
            ).start();
        } else {
            glowAnim.setValue(1);
        }
    }, [status]);

    useEffect(() => {
        // Cleanup on unmount
        return () => {
            wakeWordManager.stop();
            conversationManager.forceEnd();
        };
    }, []);

    const startWakeWordListening = async () => {
        setStatus('wake_listening');
        await wakeWordManager.start(handleWakeWordDetected);
    };

    const stopWakeWordListening = async () => {
        await wakeWordManager.stop();
        setStatus('idle');
    };

    const handleWakeWordDetected = async () => {
        console.log('[VoiceConversation] Wake word detected! Starting conversation...');

        // Stop wake word listening
        await wakeWordManager.pause();

        // Start conversation session
        await conversationManager.startSession({
            onStatusChange: handleConversationStatusChange,
            onCommand: onCommand,
            context: context
        });
    };

    const handleConversationStatusChange = (newStatus) => {
        console.log('[VoiceConversation] Conversation status:', newStatus);
        setStatus(newStatus);

        // When conversation ends, resume wake word listening
        if (newStatus === 'ended' && isEnabled) {
            setTimeout(() => {
                setStatus('wake_listening');
                wakeWordManager.resume();
            }, 1000);
        }
    };

    const toggleVoiceAssistant = async () => {
        if (status === 'wake_listening') {
            // If already listening for wake word, tapping starts conversation immediately
            await handleWakeWordDetected();
        } else if (isEnabled) {
            // Disable
            await stopWakeWordListening();
            await conversationManager.forceEnd();
            setIsEnabled(false);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        } else {
            // Enable
            setIsEnabled(true);
            await startWakeWordListening();
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
    };

    const manualTrigger = async () => {
        // Long press to manually end session if in conversation
        if (status === 'listening' || status === 'processing' || status === 'speaking') {
            await conversationManager.forceEnd();
            if (isEnabled) {
                setStatus('wake_listening');
                wakeWordManager.resume();
            }
        }
    };

    const getStatusInfo = () => {
        switch (status) {
            case 'idle':
                return { text: 'Voice Assistant Off', color: '#666', icon: MicOff };
            case 'wake_listening':
                return { text: 'Say "Hey Butler"', color: Colors.primary, icon: Mic };
            case 'listening':
                return { text: 'Listening...', color: '#4CAF50', icon: Mic };
            case 'processing':
                return { text: 'Processing...', color: '#FF9800', icon: Sparkles };
            case 'speaking':
                return { text: 'Speaking...', color: '#2196F3', icon: Volume2 };
            case 'ended':
                return { text: 'Session Ended', color: '#666', icon: MicOff };
            case 'error':
                return { text: 'Error', color: '#F44336', icon: MicOff };
            default:
                return { text: 'Unknown', color: '#666', icon: MicOff };
        }
    };

    const statusInfo = getStatusInfo();
    const StatusIcon = statusInfo.icon;

    return (
        <View style={styles.container}>
            {/* Main button */}
            <TouchableOpacity
                style={[
                    styles.mainButton,
                    { backgroundColor: statusInfo.color }
                ]}
                onPress={toggleVoiceAssistant}
                onLongPress={manualTrigger}
                activeOpacity={0.8}
            >
                <Animated.View
                    style={[
                        styles.innerButton,
                        {
                            transform: [{ scale: pulseAnim }],
                            opacity: glowAnim
                        }
                    ]}
                >
                    <StatusIcon size={32} color="#fff" />
                </Animated.View>
            </TouchableOpacity>

            {/* Status text */}
            <Text style={[styles.statusText, { color: statusInfo.color }]}>
                {statusInfo.text}
            </Text>

            {/* Help text */}
            {status === 'wake_listening' && (
                <Text style={styles.helpText}>
                    Long press to start manually
                </Text>
            )}

            {status === 'listening' && (
                <Text style={styles.helpText}>
                    Say "Thank you Butler" to end
                </Text>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        alignItems: 'center',
        gap: 12,
        paddingVertical: 20,
    },
    mainButton: {
        width: 80,
        height: 80,
        borderRadius: 40,
        justifyContent: 'center',
        alignItems: 'center',
        elevation: 8,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
    },
    innerButton: {
        width: '100%',
        height: '100%',
        borderRadius: 40,
        justifyContent: 'center',
        alignItems: 'center',
    },
    statusText: {
        fontSize: 16,
        fontWeight: '600',
    },
    helpText: {
        fontSize: 12,
        color: '#999',
        fontStyle: 'italic',
    },
});
