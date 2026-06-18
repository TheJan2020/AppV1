import { getButlerAudioBackend } from './nativeAudio';
import { PcmPlayer } from './PcmPlayer';
import { PcmRecorder } from './PcmRecorder';
import { ExpoAvPcmPlayer } from './ExpoAvPcmPlayer';
import { ExpoAvPcmRecorder } from './ExpoAvPcmRecorder';

export function createButlerPcmPlayer() {
    const backend = getButlerAudioBackend();
    if (backend === 'native') return new PcmPlayer();
    if (backend === 'expo-av') return new ExpoAvPcmPlayer();
    throw new Error('Butler voice audio is not available on this device.');
}

export function createButlerPcmRecorder() {
    const backend = getButlerAudioBackend();
    if (backend === 'native') return new PcmRecorder();
    if (backend === 'expo-av') return new ExpoAvPcmRecorder();
    throw new Error('Butler voice microphone is not available on this device.');
}
