/**
 * Full-screen Frigate event clip player.
 * Frigate serves clips progressively (2s → 3s → …). Direct MP4 WebView navigation
 * downloads ~4MB then aborts (progress=1.0 but clip still growing). HTML <video>
 * with a same-origin relative URL keeps the stream open like a browser tab.
 */

import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import {
    Modal, View, Text, StyleSheet, TouchableOpacity, Image, ActivityIndicator,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { Audio } from 'expo-av';
import { X, Clock } from 'lucide-react-native';
import { CF } from '../../utils/typography';
import {
    getEventPlayUrl, getEventThumbnailUrl, getClipRelativePath, resolveEventEndTime,
} from '../../utils/frigateEvents';
import { formatCameraName } from '../../utils/formatDisplayName';

const CLIP_RETRY_MS = 2500;
const CLIP_MAX_RETRIES = 12;
const GROWING_BADGE_MS = 5000;
const LOG = '[EventClip]';

function normalizeAuthHeaders(headers) {
    if (!headers || typeof headers !== 'object') return {};
    const out = {};
    for (const [key, value] of Object.entries(headers)) {
        if (typeof value === 'string' && value.length > 0) out[key] = value;
    }
    return out;
}

function formatEventTime(unixTs) {
    if (!Number.isFinite(Number(unixTs))) return '';
    const d = new Date(Number(unixTs) * 1000);
    return d.toLocaleString([], {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
}

function buildClipPlayerHtml(clipPath) {
    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<style>
  html,body{margin:0;padding:0;width:100%;height:100%;background:#000;overflow:hidden}
  video{position:fixed;inset:0;width:100%;height:100%;object-fit:contain;background:#000}
</style>
</head>
<body>
<video id="v" controls playsinline webkit-playsinline preload="auto"></video>
<script>
(function(){
  var clipPath = ${JSON.stringify(clipPath)};
  var v = document.getElementById('v');
  var readySent = false;
  var retries = 0;
  var maxRetries = 10;
  function post(p){window.ReactNativeWebView&&window.ReactNativeWebView.postMessage(JSON.stringify(p))}
  function markReady(reason){
    if(readySent)return;
    readySent=true;
    post({type:'ready',reason:reason});
  }
  function load(){
    v.src = clipPath + (retries ? ('?r='+retries+'&t='+Date.now()) : '');
    post({type:'load',attempt:retries,path:clipPath});
  }
  v.addEventListener('loadedmetadata',function(){
    post({type:'metadata',duration:v.duration,readyState:v.readyState});
    if(isFinite(v.duration)&&v.duration>0)markReady('metadata');
  });
  v.addEventListener('loadeddata',function(){markReady('loadeddata')});
  v.addEventListener('canplay',function(){markReady('canplay')});
  v.addEventListener('playing',function(){post({type:'playing'});markReady('playing')});
  v.addEventListener('durationchange',function(){
    if(isFinite(v.duration)&&v.duration>0){
      post({type:'duration',sec:v.duration});
      markReady('duration');
    }
  });
  v.addEventListener('progress',function(){
    if(!v.buffered.length)return;
    var end=v.buffered.end(v.buffered.length-1);
    if(end>0.25)markReady('buffered');
    post({type:'buffered',sec:end});
  });
  v.addEventListener('error',function(){
    var code=v.error?v.error.code:0;
    post({type:'error',code:code,retries:retries});
    if(retries<maxRetries){
      retries++;
      setTimeout(load,2000);
    }else{
      post({type:'fallback'});
    }
  });
  load();
  v.play().catch(function(){});
})();
</script>
</body>
</html>`;
}

function EventClipPlayer({
    clipUrl, adminUrl, authHeaders, mode, onStarted, onProgress, onError, onFallback, retryKey,
}) {
    const mountTs = useRef(Date.now());
    const baseUrl = useMemo(
        () => (adminUrl?.endsWith('/') ? adminUrl : `${adminUrl}/`),
        [adminUrl],
    );
    const clipPath = useMemo(
        () => getClipRelativePath(adminUrl, clipUrl),
        [adminUrl, clipUrl],
    );
    const html = useMemo(
        () => (mode === 'html' ? buildClipPlayerHtml(clipPath) : null),
        [mode, clipPath],
    );
    const directSource = useMemo(
        () => ({ uri: clipUrl, headers: authHeaders }),
        [clipUrl, authHeaders],
    );

    useEffect(() => {
        mountTs.current = Date.now();
        console.log(`${LOG} mount mode=${mode} path=${clipPath}${retryKey > 0 ? ` retry=${retryKey}` : ''}`);
        console.log(`${LOG} url=${clipUrl}`);
    }, [clipUrl, clipPath, mode, retryKey]);

    const logPhase = (phase, extra) => {
        const ms = Date.now() - mountTs.current;
        console.log(`${LOG} ${phase} +${ms}ms${extra ? ` ${extra}` : ''}`);
    };

    const handleMessage = useCallback((e) => {
        let data;
        try { data = JSON.parse(e.nativeEvent.data); } catch { return; }
        if (data.type === 'ready' || data.type === 'playing') {
            logPhase(`video.${data.type}`, data.reason || '');
            onStarted?.(data.type);
        } else if (data.type === 'duration' || data.type === 'buffered' || data.type === 'metadata') {
            logPhase(`video.${data.type}`, JSON.stringify(data));
            onProgress?.(data);
        } else if (data.type === 'load') {
            logPhase('video.load', `attempt=${data.attempt}`);
        } else if (data.type === 'error') {
            logPhase('video.error', `code=${data.code} retries=${data.retries}`);
            if (data.retries >= 10) onError?.('video', data.code);
        } else if (data.type === 'fallback') {
            logPhase('video.fallback', 'switching to direct MP4 WebView');
            onFallback?.();
        }
    }, [onStarted, onProgress, onError, onFallback]);

    if (mode === 'direct') {
        return (
            <WebView
                key={`direct-${clipUrl}-${retryKey}`}
                source={directSource}
                style={styles.webview}
                backgroundColor="#000"
                scrollEnabled={false}
                allowsInlineMediaPlayback
                mediaPlaybackRequiresUserAction={false}
                allowsFullscreenVideo
                originWhitelist={['*']}
                javaScriptEnabled
                onLoadStart={() => {
                    logPhase('direct.onLoadStart');
                    onStarted?.('loadStart');
                }}
                onLoadProgress={({ nativeEvent }) => {
                    logPhase('direct.onLoadProgress', `progress=${nativeEvent.progress.toFixed(3)}`);
                }}
                onLoad={() => logPhase('direct.onLoad', 'stream complete')}
                onError={(e) => {
                    logPhase('direct.onError', JSON.stringify(e.nativeEvent));
                    onError?.('webview');
                }}
                onHttpError={(e) => {
                    const code = e.nativeEvent.statusCode;
                    logPhase('direct.onHttpError', `status=${code}`);
                    if (code >= 400) onError?.('http', code);
                }}
            />
        );
    }

    return (
        <WebView
            key={`html-${clipPath}-${retryKey}`}
            source={{ html, baseUrl }}
            style={styles.webview}
            backgroundColor="#000"
            scrollEnabled={false}
            allowsInlineMediaPlayback
            mediaPlaybackRequiresUserAction={false}
            allowsFullscreenVideo
            originWhitelist={['*']}
            javaScriptEnabled
            domStorageEnabled
            onMessage={handleMessage}
            onLoad={() => logPhase('html.onLoad')}
            onError={(e) => {
                logPhase('html.onError', JSON.stringify(e.nativeEvent));
                onFallback?.();
            }}
        />
    );
}

export default function FrigateEventPlayerModal({
    visible,
    event,
    adminUrl,
    authHeaders = {},
    onClose,
}) {
    const [playerStarted, setPlayerStarted] = useState(false);
    const [playerError, setPlayerError] = useState(false);
    const [showGrowingBadge, setShowGrowingBadge] = useState(false);
    const [playerMode, setPlayerMode] = useState('html');
    const [retryKey, setRetryKey] = useState(0);
    const retryTimerRef = useRef(null);
    const retryCountRef = useRef(0);
    const startedRef = useRef(false);

    const eventId = event?.id ? String(event.id) : null;

    const authToken = authHeaders?.Authorization ?? '';
    const requestHeaders = useMemo(
        () => normalizeAuthHeaders(authHeaders),
        [authToken],
    );

    const clipUrl = useMemo(() => {
        if (!visible || !adminUrl || !event) return null;
        const url = getEventPlayUrl(adminUrl, event);
        if (url) {
            const resolvedEnd = resolveEventEndTime(event);
            console.log(`${LOG} url built event=${event?.id} camera=${event?.camera}`
                + ` window=${event?.start_time}→${resolvedEnd}`
                + `${event?.end_time == null ? ' (end_time missing, defaulted)' : ''}`);
            console.log(`${LOG} url=${url}`);
        }
        return url;
    }, [visible, adminUrl, event?.id, event?.camera, event?.start_time, event?.end_time]);

    const thumbUrl = eventId && adminUrl ? getEventThumbnailUrl(adminUrl, eventId) : null;

    useEffect(() => {
        setPlayerStarted(false);
        setPlayerError(false);
        setShowGrowingBadge(false);
        setPlayerMode('html');
        setRetryKey(0);
        retryCountRef.current = 0;
        startedRef.current = false;
        if (retryTimerRef.current) {
            clearTimeout(retryTimerRef.current);
            retryTimerRef.current = null;
        }
    }, [clipUrl]);

    useEffect(() => {
        if (!playerStarted) {
            setShowGrowingBadge(false);
            return undefined;
        }
        console.log(`${LOG} player started — hiding growing badge in ${GROWING_BADGE_MS}ms`);
        setShowGrowingBadge(true);
        const t = setTimeout(() => {
            console.log(`${LOG} growing badge auto-hidden`);
            setShowGrowingBadge(false);
        }, GROWING_BADGE_MS);
        return () => clearTimeout(t);
    }, [playerStarted, clipUrl]);

    useEffect(() => () => {
        if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    }, []);

    useEffect(() => {
        if (!visible) return undefined;
        Audio.setAudioModeAsync({
            playsInSilentModeIOS: true,
            staysActiveInBackground: false,
            shouldDuckAndroid: true,
        }).catch(() => {});
        return undefined;
    }, [visible]);

    const handleStarted = useCallback((phase) => {
        if (!startedRef.current) {
            console.log(`${LOG} playback ready phase=${phase}`);
        }
        startedRef.current = true;
        setPlayerStarted(true);
        retryCountRef.current = 0;
        if (retryTimerRef.current) {
            clearTimeout(retryTimerRef.current);
            retryTimerRef.current = null;
        }
    }, []);

    const scheduleRetry = useCallback(() => {
        if (startedRef.current) return;
        if (retryCountRef.current >= CLIP_MAX_RETRIES) {
            console.log(`${LOG} max retries (${CLIP_MAX_RETRIES}) — showing error`);
            setPlayerError(true);
            return;
        }
        retryCountRef.current += 1;
        console.log(`${LOG} scheduling retry ${retryCountRef.current}/${CLIP_MAX_RETRIES} in ${CLIP_RETRY_MS}ms`);
        retryTimerRef.current = setTimeout(() => {
            console.log(`${LOG} retrying now (key=${retryCountRef.current})`);
            setRetryKey((k) => k + 1);
        }, CLIP_RETRY_MS);
    }, []);

    const handleFallback = useCallback(() => {
        console.log(`${LOG} falling back to direct MP4 WebView`);
        setPlayerMode('direct');
        startedRef.current = false;
        setPlayerStarted(false);
    }, []);

    const handleProgress = useCallback((data) => {
        if (data.type === 'duration' && Number.isFinite(data.sec)) {
            console.log(`${LOG} duration=${data.sec.toFixed(1)}s`);
        }
        if (data.type === 'buffered' && Number.isFinite(data.sec)) {
            console.log(`${LOG} buffered=${data.sec.toFixed(1)}s`);
        }
    }, []);

    const handleError = useCallback((kind, code) => {
        if (startedRef.current) {
            console.log(`${LOG} error after start ignored kind=${kind} code=${code ?? 'n/a'}`);
            return;
        }
        console.log(`${LOG} load failed kind=${kind} code=${code ?? 'n/a'} — will retry`);
        scheduleRetry();
    }, [scheduleRetry]);

    if (!event) return null;

    const title = formatCameraName(event.camera) || 'Event';
    const subtitle = [
        event.label,
        event.sub_label,
    ].filter(Boolean).join(' · ');
    const when = formatEventTime(event.start_time);
    const isRetrying = retryKey > 0 && !playerStarted && !playerError;
    const showSpinner = clipUrl && !playerStarted && !playerError;
    const loadingHint = isRetrying
        ? 'Frigate is still saving the clip — retrying…'
        : 'Tap play on the video controls once the first seconds are ready';

    return (
        <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
            <View style={styles.container}>
                <View style={styles.header}>
                    <View style={styles.headerTextCol}>
                        <Text style={styles.title} numberOfLines={1}>{title}</Text>
                        {subtitle ? (
                            <Text style={styles.label} numberOfLines={1}>{subtitle}</Text>
                        ) : null}
                        {when ? (
                            <View style={styles.timeRow}>
                                <Clock size={11} color="rgba(255,255,255,0.35)" />
                                <Text style={styles.timeText}>{when}</Text>
                            </View>
                        ) : null}
                    </View>
                    <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={12}>
                        <X size={24} color="#fff" />
                    </TouchableOpacity>
                </View>

                <View style={styles.playerWrap}>
                    {!clipUrl && (
                        <View style={styles.centerMsg}>
                            <Text style={styles.msgText}>No playback URL for this event</Text>
                        </View>
                    )}

                    {clipUrl && playerError && (
                        <View style={styles.centerMsg}>
                            {thumbUrl ? (
                                <Image
                                    source={{ uri: thumbUrl, headers: requestHeaders }}
                                    style={styles.errorThumb}
                                    resizeMode="contain"
                                />
                            ) : null}
                            <Text style={styles.msgText}>Could not load clip</Text>
                            <Text style={styles.msgHint}>Frigate may still be saving it — try again shortly</Text>
                        </View>
                    )}

                    {clipUrl && !playerError && (
                        <>
                            {!playerStarted && thumbUrl ? (
                                <Image
                                    source={{ uri: thumbUrl, headers: requestHeaders }}
                                    style={StyleSheet.absoluteFill}
                                    resizeMode="contain"
                                />
                            ) : null}

                            {showSpinner && (
                                <View style={styles.loadingOverlay} pointerEvents="none">
                                    <ActivityIndicator size="large" color="#8947ca" />
                                    <Text style={styles.loadingText}>
                                        {isRetrying ? 'Waiting for clip…' : 'Opening clip…'}
                                    </Text>
                                    <Text style={styles.loadingHint}>{loadingHint}</Text>
                                </View>
                            )}

                            {showGrowingBadge && (
                                <View style={styles.growingBadge} pointerEvents="none">
                                    <Text style={styles.growingText}>
                                        Clip may still be growing — use controls to play
                                    </Text>
                                </View>
                            )}

                            <EventClipPlayer
                                clipUrl={clipUrl}
                                adminUrl={adminUrl}
                                authHeaders={requestHeaders}
                                mode={playerMode}
                                retryKey={retryKey}
                                onStarted={handleStarted}
                                onProgress={handleProgress}
                                onError={handleError}
                                onFallback={handleFallback}
                            />
                        </>
                    )}
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0a0a0a',
        paddingTop: 52,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        paddingHorizontal: 16,
        paddingBottom: 14,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.08)',
    },
    headerTextCol: {
        flex: 1,
        marginRight: 8,
        gap: 3,
    },
    title: {
        color: '#fff',
        fontSize: 18,
        fontFamily: CF.semibold,
        textTransform: 'capitalize',
    },
    label: {
        color: '#c49ef0',
        fontSize: 13,
        fontFamily: CF.medium,
        textTransform: 'capitalize',
    },
    timeRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        marginTop: 2,
    },
    timeText: {
        color: 'rgba(255,255,255,0.4)',
        fontSize: 12,
        fontFamily: CF.regular,
    },
    closeBtn: {
        padding: 8,
        marginTop: -4,
    },
    playerWrap: {
        flex: 1,
        backgroundColor: '#000',
        overflow: 'hidden',
    },
    webview: {
        flex: 1,
        backgroundColor: 'transparent',
    },
    loadingOverlay: {
        ...StyleSheet.absoluteFillObject,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        backgroundColor: 'rgba(0,0,0,0.55)',
        zIndex: 2,
    },
    loadingText: {
        color: 'rgba(255,255,255,0.85)',
        fontSize: 14,
        fontFamily: CF.medium,
    },
    loadingHint: {
        color: 'rgba(255,255,255,0.35)',
        fontSize: 12,
        fontFamily: CF.regular,
        textAlign: 'center',
        paddingHorizontal: 32,
    },
    growingBadge: {
        position: 'absolute',
        top: 12,
        left: 12,
        right: 12,
        zIndex: 3,
        alignItems: 'center',
    },
    growingText: {
        color: 'rgba(255,255,255,0.7)',
        fontSize: 11,
        fontFamily: CF.medium,
        backgroundColor: 'rgba(0,0,0,0.55)',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 8,
        overflow: 'hidden',
    },
    centerMsg: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 32,
        gap: 10,
    },
    errorThumb: {
        width: '100%',
        height: 200,
        marginBottom: 8,
        opacity: 0.6,
    },
    msgText: {
        color: 'rgba(255,255,255,0.6)',
        fontSize: 15,
        fontFamily: CF.semibold,
        textAlign: 'center',
    },
    msgHint: {
        color: 'rgba(255,255,255,0.35)',
        fontSize: 12,
        fontFamily: CF.regular,
        textAlign: 'center',
    },
});
