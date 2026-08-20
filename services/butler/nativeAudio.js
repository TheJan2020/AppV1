import { NativeModules, Platform } from 'react-native';

let pcmPlayerAvailable = null;
let liveMicAvailable = null;

export function getButlerAudioBackend() {
    if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
        return 'unsupported';
    }
    // Native path needs BOTH playback (expo-pcm-player) and mic (live-audio-stream).
    if (isPcmPlayerAvailable() && isLiveMicAvailable()) {
        return 'native';
    }
    return 'unsupported';
}

export function isPcmPlayerAvailable() {
    if (pcmPlayerAvailable !== null) return pcmPlayerAvailable;
    if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
        pcmPlayerAvailable = false;
        return false;
    }
    try {
        const { requireNativeModule } = require('expo-modules-core');
        requireNativeModule('ExpoPcmPlayer');
        pcmPlayerAvailable = true;
    } catch {
        pcmPlayerAvailable = false;
    }
    return pcmPlayerAvailable;
}

export function isLiveMicAvailable() {
    if (liveMicAvailable !== null) return liveMicAvailable;
    try {
        liveMicAvailable = Boolean(NativeModules.RNLiveAudioStream);
    } catch {
        liveMicAvailable = false;
    }
    return liveMicAvailable;
}

function rebuildHint() {
    if (Platform.OS === 'android') {
        return 'Voice needs a native rebuild. Run: npx expo run:android';
    }
    if (Platform.OS === 'ios') {
        return 'Voice needs a native rebuild. Run: npx expo run:ios --device';
    }
    return 'Butler voice is not supported on this platform.';
}

export function getNativeAudioStatus() {
    const backend = getButlerAudioBackend();
    const pcm = isPcmPlayerAvailable();
    const mic = isLiveMicAvailable();

    if (backend === 'native') {
        return {
            ready: true,
            backend: 'native',
            pcm: true,
            mic: true,
            platform: Platform.OS,
            message: null,
        };
    }

    const missing = [];
    if (!pcm) missing.push('playback');
    if (!mic) missing.push('microphone');
    const detail = missing.length
        ? `Missing native ${missing.join(' + ')} module. ${rebuildHint()}`
        : rebuildHint();

    return {
        ready: false,
        backend: 'unsupported',
        pcm,
        mic,
        platform: Platform.OS,
        message: detail,
    };
}
