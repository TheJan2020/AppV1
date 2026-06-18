import { Audio, InterruptionModeAndroid, InterruptionModeIOS } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import { extractPcmFromWavBase64 } from './pcmWav';

const CHUNK_MS = 120;
const SAMPLE_RATE = 16000;

const RECORD_OPTS = {
    isMeteringEnabled: false,
    android: {
        extension: '.wav',
        outputFormat: Audio.AndroidOutputFormat.DEFAULT,
        audioEncoder: Audio.AndroidAudioEncoder.DEFAULT,
        sampleRate: SAMPLE_RATE,
        numberOfChannels: 1,
        bitRate: SAMPLE_RATE * 16,
    },
    ios: {
        extension: '.wav',
        outputFormat: Audio.IOSOutputFormat.LINEARPCM,
        audioQuality: Audio.IOSAudioQuality.HIGH,
        sampleRate: SAMPLE_RATE,
        numberOfChannels: 1,
        bitRate: SAMPLE_RATE * 16,
        linearPCMBitDepth: 16,
        linearPCMIsBigEndian: false,
        linearPCMIsFloat: false,
    },
    web: { mimeType: 'audio/webm', bitsPerSecond: 128000 },
};

/** Chunked expo-av mic for Expo Go (no live-audio-stream native module). */
export class ExpoAvPcmRecorder {
    constructor() {
        this.started = false;
        this.onChunk = null;
        this.chunkCount = 0;
        this.paused = false;
        this.audioModeReady = false;
        this.activeRecording = null;
    }

    pause() {
        this.paused = true;
        void this._stopActiveRecording();
    }

    resume() {
        if (!this.started) return;
        this.paused = false;
        this.audioModeReady = false;
    }

    start(onChunk) {
        if (this.started) return;
        this.onChunk = onChunk;
        this.chunkCount = 0;
        this.paused = false;
        this.audioModeReady = false;
        this.started = true;
        void this._recordLoop();
    }

    async _stopActiveRecording() {
        const rec = this.activeRecording;
        this.activeRecording = null;
        if (!rec) return;
        try {
            await rec.stopAndUnloadAsync();
        } catch (_) { /* ignore */ }
    }

    async _ensureAudioMode() {
        await Audio.setAudioModeAsync({
            allowsRecordingIOS: true,
            playsInSilentModeIOS: true,
            interruptionModeIOS: InterruptionModeIOS.DoNotMix,
            interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
            playThroughEarpieceAndroid: false,
            staysActiveInBackground: false,
            shouldDuckAndroid: true,
        });
        this.audioModeReady = true;
    }

    async _recordLoop() {
        while (this.started) {
            if (this.paused) {
                await this._stopActiveRecording();
                await new Promise((r) => setTimeout(r, 40));
                continue;
            }
            let uri = null;
            try {
                await this._ensureAudioMode();
                const { recording } = await Audio.Recording.createAsync(RECORD_OPTS);
                this.activeRecording = recording;
                await new Promise((r) => setTimeout(r, CHUNK_MS));
                if (!this.started) {
                    await this._stopActiveRecording();
                    break;
                }
                if (this.paused) {
                    await this._stopActiveRecording();
                    continue;
                }
                await recording.stopAndUnloadAsync();
                this.activeRecording = null;
                uri = recording.getURI();
                if (uri && this.onChunk && !this.paused) {
                    const wavB64 = await FileSystem.readAsStringAsync(uri, {
                        encoding: FileSystem.EncodingType.Base64,
                    });
                    const pcmB64 = extractPcmFromWavBase64(wavB64);
                    if (pcmB64) {
                        this.chunkCount += 1;
                        this.onChunk(pcmB64);
                    }
                }
            } catch (e) {
                console.warn('[ExpoAvPcmRecorder]', e?.message ?? e);
                this.activeRecording = null;
                if (this.started && !this.paused) {
                    this.audioModeReady = false;
                    await new Promise((r) => setTimeout(r, 300));
                }
            } finally {
                if (uri) await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
            }
        }
    }

    stop() {
        if (!this.started) return;
        this.started = false;
        this.paused = false;
        this.audioModeReady = false;
        void this._stopActiveRecording();
        this.onChunk = null;
    }
}
