import { useState, useRef, useEffect, memo } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform, Keyboard } from 'react-native';
import { Colors } from '../../constants/Colors';
import { Send, Bot, User as UserIcon, Mic, Volume2, VolumeX } from 'lucide-react-native';
import { AIService } from '../../services/ai';
import { Audio } from 'expo-av';
import * as Speech from 'expo-speech';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, runOnJS } from 'react-native-reanimated';
import { Lock, X } from 'lucide-react-native';

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

function BrainView({ entities = [], callService, registryDevices = [], registryEntities = [], registryAreas = [], onExit, haUrl, haToken }) {
    const [message, setMessage] = useState('');
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(false);
    const [audioMode, setAudioMode] = useState(false);
    const [recording, setRecording] = useState(null);
    const [lockedRecording, setLockedRecording] = useState(false);
    const [permissionResponse, requestPermission] = Audio.usePermissions();
    const [isRecordingState, setIsRecordingState] = useState(false); // Track locally for gesture
    const [isKeyboardVisible, setKeyboardVisible] = useState(false);
    const scrollViewRef = useRef();

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

    const toggleAudioMode = () => {
        const newMode = !audioMode;
        setAudioMode(newMode);
        if (!newMode) {
            Speech.stop();
        }
    };

    const handleSend = async (textOverride = null) => {
        const msgContent = typeof textOverride === 'string' ? textOverride : message;
        if (!msgContent.trim() || loading) return;

        const userMsg = { role: 'user', content: msgContent };
        setHistory(prev => [...prev, userMsg]);
        setMessage('');
        setLoading(true);

        // Filter entities to only those assigned to an area
        // and enrich with area name
        const filteredContext = entities.reduce((acc, e) => {
            const regEntity = registryEntities.find(re => re.entity_id === e.entity_id);
            let areaId = regEntity?.area_id;

            // If no direct area, check device
            if (!areaId && regEntity?.device_id) {
                const device = registryDevices.find(d => d.id === regEntity.device_id);
                areaId = device?.area_id;
            }

            // Always include explicitly requested domains (like camera) even if not in an area
            const isAlwaysIncluded = e.entity_id.startsWith('camera.');

            // Only include if assigned to an area OR is always included
            if (areaId || isAlwaysIncluded) {
                const area = areaId ? registryAreas.find(a => a.area_id === areaId) : null;
                const areaName = area?.name || (isAlwaysIncluded ? 'General' : 'Unknown Room');

                const { entity_id, state, attributes } = e;
                // Filter out large/display-only attributes
                const cleanAttributes = {};
                if (attributes) {
                    Object.keys(attributes).forEach(key => {
                        if (!['entity_picture', 'icon', 'supported_features', 'friendly_name'].includes(key)) {
                            cleanAttributes[key] = attributes[key];
                        }
                    });
                }

                acc.push({
                    entity_id,
                    state,
                    name: attributes?.friendly_name || entity_id,
                    area: areaName,
                    attributes: cleanAttributes
                });
            }

            return acc;
        }, []);

        const context = filteredContext;

        // Check for camera mention and fetch snapshot if needed
        let imageBase64 = null;

        // Prepare list of cameras for intent detection
        const availableCameras = entities.filter(e => e.entity_id.startsWith('camera.'));

        console.log('[BrainView] Checking camera intent...');
        const intent = await AIService.determineCameraIntent(msgContent, availableCameras);
        console.log('[BrainView] Intent Result:', intent);

        if (intent && intent.needs_camera && intent.entity_id) {
            console.log('[BrainView] User mentioned camera:', intent.entity_id);
            setHistory(prev => [...prev, { role: 'assistant', content: `Checking camera...` }]);
            imageBase64 = await fetchCameraSnapshot(intent.entity_id, haUrl, haToken);
            console.log('[BrainView] Snapshot fetched, length:', imageBase64 ? imageBase64.length : 'null');
        } else {
            console.log('[BrainView] No camera intent detected.');
        }

        try {
            console.log('[BrainView] Sending message to AI. hasImage:', !!imageBase64);
            const responseText = await AIService.sendMessage(userMsg.content, history, context, null, imageBase64);

            // Check for embedded command
            let aiMsgContent = responseText;
            const commandRegex = /\[\[COMMAND:\s*(\{.*?\})\s*\]\]/s;
            const match = responseText.match(commandRegex);

            if (match && match[1]) {
                try {
                    const command = JSON.parse(match[1]);
                    // Remove command from display text
                    aiMsgContent = responseText.replace(match[0], '').trim();

                    if (command.action === 'call_service' && command.domain && command.service) {
                        console.log('AI Command Executing:', command);
                        if (callService) {
                            try {
                                await callService(command.domain, command.service, command.service_data || {});
                                // Optionally append success confirmation if not already in text
                                // aiMsgContent += "\n(Done)"; 
                            } catch (err) {
                                console.error('Execution Error:', err);
                                aiMsgContent += "\n[Error executing command]";
                            }
                        } else {
                            aiMsgContent += "\n[Permission denied]";
                        }
                    }
                } catch (e) {
                    console.error('Failed to parse command JSON:', e);
                }
            }

            const aiMsg = { role: 'assistant', content: aiMsgContent };
            setHistory(prev => [...prev, aiMsg]);

            if (audioMode) {
                Speech.speak(aiMsgContent, {
                    language: 'en',
                    pitch: 1.0,
                    rate: 1.0
                });
            }
        } catch (error) {
            const errorMsg = { role: 'assistant', content: `Error: ${error.message}. Please check your API keys in Settings.` };
            setHistory(prev => [...prev, errorMsg]);
        } finally {
            setLoading(false);
        }
    };

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.container}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0} // Reduced from 100 since no TabBar
        >
            <View style={styles.header}>
                <Text style={styles.title}>Brain</Text>
                <TouchableOpacity onPress={toggleAudioMode} style={styles.audioToggle}>
                    {audioMode ? <Volume2 size={24} color={Colors.primary} /> : <VolumeX size={24} color="rgba(255,255,255,0.3)" />}
                </TouchableOpacity>
            </View>

            <ScrollView
                ref={scrollViewRef}
                contentContainerStyle={styles.chatContent}
                onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
            >
                {/* ... existing history map ... */}
                {history.length === 0 && (
                    <View style={styles.emptyState}>
                        <Bot size={64} color="rgba(255,255,255,0.1)" />
                        <Text style={styles.emptyText}>How can I help you with your home today?</Text>
                    </View>
                )}

                {history.map((msg, index) => {
                    const isUser = msg.role === 'user';
                    return (
                        <View key={index} style={[styles.msgContainer, isUser ? styles.userMsgContainer : styles.aiMsgContainer]}>
                            {!isUser && (
                                <View style={styles.avatar}>
                                    <Bot size={20} color="#fff" />
                                </View>
                            )}
                            <View style={[styles.msgBubble, isUser ? styles.userBubble : styles.aiBubble]}>
                                <Text style={styles.msgText}>{msg.content}</Text>
                            </View>
                            {isUser && (
                                <View style={styles.avatar}>
                                    <UserIcon size={20} color="#fff" />
                                </View>
                            )}
                        </View>
                    );
                })}

                {loading && (
                    <View style={styles.loadingContainer}>
                        <ActivityIndicator color={Colors.primary} />
                    </View>
                )}
            </ScrollView>

            <View style={[styles.inputContainer, { paddingBottom: isKeyboardVisible ? 0 : 40 }]}>
                <TextInput
                    style={styles.input}
                    placeholder="Ask anything..."
                    placeholderTextColor="rgba(255,255,255,0.3)"
                    value={message}
                    onChangeText={setMessage}
                    onSubmitEditing={handleSend}
                    multiline
                    maxLength={500}
                />

                {/* Visual Lock Indicator Slide */}
                {isRecordingState && !lockedRecording && (
                    <Animated.View style={[styles.lockIndicator, lockAnimatedStyle]}>
                        <Lock size={16} color="rgba(255,255,255,0.5)" />
                        <Text style={styles.lockText}>Slide to lock</Text>
                    </Animated.View>
                )}

                {/* Cancel Button when Locked */}
                {lockedRecording && (
                    <TouchableOpacity onPress={cancelRecording} style={styles.cancelBtn}>
                        <Text style={styles.cancelText}>Cancel</Text>
                    </TouchableOpacity>
                )}

                <GestureDetector gesture={panGesture}>
                    <Animated.View style={[styles.micBtn, (isRecordingState || lockedRecording) && styles.recordingBtn, micAnimatedStyle]}>
                        {lockedRecording ? (
                            <TouchableOpacity onPress={() => stopRecording(true)}>
                                <Send size={24} color="#fff" />
                            </TouchableOpacity>
                        ) : (
                            <Mic size={24} color="#fff" />
                        )}
                    </Animated.View>
                </GestureDetector>
                {!isRecordingState && !lockedRecording && (
                    <TouchableOpacity
                        style={[styles.sendBtn, !message.trim() && styles.disabledBtn]}
                        onPress={() => handleSend()}
                        disabled={!message.trim() || loading}
                    >
                        <Send size={20} color="#fff" />
                    </TouchableOpacity>
                )}
            </View>

            {!isKeyboardVisible && (
                <TouchableOpacity onPress={onExit} style={styles.exitBtn}>
                    <Text style={styles.exitText}>Exit to Home</Text>
                </TouchableOpacity>
            )}
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        paddingTop: 60,
    },
    header: {
        paddingHorizontal: 20,
        marginBottom: 10,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center'
    },
    title: {
        fontSize: 32,
        fontWeight: 'bold',
        color: '#fff',
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
    msgBubble: {
        padding: 12,
        borderRadius: 20,
        maxWidth: '80%',
    },
    userBubble: {
        backgroundColor: Colors.primary,
        borderBottomRightRadius: 4,
    },
    aiBubble: {
        backgroundColor: 'rgba(255,255,255,0.1)',
        borderBottomLeftRadius: 4,
    },
    msgText: {
        color: '#fff',
        fontSize: 16,
        lineHeight: 22,
    },
    inputContainer: {
        flexDirection: 'row',
        padding: 16,
        backgroundColor: 'rgba(20, 20, 30, 0.9)',
        borderTopWidth: 1,
        borderTopColor: 'rgba(255,255,255,0.1)',
        alignItems: 'flex-end',
        gap: 10,
        // paddingBottom: 100 // Moved to inline style via isKeyboardVisible
    },
    input: {
        flex: 1,
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 20,
        paddingHorizontal: 16,
        paddingTop: 12,
        paddingBottom: 12,
        color: '#fff',
        maxHeight: 100,
        fontSize: 16,
    },
    sendBtn: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: Colors.primary,
        justifyContent: 'center',
        alignItems: 'center',
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
        fontWeight: 'bold'
    },
    audioToggle: {
        padding: 8
    },
    disabledBtn: {
        backgroundColor: 'rgba(255,255,255,0.1)',
        opacity: 0.5
    },
    loadingContainer: {
        padding: 10,
        alignItems: 'flex-start',
        paddingLeft: 42
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
        fontWeight: '500'
    }
});

export default memo(BrainView);
