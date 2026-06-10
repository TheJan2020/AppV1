import { EventEmitter, requireNativeModule } from 'expo-modules-core';

let nativeModule = null;
let loadError = null;
let emitter = null;

function getNative() {
    if (nativeModule) return nativeModule;
    if (loadError) throw loadError;
    try {
        nativeModule = requireNativeModule('ExpoPcmPlayer');
        return nativeModule;
    } catch (e) {
        loadError = e;
        throw e;
    }
}

function getEmitter() {
    if (!emitter) emitter = new EventEmitter(getNative());
    return emitter;
}

/** Lazy proxy — does not touch native code until first method call. */
export default {
    prepare: (rate) => getNative().prepare(rate),
    playPcm: (b64) => getNative().playPcm(b64),
    stop: () => getNative().stop(),
    setRoute: (route) => getNative().setRoute(route),
    playRing: () => getNative().playRing?.(),
    getAudioRouteInfo: () => getNative().getAudioRouteInfo(),
    addRouteChangeListener: (listener) => getEmitter().addListener('onAudioRouteChange', listener),
    removeRouteChangeSubscription: (subscription) => subscription?.remove?.(),
};
