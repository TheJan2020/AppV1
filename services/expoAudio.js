import { Platform } from 'react-native';
import {
    AudioModule,
    RecordingPresets,
    createAudioPlayer,
    requestRecordingPermissionsAsync,
    setAudioModeAsync,
} from 'expo-audio';

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
        player.pause();
    } catch (_) { /* ignore */ }
    try {
        player.release?.();
    } catch (_) { /* ignore */ }
}
