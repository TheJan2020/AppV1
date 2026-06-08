import { NativeModules, Platform } from 'react-native';
import Constants from 'expo-constants';

let pcmPlayerAvailable = null;
let liveMicAvailable = null;

function isExpoGo() {
    return Constants.appOwnership === 'expo';
}

/**
 * Probe ExpoPcmPlayer without loading expo-pcm-player JS (lazy native only).
 */
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

/**
 * Probe RNLiveAudioStream without requiring react-native-live-audio-stream:
 * that package's index.js runs `new NativeEventEmitter(null)` at import time and crashes.
 */
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
    if (isExpoGo()) {
        return {
            ready: false,
            pcm: false,
            mic: false,
            platform: Platform.OS,
            expoGo: true,
            message:
                'Butler voice does not work in Expo Go. Build and open the dev client:\n\nnpx expo run:ios --device',
        };
    }

    const pcm = isPcmPlayerAvailable();
    const mic = isLiveMicAvailable();
    let message = null;
    if (!pcm && !mic) {
        message =
            'Voice audio modules are missing. Rebuild the dev client on a physical iPhone:\n\nnpx expo run:ios --device';
    } else if (!pcm) {
        message = 'Playback module (ExpoPcmPlayer) is missing. Rebuild:\n\nnpx expo run:ios --device';
    } else if (!mic) {
        message = 'Microphone module (RNLiveAudioStream) is missing. Rebuild:\n\nnpx expo run:ios --device';
    } else if (Platform.OS === 'android') {
        message = 'Butler voice is iOS-only in this build.';
    }
    return {
        ready: pcm && mic && Platform.OS === 'ios',
        pcm,
        mic,
        platform: Platform.OS,
        expoGo: false,
        message,
    };
}
