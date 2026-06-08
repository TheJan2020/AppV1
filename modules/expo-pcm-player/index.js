import { requireNativeModule } from 'expo-modules-core';

let nativeModule = null;
let loadError = null;

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

/** Lazy proxy — does not touch native code until first method call. */
export default {
    /** Native prepare accepts sampleRate only (route via setRoute). */
    prepare: (rate) => getNative().prepare(rate),
    playPcm: (b64) => getNative().playPcm(b64),
    stop: () => getNative().stop(),
    setRoute: (route) => getNative().setRoute(route),
    playRing: () => getNative().playRing?.(),
};
