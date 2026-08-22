import { useState, useRef, useEffect, useCallback, memo } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TextInput,
    TouchableOpacity,
    FlatList,
    Platform,
    Keyboard,
    Image,
    Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Heading, CF } from '../../utils/typography';
import { Mic, ChevronLeft, CheckCheck } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withRepeat,
    withSequence,
    withSpring,
    withTiming,
    runOnJS,
    interpolate,
    Extrapolation,
} from 'react-native-reanimated';
import { ButlerChatClient } from '../../services/butler/ButlerChatClient';
import { getButlerBackendUrl, toButlerWsUrl } from '../../utils/butlerBackend';

/** Hide Gemini thinking / tool-planning dumps from the chat bubble. */
function looksLikeAnalysis(text) {
    const t = String(text || '').trim();
    if (!t) return false;
    if (/^(thinking|analysis|plan|tool)\s*:/i.test(t)) return true;
    if (/^\s*\{[\s\S]*"?(name|args|function)"?\s*:/.test(t)) return true;
    if (/function_call|tool_call/i.test(t) && t.length < 240) return true;
    return false;
}

function TypingDots() {
    const dot1 = useSharedValue(0.3);
    const dot2 = useSharedValue(0.3);
    const dot3 = useSharedValue(0.3);

    useEffect(() => {
        const pulse = (v) => {
            v.value = withRepeat(
                withSequence(
                    withTiming(1, { duration: 300 }),
                    withTiming(0.3, { duration: 300 }),
                ),
                -1,
            );
        };
        pulse(dot1);
        const t2 = setTimeout(() => pulse(dot2), 150);
        const t3 = setTimeout(() => pulse(dot3), 300);
        return () => {
            clearTimeout(t2);
            clearTimeout(t3);
        };
    }, [dot1, dot2, dot3]);

    const s1 = useAnimatedStyle(() => ({ opacity: dot1.value }));
    const s2 = useAnimatedStyle(() => ({ opacity: dot2.value }));
    const s3 = useAnimatedStyle(() => ({ opacity: dot3.value }));

    return (
        <View style={styles.typingRow}>
            <Animated.View style={[styles.typingDot, s1]} />
            <Animated.View style={[styles.typingDot, s2]} />
            <Animated.View style={[styles.typingDot, s3]} />
        </View>
    );
}

function formatTime(ts) {
    return new Date(ts || Date.now()).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
    });
}

function MessageBubble({ msg }) {
    const isUser = msg.role === 'user';
    const timeStr = formatTime(msg.timestamp);
    const isStreaming = !isUser && !msg.content && !msg.isError;

    return (
        <View style={[styles.msgContainer, isUser ? styles.userMsgContainer : styles.aiMsgContainer]}>
            <View style={styles.bubbleWrapper}>
                <LinearGradient
                    colors={
                        isUser
                            ? ['#245072', '#187FB2']
                            : msg.isError
                                ? ['#5c1a1a', '#7a2020']
                                : ['#602FBE', '#7B2FBE']
                    }
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={[styles.msgBubble, isUser ? styles.userBubble : styles.aiBubble]}
                >
                    {msg.toolRunning ? (
                        <Text style={styles.toolLabel}>
                            {msg.toolName ? `Working: ${msg.toolName}…` : 'Working…'}
                        </Text>
                    ) : null}

                    {isStreaming ? (
                        <TypingDots />
                    ) : (
                        <Text style={styles.msgText}>{msg.content}</Text>
                    )}

                    {!isStreaming ? (
                        <View style={styles.metaRow}>
                            <Text style={styles.timeBubble}>{timeStr}</Text>
                            {isUser ? (
                                <CheckCheck size={12} color="rgba(255,255,255,0.75)" />
                            ) : null}
                        </View>
                    ) : null}
                </LinearGradient>
            </View>
        </View>
    );
}

function BrainView({
    onExit,
    onStartVoiceCall,
}) {
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(false);
    const [keyboardHeight, setKeyboardHeight] = useState(0);
    const [chatStatus, setChatStatus] = useState('connecting');
    // Android IME breaks controlled TextInput — track draft in a ref + hasText only.
    const [hasText, setHasText] = useState(false);

    const insets = useSafeAreaInsets();
    const listRef = useRef(null);
    const inputRef = useRef(null);
    const draftRef = useRef('');
    const chatClientRef = useRef(null);
    const streamingMsgIdRef = useRef(null);
    const sendingRef = useRef(false);
    const keyboardHeightRef = useRef(0);
    const pendingScrollRef = useRef(false);

    const syncDraft = useCallback((text) => {
        const next = typeof text === 'string' ? text : '';
        draftRef.current = next;
        setHasText(next.length > 0);
    }, []);

    const keepComposerFocused = useCallback(() => {
        inputRef.current?.focus?.();
    }, []);

    const clearDraft = useCallback(() => {
        draftRef.current = '';
        setHasText(false);
        // Clear in-place — remounting TextInput (via key) dismisses/reopens the keyboard.
        const input = inputRef.current;
        if (input) {
            input.clear?.();
            input.setNativeProps?.({ text: '' });
        }
        keepComposerFocused();
    }, [keepComposerFocused]);

    const scrollToLatest = useCallback((animated = true) => {
        // Inverted FlatList: offset 0 is the newest message.
        requestAnimationFrame(() => {
            listRef.current?.scrollToOffset({ offset: 0, animated });
        });
    }, []);

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
                if (cancelled) {
                    client.close();
                    return;
                }

                chatClientRef.current = client;
                setChatStatus('ready');

                client.on('text', ({ text }) => {
                    const currentId = streamingMsgIdRef.current;
                    if (!currentId) return;
                    if (looksLikeAnalysis(text)) return;
                    setHistory((prev) =>
                        prev.map((m) =>
                            m.id === currentId && m.role === 'assistant'
                                ? { ...m, content: m.content + text }
                                : m,
                        ),
                    );
                });

                client.on('turn_end', () => {
                    setLoading(false);
                    sendingRef.current = false;
                    streamingMsgIdRef.current = null;
                    setHistory((prev) =>
                        prev.map((m) =>
                            m.role === 'user' && m.status === 'sending'
                                ? { ...m, status: 'sent' }
                                : m,
                        ),
                    );
                });

                client.on('tool_call_started', ({ name }) => {
                    const currentId = streamingMsgIdRef.current;
                    if (!currentId) return;
                    setHistory((prev) =>
                        prev.map((m) =>
                            m.id === currentId && m.role === 'assistant'
                                ? { ...m, toolName: name, toolRunning: true }
                                : m,
                        ),
                    );
                });

                client.on('tool_call_result', () => {
                    const currentId = streamingMsgIdRef.current;
                    if (!currentId) return;
                    setHistory((prev) =>
                        prev.map((m) =>
                            m.id === currentId && m.role === 'assistant'
                                ? { ...m, toolRunning: false }
                                : m,
                        ),
                    );
                });

                client.on('error', ({ message: errMsg }) => {
                    const bubbleId = streamingMsgIdRef.current;
                    setLoading(false);
                    sendingRef.current = false;
                    streamingMsgIdRef.current = null;
                    setHistory((prev) =>
                        prev.map((m) => {
                            if (m.role === 'user' && m.status === 'sending') {
                                return { ...m, status: 'sent' };
                            }
                            if (bubbleId && m.id === bubbleId) {
                                return {
                                    ...m,
                                    content: `Error: ${errMsg}`,
                                    isError: true,
                                };
                            }
                            return m;
                        }),
                    );
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
    }, []);

    // Lift composer by the real keyboard overlap (edge-to-edge Android is unreliable on height alone).
    useEffect(() => {
        const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
        const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

        const measureLift = (e) => {
            const coords = e?.endCoordinates;
            if (!coords) return 0;
            const screenH = Dimensions.get('screen').height;
            const fromScreen = Math.max(0, Math.ceil(screenH - (coords.screenY ?? screenH)));
            const reported = Math.ceil(coords.height ?? 0);
            // Prefer reported IME height; screenY math can under-report on Samsung/edge-to-edge.
            return Math.max(reported, fromScreen);
        };

        const applyHeight = (next) => {
            const h = Math.max(0, next);
            if (Math.abs(h - keyboardHeightRef.current) < 6) return;
            keyboardHeightRef.current = h;
            setKeyboardHeight(h);
            if (h > 0) {
                pendingScrollRef.current = true;
                scrollToLatest(false);
            }
        };

        const onShow = (e) => applyHeight(measureLift(e));
        const onHide = () => applyHeight(0);
        const onChange = (e) => {
            const h = measureLift(e);
            if (h > 60) applyHeight(h);
            else if (h <= 0) applyHeight(0);
        };

        const showSub = Keyboard.addListener(showEvent, onShow);
        const hideSub = Keyboard.addListener(hideEvent, onHide);
        const changeSub =
            Platform.OS === 'android'
                ? Keyboard.addListener('keyboardDidChangeFrame', onChange)
                : null;

        return () => {
            showSub.remove();
            hideSub.remove();
            changeSub?.remove();
        };
    }, [scrollToLatest]);

    const handleSend = useCallback(() => {
        const msgContent = draftRef.current.trim();
        if (!msgContent || sendingRef.current || loading) return;

        const client = chatClientRef.current;
        if (!client?.isConnected) {
            setHistory((prev) => [
                {
                    id: `err-${Date.now()}`,
                    role: 'assistant',
                    content: 'Butler is not connected. Please wait a moment and try again.',
                    timestamp: Date.now(),
                    isError: true,
                },
                ...prev,
            ]);
            return;
        }

        sendingRef.current = true;
        const now = Date.now();
        const userId = `u-${now}`;
        const assistantId = `a-${now}`;
        streamingMsgIdRef.current = assistantId;

        // Clear composer immediately (local) — do not wait on Butler.
        clearDraft();

        setHistory((prev) => [
            {
                id: assistantId,
                role: 'assistant',
                content: '',
                timestamp: now,
            },
            {
                id: userId,
                role: 'user',
                content: msgContent,
                timestamp: now,
                status: 'sent',
            },
            ...prev,
        ]);
        setLoading(true);

        try {
            client.sendMessage(msgContent);
        } catch (e) {
            sendingRef.current = false;
            setLoading(false);
            streamingMsgIdRef.current = null;
            setHistory((prev) =>
                prev.map((m) => {
                    if (m.id === assistantId) {
                        return {
                            ...m,
                            content: 'Could not send. Please try again.',
                            isError: true,
                        };
                    }
                    return m;
                }),
            );
            return;
        }

        scrollToLatest(true);
    }, [loading, scrollToLatest, clearDraft]);

    const composerBottomGap = keyboardHeight > 0 ? 10 : Math.max(insets.bottom, 12) + 10;

    const renderItem = useCallback(({ item }) => <MessageBubble msg={item} />, []);
    const keyExtractor = useCallback((item) => String(item.id), []);

    const onActionPress = useCallback(() => {
        if (draftRef.current.trim().length > 0) {
            handleSend();
            return;
        }
        onStartVoiceCall?.();
    }, [handleSend, onStartVoiceCall]);

    const screenW = Dimensions.get('window').width;
    const swipeEdge = 40 + (insets.left || 0);
    const translateX = useSharedValue(0);

    const finishSwipeBack = useCallback(() => {
        onExit?.();
    }, [onExit]);

    const dismissKeyboard = useCallback(() => {
        Keyboard.dismiss();
    }, []);

    const swipeBackGesture = Gesture.Pan()
        .maxPointers(1)
        .activeOffsetX(12)
        .failOffsetY([-28, 28])
        .onTouchesDown((e, state) => {
            const x = e?.allTouches?.[0]?.x ?? 999;
            if (x > swipeEdge) state.fail();
        })
        .onStart(() => {
            runOnJS(dismissKeyboard)();
        })
        .onUpdate((e) => {
            translateX.value = Math.max(0, e.translationX);
        })
        .onEnd((e) => {
            const shouldPop = e.translationX > screenW * 0.28 || e.velocityX > 800;
            if (shouldPop) {
                translateX.value = withTiming(screenW, { duration: 180 }, (finished) => {
                    if (finished) runOnJS(finishSwipeBack)();
                });
            } else {
                translateX.value = withSpring(0, { damping: 22, stiffness: 220 });
            }
        });

    const swipeStyle = useAnimatedStyle(() => ({
        transform: [{ translateX: translateX.value }],
        shadowColor: '#000',
        shadowOffset: { width: -8, height: 0 },
        shadowOpacity: interpolate(translateX.value, [0, 24], [0, 0.28], Extrapolation.CLAMP),
        shadowRadius: 12,
        elevation: interpolate(translateX.value, [0, 24], [0, 12], Extrapolation.CLAMP),
    }));

    return (
        <View style={styles.swipeRoot}>
            <GestureDetector gesture={swipeBackGesture}>
                <Animated.View style={[styles.container, { paddingTop: insets.top + 8 }, swipeStyle]}>
            <View style={styles.header}>
                <TouchableOpacity
                    onPress={onExit}
                    style={styles.backBtn}
                    accessibilityLabel="Back to home"
                >
                    <ChevronLeft size={26} color="#fff" />
                </TouchableOpacity>
                <View style={styles.headerCenter}>
                    <Text style={styles.title}>Butler</Text>
                    {chatStatus === 'connecting' && (
                        <Text style={styles.statusText}>Connecting…</Text>
                    )}
                    {chatStatus === 'ready' && (
                        <Text style={[styles.statusText, styles.statusReady]}>Online</Text>
                    )}
                    {chatStatus === 'error' && (
                        <Text style={[styles.statusText, styles.statusError]}>Disconnected</Text>
                    )}
                </View>
                <View style={styles.headerSpacer} />
            </View>

            <View style={[styles.chatPane, { marginBottom: 68 + keyboardHeight }]}>
                {history.length === 0 ? (
                    <View style={styles.emptyOverlay} pointerEvents="none">
                        <Text style={styles.emptyText}>
                            How can I help you with your home today?
                        </Text>
                    </View>
                ) : null}

                <FlatList
                    ref={listRef}
                    style={styles.chatScroll}
                    data={history}
                    keyExtractor={keyExtractor}
                    renderItem={renderItem}
                    inverted
                    keyboardShouldPersistTaps="always"
                    keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
                    contentContainerStyle={[
                        styles.chatContent,
                        { paddingTop: 12 + (keyboardHeight > 0 ? 8 : composerBottomGap) },
                    ]}
                    maintainVisibleContentPosition={{
                        minIndexForVisible: 0,
                        autoscrollToTopThreshold: 40,
                    }}
                    onContentSizeChange={() => {
                        if (pendingScrollRef.current) {
                            pendingScrollRef.current = false;
                            scrollToLatest(false);
                        }
                    }}
                />
            </View>

            <View
                style={[
                    styles.inputContainer,
                    {
                        bottom: keyboardHeight,
                        paddingBottom: composerBottomGap,
                    },
                ]}
            >
                <View style={styles.inputRow}>
                    <View style={styles.inputPill}>
                        <TextInput
                            ref={inputRef}
                            style={styles.input}
                            placeholder="Ask anything..."
                            placeholderTextColor="rgba(255,255,255,0.35)"
                            // Uncontrolled: Android Samsung/Gboard IME desyncs controlled `value`.
                            defaultValue=""
                            onChangeText={syncDraft}
                            onChange={(e) => {
                                // Extra path for Android composition / autocorrect frames.
                                syncDraft(e?.nativeEvent?.text ?? '');
                            }}
                            onSubmitEditing={() => {
                                if (draftRef.current.trim()) handleSend();
                            }}
                            returnKeyType="send"
                            enablesReturnKeyAutomatically
                            submitBehavior="submit"
                            blurOnSubmit={false}
                            multiline
                            textAlignVertical="center"
                            maxLength={500}
                            editable={chatStatus !== 'connecting'}
                            underlineColorAndroid="transparent"
                            autoCorrect
                            autoCapitalize="sentences"
                        />
                    </View>

                    <TouchableOpacity
                        onPressIn={() => {
                            // Send sits outside FlatList — keep focus so the IME doesn't bounce.
                            if (draftRef.current.trim().length > 0) keepComposerFocused();
                        }}
                        onPress={onActionPress}
                        disabled={hasText ? false : !onStartVoiceCall}
                        activeOpacity={0.85}
                        accessibilityLabel={hasText ? 'Send message' : 'Call Butler'}
                    >
                        <LinearGradient
                            colors={['#602FBE', '#7B2FBE']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 0, y: 1 }}
                            style={[
                                styles.actionBtn,
                                !hasText && !onStartVoiceCall && styles.disabledBtn,
                            ]}
                        >
                            {hasText ? (
                                <Image
                                    source={require('../../assets/ai_msg.png')}
                                    style={styles.actionIcon}
                                    resizeMode="contain"
                                />
                            ) : (
                                <Mic size={22} color="#fff" />
                            )}
                        </LinearGradient>
                    </TouchableOpacity>
                </View>
            </View>
                </Animated.View>
            </GestureDetector>
        </View>
    );
}

const styles = StyleSheet.create({
    swipeRoot: {
        flex: 1,
    },
    container: {
        flex: 1,
        backgroundColor: '#09091A',
    },
    header: {
        paddingHorizontal: 16,
        marginBottom: 8,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    headerCenter: {
        alignItems: 'center',
    },
    headerSpacer: {
        width: 36,
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
    statusReady: {
        color: 'rgba(120, 220, 160, 0.85)',
    },
    statusError: {
        color: '#ff6b6b',
    },
    toolLabel: {
        color: 'rgba(255,255,255,0.55)',
        fontSize: 12,
        marginBottom: 6,
        fontStyle: 'italic',
    },
    chatScroll: {
        flex: 1,
    },
    chatPane: {
        flex: 1,
        position: 'relative',
    },
    chatContent: {
        paddingHorizontal: 16,
        paddingBottom: 8,
        flexGrow: 1,
    },
    emptyOverlay: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 28,
        zIndex: 1,
    },
    emptyText: {
        color: 'rgba(255,255,255,0.35)',
        fontSize: 16,
        textAlign: 'center',
        lineHeight: 24,
        fontFamily: CF.medium,
    },
    msgContainer: {
        flexDirection: 'row',
        marginBottom: 12,
        alignItems: 'flex-end',
    },
    userMsgContainer: {
        justifyContent: 'flex-end',
    },
    aiMsgContainer: {
        justifyContent: 'flex-start',
    },
    bubbleWrapper: {
        maxWidth: '82%',
    },
    msgBubble: {
        paddingHorizontal: 14,
        paddingTop: 10,
        paddingBottom: 8,
        borderRadius: 18,
    },
    userBubble: {
        borderBottomRightRadius: 6,
    },
    aiBubble: {
        borderBottomLeftRadius: 6,
    },
    msgText: {
        color: '#fff',
        fontSize: 15,
        lineHeight: 21,
        fontFamily: CF.regular,
    },
    metaRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'flex-end',
        gap: 4,
        marginTop: 4,
    },
    timeBubble: {
        color: 'rgba(255,255,255,0.55)',
        fontSize: 10,
        fontFamily: CF.regular,
    },
    typingRow: {
        flexDirection: 'row',
        gap: 5,
        alignItems: 'center',
        paddingVertical: 4,
        minWidth: 36,
    },
    typingDot: {
        width: 7,
        height: 7,
        borderRadius: 4,
        backgroundColor: '#fff',
    },
    inputContainer: {
        position: 'absolute',
        left: 0,
        right: 0,
        paddingHorizontal: 14,
        paddingTop: 10,
        backgroundColor: '#09091A',
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: 'rgba(255,255,255,0.08)',
        zIndex: 5,
    },
    inputRow: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        gap: 10,
    },
    inputPill: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#21213F',
        borderRadius: 26,
        paddingHorizontal: 16,
        paddingVertical: 6,
        minHeight: 50,
    },
    input: {
        flex: 1,
        color: '#fff',
        fontSize: 15,
        maxHeight: 110,
        minHeight: 38,
        paddingTop: Platform.OS === 'ios' ? 8 : 7,
        paddingBottom: Platform.OS === 'ios' ? 8 : 7,
        paddingVertical: 0,
        fontFamily: CF.regular,
    },
    actionBtn: {
        width: 48,
        height: 48,
        borderRadius: 24,
        justifyContent: 'center',
        alignItems: 'center',
        overflow: 'hidden',
        marginBottom: 1,
    },
    micActionBtn: {
        backgroundColor: '#602FBE',
    },
    actionIcon: {
        width: 22,
        height: 22,
    },
    disabledBtn: {
        opacity: 0.45,
    },
});

export default memo(BrainView);
