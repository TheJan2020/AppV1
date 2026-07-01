import { useState, useRef, useEffect, memo } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform, Keyboard, Image } from 'react-native';
import { Colors } from '../../constants/Colors';
import { Heading, CF } from '../../utils/typography';
import { Send, Bot, User as UserIcon, Mic, ChevronLeft } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Audio } from 'expo-av';
import * as Speech from 'expo-speech';
import { ButlerChatClient } from '../../services/butler/ButlerChatClient';
import { getButlerBackendUrl, toButlerWsUrl } from '../../utils/butlerBackend';
import { AIService } from '../../services/ai';

const AI_AVATAR = require('../../assets/ai.png');
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, runOnJS, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { ButlerIcon } from './TabBarIcons';
import { Lock, X } from 'lucide-react-native';

function TypingDots() {
    const dot1 = useSharedValue(0.3);
    const dot2 = useSharedValue(0.3);
    const dot3 = useSharedValue(0.3);
    useEffect(() => {
        const anim = (v, delay) => {
            v.value = withRepeat(
                withSequence(
                    withTiming(1, { duration: 300 }),
                    withTiming(0.3, { duration: 300 })
                ),
                -1
            );
        };
        anim(dot1, 0);
        setTimeout(() => anim(dot2, 0), 150);
        setTimeout(() => anim(dot3, 0), 300);
    }, []);
    const s1 = useAnimatedStyle(() => ({ opacity: dot1.value }));
    const s2 = useAnimatedStyle(() => ({ opacity: dot2.value }));
    const s3 = useAnimatedStyle(() => ({ opacity: dot3.value }));
    return (
        <View style={{ flexDirection: 'row', gap: 5, alignItems: 'center', paddingVertical: 2 }}>
            <Animated.View style={[{ width: 7, height: 7, borderRadius: 4, backgroundColor: '#fff' }, s1]} />
            <Animated.View style={[{ width: 7, height: 7, borderRadius: 4, backgroundColor: '#fff' }, s2]} />
            <Animated.View style={[{ width: 7, height: 7, borderRadius: 4, backgroundColor: '#fff' }, s3]} />
        </View>
    );
}

async function fetchCameraSnapshot(entityId, haUrl, haToken) {
    if (!haUrl || !haToken) {
        console.error('[BrainView] Missing HA URL or Token');
        return null;
    }
    try {
        const url = `${haUrl}/api/camera_proxy/${entityId}`;
        console.log('[BrainView] Fetching from:', url);
        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${haToken}`
            }
        });
        if (!response.ok) {
            console.error('[BrainView] Snapshot fetch failed:', response.status);
            return null;
        }
        const blob = await response.blob();
        console.log('[BrainView] Snapshot blob size:', blob.size);

        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                const base64data = reader.result.split(',')[1];
                resolve(base64data);
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    } catch (error) {
        console.error('Failed to fetch snapshot:', error);
        return null;
    }
}

function BrainView({ entities = [], callService, registryDevices = [], registryEntities = [], registryAreas = [], onExit, onStartVoiceCall, haUrl, haToken }) {
    const [message, setMessage] = useState('');
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(false);
    const [audioMode, setAudioMode] = useState(false);
    const [recording, setRecording] = useState(null);
    const [lockedRecording, setLockedRecording] = useState(false);
    const [permissionResponse, requestPermission] = Audio.usePermissions();
    const [isRecordingState, setIsRecordingState] = useState(false);
    const [isKeyboardVisible, setKeyboardVisible] = useState(false);
    const [chatStatus, setChatStatus] = useState('connecting'); // 'connecting' | 'ready' | 'error'
    const scrollViewRef = useRef();
    const chatClientRef = useRef(null);
    const streamingMsgIdRef = useRef(null); // id of the assistant bubble currently streaming
    const audioModeRef = useRef(false);     // always-current audioMode for WS callbacks

    // ── Butler chat WS session ──────────────────────────────────────────────
    useEffect(() => {
        let client = null;
        let cancelled = false;

        async function initChat() {
            try {
                const httpBase = await getButlerBackendUrl();
                const wsBase = toButlerWsUrl(httpBase);
                client = new ButlerChatClient(wsBase);

                client.on('close', () => {
                    if (!cancelled) setChatStatus('error');
                });
                client.on('error', () => {
                    if (!cancelled) setChatStatus('error');
                });

                await client.connect(15000);
                if (cancelled) { client.close(); return; }

                chatClientRef.current = client;
                setChatStatus('ready');

                // Streaming text — append chunks to the current assistant bubble
                client.on('text', ({ text }) => {
                    // Capture the ID immediately (synchronously) when the WS frame
                    // arrives — NOT inside the setHistory updater. React schedules
                    // state updaters asynchronously, so by the time the updater runs
                    // 'turn_end' may have already nulled streamingMsgIdRef.current,
                    // causing the last chunk(s) to be silently dropped.
                    const currentId = streamingMsgIdRef.current;
                    if (!currentId) return;
                    setHistory(prev =>
                        prev.map(m =>
                            m.id === currentId
                                ? { ...m, content: m.content + text }
                                : m
                        )
                    );
                });

                client.on('turn_end', () => {
                    setLoading(false);
                    streamingMsgIdRef.current = null;
                    // Read last assistant message aloud if audio mode is on.
                    // Use audioModeRef to avoid stale closure (this handler is
                    // created once at mount, so `audioMode` state would be stale).
                    if (audioModeRef.current) {
                        setHistory(prev => {
                            const last = [...prev].reverse().find(m => m.role === 'assistant');
                            if (last?.content) Speech.speak(last.content, { language: 'en' });
                            return prev;
                        });
                    }
                });

                client.on('tool_call_started', ({ name }) => {
                    const currentId = streamingMsgIdRef.current;
                    if (!currentId) return;
                    setHistory(prev =>
                        prev.map(m =>
                            m.id === currentId
                                ? { ...m, toolName: name, toolRunning: true }
                                : m
                        )
                    );
                });

                client.on('tool_call_result', () => {
                    const currentId = streamingMsgIdRef.current;
                    if (!currentId) return;
                    setHistory(prev =>
                        prev.map(m =>
                            m.id === currentId
                                ? { ...m, toolRunning: false }
                                : m
                        )
                    );
                });

                client.on('error', ({ message: errMsg }) => {
                    // Capture the ID before nullifying it, otherwise setHistory
                    // will see null and skip updating the bubble.
                    const bubbleId = streamingMsgIdRef.current;
                    setLoading(false);
                    streamingMsgIdRef.current = null;
                    if (bubbleId) {
                        setHistory(prev =>
                            prev.map(m =>
                                m.id === bubbleId
                                    ? { ...m, content: `Error: ${errMsg}`, isError: true }
                                    : m
                            )
                        );
                    }
                });

            } catch (e) {
                if (!cancelled) setChatStatus('error');
                console.error('[BrainView] Butler chat connect failed:', e.message);
            }
        }

        initChat();

        return () => {
            cancelled = true;
            chatClientRef.current?.close();
            chatClientRef.current = null;
        };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        const keyboardDidShowListener = Keyboard.addListener(
            'keyboardDidShow',
            () => {
                setKeyboardVisible(true);
            }
        );
        const keyboardDidHideListener = Keyboard.addListener(
            'keyboardDidHide',
            () => {
                setKeyboardVisible(false);
            }
        );

        return () => {
            keyboardDidHideListener.remove();
            keyboardDidShowListener.remove();
        };
    }, []);

    // Animation values
    const micScale = useSharedValue(1);
    const lockOpacity = useSharedValue(0);
    const lockTranslateY = useSharedValue(0);

    async function startRecording() {
        try {
            // Ensure no existing recording
            if (recording) {
                console.warn('Stopping previous recording before starting new one');
                await recording.stopAndUnloadAsync();
                setRecording(null);
            }

            if (permissionResponse.status !== 'granted') {
                console.log('Requesting permission..');
                await requestPermission();
            }
            await Audio.setAudioModeAsync({
                allowsRecordingIOS: true,
                playsInSilentModeIOS: true,
            });

            console.log('Starting recording..');
            const { recording: newRecording } = await Audio.Recording.createAsync(
                Audio.RecordingOptionsPresets.HIGH_QUALITY
            );
            setRecording(newRecording);
            setIsRecordingState(true);
        } catch (err) {
            console.error('Failed to start recording', err);
            setIsRecordingState(false);
        }
    }

    async function stopRecording(shouldSend = true) {
        console.log('Stopping recording.., Send:', shouldSend);
        if (!recording) return;

        setIsRecordingState(false);
        setLockedRecording(false);
        setRecording(undefined); // Clear state immediately

        try {
            await recording.stopAndUnloadAsync();
            await Audio.setAudioModeAsync({
                allowsRecordingIOS: false,
            });
            const uri = recording.getURI();
            console.log('Recording stopped and stored at', uri);

            if (shouldSend && uri) {
                setLoading(true);
                try {
                    const text = await AIService.transcribeAudio(uri);
                    if (text) {
                        setMessage(text);
                        handleSend(text);
                    }
                } catch (error) {
                    console.error('Transcription failed:', error);
                    setHistory(prev => [...prev, { role: 'assistant', content: "Sorry, I couldn't hear that clearly." }]);
                    setLoading(false);
                }
            }
        } catch (error) {
            console.error('Error stopping recording', error);
        }
    }

    const cancelRecording = async () => {
        await stopRecording(false);
    };

    // Gesture Handling
    const panGesture = Gesture.Pan()
        .onBegin(() => {
            runOnJS(startRecording)();
            micScale.value = withSpring(1.2);
            lockOpacity.value = withSpring(1);
            lockTranslateY.value = 0;
        })
        .onUpdate((e) => {
            // Slide up logic
            lockTranslateY.value = e.translationY;
            if (e.translationY < -50) {
                runOnJS(setLockedRecording)(true);
                lockOpacity.value = withSpring(0); // Hide lock icon when locked
            }
        })
        .onEnd(() => {
            micScale.value = withSpring(1);
            lockOpacity.value = withSpring(0);
            lockTranslateY.value = withSpring(0);

            // If not locked, stop and send. If locked, do nothing (wait for manual stop)
            if (!lockedRecording) {
                // Must check current state ref or just rely on the fact that lockedRecording state update might be slightly delayed in JS thread logic
                // But since we set it in onUpdate via runOnJS, we need to be careful.
                // Simpler: pass the check to JS
                runOnJS(handleGestureEnd)();
            }
        });

    function handleGestureEnd() {
        setLockedRecording(current => {
            if (!current) {
                stopRecording(true);
            }
            return current;
        });
    }

    const micAnimatedStyle = useAnimatedStyle(() => ({
        transform: [{ scale: micScale.value }]
    }));

    const lockAnimatedStyle = useAnimatedStyle(() => ({
        opacity: lockOpacity.value,
        transform: [{ translateY: lockTranslateY.value }]
    }));

    const handleSend = async (textOverride = null) => {
        const msgContent = typeof textOverride === 'string' ? textOverride : message;
        if (!msgContent.trim() || loading) return;

        const client = chatClientRef.current;
        if (!client?.isConnected) {
            setHistory(prev => [...prev, {
                id: Date.now(),
                role: 'assistant',
                content: 'Butler is not connected. Please wait a moment and try again.',
                timestamp: Date.now(),
            }]);
            return;
        }

        const userMsg = { id: Date.now(), role: 'user', content: msgContent, timestamp: Date.now() };
        setHistory(prev => [...prev, userMsg]);
        setMessage('');
        setLoading(true);

        // Create an empty assistant bubble that will be filled by streaming chunks
        const assistantId = Date.now() + 1;
        streamingMsgIdRef.current = assistantId;
        setHistory(prev => [...prev, {
            id: assistantId,
            role: 'assistant',
            content: '',
            timestamp: Date.now(),
        }]);

        client.sendMessage(msgContent);
    };

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.container}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0} // Reduced from 100 since no TabBar
        >
            <View style={styles.header}>
                <TouchableOpacity
                    onPress={onExit}
                    style={styles.backBtn}
                    accessibilityLabel="Back to home"
                >
                    <ChevronLeft size={26} color="#fff" />
                </TouchableOpacity>
                <View style={{ alignItems: 'center' }}>
                    <Text style={styles.title}>Butler</Text>
                    {chatStatus === 'connecting' && (
                        <Text style={styles.statusText}>Connecting…</Text>
                    )}
                    {chatStatus === 'error' && (
                        <Text style={[styles.statusText, { color: '#ff6b6b' }]}>Disconnected</Text>
                    )}
                </View>
                {onStartVoiceCall ? (
                    <TouchableOpacity
                        onPress={onStartVoiceCall}
                        style={styles.backBtn}
                        activeOpacity={0.85}
                        accessibilityLabel="Butler voice"
                    >
                        <ButlerIcon active size={22} />
                    </TouchableOpacity>
                ) : (
                    <View style={{ width: 36 }} />
                )}
            </View>

            <ScrollView
                ref={scrollViewRef}
                contentContainerStyle={styles.chatContent}
                onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
            >
                {history.length === 0 && (
                    <View style={styles.emptyState}>
                        <Text style={styles.emptyText}>How can I help you with your home today?</Text>
                    </View>
                )}

                {history.map((msg, index) => {
                    const isUser = msg.role === 'user';
                    const timeStr = msg.timestamp
                        ? new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                        : new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                    return (
                        <View key={msg.id ?? index} style={[styles.msgContainer, isUser ? styles.userMsgContainer : styles.aiMsgContainer]}>
                            <View style={styles.bubbleWrapper}>
                                {isUser ? (
                                    <LinearGradient
                                        colors={['#245072', '#187FB2']}
                                        start={{ x: 0, y: 0 }}
                                        end={{ x: 1, y: 0 }}
                                        style={[styles.msgBubble, styles.userBubble]}
                                    >
                                        <Text style={styles.msgText}>{msg.content}</Text>
                                        <Text style={styles.timeBubble}>{timeStr}</Text>
                                    </LinearGradient>
                                ) : (
                                    <LinearGradient
                                        colors={msg.isError ? ['#5c1a1a', '#7a2020'] : ['#602FBE', '#7B2FBE']}
                                        start={{ x: 0, y: 0 }}
                                        end={{ x: 1, y: 0 }}
                                        style={[styles.msgBubble, styles.aiBubble]}
                                    >
                                        {msg.toolRunning && (
                                            <Text style={styles.toolLabel}>⚙ {msg.toolName}…</Text>
                                        )}
                                        {msg.content.length > 0
                                            ? <Text style={styles.msgText}>{msg.content}</Text>
                                            : <TypingDots />
                                        }
                                        {!msg.toolRunning && msg.content.length > 0 && (
                                            <Text style={styles.timeBubble}>{timeStr}</Text>
                                        )}
                                    </LinearGradient>
                                )}
                            </View>
                        </View>
                    );
                })}
            </ScrollView>

            <View style={[styles.inputContainer, { paddingBottom: isKeyboardVisible ? 16 : 40 }]}>
                <View style={styles.inputPill}>
                    <TextInput
                        style={styles.input}
                        placeholder="Ask anything..."
                        placeholderTextColor="rgba(255,255,255,0.35)"
                        value={message}
                        onChangeText={setMessage}
                        onSubmitEditing={handleSend}
                        multiline
                        maxLength={500}
                    />
                    {!isRecordingState && !lockedRecording && (
                        <TouchableOpacity
                            onPress={() => handleSend()}
                            disabled={!message.trim() || loading}
                            activeOpacity={0.8}
                        >
                            <LinearGradient
                                colors={['#602FBE', '#7B2FBE']}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 0, y: 1 }}
                                style={[styles.sendBtn, !message.trim() && styles.disabledBtn]}
                            >
                                <Image
                                    source={require('../../assets/ai_msg.png')}
                                    style={{ width: 20, height: 20 }}
                                    resizeMode="contain"
                                />
                            </LinearGradient>
                        </TouchableOpacity>
                    )}
                </View>
            </View>

        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        paddingTop: 60,
        backgroundColor: '#09091A',
    },
    header: {
        paddingHorizontal: 16,
        marginBottom: 10,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center'
    },
    backBtn: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: 'rgba(255,255,255,0.08)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    title: {
        ...Heading.lg,
        color: '#fff',
    },
    statusText: {
        fontSize: 11,
        color: 'rgba(255,255,255,0.4)',
        marginTop: 2,
    },
    toolLabel: {
        color: 'rgba(255,255,255,0.55)',
        fontSize: 12,
        marginBottom: 6,
        fontStyle: 'italic',
    },
    chatContent: {
        paddingHorizontal: 20,
        paddingBottom: 20,
        flexGrow: 1,
    },
    emptyState: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: 100,
        gap: 20
    },
    emptyText: {
        color: 'rgba(255,255,255,0.3)',
        fontSize: 16,
        textAlign: 'center'
    },
    msgContainer: {
        flexDirection: 'row',
        marginBottom: 20,
        gap: 10,
        alignItems: 'flex-end',
    },
    userMsgContainer: {
        justifyContent: 'flex-end',
    },
    aiMsgContainer: {
        justifyContent: 'flex-start',
    },
    avatar: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: 'rgba(255,255,255,0.1)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    avatarImg: {
        width: 32,
        height: 32,
        borderRadius: 16,
    },
    aiAvatar: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: '#602FBE',
        justifyContent: 'center',
        alignItems: 'center',
    },
    aiAvatarText: {
        color: '#fff',
        fontSize: 11,
        fontFamily: CF.bold,
        letterSpacing: 0.5,
    },
    bubbleWrapper: {
        maxWidth: '80%',
    },
    msgBubble: {
        padding: 12,
        borderRadius: 20,
    },
    userBubble: {
        borderBottomRightRadius: 4,
    },
    aiBubble: {
        borderBottomLeftRadius: 4,
    },
    typingBubble: {
        paddingVertical: 14,
        paddingHorizontal: 16,
    },
    msgText: {
        color: '#fff',
        fontSize: 16,
        lineHeight: 22,
    },
    timeBubble: {
        color: 'rgba(255,255,255,0.5)',
        fontSize: 11,
        marginTop: 6,
        textAlign: 'right',
    },
    timeText: {
        fontSize: 11,
        color: 'rgba(255,255,255,0.35)',
        marginTop: 4,
    },
    timeRight: {
        textAlign: 'right',
    },
    timeLeft: {
        textAlign: 'left',
    },
    dateSeparator: {
        alignItems: 'center',
        marginBottom: 16,
        marginTop: 4,
    },
    dateText: {
        fontSize: 12,
        color: 'rgba(255,255,255,0.3)',
    },
    loadingContainer: {
        padding: 10,
        alignItems: 'flex-start',
        paddingLeft: 42
    },
    inputContainer: {
        paddingHorizontal: 16,
        paddingTop: 12,
        backgroundColor: '#09091A',
        borderTopWidth: 1,
        borderTopColor: 'rgba(255,255,255,0.06)',
    },
    inputPill: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#21213F',
        borderRadius: 28,
        paddingHorizontal: 16,
        paddingVertical: 8,
        gap: 8,
    },
    input: {
        flex: 1,
        color: '#fff',
        fontSize: 15,
        maxHeight: 100,
        paddingVertical: 4,
    },
    sendBtn: {
        width: 44,
        height: 44,
        borderRadius: 22,
        justifyContent: 'center',
        alignItems: 'center',
        overflow: 'hidden',
    },
    micBtn: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: 'rgba(255,255,255,0.1)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    recordingBtn: {
        backgroundColor: '#ff4444', // Red when recording
        width: 60,
        height: 60,
        borderRadius: 30,
    },
    lockIndicator: {
        position: 'absolute',
        bottom: 80,
        right: 20,
        alignItems: 'center',
        gap: 4
    },
    lockText: {
        color: 'rgba(255,255,255,0.5)',
        fontSize: 12
    },
    cancelBtn: {
        marginRight: 10,
        padding: 10
    },
    cancelText: {
        color: '#ff4444',
        fontFamily: CF.bold,
    },
    audioToggle: {
        padding: 8
    },
    disabledBtn: {
        backgroundColor: 'rgba(255,255,255,0.1)',
        opacity: 0.5
    },
    exitBtn: {
        alignSelf: 'center',
        marginBottom: 30, // Safe Area bottom
        marginTop: 10,
        paddingVertical: 10,
        paddingHorizontal: 20
    },
    exitText: {
        color: 'rgba(255,255,255,0.5)',
        fontSize: 14,
        fontFamily: CF.medium,
    },
});

export default memo(BrainView);
