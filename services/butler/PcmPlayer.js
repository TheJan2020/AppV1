import { isPcmPlayerAvailable } from './nativeAudio';

const SAMPLE_RATE = 24000;

function getNativePlayer() {
    if (!isPcmPlayerAvailable()) {
        throw new Error(
            'expo-pcm-player native module missing. Rebuild the dev client: npx expo run:ios --device',
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
        this._preparingRoute = null;
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

    async setRoute(route) {
        this.route = route;
        if (!this.prepared) return;
        const mod = this._module();
        if (typeof mod.setRoute !== 'function') return;
        try {
            await mod.setRoute(route);
        } catch (e) {
            console.warn('[PcmPlayer] setRoute', e?.message ?? e);
        }
    }

    async ensurePrepared(route = 'SPEAKER') {
        if (this.prepared && this.route === route) return;
        if (this.preparePromise && this._preparingRoute === route) return this.preparePromise;
        this._preparingRoute = route;
        this.prepared = false;
        this.preparePromise = (async () => {
            const mod = this._module();
            await mod.prepare(SAMPLE_RATE);
            this.prepared = true;
            this.route = route;
            if (typeof mod.setRoute === 'function' && route !== 'SPEAKER') {
                try {
                    await mod.setRoute(route);
                } catch (e) {
                    console.warn('[PcmPlayer] setRoute after prepare', e?.message ?? e);
                }
            }
            this._preparingRoute = null;
        })();
        return this.preparePromise;
    }
}
