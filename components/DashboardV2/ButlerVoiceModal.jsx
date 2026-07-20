import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Modal,
    TouchableOpacity,
    Animated,
    Easing,
    ScrollView,
    AppState,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { Headphones, PhoneOff, Volume2 } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { Heading, CF } from '../../utils/typography';
import { ButlerChatIcon } from './TabBarIcons';
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
const KEEP_AWAKE_TAG = 'butler-voice-call';

const PHASE_LABEL = {
    ringing: 'Ringing…',
    butler: 'Butler speaking',
    live: 'Listening…',
    error: 'Call failed',
};

let msgSeq = 0;
function nextMsgId() {
    msgSeq += 1;
    return `m${msgSeq}`;
}

/** Drop internal analysis / tool dumps that should never appear in the UI. */
function isNoiseTranscript(text) {
    const t = String(text || '').trim();
    if (!t) return true;
    if (t.startsWith('[') && (t.includes('context') || t.includes('live') || t.includes('system'))) return true;
    if (/^\s*\{[\s\S]*"?(tool|function|name|args)"?\s*:/.test(t)) return true;
    if (/function_call|tool_call|list_entities|get_entity_state|call_service/i.test(t) && t.length < 220) return true;
    if (/^(thinking|analysis|plan|tool)\s*:/i.test(t)) return true;
    return false;
}

/** Normalize for echo / greeting comparisons. */
function normText(s) {
    return String(s || '')
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Do NOT pre-lock from phone OS locale.
 * An Arabic locale was pinning Gemini speech to ar-EG and then flipping the
 * spoken reply to Arabic even when the user started in English. Language is
 * locked only from the user's first clear spoken utterance.
 */
function preferredCallLanguage() {
    return null;
}

/**
 * Gemini Live sometimes captions English speech in Devanagari/Hindi phonetics
 * while still understanding English. Drop those wrong-script captions for YOU.
 */
function isWrongScriptForCall(text, callLanguage) {
    const t = String(text || '');
    if (!t.trim()) return true;
    const latin = (t.match(/[A-Za-z]/g) || []).length;
    const arabic = (t.match(/[\u0600-\u06FF]/g) || []).length;
    const devanagari = (t.match(/[\u0900-\u097F]/g) || []).length;
    const cjk = (t.match(/[\u3040-\u30FF\u3400-\u9FFF]/g) || []).length;
    if (callLanguage === 'en') {
        // English call captions must be Latin — never Hindi/CJK phonetic dumps
        if (devanagari >= 2 || cjk >= 2) return true;
        if (arabic >= 4 && latin === 0) return true;
        return false;
    }
    if (callLanguage === 'ar') {
        if (devanagari >= 2 || cjk >= 2) return true;
        return false;
    }
    return false;
}

/** Infer en/ar from the first real user caption script. */
function detectSpokenLanguage(text) {
    const t = String(text || '');
    const arabic = (t.match(/[\u0600-\u06FF]/g) || []).length;
    const latin = (t.match(/[A-Za-z]/g) || []).length;
    // Match backend thresholds — short/noisy captions must not flip language.
    if (latin >= 8 && arabic === 0) return 'en';
    if (arabic >= 6 && latin === 0) return 'ar';
    return null;
}

/** Collapse whitespace only — real cleanup happens via backend ASR polish. */
function normalizeCaption(text) {
    return String(text || '').replace(/\s+/g, ' ').trim();
}

/** Butler speech often echoes into the mic and is wrongly labeled as YOU. */
function isButlerEchoOrGreeting(text, messages = [], lastAssistantText = '') {
    const raw = String(text || '').trim();
    if (!raw) return true;
    // Classic opening / filler lines that are never real user speech
    if (
        /^(hello[,.]?\s*)?(i am|i'm)\s+butler\b|how can i help|waiting for your request|certainly|checking now|one moment|wait[,.]?\s*(let me|i am)?\s*check|أهلاً|كيف يمكنني|كيف أقدر|لحظة|أتأكد/i.test(
            raw,
        )
    ) {
        return true;
    }
    const t = normText(raw);
    if (t.length < 2) return true;

    const assistantCandidates = [];
    if (lastAssistantText) assistantCandidates.push(lastAssistantText);
    // Prefer recent assistant lines — echo often lands after Butler's bubble is finalized.
    for (const m of [...messages].reverse()) {
        if (m.role === 'assistant' && m.text) assistantCandidates.push(m.text);
        if (assistantCandidates.length >= 4) break;
    }

    for (const assistant of assistantCandidates) {
        const a = normText(assistant);
        if (!a) continue;
        if (t === a) return true;
        // User caption is just a slice of what Butler just said
        if (t.length >= 4 && a.includes(t)) return true;
        if (a.length >= 8 && t.startsWith(a.slice(0, Math.min(18, a.length)))) return true;
        // Truncated / slightly misheard echo (missing leading "I", "a", word endings)
        if (t.length >= 12 && a.length >= 12) {
            const aCore = a.replace(/^(i am|i'm|i)\s+/i, '');
            const tCore = t.replace(/^(i am|i'm|i)\s+/i, '');
            if (tCore.length >= 8 && (aCore.includes(tCore) || tCore.includes(aCore.slice(0, Math.min(tCore.length, aCore.length))))) {
                return true;
            }
            // Prefix similarity even when ASR drops articles mid-sentence
            const prefixLen = Math.min(28, t.length, a.length);
            if (prefixLen >= 12 && t.slice(0, prefixLen) === a.slice(0, prefixLen)) return true;
        }
        // High word overlap with Butler's recent line
        const aw = new Set(a.split(' ').filter((w) => w.length > 2));
        const tw = t.split(' ').filter((w) => w.length > 2);
        if (tw.length >= 3 && aw.size > 0) {
            const overlap = tw.filter((w) => aw.has(w)).length;
            if (overlap / tw.length >= 0.7) return true;
        }
        // Shared long token sequence (order-preserving) — catches truncated ASR echo
        if (tw.length >= 5) {
            let ai = 0;
            let matched = 0;
            const aWords = a.split(' ').filter((w) => w.length > 2);
            for (const w of tw) {
                const found = aWords.indexOf(w, ai);
                if (found >= 0) {
                    matched += 1;
                    ai = found + 1;
                }
            }
            if (matched / tw.length >= 0.7) return true;
        }
    }
    return false;
}

/**
 * Display the current turn's caption for a role.
 *
 * The backend is the single source of truth for stitching Gemini's ASR/TTS
 * caption deltas together (see transcript_polish.merge_transcript_delta) —
 * every `userTranscript` / `assistantTranscript` event already carries the
 * full cumulative text for the turn. The client's only job is to show it,
 * so we replace the open bubble's text rather than re-guessing overlaps.
 */
function mergeTranscript(prev, role, cumulativeText) {
    const text = normalizeCaption(cumulativeText);
    if (!text || isNoiseTranscript(text)) return prev;

    const last = prev[prev.length - 1];
    if (last && last.role === role && !last.final) {
        return [...prev.slice(0, -1), { ...last, text }];
    }
    return [...prev, { id: nextMsgId(), role, text, final: false }];
}

const DETECTING_CAPTION = '…';

/**
 * Replace / place the YOU bubble with the backend-polished caption.
 *
 * Polished finals often arrive AFTER Butler has already started (or finished)
 * speaking — re-transcription is a separate Gemini round-trip. Appending at
 * the end makes the answer appear above the question. Instead:
 *  1) Collapse a trailing run of provisional YOU bubbles (live ASR / "…").
 *  2) If Butler's reply is already at the end, upgrade the YOU just before
 *     that trailing assistant block, or insert one there.
 */
function applyFinalUserCaption(prev, text) {
    const cleaned = normalizeCaption(text);
    // Empty final clears a Detecting/placeholder bubble without inventing text.
    if (!cleaned) {
        let cutoff = prev.length;
        for (let i = prev.length - 1; i >= 0; i -= 1) {
            if (prev[i].role !== 'user') break;
            cutoff = i;
        }
        if (cutoff < prev.length) {
            const onlyPlaceholder = prev
                .slice(cutoff)
                .every((m) => !m.text || m.text === DETECTING_CAPTION);
            if (onlyPlaceholder) return prev.slice(0, cutoff);
        }
        return prev;
    }
    if (isNoiseTranscript(cleaned)) return prev;

    // 1) Trailing YOU run still at the end of the list
    let cutoff = prev.length;
    for (let i = prev.length - 1; i >= 0; i -= 1) {
        if (prev[i].role !== 'user') break;
        cutoff = i;
    }
    if (cutoff < prev.length) {
        const id = prev[cutoff].id;
        return [...prev.slice(0, cutoff), { id, role: 'user', text: cleaned, final: true }];
    }

    // 2) Late final — trailing messages are Butler's reply. Keep YOU above them.
    let insertAt = prev.length;
    for (let i = prev.length - 1; i >= 0; i -= 1) {
        if (prev[i].role === 'assistant' || prev[i].role === 'status') {
            insertAt = i;
            continue;
        }
        break;
    }
    if (insertAt < prev.length) {
        if (insertAt > 0 && prev[insertAt - 1].role === 'user') {
            const i = insertAt - 1;
            return [
                ...prev.slice(0, i),
                { ...prev[i], text: cleaned, final: true },
                ...prev.slice(i + 1),
            ];
        }
        return [
            ...prev.slice(0, insertAt),
            { id: nextMsgId(), role: 'user', text: cleaned, final: true },
            ...prev.slice(insertAt),
        ];
    }

    return [...prev, { id: nextMsgId(), role: 'user', text: cleaned, final: true }];
}

function finalizeRole(prev, role) {
    if (!prev.length) return prev;
    return prev.map((m) => {
        if (m.role !== role || m.final) return m;
        return { ...m, text: normalizeCaption(m.text), final: true };
    });
}

function finalizeAll(prev) {
    return prev.map((m) =>
        m.final ? m : { ...m, text: normalizeCaption(m.text), final: true },
    );
}

function ButlerVoiceModal({ visible, onClose, onSwitchToChat, context }) {
    const [phase, setPhase] = useState('ringing');
    const [audioRoute, setAudioRoute] = useState('SPEAKER');
    const [routeHint, setRouteHint] = useState('');
    const [errorHint, setErrorHint] = useState('');
    const [messages, setMessages] = useState([]);
    const [statusHint, setStatusHint] = useState('');

    const sessionRef = useRef(null);
    const audioRouteRef = useRef('SPEAKER');
    const contextRef = useRef(context);
    const butlerSpokeRef = useRef(false);
    const butlerSpeakingRef = useRef(false); // UI phase only — barge-in still shows YOU text
    const lastAssistantTextRef = useRef('');
    const callLanguageRef = useRef(preferredCallLanguage());
    const languageLockedRef = useRef(false);
    /** True after server `user_turn_started` until a real YOU caption lands. */
    const userTurnPendingRef = useRef(false);
    const scrollRef = useRef(null);
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
            // Route switch must never surface as "Call failed"
        } catch (e) {
            console.warn('[ButlerVoice] setRoute', e?.message ?? e);
            const info = await getButlerAudioRouteInfo().catch(() => null);
            setRouteHint(formatAudioRouteLabel(info, route) || 'Could not switch audio route');
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
            void deactivateKeepAwake(KEEP_AWAKE_TAG);
            void stopSession();
            setPhase('ringing');
            setAudioRoute('SPEAKER');
            setRouteHint('');
            setErrorHint('');
            setMessages([]);
            setStatusHint('');
            butlerSpokeRef.current = false;
            butlerSpeakingRef.current = false;
            lastAssistantTextRef.current = '';
            callLanguageRef.current = preferredCallLanguage();
            languageLockedRef.current = false;
            userTurnPendingRef.current = false;
            return undefined;
        }

        let cancelled = false;
        let hadExternalAudio = false;
        butlerSpokeRef.current = false;
        butlerSpeakingRef.current = false;
        lastAssistantTextRef.current = '';
        callLanguageRef.current = preferredCallLanguage();
        languageLockedRef.current = false;
        userTurnPendingRef.current = false;
        setPhase('ringing');
        setAudioRoute('SPEAKER');
        audioRouteRef.current = 'SPEAKER';
        setRouteHint('');
        setErrorHint('');
        setMessages([]);
        setStatusHint('');

        // Keep screen on for the whole call (prevents lock / dim during long tool waits)
        void activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => {});

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
                    // `speaking` fires on EVERY audio chunk Butler streams (many times
                    // per second), not just once per turn. Only finalize the user's
                    // bubble on the silence→speaking edge — otherwise a user utterance
                    // that overlaps trailing Butler audio gets its live caption closed
                    // and reopened on every chunk, fragmenting one sentence into many
                    // disjoint "YOU" bubbles (e.g. "شيء" / "I'm saying on the").
                    const wasSpeaking = butlerSpeakingRef.current;
                    butlerSpokeRef.current = true;
                    butlerSpeakingRef.current = true;
                    setPhase('butler');
                    setStatusHint('');
                    if (!wasSpeaking) {
                        // Close the user's bubble so butler captions can't attach to it.
                        // If the user spoke but the caption is still in flight, reserve
                        // a YOU slot now so Butler's answer cannot render above it.
                        setMessages((prev) => {
                            let next = finalizeRole(prev, 'user');
                            const last = next[next.length - 1];
                            if (
                                userTurnPendingRef.current &&
                                !(last && last.role === 'user')
                            ) {
                                next = [
                                    ...next,
                                    {
                                        id: nextMsgId(),
                                        role: 'user',
                                        text: DETECTING_CAPTION,
                                        final: false,
                                    },
                                ];
                            }
                            return next;
                        });
                    }
                });
                session.on('listening', () => {
                    if (cancelled) return;
                    butlerSpeakingRef.current = false;
                    setMessages((prev) => finalizeAll(prev.filter((m) => m.role !== 'status' || m.text)));
                    if (butlerSpokeRef.current) setPhase('live');
                    setStatusHint('');
                });
                session.on('userTurnStarted', () => {
                    if (cancelled) return;
                    userTurnPendingRef.current = true;
                    setMessages((prev) => {
                        const withoutStatus = prev.filter((m) => m.role !== 'status');
                        const last = withoutStatus[withoutStatus.length - 1];
                        if (last && last.role === 'user' && !last.final) {
                            return [
                                ...withoutStatus.slice(0, -1),
                                { ...last, text: DETECTING_CAPTION },
                            ];
                        }
                        return [
                            ...finalizeRole(withoutStatus, 'assistant'),
                            {
                                id: nextMsgId(),
                                role: 'user',
                                text: DETECTING_CAPTION,
                                final: false,
                            },
                        ];
                    });
                    setPhase('live');
                    setStatusHint('');
                });
                session.on('userTranscript', (text) => {
                    if (cancelled) return;
                    if (isNoiseTranscript(text)) return;
                    // Drop Gemini's wrong-script English→Hindi phonetics, etc.
                    if (isWrongScriptForCall(text, callLanguageRef.current)) return;
                    const live = normalizeCaption(text);
                    if (!live) return;
                    setMessages((prev) => {
                        // Drop speaker-echo of Butler; keep real barge-in speech
                        if (isButlerEchoOrGreeting(live, prev, lastAssistantTextRef.current)) {
                            return prev;
                        }
                        // Lock once from the first clear utterance — never flip later.
                        if (!languageLockedRef.current) {
                            const detected = detectSpokenLanguage(live);
                            if (detected) {
                                languageLockedRef.current = true;
                                callLanguageRef.current = detected;
                                session.lockCallLanguage(detected);
                            }
                        }
                        // Provisional live caption — backend will replace with polished final
                        userTurnPendingRef.current = true;
                        butlerSpeakingRef.current = false;
                        const cleaned = finalizeRole(
                            prev.filter((m) => m.role !== 'status'),
                            'assistant',
                        );
                        return mergeTranscript(cleaned, 'user', live);
                    });
                    setPhase('live');
                    setStatusHint('');
                });
                session.on('userTranscriptFinal', (text) => {
                    if (cancelled) return;
                    // Allow empty finals through so Detecting/"…" placeholders clear.
                    if (text && isNoiseTranscript(text)) return;
                    if (text && isWrongScriptForCall(text, callLanguageRef.current)) return;
                    const finalText = normalizeCaption(text);
                    if (
                        finalText &&
                        isButlerEchoOrGreeting(finalText, [], lastAssistantTextRef.current)
                    ) {
                        // Drop echo YOU bubble if live ASR already painted it
                        setMessages((prev) => {
                            const last = prev[prev.length - 1];
                            if (
                                last?.role === 'user' &&
                                isButlerEchoOrGreeting(
                                    last.text,
                                    prev,
                                    lastAssistantTextRef.current,
                                )
                            ) {
                                return prev.slice(0, -1);
                            }
                            return prev;
                        });
                        return;
                    }
                    if (finalText && !languageLockedRef.current) {
                        const detected = detectSpokenLanguage(finalText);
                        if (detected) {
                            languageLockedRef.current = true;
                            callLanguageRef.current = detected;
                            session.lockCallLanguage(detected);
                        }
                    }
                    if (finalText) userTurnPendingRef.current = false;
                    setMessages((prev) => applyFinalUserCaption(prev, finalText));
                    setPhase('live');
                });
                session.on('assistantTranscript', (text) => {
                    if (cancelled) return;
                    if (isNoiseTranscript(text)) return;
                    // Keep Butler's caption in the locked call script when known.
                    if (isWrongScriptForCall(text, callLanguageRef.current)) return;
                    const live = normalizeCaption(text);
                    if (!live) return;
                    butlerSpokeRef.current = true;
                    butlerSpeakingRef.current = true;
                    lastAssistantTextRef.current = live;
                    setMessages((prev) => {
                        // If a YOU bubble already has this butler line (echo), remove it
                        const withoutEcho = prev.filter(
                            (m) =>
                                !(
                                    m.role === 'user' &&
                                    isButlerEchoOrGreeting(m.text, [{ role: 'assistant', text: live }], live)
                                ),
                        );
                        // Finalize prior YOU before Butler caption grows
                        const cleaned = finalizeRole(
                            withoutEcho.filter((m) => m.role !== 'status'),
                            'user',
                        );
                        return mergeTranscript(cleaned, 'assistant', live);
                    });
                    setPhase('butler');
                    setStatusHint('');
                });
                // Do NOT render raw model `text` events — they often contain
                // bilingual thinking / tool planning ("analysis") and pollute the chat.
                // Tool calls stay silent in the UI — no "checking" status bubble.
                session.on('toolCall', () => {
                    if (cancelled) return;
                    setMessages((prev) => prev.filter((m) => m.role !== 'status'));
                });
                session.on('toolResult', () => {
                    if (cancelled) return;
                    setStatusHint('');
                });
                session.on('interrupted', () => {
                    if (cancelled) return;
                    butlerSpeakingRef.current = false;
                    setPhase('live');
                    setMessages((prev) => finalizeRole(prev, 'assistant'));
                });
                session.on('error', ({ message }) => {
                    if (cancelled) return;
                    butlerSpeakingRef.current = false;
                    setPhase('error');
                    const raw = String(message || '');
                    let friendly = raw.slice(0, 120);
                    if (/1007|CONTENT_TYPE_AUDIO|invalid frame/i.test(raw)) {
                        friendly = 'Audio route interrupted. Tap Speaker, then try the call again.';
                    } else if (/disconnected|closed/i.test(raw)) {
                        friendly = 'Call disconnected. Please try again.';
                    }
                    setErrorHint(friendly);
                });

                const result = await session.start(contextRef.current, {
                    callLanguage: callLanguageRef.current,
                });
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
                // Auto-route to headset/Bluetooth when it connects mid-call
                Haptics.selectionAsync();
                audioRouteRef.current = 'HEADSET';
                setAudioRoute('HEADSET');
                void sessionRef.current?.setRoute('HEADSET');
            } else if (!externalNow && hadExternalAudio) {
                hadExternalAudio = false;
                // BT/wired disconnected — fall back to speaker so audio isn't lost
                if (audioRouteRef.current === 'HEADSET') {
                    audioRouteRef.current = 'SPEAKER';
                    setAudioRoute('SPEAKER');
                    void sessionRef.current?.setRoute('SPEAKER');
                }
            } else if (externalNow) {
                hadExternalAudio = true;
            }
        });

        // Leaving the app ends the call (avoids runaway greetings in background).
        const onAppState = (next) => {
            if (next === 'background') {
                cancelled = true;
                void endSession();
            }
        };
        const appSub = AppState.addEventListener('change', onAppState);

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
            appSub.remove();
            unsubRoute();
            liveAnim.stop();
            livePulse.setValue(1);
            ringScale.setValue(1);
            void deactivateKeepAwake(KEEP_AWAKE_TAG);
            void stopSession();
        };
    }, [visible, stopSession, endSession, runRingPulse, livePulse]);

    useEffect(() => {
        if (!messages.length) return;
        const t = setTimeout(() => {
            scrollRef.current?.scrollToEnd?.({ animated: true });
        }, 50);
        return () => clearTimeout(t);
    }, [messages]);

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
                    {statusHint ? (
                        <Text style={styles.statusHint} numberOfLines={1}>{statusHint}</Text>
                    ) : null}
                    {routeHint ? (
                        <Text style={styles.routeHint} numberOfLines={1}>{routeHint}</Text>
                    ) : null}
                    {phase === 'error' && errorHint ? (
                        <Text style={styles.errorHint} numberOfLines={2}>{errorHint}</Text>
                    ) : null}

                    <ScrollView
                        ref={scrollRef}
                        style={styles.transcript}
                        contentContainerStyle={styles.transcriptContent}
                        showsVerticalScrollIndicator={false}
                    >
                        {messages.length === 0 ? (
                            <Text style={styles.transcriptEmpty}>
                                Your conversation will appear here
                            </Text>
                        ) : (
                            messages.map((m) => {
                                if (m.role === 'status') {
                                    return (
                                        <View key={m.id} style={styles.statusBubble}>
                                            <Text style={styles.statusBubbleText}>{m.text}</Text>
                                        </View>
                                    );
                                }
                                const isUser = m.role === 'user';
                                return (
                                    <View
                                        key={m.id}
                                        style={[
                                            styles.bubble,
                                            isUser ? styles.bubbleUser : styles.bubbleButler,
                                        ]}
                                    >
                                        <Text style={styles.bubbleRole}>
                                            {isUser ? 'You' : 'Butler'}
                                        </Text>
                                        <Text style={styles.bubbleText}>
                                            {m.text}
                                        </Text>
                                    </View>
                                );
                            })
                        )}
                    </ScrollView>
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
                            accessibilityLabel="Switch to Butler chat"
                        >
                            <ButlerChatIcon color="#c9a8f0" size={26} />
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
        paddingHorizontal: 24,
    },
    callerName: {
        ...Heading.lg24,
        color: '#ededf5',
        letterSpacing: -0.5,
        marginBottom: 20,
    },
    avatarWrap: {
        width: 120,
        height: 120,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 16,
    },
    ringRipple: {
        position: 'absolute',
        width: 120,
        height: 120,
        borderRadius: 60,
        borderWidth: 2,
        borderColor: 'rgba(123,47,190,0.55)',
    },
    avatar: {
        width: 88,
        height: 88,
        borderRadius: 44,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#7B2FBE',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.45,
        shadowRadius: 24,
        elevation: 12,
    },
    avatarLetter: {
        fontSize: 34,
        fontFamily: CF.semibold,
        color: '#fff',
        letterSpacing: -1,
    },
    statusLine: {
        fontSize: 16,
        fontFamily: CF.medium,
        color: 'rgba(237,237,245,0.72)',
        letterSpacing: -0.2,
    },
    statusHint: {
        marginTop: 4,
        fontSize: 13,
        fontFamily: CF.medium,
        color: 'rgba(201,168,240,0.95)',
        letterSpacing: -0.1,
    },
    routeHint: {
        marginTop: 4,
        fontSize: 12,
        fontFamily: CF.regular,
        color: 'rgba(201,168,240,0.7)',
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
    transcript: {
        flex: 1,
        alignSelf: 'stretch',
        marginTop: 18,
        marginBottom: 8,
    },
    transcriptContent: {
        paddingBottom: 12,
        gap: 10,
    },
    transcriptEmpty: {
        textAlign: 'center',
        color: 'rgba(237,237,245,0.28)',
        fontSize: 13,
        fontFamily: CF.regular,
        marginTop: 24,
    },
    bubble: {
        maxWidth: '88%',
        borderRadius: 16,
        paddingHorizontal: 14,
        paddingVertical: 10,
    },
    bubbleUser: {
        alignSelf: 'flex-end',
        backgroundColor: 'rgba(123,47,190,0.28)',
        borderWidth: 1,
        borderColor: 'rgba(123,47,190,0.4)',
    },
    bubbleButler: {
        alignSelf: 'flex-start',
        backgroundColor: 'rgba(255,255,255,0.07)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    bubbleRole: {
        fontSize: 10,
        fontFamily: CF.semibold,
        color: 'rgba(201,168,240,0.85)',
        marginBottom: 3,
        letterSpacing: 0.3,
        textTransform: 'uppercase',
    },
    bubbleText: {
        fontSize: 15,
        fontFamily: CF.regular,
        lineHeight: 22,
        letterSpacing: -0.2,
        color: '#ededf5',
        writingDirection: 'auto',
    },
    statusBubble: {
        alignSelf: 'center',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 12,
        backgroundColor: 'rgba(68,200,202,0.12)',
        borderWidth: 1,
        borderColor: 'rgba(68,200,202,0.28)',
    },
    statusBubbleText: {
        fontSize: 12,
        fontFamily: CF.medium,
        color: '#7ad4d6',
        fontStyle: 'italic',
    },
    controls: {
        alignItems: 'center',
        paddingHorizontal: 32,
        gap: 22,
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
