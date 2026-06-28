import { isPcmPlayerAvailable } from './nativeAudio';

const SAMPLE_RATE = 24000;

function getNativePlayer() {
    if (!isPcmPlayerAvailable()) {
        throw new Error(
            'expo-pcm-player native module missing. Rebuild the native app.',
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

    enqueue(pcmBase64) {
        void this.ensurePrepared(this.route).then(() => {
            this._module().playPcm(pcmBase64).catch((e) => {
                console.warn('[PcmPlayer] playPcm', e?.message ?? e);
            });
        });
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
