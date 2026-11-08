import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, AppState, BackHandler, Platform, Dimensions,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { FullWindowOverlay } from 'react-native-screens';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Phone, PhoneOff, LockOpen } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { CF } from '../../utils/typography';
import AuthedCameraImage from './AuthedCameraImage';
import {
    adminToWsUrl,
    adminToSipWsUrl,
    answerIntercomCall,
    declineIntercomCall,
    fetchIntercomCall,
    fetchIntercomClient,
    hangupIntercomCall,
    releaseDoorCall,
    reportSipIncoming,
    sipWsCandidates,
    readIntercomMessage,
} from '../../services/intercom';
import { INTERCOM_PHONE_HTML } from '../../services/intercomPhoneHtml';
import IntercomCall from '../../modules/expo-intercom-call';
import { getIntercomUnlockService } from '../../services/intercomHaBridge';
import {
    releaseAudioPlayer,
    requestRecordingPermissionsAsync,
    routeCallAudioToSpeaker,
    startIntercomRingtone,
} from '../../services/expoAudio';
import { setIntercomLineStatus } from '../../services/intercomLineStatus';

const KEEP_AWAKE = 'intercom-call';

function callSig(call) {
    if (!call) return '';
    return [call.callId, call.status, call.answeredByUserId, call.answeredByName, call._gone ? 1 : 0].join('|');
}

function applyEvent(prev, payload) {
    const next = payload?.call;
    if (!next) {
        if (payload?.event === 'ended' && prev) return { ...prev, status: 'ended', _gone: true };
        return prev;
    }
    if (next.status === 'ended') return { ...next, _gone: true };
    return next;
}

function IntercomCallModal({
    adminUrl,
    userId,
    userName,
    callService,
    homeLocks = [],
    token,
}) {
    const insets = useSafeAreaInsets();
    const [call, setCall] = useState(null);
    const [busy, setBusy] = useState(false);
    const [notice, setNotice] = useState('');
    const [sip, setSip] = useState(null);
    const [sipStatus, setSipStatus] = useState('');
    const [listenSip, setListenSip] = useState(null);
    const [sipLive, setSipLive] = useState(false);
    const [sipVideo, setSipVideo] = useState(false);
    const [sipReady, setSipReady] = useState(false);
    const [lineError, setLineError] = useState('');
    const [holdSip, setHoldSip] = useState(false);
    const [officeAudioId, setOfficeAudioId] = useState('');
    const [intercomOn, setIntercomOn] = useState(false);
    const wsRef = useRef(null);
    const webRef = useRef(null);
    const dismissedRef = useRef('');
    const sipIncomingRef = useRef(false);
    const sipCallbackTriedRef = useRef(false);
    const sipLiveRef = useRef(false);
    const callStatusRef = useRef('');
    const callRef = useRef(null);
    const userIdRef = useRef(userId);
    const handleAnswerRef = useRef(async () => {});
    const handleDeclineRef = useRef(async () => {});
    const handleHangupRef = useRef(async () => {});
    const ringPlayerRef = useRef(null);
    const nativeAnsweredRef = useRef('');
    const sipRegisteredRef = useRef(false);
    const sipAnsweringRef = useRef(false);
    const pendingAudioRef = useRef('');
    const holdSipRef = useRef(false);
    const officeKickRef = useRef(0);
    userIdRef.current = userId;

    const runSip = (code) => {
        try { webRef.current?.injectJavaScript(`${code}; true;`); } catch { /* ignore */ }
    };

    const kickOfficeTalk = (audioId) => {
        const id = String(audioId || '');
        if (!id) return;
        pendingAudioRef.current = id;
        holdSipRef.current = true;
        const token = officeKickRef.current + 1;
        officeKickRef.current = token;
        const started = Date.now();
        const kick = () => {
            if (officeKickRef.current !== token) return;
            if (pendingAudioRef.current !== id) return;
            if (sipLiveRef.current) return;
            const literal = JSON.stringify(id);
            runSip(
                `window.PW_HOLD_SIP=true;window.PW_AUDIO_ID=${literal};`
                + 'var ws=window.PW_AUDIO_WS;'
                + 'if(window.startOfficeTalk&&(!ws||ws.readyState>1))window.startOfficeTalk(null,window.PW_AUDIO_ID)',
            );
            if (Date.now() - started < 15000) setTimeout(kick, 400);
        };
        kick();
    };

    const stopAllRinging = useCallback(() => {
        runSip(`(function(){try{if(window.PW_RING_ID){clearInterval(window.PW_RING_ID);window.PW_RING_ID=null;}}catch(e){}})()`);
        releaseAudioPlayer(ringPlayerRef.current);
        ringPlayerRef.current = null;
    }, []);

    const quietRingtone = useCallback(() => {
        runSip(`(function(){try{if(window.PW_RING_ID){clearInterval(window.PW_RING_ID);window.PW_RING_ID=null;}}catch(e){}})()`);
        const player = ringPlayerRef.current;
        if (!player) return;
        try { player.volume = 0; } catch { /* ignore */ }
        try { player.pause(); } catch { /* ignore */ }
    }, []);

    const callDoorAfterRelease = useCallback(async () => {
        if (sipCallbackTriedRef.current) return;
        if (sipIncomingRef.current || sipLiveRef.current) return;
        // Door (8000) already called us (7000). Calling 8000 back collides and FreePBX Rejects.
        sipCallbackTriedRef.current = true;
        sipCallbackTriedRef.current = true;
        setSipStatus('Calling the door…');
        runSip('window.PW_SIP_HANGUP && window.PW_SIP_HANGUP()');
        try {
            await releaseDoorCall(adminUrl);
        } catch { /* door may already be idle */ }
        await new Promise((r) => setTimeout(r, 80));
        runSip(`(function(){ if (window.PW_PLACE_CALL) window.PW_PLACE_CALL(); })()`);
    }, [adminUrl]);

    const startWebRing = () => {
        runSip(`(function(){
          try {
            var C = window.AudioContext || window.webkitAudioContext;
            if (!C) return;
            if (!window.PW_ACTX) window.PW_ACTX = new C();
            var ctx = window.PW_ACTX;
            if (ctx.resume) ctx.resume();
            if (window.PW_RING_ID) { clearInterval(window.PW_RING_ID); window.PW_RING_ID = null; }
            function beep() {
              var o = ctx.createOscillator();
              var g = ctx.createGain();
              o.type = 'sine';
              o.frequency.value = 880;
              g.gain.setValueAtTime(0.0001, ctx.currentTime);
              g.gain.exponentialRampToValueAtTime(0.22, ctx.currentTime + 0.02);
              g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.16);
              o.connect(g); g.connect(ctx.destination);
              o.start(); o.stop(ctx.currentTime + 0.18);
            }
            beep();
            window.PW_RING_ID = setInterval(beep, 650);
          } catch (e) {}
        })()`);
    };

    const stopWebRing = () => {
        runSip(`(function(){try{if(window.PW_RING_ID){clearInterval(window.PW_RING_ID);window.PW_RING_ID=null;}}catch(e){}})()`);
    };

    const mine = !!(call && userId && String(call.answeredByUserId) === String(userId));
    const visible = !!(call && call.status !== 'ended' && !call._gone && (
        call.status === 'ringing' || mine
    ));
    callStatusRef.current = call?.status || '';
    callRef.current = call;

    const unlockEntity = call?.unlockEntityId
        || listenSip?.unlockEntityId
        || homeLocks.find((l) => l?.entity_id)?.entity_id
        || '';

    const snapshotUrl = useMemo(() => {
        if (!adminUrl) return '';
        const base = adminUrl.replace(/\/+$/, '');
        if (call?.doorCamera || listenSip?.doorCamera) {
            return `${base}/api/intercom/snapshot`;
        }
        const cam = call?.cameraId || listenSip?.cameraId;
        if (cam) {
            const id = encodeURIComponent(String(cam).replace(/^camera\./, ''));
            return `${base}/api/ha-camera/${id}`;
        }
        if (call?.cameraReady || listenSip?.cameraReady) {
            return `${base}/api/intercom/snapshot`;
        }
        return '';
    }, [adminUrl, call?.cameraId, call?.cameraReady, call?.doorCamera, listenSip?.cameraId, listenSip?.cameraReady, listenSip?.doorCamera]);

    const ingest = useCallback((payload) => {
        if (!payload) return;
        const run = () => {
            const next = payload.call;
            if (next?.status === 'ringing' && dismissedRef.current && dismissedRef.current === next.callId) {
                return;
            }
            if (next?.source === 'sip-invite' || next?.source === 'app-sip') {
                sipIncomingRef.current = true;
            }
            if (payload.event === 'answered' && next && userId
                && next.answeredByUserId
                && String(next.answeredByUserId) !== String(userId)
                && dismissedRef.current !== next.callId
                && !sipAnsweringRef.current
                && !sipLiveRef.current) {
                const who = next.answeredByName || 'Someone';
                setNotice(`${who} picked up the call`);
                runSip('window.PW_SIP_HANGUP && window.PW_SIP_HANGUP()');
                IntercomCall.endCall();
                setTimeout(() => setNotice(''), 4000);
            }
            setCall((prev) => {
                const applied = applyEvent(prev, payload);
                return callSig(prev) === callSig(applied) ? prev : applied;
            });
            if (next?.sip) setSip(next.sip);
            if (payload.event === 'ended') {
                IntercomCall.endCall();
                setSip(null);
                setSipLive(false);
                setSipVideo(false);
                setTimeout(() => setCall(null), 1200);
            }
        };
        setTimeout(run, 0);
    }, [userId]);

    useEffect(() => {
        if (!adminUrl) {
            setIntercomOn(false);
            setListenSip(null);
            setIntercomLineStatus({ level: 'off' });
            return undefined;
        }
        let cancelled = false;
        fetchIntercomClient(adminUrl).then((data) => {
            if (cancelled) return;
            if (!data?.enabled) {
                setIntercomOn(false);
                setListenSip(null);
                setSipReady(false);
                setIntercomLineStatus({ level: 'off' });
                return;
            }
            setIntercomOn(true);
            if (!data.sip) {
                setListenSip(null);
                setSipReady(false);
                setIntercomLineStatus({
                    level: 'error',
                    title: 'Door line is not configured',
                    detail: 'This home has no SIP extension for the app.',
                });
                return;
            }
            const urls = [];
            const addUrl = (u) => {
                const v = String(u || '').trim();
                if (v && !urls.includes(v)) urls.push(v);
            };
            addUrl(adminToSipWsUrl(adminUrl));
            (data.sip.wssUrls || []).forEach(addUrl);
            sipWsCandidates(data.sip.wssUrl).forEach(addUrl);
            const joinTarget = data.sip.joinTarget || data.sip.target || '';
            setListenSip({
                ...data.sip,
                wssUrl: urls[0] || data.sip.wssUrl,
                wssUrls: urls,
                joinTarget,
                autoDial: false,
                cameraId: data.public?.camera_id,
                cameraReady: !!data.public?.camera_ready,
                doorCamera: !!data.public?.door_camera,
                unlockEntityId: data.public?.unlock_entity_id,
                label: data.public?.label || data.sip.displayName,
            });
        }).catch((err) => {
            if (!cancelled) {
                setIntercomOn(false);
                setListenSip(null);
                setSipReady(false);
                setIntercomLineStatus({
                    level: 'error',
                    title: 'Door line is not connected',
                    detail: err?.message || 'The home server did not answer.',
                });
            }
        });
        return () => { cancelled = true; };
    }, [adminUrl]);

    const ingestRef = useRef(ingest);
    ingestRef.current = ingest;

    useEffect(() => {
        if (!adminUrl) return undefined;
        let cancelled = false;
        let ping;
        let heartbeat;

        const connect = () => {
            const url = adminToWsUrl(adminUrl);
            if (!url) return;
            try {
                const ws = new WebSocket(url);
                wsRef.current = ws;
                ws.onopen = () => {
                    if (heartbeat) clearInterval(heartbeat);
                    heartbeat = setInterval(() => {
                        try {
                            if (ws.readyState === 1) ws.send('{"type":"ping"}');
                        } catch { /* ignore */ }
                    }, 20000);
                };
                ws.onmessage = (ev) => {
                    const payload = readIntercomMessage(ev.data);
                    if (payload) ingestRef.current(payload);
                };
                ws.onclose = () => {
                    if (heartbeat) clearInterval(heartbeat);
                    if (!cancelled) ping = setTimeout(connect, 2500);
                };
                ws.onerror = () => {
                    try { ws.close(); } catch { /* ignore */ }
                };
            } catch {
                ping = setTimeout(connect, 2500);
            }
        };

        connect();
        fetchIntercomCall(adminUrl, userIdRef.current).then((data) => {
            if (cancelled || !data?.call) return;
            ingestRef.current({ event: data.call.status, call: data.call });
        }).catch(() => {});
        const poll = setInterval(() => {
            fetchIntercomCall(adminUrl, userIdRef.current).then((data) => {
                if (cancelled) return;
                if (data?.call) {
                    ingestRef.current({ event: data.call.status, call: data.call });
                }
            }).catch(() => {});
        }, 1500);

        return () => {
            cancelled = true;
            clearInterval(poll);
            if (ping) clearTimeout(ping);
            if (heartbeat) clearInterval(heartbeat);
            try { wsRef.current?.close(); } catch { /* ignore */ }
        };
    }, [adminUrl]);

    useEffect(() => {
        if (!adminUrl) return undefined;
        const onChange = (next) => {
            if (next !== 'active') return;
            fetchIntercomCall(adminUrl, userIdRef.current).then((data) => {
                if (data?.call) ingestRef.current({ event: data.call.status, call: data.call });
            }).catch(() => {});
            if (!sipLiveRef.current && callStatusRef.current !== 'ringing' && callStatusRef.current !== 'answered') {
                runSip(`(function(){ if (window.PW_RESTART) window.PW_RESTART(); else if (window.PW_SIP_READY) window.PW_SIP_READY(); })()`);
            }
        };
        const sub = AppState.addEventListener('change', onChange);
        return () => sub.remove();
    }, [adminUrl]);

    useEffect(() => {
        if (!listenSip) return undefined;
        const kick = () => {
            if (sipRegisteredRef.current || sipLiveRef.current) return;
            if (callStatusRef.current === 'ringing' || callStatusRef.current === 'answered') return;
            runSip(`(function(){ if (window.PW_RESTART) window.PW_RESTART(); else if (window.PW_SIP_READY) window.PW_SIP_READY(); })()`);
        };
        const first = setTimeout(kick, 2000);
        const later = setInterval(kick, 20000);
        return () => {
            clearTimeout(first);
            clearInterval(later);
        };
    }, [listenSip]);

    const ringing = call?.status === 'ringing';

    useEffect(() => {
        if (visible) activateKeepAwakeAsync(KEEP_AWAKE).catch(() => {});
        else deactivateKeepAwake(KEEP_AWAKE);
        return () => deactivateKeepAwake(KEEP_AWAKE);
    }, [visible]);

    useEffect(() => {
        if (!listenSip) return undefined;
        requestRecordingPermissionsAsync().catch(() => {});
        return undefined;
    }, [listenSip]);

    useEffect(() => {
        if (!sipLive) return undefined;
        stopAllRinging();
        routeCallAudioToSpeaker().catch(() => {});
        runSip(`(function(){
          var a=document.getElementById('remote');
          if(a){a.muted=false;a.volume=1;a.play().catch(function(){});}
          try{
            var ctx=window.PW_ACTX||new (window.AudioContext||window.webkitAudioContext)();
            window.PW_ACTX=ctx;
            if(ctx.resume) ctx.resume();
            if(a&&a.srcObject&&!a._pwTap){
              a._pwTap=true;
              var src=ctx.createMediaStreamSource(a.srcObject);
              var g=ctx.createGain();
              g.gain.value=1.2;
              src.connect(g); g.connect(ctx.destination);
            }
          }catch(e){}
        })()`);
        return undefined;
    }, [sipLive]);

    useEffect(() => {
        if (!ringing) return undefined;
        let cancelled = false;
        const nativeIos = IntercomCall.isAvailable() && Platform.OS === 'ios';
        if (!nativeIos) {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
        }
        const buzz = nativeIos ? null : setInterval(() => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
        }, 1800);
        if (!nativeIos) startWebRing();
        runSip(`(function(){
          window.PW_PENDING = true;
          if (window.PW_EXPECT) window.PW_EXPECT();
          try {
            if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia && !window.PW_LOCAL) {
              navigator.mediaDevices.getUserMedia({ audio: true, video: false }).then(function (stream) {
                window.PW_LOCAL = stream;
              }).catch(function () {});
            }
          } catch (e) {}
        })()`);
        if (!nativeIos) {
            startIntercomRingtone().then((p) => {
                if (cancelled) {
                    releaseAudioPlayer(p);
                    return;
                }
                ringPlayerRef.current = p;
            }).catch((err) => {
                console.warn('[Intercom] ringtone', err?.message || err);
            });
        }
        const lockedOrBackground = AppState.currentState !== 'active';
        if (IntercomCall.isAvailable() && lockedOrBackground) {
            IntercomCall.reportIncoming(call?.callId || '', call?.label || 'Front door');
        }
        return () => {
            cancelled = true;
            if (buzz) clearInterval(buzz);
            stopWebRing();
        };
    }, [ringing, call?.callId, call?.label]);

    const handleAnswer = async (fromCall) => {
        const active = fromCall || callRef.current;
        if (!active || busy) return;
        setBusy(true);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
        sipAnsweringRef.current = true;
        setSipStatus('Joining the door line…');
        stopAllRinging();
        await Promise.race([
            routeCallAudioToSpeaker().catch(() => {}),
            new Promise((resolve) => setTimeout(resolve, 400)),
        ]);
        const bridging = holdSipRef.current || holdSip;
        if (!bridging) runSip('if (window.PW_ANSWER) window.PW_ANSWER();');
        let joinedBridge = false;
        try {
            let result = await answerIntercomCall(adminUrl, { userId, username: userName });
            if (!result?.call?.audioId && (bridging || result?.already)) {
                try {
                    const latest = await fetchIntercomCall(adminUrl, userId);
                    if (latest?.call?.audioId) {
                        result = { ...result, ok: true, call: { ...latest.call, ...result.call, audioId: latest.call.audioId } };
                    }
                } catch { /* the answer response is enough when it includes audio */ }
            }
            if (result.ok) {
                ingest({ event: 'answered', call: { ...result.call, sip: listenSip || result.call?.sip || null } });
                if (result.call?.audioId) {
                    joinedBridge = true;
                    holdSipRef.current = true;
                    setHoldSip(true);
                    setOfficeAudioId(result.call.audioId);
                    setSipStatus('Connecting to the door…');
                    kickOfficeTalk(result.call.audioId);
                } else if (result.call?.pickupMode === 'callback') {
                    setSipStatus('Calling the door…');
                    const kick = () => {
                        if (sipLiveRef.current || sipIncomingRef.current) return;
                        callDoorAfterRelease();
                    };
                    setTimeout(kick, sipRegisteredRef.current ? 400 : 1600);
                } else if (!sipIncomingRef.current && !sipLiveRef.current) {
                    setSipStatus('Connecting to the door…');
                }
            } else if (sipIncomingRef.current) {
                ingest({
                    event: 'answered',
                    call: {
                        ...active,
                        status: 'answered',
                        answeredByUserId: userId,
                        answeredByName: userName,
                    },
                });
            } else {
                setNotice(result.error || 'Could not answer');
                if (result.call) ingest({ event: result.call.status, call: result.call });
            }
        } finally {
            if (!joinedBridge) {
                holdSipRef.current = false;
                setHoldSip(false);
            }
            setBusy(false);
        }
    };
    handleAnswerRef.current = handleAnswer;

    const handleDecline = async () => {
        dismissedRef.current = callRef.current?.callId || '';
        pendingAudioRef.current = '';
        setOfficeAudioId('');
        setHoldSip(false);
        sipIncomingRef.current = false;
        sipCallbackTriedRef.current = false;
        sipAnsweringRef.current = false;
        stopAllRinging();
        runSip('window.PW_AUDIO_ID=""; window.PW_HOLD_SIP=false; window.PW_SIP_HANGUP && window.PW_SIP_HANGUP(); if (!window.PW_UA_OK && window.PW_SIP_READY) window.PW_SIP_READY()');
        IntercomCall.endCall();
        setCall(null);
        setSip(null);
        setSipStatus('');
        declineIntercomCall(adminUrl, { userId }).catch(() => {});
    };
    handleDeclineRef.current = handleDecline;

    const handleHangup = async () => {
        setBusy(true);
        pendingAudioRef.current = '';
        setOfficeAudioId('');
        setHoldSip(false);
        sipIncomingRef.current = false;
        sipCallbackTriedRef.current = false;
        sipAnsweringRef.current = false;
        stopAllRinging();
        runSip('window.PW_AUDIO_ID=""; window.PW_HOLD_SIP=false; window.PW_SIP_HANGUP && window.PW_SIP_HANGUP(); if (!window.PW_UA_OK && window.PW_SIP_READY) window.PW_SIP_READY()');
        IntercomCall.endCall();
        try {
            await hangupIntercomCall(adminUrl, 'hangup');
            setCall(null);
            setSip(null);
            setSipStatus('');
        } finally {
            setBusy(false);
        }
    };
    handleHangupRef.current = handleHangup;

    useEffect(() => {
        if (!adminUrl || !IntercomCall.isAvailable()) return undefined;
        IntercomCall.configure(adminUrl, userId || '', userName || '');

        const answerFromNative = async (payload) => {
            const callId = String(payload?.callId || '');
            if (callId && nativeAnsweredRef.current === callId) return;
            if (callId) nativeAnsweredRef.current = callId;
            holdSipRef.current = true;
            setHoldSip(true);
            let active = callRef.current;
            if (!active || (callId && active.callId !== callId)) {
                try {
                    const data = await fetchIntercomCall(adminUrl, userId);
                    if (data?.call) {
                        ingestRef.current({ event: data.call.status, call: data.call });
                        active = data.call;
                    }
                } catch { /* use payload */ }
            }
            if (!active || active.status === 'ended') {
                active = {
                    callId: callId || `sip-${Date.now()}`,
                    status: 'ringing',
                    label: payload?.label || 'Front door',
                };
                ingestRef.current({ event: 'ringing', call: active });
            }
            await handleAnswerRef.current(active);
        };

        const pending = IntercomCall.consumePending();
        if (pending?.action === 'answer') {
            answerFromNative(pending);
        } else if (pending?.action === 'decline') {
            handleDeclineRef.current();
        } else if (pending?.action === 'incoming' && pending.callId) {
            ingestRef.current({
                event: 'ringing',
                call: {
                    callId: pending.callId,
                    status: 'ringing',
                    label: pending.label || 'Front door',
                },
            });
        }

        const subs = [
            IntercomCall.addListener('onAnswer', answerFromNative),
            IntercomCall.addListener('onDecline', () => handleDeclineRef.current()),
            IntercomCall.addListener('onHangup', () => handleHangupRef.current()),
            IntercomCall.addListener('onIncoming', (payload) => {
                ingestRef.current({
                    event: 'ringing',
                    call: {
                        callId: payload?.callId || `sip-${Date.now()}`,
                        status: 'ringing',
                        label: payload?.label || 'Front door',
                    },
                });
            }),
        ];
        return () => {
            subs.forEach((sub) => {
                try { sub?.remove?.(); } catch { /* ignore */ }
            });
        };
    }, [adminUrl, userId, userName]);

    useEffect(() => {
        if (!visible) return undefined;
        const onBack = () => {
            if (call?.status === 'ringing') handleDecline();
            else handleHangup();
            return true;
        };
        const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
        return () => sub.remove();
    }, [visible, call?.status]);

    const handleUnlock = () => {
        const unlock = callService || getIntercomUnlockService();
        if (!unlockEntity || !unlock) return;
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        unlock('lock', 'unlock', { entity_id: unlockEntity });
    };

    const phoneBase = useMemo(() => {
        const admin = String(adminUrl || '').trim();
        if (/^https:\/\//i.test(admin)) return admin.endsWith('/') ? admin : `${admin}/`;
        return 'http://localhost/';
    }, [adminUrl]);

    const sipSourceKey = listenSip
        ? `${phoneBase}|${listenSip.wssUrl}|${listenSip.sipUser}`
        : '';
    const webSource = useMemo(() => (
        sipSourceKey ? { html: INTERCOM_PHONE_HTML, baseUrl: phoneBase } : null
    ), [sipSourceKey, phoneBase]);

    const inject = useMemo(() => {
        if (!listenSip) return 'true;';
        const hold = holdSip ? 'window.PW_HOLD_SIP=true;' : 'window.PW_HOLD_SIP=false;';
        const audio = officeAudioId ? `window.PW_AUDIO_ID=${JSON.stringify(officeAudioId)};` : '';
        return `${hold}${audio}window.PW_SIP = ${JSON.stringify({ ...listenSip, adminUrl, autoDial: false })}; if (window.PW_SIP_READY && !window.PW_HOLD_SIP) window.PW_SIP_READY(); true;`;
    }, [listenSip, adminUrl, holdSip, officeAudioId]);

    const originWhitelist = useMemo(() => ['*', 'http://*', 'https://*', 'ws://*', 'wss://*'], []);

    useEffect(() => {
        if (!intercomOn) return undefined;
        if (lineError) {
            setIntercomLineStatus({ level: 'error', title: 'Door line error', detail: lineError });
            return undefined;
        }
        if (sipReady) {
            setIntercomLineStatus({
                level: 'connected',
                title: 'Door line connected',
                detail: 'This phone is registered and can receive the intercom.',
            });
            return undefined;
        }
        if (!listenSip) {
            setIntercomLineStatus({
                level: 'connecting',
                title: 'Connecting to the door line',
                detail: 'Waiting for this home’s door settings.',
            });
            return undefined;
        }
        setIntercomLineStatus({
            level: 'connecting',
            title: 'Connecting to the door line',
            detail: sipStatus || 'The phone is registering with the door system.',
        });
        return undefined;
    }, [intercomOn, lineError, sipReady, listenSip, sipStatus]);

    const onSipMessage = (ev) => {
        const raw = ev?.nativeEvent?.data;
        setTimeout(() => {
            const msg = readIntercomMessage(raw);
            if (msg?.type !== 'sip') return;
            console.log('[Intercom] sip', msg.status, msg.target || msg.cause || msg.extension || '');
            if (msg.status === 'registered') {
                sipRegisteredRef.current = true;
                setSipReady(true);
                setLineError('');
                setSipStatus('');
                console.log('[Intercom] SIP registered', msg.extension || listenSip?.sipUser || '');
                return;
            }
            if (msg.status === 'incoming') {
                sipIncomingRef.current = true;
                sipCallbackTriedRef.current = false;
                runSip('window.PW_EXPECT && window.PW_EXPECT()');
                if (callStatusRef.current === 'answered' || nativeAnsweredRef.current || sipAnsweringRef.current) {
                    sipAnsweringRef.current = true;
                    runSip('window.PW_ANSWER && window.PW_ANSWER()');
                }
                reportSipIncoming(adminUrl, { from: msg.from }).then((res) => {
                    const doorExt = String(listenSip?.joinTarget || listenSip?.target || '');
                    const fromExt = String(msg.from || '');
                    const doorLabel = listenSip?.label || listenSip?.displayName || 'Front door';
                    if (res?.call) {
                        ingest({
                            event: 'ringing',
                            call: {
                                ...res.call,
                                label: (doorExt && fromExt === doorExt) ? doorLabel : (res.call.label || doorLabel),
                            },
                        });
                    } else {
                        ingest({
                            event: 'ringing',
                            call: {
                                callId: `sip-${Date.now()}`,
                                status: 'ringing',
                                label: doorLabel,
                                cameraId: listenSip?.cameraId || '',
                                cameraReady: !!listenSip?.cameraReady,
                                doorCamera: !!listenSip?.doorCamera,
                                unlockEntityId: listenSip?.unlockEntityId || '',
                            },
                        });
                    }
                }).catch(() => {});
                return;
            }
            if (msg.status === 'callback') {
                if (sipIncomingRef.current || sipLiveRef.current) return;
                callDoorAfterRelease();
                return;
            }
            if (msg.status === 'connected') {
                sipLiveRef.current = true;
                setSipLive(true);
                setSipStatus('Talk to the visitor');
            }
            else if (msg.status === 'video') {
                setSipVideo(true);
            }
            else if (msg.status === 'calling') {
                const t = String(msg.target || '');
                if (t === 'waiting-inbound') setSipStatus('Waiting for the door line…');
                else if (t === 'waiting-register') setSipStatus('Registering with the phone system…');
                else if (t.startsWith('ice')) setSipStatus(`Door audio ${t.replace(/^ice\s+/i, '')}…`);
                else if (t.startsWith('mic-fail')) setSipStatus('Microphone blocked — allow mic and retry');
                else if (t === 'answered-inbound' || t === 'answer-session') setSipStatus('Door answered — connecting audio…');
                else if (t.startsWith('sdp-local')) setSipStatus('Audio SDP sent — waiting for the door…');
                else if (t.startsWith('pc-wait')) setSipStatus(`Audio path ${t.replace(/^pc-wait\s+/i, '')}`);
                else if (t.startsWith('no-session')) setSipStatus('No SIP call yet — waiting for the door…');
                else if (t === 'bridge-answer' || t === 'bridge-open') setSipStatus('Connecting through the office…');
                else if (t === 'bridge-socket') {
                    setLineError('The office audio connection failed.');
                    setSipStatus('Office audio connection failed');
                }
                else if (
                    t.startsWith('progress') || t.startsWith('cand')
                    || t.startsWith('gather') || t.startsWith('register') || t.startsWith('media ')
                    || t === 'socket-open' || t.startsWith('answer-start') || t.startsWith('answer-opts')
                    || t.startsWith('offer') || t.startsWith('sdp-') || t.startsWith('pc ')
                    || t === 'mic-ready'
                    || t.startsWith('setRemote') || t.startsWith('setLocal')
                    || t.startsWith('createAnswer') || t.startsWith('createOffer')
                ) {
                    return;
                } else {
                    setSipStatus(`Calling door ${t}`.trim());
                }
            }
            else if (msg.status === 'register_failed') {
                sipRegisteredRef.current = false;
                setSipReady(false);
                const cause = msg.cause || 'the phone system rejected the registration';
                setLineError(`The door line could not register. ${cause}`);
                console.warn('[Intercom] SIP register failed', msg.cause);
            }
            else if (msg.status === 'failed') {
                const cause = String(msg.cause || '');
                if (cause === 'no-inbound' && !sipIncomingRef.current) {
                    callDoorAfterRelease();
                    return;
                }
                sipLiveRef.current = false;
                setSipLive(false);
                setSipStatus(msg.cause ? `Door audio failed (${msg.cause})` : 'Door did not answer');
            }
            else if (msg.status === 'ended') {
                const cause = String(msg.cause || '');
                pendingAudioRef.current = '';
                setOfficeAudioId('');
                setHoldSip(false);
                runSip('window.PW_AUDIO_ID=""; window.PW_HOLD_SIP=false; if (!window.PW_UA_OK && window.PW_SIP_READY) window.PW_SIP_READY()');
                sipIncomingRef.current = false;
                sipCallbackTriedRef.current = false;
                sipAnsweringRef.current = false;
                sipLiveRef.current = false;
                setSipLive(false);
                setSipVideo(false);
                if (callStatusRef.current === 'answered' && !cause.toLowerCase().includes('cancel')) {
                    setSipStatus(cause ? `Door hung up (${cause})` : 'Door hung up before audio started');
                } else {
                    setSipStatus('');
                }
            }
        }, 0);
    };

    const phone = webSource ? (
        <WebView
            ref={webRef}
            source={webSource}
            mixedContentMode="always"
            style={styles.sipWeb}
            mediaPlaybackRequiresUserAction={false}
            allowsInlineMediaPlayback
            javaScriptEnabled
            domStorageEnabled
            scrollEnabled={false}
            bounces={false}
            ignoreSilentHardwareSwitch
            androidLayerType="hardware"
            mediaCapturePermissionGrantType="grant"
            injectedJavaScriptBeforeContentLoaded={inject}
            injectedJavaScript={inject}
            originWhitelist={originWhitelist}
            onMessage={onSipMessage}
            onLoadEnd={() => {
                const audioId = pendingAudioRef.current;
                const bridging = !!(audioId || holdSipRef.current);
                const audioLine = audioId
                    ? `window.PW_HOLD_SIP=true;window.PW_AUDIO_ID=${JSON.stringify(audioId)};`
                    : (bridging ? 'window.PW_HOLD_SIP=true;' : '');
                const pageInject = bridging
                    ? inject.replace(
                        'if (window.PW_SIP_READY && !window.PW_HOLD_SIP) window.PW_SIP_READY();',
                        'window.PW_HOLD_SIP=true;',
                    )
                    : inject;
                runSip(`(function(){
                  window.PW_HOLD_SIP=${bridging ? 'true' : 'false'};
                  ${pageInject}
                  ${audioLine}
                  var md = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
                  if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify({
                    type: 'sip', status: 'calling', target: 'media ' + md
                  }));
                  if (window.PW_AUDIO_ID && window.startOfficeTalk) {
                    var ws = window.PW_AUDIO_WS;
                    if (!ws || ws.readyState > 1) window.startOfficeTalk(null, window.PW_AUDIO_ID);
                    return;
                  }
                  if (window.PW_HOLD_SIP) return;
                  if (window.PW_UA_OK) return;
                  if (window.PW_RESTART) window.PW_RESTART();
                  else if (window.PW_SIP_READY) window.PW_SIP_READY();
                })()`);
            }}
            onContentProcessDidTerminate={() => {
                sipRegisteredRef.current = false;
                try { webRef.current?.reload(); } catch { /* ignore */ }
            }}
            onRenderProcessGone={() => {
                sipRegisteredRef.current = false;
                try { webRef.current?.reload(); } catch { /* ignore */ }
            }}
            onError={() => {}}
        />
    ) : null;

    const win = Dimensions.get('window');
    const previewW = Math.max(280, win.width - 48);
    const previewH = Math.min(Math.round(previewW * 10 / 16), Math.round(win.height * 0.36));
    const layer = {
        position: 'absolute',
        top: 0,
        left: 0,
        width: win.width,
        height: win.height,
        zIndex: 99999,
        elevation: 99999,
    };

    const screen = (
        <View
            pointerEvents={visible ? 'auto' : 'box-none'}
            style={visible
                ? [layer, styles.callRoot, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20 }]
                : [layer, styles.idleRoot]}
        >
            <View
                pointerEvents="none"
                collapsable={false}
                style={[styles.sipHold, visible ? styles.sipHoldActive : styles.sipHoldIdle]}
            >
                {phone}
            </View>

            {visible ? (
                <>
                    <Text style={styles.kicker}>{ringing ? 'Incoming' : (sipLive ? 'Connected' : 'Joining audio')}</Text>
                    <Text style={styles.title}>{call?.label || 'Front door'}</Text>
                    {call?.answeredByName && !mine ? (
                        <Text style={styles.sub}>{call.answeredByName} answered</Text>
                    ) : (
                        <Text style={styles.sub}>{ringing ? 'Someone is at the door' : (sipLive ? 'Talk to the visitor' : 'Connecting to the door…')}</Text>
                    )}
                </>
            ) : null}

            {visible ? (
                <View style={[styles.preview, { width: previewW, height: previewH, alignSelf: 'center', zIndex: 2 }]}>
                    {snapshotUrl ? (
                        <AuthedCameraImage
                            uri={snapshotUrl}
                            headers={token ? { Authorization: `Bearer ${token}` } : undefined}
                            refreshMs={400}
                            style={StyleSheet.absoluteFill}
                        />
                    ) : (
                        <View style={styles.previewEmpty}>
                            <Phone size={40} color="rgba(255,255,255,0.35)" />
                        </View>
                    )}
                    {sipLive ? (
                        <View pointerEvents="none" style={styles.livePill}>
                            <Text style={styles.livePillText}>{sipVideo ? 'LIVE' : 'AUDIO'}</Text>
                        </View>
                    ) : null}
                </View>
            ) : null}

            {visible ? (
                <>
                    {sipStatus ? <Text style={styles.hint}>{sipStatus}</Text> : null}
                    {mine && !sipStatus ? (
                        <Text style={styles.hint}>Talk to the visitor</Text>
                    ) : null}
                    <View style={styles.actions}>
                        {ringing ? (
                            <>
                                <TouchableOpacity style={[styles.round, styles.decline]} onPress={handleDecline} disabled={busy}>
                                    <PhoneOff size={28} color="#fff" />
                                    <Text style={styles.roundLabel}>Decline</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={[styles.round, styles.answer]} onPress={handleAnswer} disabled={busy}>
                                    {busy ? <ActivityIndicator color="#fff" /> : <Phone size={28} color="#fff" />}
                                    <Text style={styles.roundLabel}>Answer</Text>
                                </TouchableOpacity>
                            </>
                        ) : (
                            <>
                                {unlockEntity ? (
                                    <TouchableOpacity style={[styles.round, styles.unlock]} onPress={handleUnlock}>
                                        <LockOpen size={26} color="#fff" />
                                        <Text style={styles.roundLabel}>Unlock</Text>
                                    </TouchableOpacity>
                                ) : null}
                                <TouchableOpacity style={[styles.round, styles.decline]} onPress={handleHangup} disabled={busy}>
                                    <PhoneOff size={28} color="#fff" />
                                    <Text style={styles.roundLabel}>Hang up</Text>
                                </TouchableOpacity>
                            </>
                        )}
                    </View>
                </>
            ) : null}

        </View>
    );

    if (Platform.OS === 'ios') {
        return <FullWindowOverlay>{screen}</FullWindowOverlay>;
    }
    return screen;
}

const styles = StyleSheet.create({
    fill: { flex: 1 },
    host: { flex: 1 },
    idleRoot: {
        backgroundColor: 'transparent',
    },
    callRoot: {
        backgroundColor: '#09091A',
        justifyContent: 'space-between',
    },
    sipHold: {
        position: 'absolute',
        overflow: 'hidden',
        backgroundColor: '#09091A',
    },
    sipHoldIdle: {
        width: 320,
        height: 180,
        left: 0,
        top: 0,
        opacity: 0.02,
        zIndex: 0,
    },
    sipHoldActive: {
        width: 320,
        height: 180,
        right: 8,
        bottom: 8,
        opacity: 1,
        zIndex: 0,
        borderRadius: 12,
    },
    sipWeb: {
        width: 320,
        height: 180,
    },
    sipChip: {
        position: 'absolute',
        alignSelf: 'center',
        zIndex: 80,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        backgroundColor: 'rgba(18,18,32,0.92)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.12)',
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderRadius: 14,
    },
    sipDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
    },
    sipDotLive: { backgroundColor: '#22c55e' },
    sipDotWait: { backgroundColor: '#eab308' },
    sipChipText: {
        color: '#fff',
        fontSize: 12,
        fontFamily: CF.medium,
    },
    overlay: {
        flex: 1,
        backgroundColor: '#09091A',
    },
    kicker: {
        textAlign: 'center',
        color: 'rgba(255,255,255,0.45)',
        letterSpacing: 2,
        fontSize: 12,
        fontFamily: CF.semibold,
        textTransform: 'uppercase',
    },
    title: {
        textAlign: 'center',
        color: '#fff',
        fontSize: 32,
        fontFamily: CF.bold,
        marginTop: 8,
    },
    sub: {
        textAlign: 'center',
        color: 'rgba(255,255,255,0.6)',
        fontSize: 16,
        marginTop: 8,
        fontFamily: CF.regular,
    },
    preview: {
        marginTop: 20,
        borderRadius: 20,
        overflow: 'hidden',
        backgroundColor: 'rgba(255,255,255,0.06)',
    },
    previewEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    livePill: {
        position: 'absolute',
        top: 12,
        left: 12,
        backgroundColor: 'rgba(0,0,0,0.55)',
        borderRadius: 8,
        paddingHorizontal: 8,
        paddingVertical: 4,
    },
    livePillText: {
        color: '#fff',
        fontSize: 10,
        letterSpacing: 1,
        fontFamily: CF.semibold,
    },
    hint: {
        textAlign: 'center',
        color: 'rgba(255,255,255,0.45)',
        fontSize: 13,
        marginTop: 16,
        paddingHorizontal: 28,
        fontFamily: CF.regular,
    },
    actions: {
        marginTop: 12,
        flexDirection: 'row',
        justifyContent: 'space-evenly',
        alignItems: 'center',
        paddingHorizontal: 24,
        paddingBottom: 8,
    },
    round: {
        width: 92,
        height: 92,
        borderRadius: 46,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
    },
    answer: { backgroundColor: '#22c55e' },
    decline: { backgroundColor: '#ef4444' },
    unlock: { backgroundColor: '#8947ca' },
    roundLabel: { color: '#fff', fontSize: 12, fontFamily: CF.semibold },
    toast: {
        position: 'absolute',
        alignSelf: 'center',
        zIndex: 80,
        backgroundColor: 'rgba(18,18,32,0.92)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 14,
    },
    toastText: { color: '#fff', fontSize: 13, fontFamily: CF.medium },
    pickupToast: {
        position: 'absolute',
        left: 24,
        right: 24,
        bottom: 48,
        zIndex: 90,
        backgroundColor: 'rgba(18,18,32,0.94)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.12)',
        paddingHorizontal: 16,
        paddingVertical: 14,
        borderRadius: 16,
        alignItems: 'center',
    },
    pickupToastText: { color: '#fff', fontSize: 15, fontFamily: CF.semibold, textAlign: 'center' },
});

export default memo(IntercomCallModal);
