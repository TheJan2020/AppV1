import { getButlerAudioBackend } from './nativeAudio';
import { PcmPlayer } from './PcmPlayer';
import { PcmRecorder } from './PcmRecorder';

export function createButlerPcmPlayer() {
    const backend = getButlerAudioBackend();
    if (backend === 'native') return new PcmPlayer();
    throw new Error('Butler voice audio is not available on this device.');
}

export function createButlerPcmRecorder() {
    const backend = getButlerAudioBackend();
    if (backend === 'native') return new PcmRecorder();
    throw new Error('Butler voice microphone is not available on this device.');
}
