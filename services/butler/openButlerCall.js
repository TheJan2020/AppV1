import { Alert } from 'react-native';
import { preflightButlerCall } from './preflightButlerCall';
import { syncButlerHaConfig } from '../../utils/butlerBackend';
import { getNativeAudioStatus } from './nativeAudio';

let lastHaSyncKey = '';
let lastHaSyncAt = 0;
const HA_SYNC_TTL_MS = 5 * 60 * 1000;

async function syncButlerHaConfigIfNeeded(haUrl, haToken) {
    const ha_url = String(haUrl || '').trim();
    const ha_token = String(haToken || '').trim();
    if (!ha_url || !ha_token) return;

    const syncKey = `${ha_url}|${ha_token.slice(0, 12)}`;
    if (syncKey === lastHaSyncKey && Date.now() - lastHaSyncAt < HA_SYNC_TTL_MS) {
        return;
    }

    const sync = await syncButlerHaConfig(ha_url, ha_token);
    if (sync.ok) {
        lastHaSyncKey = syncKey;
        lastHaSyncAt = Date.now();
    } else {
        console.warn('[Butler] HA sync failed:', sync.error);
    }
}

/**
 * Instant gate before showing the call UI — native modules only (no network).
 */
export function canOpenButlerCall() {
    const native = getNativeAudioStatus();
    if (native.ready) return { ok: true };
    return {
        ok: false,
        error: native.message ?? 'Butler voice is not supported on this device.',
    };
}

/**
 * Health check + HA sync in background after the modal is already visible.
 */
export function runButlerBackgroundSetup({ haUrl, haToken } = {}) {
    void syncButlerHaConfigIfNeeded(haUrl, haToken);
    void preflightButlerCall().catch((err) => {
        console.warn('[Butler] background preflight:', err?.message ?? err);
    });
}

/**
 * Full preflight before opening UI — use for settings/diagnostics, not tab taps.
 */
export async function prepareButlerCall({ haUrl, haToken } = {}) {
    try {
        const pre = await preflightButlerCall({ useCache: false });
        if (!pre.ok) {
            Alert.alert(
                pre.stage === 'native' ? 'Voice not available' : 'Butler unavailable',
                pre.error ?? 'Unknown error',
            );
            return false;
        }
    } catch (err) {
        console.warn('[Butler] preflight failed:', err?.message ?? err);
        Alert.alert(
            'Voice not available',
            err?.message ?? 'Could not check voice modules. Use a dev build: npx expo run:ios --device',
        );
        return false;
    }

    await syncButlerHaConfigIfNeeded(haUrl, haToken);
    return true;
}
