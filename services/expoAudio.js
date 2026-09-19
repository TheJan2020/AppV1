import { Platform } from 'react-native';
import {
    AudioModule,
    RecordingPresets,
    createAudioPlayer,
    requestRecordingPermissionsAsync,
    setAudioModeAsync,
    setIsAudioActiveAsync,
} from 'expo-audio';

const RINGTONE_ASSET = require('../assets/sounds/intercom-ring.wav');

export {
    RecordingPresets,
    createAudioPlayer,
    requestRecordingPermissionsAsync,
    setAudioModeAsync,
};

export function createAudioRecorder(options = RecordingPresets.HIGH_QUALITY) {
    const platformOptions = {
        extension: options.extension,
        sampleRate: options.sampleRate,
        numberOfChannels: options.numberOfChannels,
        bitRate: options.bitRate,
        isMeteringEnabled: options.isMeteringEnabled ?? false,
        directory: options.directory,
        ...(Platform.OS === 'ios'
            ? options.ios
            : Platform.OS === 'android'
                ? options.android
                : options.web),
    };
    return new AudioModule.AudioRecorder(platformOptions);
}

export async function startAudioRecording(options = RecordingPresets.HIGH_QUALITY) {
    const recorder = createAudioRecorder(options);
    await recorder.prepareToRecordAsync();
    recorder.record();
    return recorder;
}

export async function stopAudioRecording(recorder) {
    if (!recorder) return null;
    try {
        await recorder.stop();
    } catch (_) { /* already stopped */ }
    const uri = recorder.uri;
    try {
        recorder.release?.();
    } catch (_) { /* ignore */ }
    return uri;
}

export function releaseAudioPlayer(player) {
    if (!player) return;
    try {
        player._pwRingSub?.remove?.();
    } catch (_) { /* ignore */ }
    try {
        player.pause();
    } catch (_) { /* ignore */ }
    try {
        player.release?.();
    } catch (_) { /* ignore */ }
}

/** Speaker + voice-call audio mode. Uses the local PCM module when a native build is present. */
export async function routeCallAudioToSpeaker() {
    await setAudioModeAsync({
        playsInSilentMode: true,
        allowsRecording: true,
        interruptionMode: 'doNotMix',
        shouldRouteThroughEarpiece: false,
        shouldPlayInBackground: true,
    });
    try {
        const pcm = require('../modules/expo-pcm-player').default;
        await pcm.setRoute('SPEAKER');
    } catch {
        /* Expo Go has no ExpoPcmPlayer; expo-audio mode above still applies. */
    }
}

export async function startIntercomRingtone() {
    try {
        await setIsAudioActiveAsync(true);
    } catch { /* Expo Go still plays without this */ }
    setAudioModeAsync({
        playsInSilentMode: true,
        allowsRecording: false,
        interruptionMode: 'doNotMix',
        shouldRouteThroughEarpiece: false,
        shouldPlayInBackground: true,
    }).catch(() => {});

    const player = createAudioPlayer(RINGTONE_ASSET);
    player.loop = true;
    player.volume = 1;
    player.muted = false;
    player.play();
    const sub = player.addListener?.('playbackStatusUpdate', (status) => {
        if (status?.error) {
            console.warn('[Intercom] ringtone status', status.error);
        }
        if (status?.isLoaded && !status.playing && !status.didJustFinish) {
            try { player.play(); } catch { /* ignore */ }
        }
    });
    player._pwRingSub = sub;
    console.log('[Intercom] ringtone start');
    return player;
}
