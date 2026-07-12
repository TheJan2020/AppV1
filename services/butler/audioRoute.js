import { isPcmPlayerAvailable } from './nativeAudio';

/** @typedef {{ bluetoothConnected: boolean, wiredHeadset: boolean, hasExternalAudio: boolean, outputName: string, outputType: string }} ButlerRouteInfo */

function getPlayerModule() {
    if (!isPcmPlayerAvailable()) return null;
    try {
        return require('expo-pcm-player').default;
    } catch {
        return null;
    }
}

/** Read current speaker / BT / wired headset state (iOS native). */
export async function getButlerAudioRouteInfo() {
    const mod = getPlayerModule();
    if (!mod?.getAudioRouteInfo) {
        return {
            bluetoothConnected: false,
            wiredHeadset: false,
            hasExternalAudio: false,
            outputName: '',
            outputType: '',
        };
    }
    try {
        const info = await mod.getAudioRouteInfo();
        return {
            bluetoothConnected: Boolean(info?.bluetoothConnected),
            wiredHeadset: Boolean(info?.wiredHeadset),
            hasExternalAudio: Boolean(info?.hasExternalAudio),
            outputName: String(info?.outputName || ''),
            outputType: String(info?.outputType || ''),
        };
    } catch (e) {
        console.warn('[ButlerAudioRoute] getAudioRouteInfo', e?.message ?? e);
        return {
            bluetoothConnected: false,
            wiredHeadset: false,
            hasExternalAudio: false,
            outputName: '',
            outputType: '',
        };
    }
}

/** HEADSET when BT or wired headphones are available; otherwise SPEAKER. */
export function suggestButlerRoute(info) {
    if (info?.hasExternalAudio || info?.bluetoothConnected || info?.wiredHeadset) {
        return 'HEADSET';
    }
    return 'SPEAKER';
}

/** Human label for route row subtitle. */
export function formatAudioRouteLabel(info, selectedRoute) {
    if (selectedRoute === 'HEADSET') {
        if (info?.bluetoothConnected) {
            const name = info.outputName?.trim();
            return name ? `Bluetooth · ${name}` : 'Bluetooth headset';
        }
        if (info?.wiredHeadset) {
            return 'Wired headset';
        }
        return 'Earpiece (connect Bluetooth or plug in headphones)';
    }
    if (info?.bluetoothConnected) {
        const name = info.outputName?.trim();
        return name ? `Speaker (BT available: ${name})` : 'Speaker (Bluetooth available)';
    }
    if (info?.wiredHeadset) {
        return 'Speaker (headset plugged in)';
    }
    return 'Phone speaker';
}

/**
 * Subscribe to iOS route changes (BT connect/disconnect, plug/unplug).
 * @returns {() => void} unsubscribe
 */
export function subscribeButlerAudioRoute(onChange) {
    const mod = getPlayerModule();
    if (!mod?.addRouteChangeListener) return () => {};

    const sub = mod.addRouteChangeListener((info) => {
        onChange({
            bluetoothConnected: Boolean(info?.bluetoothConnected),
            wiredHeadset: Boolean(info?.wiredHeadset),
            hasExternalAudio: Boolean(info?.hasExternalAudio),
            outputName: String(info?.outputName || ''),
            outputType: String(info?.outputType || ''),
        });
    });

    return () => {
        mod.removeRouteChangeSubscription?.(sub);
    };
}
