import { Alert } from 'react-native';
import { preflightButlerCall } from './preflightButlerCall';
import { syncButlerHaConfig } from '../../utils/butlerBackend';

/**
 * Gate opening the Butler modal: native modules + backend + optional HA sync.
 * Returns true only when safe to show the call UI (prevents crash → "Refreshing…").
 */
export async function prepareButlerCall({ haUrl, haToken } = {}) {
    try {
        const pre = await preflightButlerCall();
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

    if (haUrl && haToken) {
        const sync = await syncButlerHaConfig(haUrl, haToken);
        if (!sync.ok) {
            console.warn('[Butler] HA sync failed:', sync.error);
        }
    }

    return true;
}
