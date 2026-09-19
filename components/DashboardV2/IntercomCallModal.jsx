import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    View, Text, StyleSheet, Modal, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Phone, PhoneOff, LockOpen } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { CF } from '../../utils/typography';
import AuthedCameraImage from './AuthedCameraImage';
import {
    adminToWsUrl,
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
import {
    releaseAudioPlayer,
    requestRecordingPermissionsAsync,
    routeCallAudioToSpeaker,
    startIntercomRingtone,
} from '../../services/expoAudio';

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
    const [intercomOn, setIntercomOn] = useState(false);
    const wsRef = useRef(null);
    const webRef = useRef(null);
    const dismissedRef = useRef('');
    const sipIncomingRef = useRef(false);
    const sipCallbackTriedRef = useRef(false);

    const runSip = (code) => {
        try { webRef.current?.injectJavaScript(`${code}; true;`); } catch { /* ignore */ }
    };

    const callDoorAfterRelease = useCallback(async () => {
        if (sipCallbackTriedRef.current) return;
        sipCallbackTriedRef.current = true;
        setSipStatus('Calling the door…');
        try {
            await releaseDoorCall(adminUrl);
        } catch { /* door may already be idle */ }
        await new Promise((r) => setTimeout(r, 400));
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
            if (payload.event === 'answered' && next && userId
                && String(next.answeredByUserId) !== String(userId)
                && dismissedRef.current !== next.callId) {
                const who = next.answeredByName || 'Someone';
                setNotice(`${who} picked up the call`);
                runSip('window.PW_SIP_HANGUP && window.PW_SIP_HANGUP()');
                setTimeout(() => setNotice(''), 4000);
            }
            setCall((prev) => {
                const applied = applyEvent(prev, payload);
                return callSig(prev) === callSig(applied) ? prev : applied;
            });
            if (next?.sip) setSip(next.sip);
            if (payload.event === 'ended') {
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
            return undefined;
        }
        let cancelled = false;
        fetchIntercomClient(adminUrl).then((data) => {
            if (cancelled) return;
            if (!data?.enabled) {
                setIntercomOn(false);
                setListenSip(null);
                return;
            }
            setIntercomOn(true);
            if (!data.sip) return;
            const urls = sipWsCandidates(data.sip.wssUrl);
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
        }).catch(() => {
            if (!cancelled) {
                setIntercomOn(false);
                setListenSip(null);
            }
        });
        return () => { cancelled = true; };
    }, [adminUrl]);

    const ingestRef = useRef(ingest);
    ingestRef.current = ingest;

    useEffect(() => {
        if (!adminUrl || !intercomOn) return undefined;
        let cancelled = false;
        let ping;

        const connect = () => {
            const url = adminToWsUrl(adminUrl);
            if (!url) return;
            try {
                const ws = new WebSocket(url);
                wsRef.current = ws;
                ws.onmessage = (ev) => {
                    const payload = readIntercomMessage(ev.data);
                    if (payload) ingestRef.current(payload);
                };
                ws.onclose = () => {
                    if (!cancelled) ping = setTimeout(connect, 8000);
                };
                ws.onerror = () => {
                    try { ws.close(); } catch { /* ignore */ }
                };
            } catch {
                ping = setTimeout(connect, 8000);
            }
        };

        connect();
        fetchIntercomCall(adminUrl, userId).then((data) => {
            if (cancelled || !data?.call) return;
            ingestRef.current({ event: data.call.status, call: data.call });
        }).catch(() => {});
        const poll = setInterval(() => {
            fetchIntercomCall(adminUrl, userId).then((data) => {
                if (cancelled) return;
                if (data?.call) {
                    ingestRef.current({ event: data.call.status, call: data.call });
                }
            }).catch(() => {});
        }, 3000);

        return () => {
            cancelled = true;
            clearInterval(poll);
            if (ping) clearTimeout(ping);
            try { wsRef.current?.close(); } catch { /* ignore */ }
        };
    }, [adminUrl, userId, intercomOn]);

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
        if (!visible || ringing) return undefined;
        routeCallAudioToSpeaker().catch(() => {});
        return undefined;
    }, [visible, ringing]);

    useEffect(() => {
        if (!sipLive) return undefined;
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
        let player;
        let cancelled = false;
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
        const buzz = setInterval(() => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
        }, 1800);
        startWebRing();
        runSip(`(function(){ window.PW_PENDING = true; if (window.PW_EXPECT) window.PW_EXPECT(); })()`);
        startIntercomRingtone().then((p) => {
            if (cancelled) {
                releaseAudioPlayer(p);
                return;
            }
            player = p;
        }).catch((err) => {
            console.warn('[Intercom] ringtone', err?.message || err);
        });
        return () => {
            cancelled = true;
            clearInterval(buzz);
            stopWebRing();
            releaseAudioPlayer(player);
        };
    }, [ringing]);

    const handleAnswer = async () => {
        if (!call || busy) return;
        setBusy(true);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
        stopWebRing();
        runSip(`(function(){
          function go(){ if (window.PW_ANSWER) window.PW_ANSWER(); }
          try {
            if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
              navigator.mediaDevices.getUserMedia({ audio: true, video: false }).then(function (stream) {
                window.PW_LOCAL = stream;
                go();
              }).catch(function (err) {
                if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify({
                  type: 'sip', status: 'failed', cause: 'mic:' + ((err && err.name) || 'denied')
                }));
                go();
              });
            } else {
              if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'sip', status: 'failed', cause: 'no-mediadevices'
              }));
              go();
            }
          } catch (e) { go(); }
        })()`);
        try {
            await requestRecordingPermissionsAsync();
            await routeCallAudioToSpeaker();
        } catch { /* Expo Go may still prompt from the WebView */ }
        try {
            const result = await answerIntercomCall(adminUrl, { userId, username: userName });
            if (result.ok) {
                ingest({ event: 'answered', call: { ...result.call, sip: listenSip || result.call?.sip || null } });
                if (!sipIncomingRef.current) setSipStatus('Waiting for the door line…');
            } else if (sipIncomingRef.current) {
                ingest({
                    event: 'answered',
                    call: {
                        ...call,
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
            setBusy(false);
        }
    };

    const handleDecline = async () => {
        dismissedRef.current = call?.callId || '';
        sipIncomingRef.current = false;
        sipCallbackTriedRef.current = false;
        stopWebRing();
        runSip('window.PW_SIP_HANGUP && window.PW_SIP_HANGUP()');
        setCall(null);
        setSip(null);
        setSipStatus('');
        declineIntercomCall(adminUrl, { userId }).catch(() => {});
    };

    const handleHangup = async () => {
        setBusy(true);
        sipIncomingRef.current = false;
        sipCallbackTriedRef.current = false;
        stopWebRing();
        runSip('window.PW_SIP_HANGUP && window.PW_SIP_HANGUP()');
        try {
            await hangupIntercomCall(adminUrl, 'hangup');
            setCall(null);
            setSip(null);
            setSipStatus('');
        } finally {
            setBusy(false);
        }
    };

    const handleUnlock = () => {
        if (!unlockEntity || !callService) return;
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        callService('lock', 'unlock', { entity_id: unlockEntity });
    };

    const phoneBase = useMemo(() => {
        // localhost is a secure context (mic allowed) without binding ICE to 127.0.0.1.
        return 'http://localhost/';
    }, []);

    const webSource = useMemo(() => (
        listenSip ? { html: INTERCOM_PHONE_HTML, baseUrl: phoneBase } : null
    ), [listenSip, phoneBase]);

    const inject = useMemo(() => {
        if (!listenSip) return 'true;';
        return `window.PW_SIP = ${JSON.stringify({ ...listenSip, autoDial: false })}; if (window.PW_SIP_READY) window.PW_SIP_READY(); true;`;
    }, [listenSip]);

    const originWhitelist = useMemo(() => ['*', 'http://*', 'https://*', 'ws://*', 'wss://*'], []);

    const onSipMessage = (ev) => {
        const raw = ev?.nativeEvent?.data;
        setTimeout(() => {
            const msg = readIntercomMessage(raw);
            if (msg?.type !== 'sip') return;
            if (msg.status === 'registered') {
                setSipStatus('');
                return;
            }
            if (msg.status === 'incoming') {
                sipIncomingRef.current = true;
                sipCallbackTriedRef.current = false;
                reportSipIncoming(adminUrl, { from: msg.from }).then((res) => {
                    if (res?.call) ingest({ event: 'ringing', call: res.call });
                    else {
                        ingest({
                            event: 'ringing',
                            call: {
                                callId: `sip-${Date.now()}`,
                                status: 'ringing',
                                label: listenSip?.label || listenSip?.displayName || 'Main Door',
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
                return;
            }
            if (msg.status === 'connected') {
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
                else if (
                    t.startsWith('progress') || t.startsWith('ice') || t.startsWith('cand')
                    || t.startsWith('gather') || t.startsWith('register') || t.startsWith('media ')
                    || t === 'socket-open'
                ) {
                    return;
                } else {
                    setSipStatus(`Calling door ${t}`.trim());
                }
            }
            else if (msg.status === 'register_failed') setNotice(`Intercom could not register (${msg.cause || 'FreePBX'})`);
            else if (msg.status === 'failed') {
                setSipLive(false);
                setSipStatus(msg.cause ? `Door audio failed (${msg.cause})` : 'Door did not answer');
            }
            else if (msg.status === 'ended') {
                sipIncomingRef.current = false;
                sipCallbackTriedRef.current = false;
                setSipLive(false);
                setSipVideo(false);
                setSipStatus('');
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
            ignoreSilentHardwareSwitch
            androidLayerType="hardware"
            mediaCapturePermissionGrantType="grant"
            injectedJavaScriptBeforeContentLoaded={inject}
            injectedJavaScript={inject}
            originWhitelist={originWhitelist}
            onMessage={onSipMessage}
            onLoadEnd={() => {
                runSip(`(function(){
                  var md = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
                  var origin = String(location.origin || location.href || '');
                  if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify({
                    type: 'sip', status: 'calling', target: 'media ' + md + ' ' + origin
                  }));
                })()`);
            }}
            onError={() => {}}
        />
    ) : null;

    const callUi = (
        <View style={[styles.overlay, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
            <Text style={styles.kicker}>{ringing ? 'Incoming' : (sipLive ? 'Connected' : 'Joining audio')}</Text>
            <Text style={styles.title}>{call?.label || 'Front door'}</Text>
            {call?.answeredByName && !mine ? (
                <Text style={styles.sub}>{call.answeredByName} answered</Text>
            ) : (
                <Text style={styles.sub}>{ringing ? 'Someone is at the door' : (sipLive ? 'Talk to the visitor' : 'Connecting to the door…')}</Text>
            )}

            <View style={styles.preview}>
                {snapshotUrl ? (
                    <AuthedCameraImage
                        uri={snapshotUrl}
                        headers={token ? { Authorization: `Bearer ${token}` } : {}}
                        refreshMs={visible ? 400 : 0}
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
        </View>
    );

    return (
        <>
            <View pointerEvents="none" collapsable={false} style={styles.sipHold}>
                {phone}
            </View>
            <Modal
                visible={!!visible}
                animationType="fade"
                presentationStyle="fullScreen"
                transparent={false}
                statusBarTranslucent
                onRequestClose={ringing ? handleDecline : handleHangup}
            >
                {callUi}
            </Modal>
            {notice && !visible ? (
                <View pointerEvents="none" style={styles.pickupToast}>
                    <Text style={styles.pickupToastText}>{notice}</Text>
                </View>
            ) : null}
        </>
    );
}

const styles = StyleSheet.create({
    fill: { flex: 1 },
    host: { flex: 1 },
    sipHold: {
        position: 'absolute',
        width: 280,
        height: 160,
        left: -400,
        top: 0,
        overflow: 'hidden',
    },
    sipWeb: {
        width: 280,
        height: 160,
    },
    overlay: {
        flex: 1,
        backgroundColor: '#09091A',
        zIndex: 1,
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
        marginTop: 28,
        marginHorizontal: 24,
        aspectRatio: 16 / 10,
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
        marginTop: 'auto',
        flexDirection: 'row',
        justifyContent: 'space-evenly',
        alignItems: 'center',
        paddingHorizontal: 24,
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
