import { checkButlerBackendHealth } from '../../utils/butlerBackend';
import { getNativeAudioStatus } from './nativeAudio';

/**
 * Run before opening the Butler call UI. Fails fast with a user-visible message
 * instead of crashing the JS runtime (which triggers Expo "Refreshing…").
 */
export async function preflightButlerCall() {
    const native = getNativeAudioStatus();
    if (!native.ready) {
        return { ok: false, stage: 'native', error: native.message };
    }

    const health = await checkButlerBackendHealth();
    if (!health.ok) {
        const detail = health.error
            ? `${health.error}`
            : 'Connection failed';
        return {
            ok: false,
            stage: 'backend',
            error: `Cannot reach Butler at ${health.base}.\n\n${detail}`,
            base: health.base,
        };
    }

    if (!health.data?.ha_ready) {
        return {
            ok: false,
            stage: 'ha',
            error: 'Butler is up but Home Assistant is not connected. Open the app once (syncs HA), or set HA in http://<mac-ip>:8787/admin',
            base: health.base,
            health: health.data,
        };
    }

    return {
        ok: true,
        base: health.base,
        entities: health.data?.entities_cached ?? 0,
        areas: health.data?.areas ?? 0,
    };
}
