import { Platform } from 'react-native';
import { isPcmPlayerAvailable } from './nativeAudio';
import { amplifyPcm16Base64 } from './pcmGain';

const SAMPLE_RATE = 24000;

/**
 * Gemini Live replies are often quiet on phone speaker — boost playback.
 * Speaker uses a lower boost than headset: loud speakerphone + open mic is the
 * main echo path that feeds Butler's own voice back into STT.
 */
const OUTPUT_GAIN_SPEAKER = Platform.OS === 'ios' ? 2.0 : 1.8;
const OUTPUT_GAIN_HEADSET = Platform.OS === 'ios' ? 3.0 : 2.5;

function getNativePlayer() {
    if (!isPcmPlayerAvailable()) {
        throw new Error(
            'expo-pcm-player native module missing. Rebuild: npx expo run:android / npx expo run:ios',
        );
    }
    return require('expo-pcm-player').default;
}

/** Streams 24 kHz PCM from Butler backend to native AVAudioEngine. */
export class PcmPlayer {
    constructor() {
        this.prepared = false;
        this.preparePromise = null;
        this.native = null;
        this.route = 'SPEAKER';
    }

    _module() {
        if (!this.native) this.native = getNativePlayer();
        return this.native;
    }

    _outputGain() {
        return this.route === 'SPEAKER' ? OUTPUT_GAIN_SPEAKER : OUTPUT_GAIN_HEADSET;
    }

    enqueue(pcmBase64) {
        const boosted = amplifyPcm16Base64(pcmBase64, this._outputGain());
        void this.ensurePrepared(this.route).then(() => {
            this._module().playPcm(boosted).catch((e) => {
                console.warn('[PcmPlayer] playPcm', e?.message ?? e);
            });
        });
    }

    /** Stop queued TTS without tearing down the duplex AVAudioSession. */
    async clearPlayback() {
        if (!this.prepared) return;
        try {
            const mod = this._module();
            if (typeof mod.clearPlayback === 'function') {
                await mod.clearPlayback();
            }
        } catch (e) {
            console.warn('[PcmPlayer] clearPlayback', e?.message ?? e);
        }
    }

    async flush() {
        if (!this.prepared) return;
        this.prepared = false;
        this.preparePromise = null;
        try {
            await this._module().stop();
        } catch (e) {
            console.warn('[PcmPlayer] stop', e?.message ?? e);
        }
        this.native = null;
    }

    async _applyRoute() {
        const mod = this._module();
        if (typeof mod.setRoute !== 'function') return;
        try {
            await mod.setRoute(this.route);
            console.log('[PcmPlayer] route ->', this.route);
        } catch (e) {
            console.warn('[PcmPlayer] setRoute', e?.message ?? e);
        }
    }

    async setRoute(route) {
        this.route = route === 'SPEAKER' ? 'SPEAKER' : 'HEADSET';
        if (!this.prepared) return;
        await this._applyRoute();
    }

    async ensurePrepared(route = this.route) {
        this.route = route === 'SPEAKER' ? 'SPEAKER' : 'HEADSET';

        if (this.prepared) {
            await this._applyRoute();
            return;
        }

        if (this.preparePromise) {
            await this.preparePromise;
            await this._applyRoute();
            return;
        }

        this.preparePromise = (async () => {
            const mod = this._module();
            // Set preferred route BEFORE prepare so native session is not forced to speaker.
            if (typeof mod.setRoute === 'function') {
                try {
                    await mod.setRoute(this.route);
                } catch (e) {
                    console.warn('[PcmPlayer] pre-prepare setRoute', e?.message ?? e);
                }
            }
            await mod.prepare(SAMPLE_RATE);
            this.prepared = true;
            await this._applyRoute();
        })();

        try {
            await this.preparePromise;
        } finally {
            this.preparePromise = null;
        }
    }
}
