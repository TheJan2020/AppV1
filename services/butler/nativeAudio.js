import { NativeModules, Platform } from 'react-native';
import Constants from 'expo-constants';

let pcmPlayerAvailable = null;
let liveMicAvailable = null;

function isExpoGo() {
    return Constants.appOwnership === 'expo';
}

export function getButlerAudioBackend() {
    if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
        return 'unsupported';
    }
    if (isPcmPlayerAvailable() && isLiveMicAvailable()) {
        return 'native';
    }
    return 'expo-av';
}

export function isPcmPlayerAvailable() {
    if (pcmPlayerAvailable !== null) return pcmPlayerAvailable;
    if (Platform.OS !== 'ios') {
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

export function getNativeAudioStatus() {
    const backend = getButlerAudioBackend();
    const pcm = isPcmPlayerAvailable();
    const mic = isLiveMicAvailable();
    const expoGo = isExpoGo();

    if (backend === 'native') {
        return {
            ready: true,
            backend: 'native',
            pcm: true,
            mic: true,
            platform: Platform.OS,
            expoGo,
            message: null,
        };
    }

    if (backend === 'expo-av') {
        return {
            ready: true,
            backend: 'expo-av',
            pcm: false,
            mic: false,
            platform: Platform.OS,
            expoGo,
            message: null,
        };
    }

    return {
        ready: false,
        backend: 'unsupported',
        pcm,
        mic,
        platform: Platform.OS,
        expoGo,
        message: 'Butler voice is not supported on this platform.',
    };
}
