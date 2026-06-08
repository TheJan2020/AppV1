import { Buffer } from 'buffer';
import { Platform } from 'react-native';
import { isLiveMicAvailable } from './nativeAudio';

/** Boost quiet iPhone mics when held at arm's length / speakerphone. */
const INPUT_GAIN = Platform.OS === 'ios' ? 2.5 : 1;

function getLiveAudioStream() {
    if (!isLiveMicAvailable()) {
        throw new Error(
            'react-native-live-audio-stream missing. Rebuild dev client: npx expo run:ios --device',
        );
    }
    return require('react-native-live-audio-stream').default
        ?? require('react-native-live-audio-stream');
}

/**
 * 16 kHz mono PCM mic capture for Gemini Live (requires dev build).
 */
export class PcmRecorder {
    constructor() {
        this.started = false;
        this.onChunk = null;
        this.subscription = null;
        this.chunkCount = 0;
        this.LiveAudioStream = null;
    }

    start(onChunk) {
        if (this.started) return;
        const LiveAudioStream = getLiveAudioStream();
        this.LiveAudioStream = LiveAudioStream;
        this.onChunk = onChunk;
        this.chunkCount = 0;

        const initOpts = {
            sampleRate: 16000,
            channels: 1,
            bitsPerSample: 16,
            bufferSize: 2048,
        };
        if (Platform.OS === 'android') {
            initOpts.audioSource = 6;
        }
        LiveAudioStream.init(initOpts);

        this.subscription = LiveAudioStream.on('data', (data) => {
            this.chunkCount++;
            if (this.chunkCount === 1) {
                console.log('[PcmRecorder] first mic chunk');
            } else if (this.chunkCount % 100 === 0) {
                console.log(`[PcmRecorder] ${this.chunkCount} chunks sent`);
            }
            const out = INPUT_GAIN === 1 ? data : amplifyPcm16Base64(data, INPUT_GAIN);
            this.onChunk?.(out);
        });

        LiveAudioStream.start();
        this.started = true;
        console.log('[PcmRecorder] started');
    }

    stop() {
        if (!this.started) return;
        this.LiveAudioStream?.stop();
        this.subscription?.remove?.();
        this.subscription = null;
        this.onChunk = null;
        this.started = false;
        console.log(`[PcmRecorder] stopped (${this.chunkCount} chunks)`);
    }
}

function amplifyPcm16Base64(b64, gain) {
    const buf = Buffer.from(b64, 'base64');
    const out = Buffer.alloc(buf.length);
    const samples = Math.floor(buf.length / 2);
    for (let i = 0; i < samples; i++) {
        let s = buf.readInt16LE(i * 2) * gain;
        if (s > 32767) s = 32767;
        else if (s < -32768) s = -32768;
        out.writeInt16LE(s, i * 2);
    }
    return out.toString('base64');
}
