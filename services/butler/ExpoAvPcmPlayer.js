import { Audio, InterruptionModeAndroid, InterruptionModeIOS } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import { Buffer } from 'buffer';
import { wrapPcm16InWav } from './pcmWav';

const PLAY_SAMPLE_RATE = 24000;
const BATCH_MS = 100;
const MIN_BATCH_BYTES = 5760;

/** expo-av playback for Expo Go — batches PCM to reduce gaps between chunks. */
export class ExpoAvPcmPlayer {
    constructor() {
        this.prepared = false;
        this.preparePromise = null;
        this.route = 'SPEAKER';
        this.queue = [];
        this.playing = false;
        this.currentSound = null;
        this.playTimeout = null;
        this.pendingBuffers = [];
        this.batchTimer = null;
        this.turnEnded = false;
    }

    async _setAudioMode() {
        await Audio.setAudioModeAsync({
            allowsRecordingIOS: true,
            playsInSilentModeIOS: true,
            interruptionModeIOS: InterruptionModeIOS.DoNotMix,
            interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
            playThroughEarpieceAndroid: this.route !== 'SPEAKER',
            staysActiveInBackground: false,
            shouldDuckAndroid: true,
        });
    }

    enqueue(pcmBase64) {
        if (!pcmBase64) return;
        this.turnEnded = false;
        this.pendingBuffers.push(Buffer.from(pcmBase64, 'base64'));
        void this.ensurePrepared(this.route).then(() => this._scheduleBatch());
    }

    markTurnEnded() {
        this.turnEnded = true;
        this._flushBatch(true);
    }

    _pendingBytes() {
        return this.pendingBuffers.reduce((sum, b) => sum + b.length, 0);
    }

    _scheduleBatch() {
        if (this.batchTimer) return;
        if (this.turnEnded) {
            this._flushBatch(true);
            return;
        }
        if (this._pendingBytes() >= MIN_BATCH_BYTES) {
            this._flushBatch(false);
            return;
        }
        this.batchTimer = setTimeout(() => {
            this.batchTimer = null;
            this._flushBatch(false);
            if (this.pendingBuffers.length > 0) this._scheduleBatch();
        }, BATCH_MS);
    }

    _flushBatch(force) {
        if (this.batchTimer) {
            clearTimeout(this.batchTimer);
            this.batchTimer = null;
        }
        if (this.pendingBuffers.length === 0) return;
        if (!force && this._pendingBytes() < MIN_BATCH_BYTES && !this.turnEnded) return;
        const combined = Buffer.concat(this.pendingBuffers);
        this.pendingBuffers = [];
        this.queue.push(combined.toString('base64'));
        if (!this.playing) this._playNext();
    }

    _clearPlayTimeout() {
        if (this.playTimeout) {
            clearTimeout(this.playTimeout);
            this.playTimeout = null;
        }
    }

    async _playNext() {
        if (this.queue.length === 0) {
            this.playing = false;
            return;
        }
        this.playing = true;
        const pcmB64 = this.queue.shift();
        const wavB64 = wrapPcm16InWav(pcmB64, PLAY_SAMPLE_RATE);
        const uri = `${FileSystem.cacheDirectory}butler_${Date.now()}_${Math.random().toString(36).slice(2)}.wav`;
        const durationMs = Math.max(40, (Buffer.from(pcmB64, 'base64').length / 2 / PLAY_SAMPLE_RATE) * 1000 + 80);
        try {
            await FileSystem.writeAsStringAsync(uri, wavB64, { encoding: FileSystem.EncodingType.Base64 });
            const { sound } = await Audio.Sound.createAsync({ uri }, { shouldPlay: true, volume: 1.0 });
            this.currentSound = sound;
            const advance = () => {
                if (this.currentSound !== sound) return;
                this._clearPlayTimeout();
                sound.unloadAsync().catch(() => {});
                this.currentSound = null;
                FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
                this._playNext();
            };
            sound.setOnPlaybackStatusUpdate((status) => {
                if (status.didJustFinish) advance();
            });
            this.playTimeout = setTimeout(advance, durationMs);
        } catch (e) {
            console.warn('[ExpoAvPcmPlayer] play', e?.message ?? e);
            this._clearPlayTimeout();
            FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
            this._playNext();
        }
    }

    async setRoute(route) {
        this.route = route === 'SPEAKER' ? 'SPEAKER' : 'HEADSET';
        if (this.prepared) await this._setAudioMode();
    }

    async ensurePrepared(route = this.route) {
        this.route = route === 'SPEAKER' ? 'SPEAKER' : 'HEADSET';
        if (this.prepared) return;
        if (this.preparePromise) {
            await this.preparePromise;
            return;
        }
        this.preparePromise = (async () => {
            await this._setAudioMode();
            this.prepared = true;
        })();
        try {
            await this.preparePromise;
        } finally {
            this.preparePromise = null;
        }
    }

    async waitUntilIdle(timeoutMs = 45000) {
        this._flushBatch(true);
        const start = Date.now();
        while (this.playing || this.queue.length > 0 || this.pendingBuffers.length > 0 || this.batchTimer) {
            if (Date.now() - start > timeoutMs) break;
            await new Promise((r) => setTimeout(r, 40));
        }
        await new Promise((r) => setTimeout(r, 250));
        this._flushBatch(true);
        while (this.playing || this.queue.length > 0) {
            if (Date.now() - start > timeoutMs) break;
            await new Promise((r) => setTimeout(r, 40));
        }
    }

    async flush() {
        this._clearPlayTimeout();
        if (this.batchTimer) clearTimeout(this.batchTimer);
        this.batchTimer = null;
        this.pendingBuffers = [];
        this.prepared = false;
        this.preparePromise = null;
        this.queue = [];
        this.playing = false;
        this.turnEnded = false;
        if (this.currentSound) {
            try {
                await this.currentSound.stopAsync();
                await this.currentSound.unloadAsync();
            } catch (_) { /* ignore */ }
            this.currentSound = null;
        }
    }
}
