import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Modal,
    TouchableOpacity,
    Animated,
    Easing,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Headphones, PhoneOff, Volume2 } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { Heading, CF } from '../../utils/typography';
import { PrimeBotIcon } from './TabBarIcons';
import { ROOM_GROUP_ICON_GRADIENT_PROPS } from './RoomGroupIconButton';
import { getButlerBackendUrl, toButlerWsUrl } from '../../utils/butlerBackend';
import { ButlerVoiceSession } from '../../services/butler/ButlerVoiceSession';
import {
    formatAudioRouteLabel,
    getButlerAudioRouteInfo,
    subscribeButlerAudioRoute,
    suggestButlerRoute,
} from '../../services/butler/audioRoute';

const RING_COUNT = 2;
const RING_MS = 900;
const RING_GAP_MS = 350;

const PHASE_LABEL = {
    ringing: 'Ringing…',
    butler: 'Butler',
    live: 'Connected',
    error: 'Call failed',
};

function ButlerVoiceModal({ visible, onClose, onSwitchToChat, context }) {
    const [phase, setPhase] = useState('ringing');
    const [audioRoute, setAudioRoute] = useState('SPEAKER');
    const [routeHint, setRouteHint] = useState('');
    const [errorHint, setErrorHint] = useState('');

    const sessionRef = useRef(null);
    const audioRouteRef = useRef('SPEAKER');
    const contextRef = useRef(context);
    const butlerSpokeRef = useRef(false);
    contextRef.current = context;

    const ringScale = useRef(new Animated.Value(1)).current;
    const ringOpacity = useRef(new Animated.Value(0.35)).current;
    const livePulse = useRef(new Animated.Value(1)).current;

    const stopSession = useCallback(async () => {
        const session = sessionRef.current;
        sessionRef.current = null;
        if (session) await session.stop();
    }, []);

    const endSession = useCallback(async () => {
        await stopSession();
        onClose?.();
    }, [stopSession, onClose]);

    const switchToChat = useCallback(async () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        await stopSession();
        onSwitchToChat?.();
    }, [stopSession, onSwitchToChat]);

    const applyRoute = useCallback(async (route) => {
        audioRouteRef.current = route;
        setAudioRoute(route);
        Haptics.selectionAsync();
        try {
            await sessionRef.current?.setRoute(route);
            const info = await getButlerAudioRouteInfo();
            setRouteHint(formatAudioRouteLabel(info, route));
        } catch (e) {
            console.warn('[ButlerVoice] setRoute', e?.message ?? e);
        }
    }, []);

    const runRingPulse = useCallback(
        () =>
            new Promise((resolve) => {
                ringScale.setValue(1);
                ringOpacity.setValue(0.35);
                Animated.parallel([
                    Animated.sequence([
                        Animated.timing(ringScale, {
                            toValue: 1.14,
                            duration: RING_MS * 0.45,
                            easing: Easing.out(Easing.cubic),
                            useNativeDriver: true,
                        }),
                        Animated.timing(ringScale, {
                            toValue: 1,
                            duration: RING_MS * 0.55,
                            easing: Easing.inOut(Easing.quad),
                            useNativeDriver: true,
                        }),
                    ]),
                    Animated.sequence([
                        Animated.timing(ringOpacity, {
                            toValue: 1,
                            duration: RING_MS * 0.35,
                            useNativeDriver: true,
                        }),
                        Animated.timing(ringOpacity, {
                            toValue: 0.35,
                            duration: RING_MS * 0.65,
                            useNativeDriver: true,
                        }),
                    ]),
                ]).start(() => resolve());
            }),
        [ringScale, ringOpacity],
    );

    useEffect(() => {
        if (!visible) {
            void stopSession();
            setPhase('ringing');
            setAudioRoute('SPEAKER');
            setRouteHint('');
            setErrorHint('');
            butlerSpokeRef.current = false;
            return undefined;
        }

        let cancelled = false;
        let hadExternalAudio = false;
        butlerSpokeRef.current = false;
        setPhase('ringing');
        setAudioRoute('SPEAKER');
        audioRouteRef.current = 'SPEAKER';
        setRouteHint('');
        setErrorHint('');

        const liveAnim = Animated.loop(
            Animated.sequence([
                Animated.timing(livePulse, {
                    toValue: 1.06,
                    duration: 1200,
                    easing: Easing.inOut(Easing.sin),
                    useNativeDriver: true,
                }),
                Animated.timing(livePulse, {
                    toValue: 1,
                    duration: 1200,
                    easing: Easing.inOut(Easing.sin),
                    useNativeDriver: true,
                }),
            ]),
        );
        liveAnim.start();

        /** Visual/haptic only — must not touch AVAudioSession (breaks Butler voice). */
        const playRingVisuals = async () => {
            for (let i = 1; i <= RING_COUNT; i += 1) {
                if (cancelled) return;
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                await runRingPulse();
                if (i < RING_COUNT && !cancelled) {
                    await new Promise((r) => setTimeout(r, RING_GAP_MS));
                }
            }
        };

        const connectSession = async () => {
            try {
                const httpBase = await getButlerBackendUrl();
                if (cancelled) return;

                const session = new ButlerVoiceSession(toButlerWsUrl(httpBase));
                session.setInitialRoute(audioRouteRef.current);
                sessionRef.current = session;

                session.on('speaking', () => {
                    if (cancelled) return;
                    butlerSpokeRef.current = true;
                    setPhase('butler');
                });
                session.on('listening', () => {
                    if (cancelled) return;
                    if (butlerSpokeRef.current) setPhase('live');
                });
                session.on('error', ({ message }) => {
                    if (cancelled) return;
                    setPhase('error');
                    setErrorHint(message?.slice(0, 80) ?? '');
                });

                const result = await session.start(contextRef.current);
                if (cancelled) {
                    await session.stop();
                    return;
                }
                if (!result.ok) {
                    setPhase('error');
                    setErrorHint(result.error?.slice(0, 80) ?? 'Connection failed');
                }
            } catch (err) {
                if (!cancelled) {
                    setPhase('error');
                    setErrorHint(err?.message?.slice(0, 80) ?? 'Error');
                }
            }
        };

        const unsubRoute = subscribeButlerAudioRoute((info) => {
            if (cancelled) return;

            const externalNow = Boolean(info.hasExternalAudio);
            setRouteHint(formatAudioRouteLabel(info, audioRouteRef.current));

            if (externalNow && !hadExternalAudio) {
                hadExternalAudio = true;
                if (audioRouteRef.current === 'SPEAKER') {
                    Haptics.selectionAsync();
                    audioRouteRef.current = 'HEADSET';
                    setAudioRoute('HEADSET');
                    void sessionRef.current?.setRoute('HEADSET');
                } else {
                    void sessionRef.current?.setRoute('HEADSET');
                }
            } else if (!externalNow && hadExternalAudio) {
                hadExternalAudio = false;
                if (audioRouteRef.current === 'HEADSET') {
                    void sessionRef.current?.setRoute('HEADSET');
                }
            } else if (externalNow) {
                hadExternalAudio = true;
            }
        });

        const bootstrap = async () => {
            void playRingVisuals();
            void connectSession();

            const info = await getButlerAudioRouteInfo();
            if (cancelled) return;

            hadExternalAudio = Boolean(info.hasExternalAudio);
            const initial = suggestButlerRoute(info);
            const prevRoute = audioRouteRef.current;
            audioRouteRef.current = initial;
            setAudioRoute(initial);
            setRouteHint(formatAudioRouteLabel(info, initial));
            if (sessionRef.current && initial !== prevRoute) {
                void sessionRef.current.setRoute(initial);
            }
        };

        void bootstrap();

        return () => {
            cancelled = true;
            unsubRoute();
            liveAnim.stop();
            livePulse.setValue(1);
            ringScale.setValue(1);
            void stopSession();
        };
    }, [visible, stopSession, runRingPulse, livePulse]);

    const statusLabel = PHASE_LABEL[phase] ?? 'Butler';
    const showRingRipple = phase === 'ringing';
    const avatarPulse = phase === 'live' || phase === 'butler';
    const routeControlsEnabled = phase !== 'error';

    return (
        <Modal
            visible={visible}
            transparent={false}
            animationType="slide"
            statusBarTranslucent
            onRequestClose={endSession}
        >
            <LinearGradient
                colors={['#0d0d18', '#16162a', '#1a1030']}
                style={styles.screen}
            >
                <View style={styles.content}>
                    <Text style={styles.callerName}>Butler</Text>

                    <View style={styles.avatarWrap}>
                        {showRingRipple ? (
                            <Animated.View
                                style={[
                                    styles.ringRipple,
                                    { opacity: ringOpacity, transform: [{ scale: ringScale }] },
                                ]}
                            />
                        ) : null}
                        <Animated.View
                            style={avatarPulse ? { transform: [{ scale: livePulse }] } : undefined}
                        >
                            <LinearGradient
                                {...ROOM_GROUP_ICON_GRADIENT_PROPS}
                                style={styles.avatar}
                            >
                                <Text style={styles.avatarLetter}>B</Text>
                            </LinearGradient>
                        </Animated.View>
                    </View>

                    <Text style={styles.statusLine}>{statusLabel}</Text>
                    {routeHint ? (
                        <Text style={styles.routeHint} numberOfLines={1}>{routeHint}</Text>
                    ) : null}
                    {phase === 'error' && errorHint ? (
                        <Text style={styles.errorHint} numberOfLines={2}>{errorHint}</Text>
                    ) : null}
                </View>

                <View style={styles.controls}>
                    <View style={styles.routeRow}>
                        <TouchableOpacity
                            style={[
                                styles.routeBtn,
                                audioRoute === 'HEADSET' && styles.routeBtnActive,
                            ]}
                            onPress={() => applyRoute('HEADSET')}
                            activeOpacity={0.85}
                            disabled={!routeControlsEnabled}
                        >
                            <Headphones
                                size={22}
                                color={audioRoute === 'HEADSET' ? '#c9a8f0' : 'rgba(237,237,245,0.45)'}
                            />
                            <Text
                                style={[
                                    styles.routeLabel,
                                    audioRoute === 'HEADSET' && styles.routeLabelActive,
                                ]}
                            >
                                Headset
                            </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={[
                                styles.routeBtn,
                                audioRoute === 'SPEAKER' && styles.routeBtnActive,
                            ]}
                            onPress={() => applyRoute('SPEAKER')}
                            activeOpacity={0.85}
                            disabled={!routeControlsEnabled}
                        >
                            <Volume2
                                size={22}
                                color={audioRoute === 'SPEAKER' ? '#c9a8f0' : 'rgba(237,237,245,0.45)'}
                            />
                            <Text
                                style={[
                                    styles.routeLabel,
                                    audioRoute === 'SPEAKER' && styles.routeLabelActive,
                                ]}
                            >
                                Speaker
                            </Text>
                        </TouchableOpacity>
                    </View>

                    <View style={styles.callActionsRow}>
                        <TouchableOpacity
                            style={styles.chatBtn}
                            onPress={switchToChat}
                            activeOpacity={0.85}
                            accessibilityLabel="Switch to PrimeBot chat"
                        >
                            <PrimeBotIcon color="#c9a8f0" size={26} />
                            <Text style={styles.chatBtnLabel}>Chat</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={styles.endCallBtn}
                            onPress={endSession}
                            activeOpacity={0.9}
                            accessibilityLabel="End Butler call"
                        >
                            <PhoneOff size={28} color="#fff" strokeWidth={2.2} />
                        </TouchableOpacity>
                    </View>
                </View>
            </LinearGradient>
        </Modal>
    );
}

const styles = StyleSheet.create({
    screen: {
        flex: 1,
        justifyContent: 'space-between',
        paddingTop: 72,
        paddingBottom: 48,
    },
    content: {
        flex: 1,
        alignItems: 'center',
        paddingHorizontal: 32,
    },
    callerName: {
        ...Heading.lg24,
        color: '#ededf5',
        letterSpacing: -0.5,
        marginBottom: 40,
    },
    avatarWrap: {
        width: 160,
        height: 160,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 40,
    },
    ringRipple: {
        position: 'absolute',
        width: 160,
        height: 160,
        borderRadius: 80,
        borderWidth: 2,
        borderColor: 'rgba(123,47,190,0.55)',
    },
    avatar: {
        width: 120,
        height: 120,
        borderRadius: 60,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#7B2FBE',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.45,
        shadowRadius: 24,
        elevation: 12,
    },
    avatarLetter: {
        fontSize: 44,
        fontFamily: CF.semibold,
        color: '#fff',
        letterSpacing: -1,
    },
    statusLine: {
        fontSize: 17,
        fontFamily: CF.medium,
        color: 'rgba(237,237,245,0.72)',
        letterSpacing: -0.2,
    },
    routeHint: {
        marginTop: 6,
        fontSize: 13,
        fontFamily: CF.regular,
        color: 'rgba(201,168,240,0.85)',
        letterSpacing: -0.1,
    },
    errorHint: {
        marginTop: 8,
        fontSize: 12,
        fontFamily: CF.regular,
        color: 'rgba(255,120,120,0.85)',
        textAlign: 'center',
        maxWidth: 280,
    },
    controls: {
        alignItems: 'center',
        paddingHorizontal: 32,
        gap: 28,
    },
    routeRow: {
        flexDirection: 'row',
        gap: 16,
    },
    routeBtn: {
        width: 100,
        paddingVertical: 14,
        borderRadius: 16,
        alignItems: 'center',
        gap: 6,
        backgroundColor: 'rgba(255,255,255,0.06)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    routeBtnActive: {
        backgroundColor: 'rgba(123,47,190,0.22)',
        borderColor: 'rgba(123,47,190,0.45)',
    },
    routeLabel: {
        fontSize: 11,
        fontFamily: CF.medium,
        color: 'rgba(237,237,245,0.45)',
    },
    routeLabelActive: {
        color: '#c9a8f0',
    },
    callActionsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 28,
    },
    chatBtn: {
        width: 72,
        height: 72,
        borderRadius: 36,
        backgroundColor: 'rgba(123,47,190,0.22)',
        borderWidth: 1.5,
        borderColor: 'rgba(123,47,190,0.45)',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
    },
    chatBtnLabel: {
        fontSize: 10,
        fontFamily: CF.medium,
        color: '#c9a8f0',
        letterSpacing: 0.2,
    },
    endCallBtn: {
        width: 72,
        height: 72,
        borderRadius: 36,
        backgroundColor: '#e53935',
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#e53935',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.5,
        shadowRadius: 14,
        elevation: 8,
    },
});

export default memo(ButlerVoiceModal);
