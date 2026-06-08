import * as SecureStore from 'expo-secure-store';
import { getAdminUrl } from './storage';
import { authFetch } from './authFetch';

const timerKey = (entityId) => `climate_timer_${entityId}`;

let cachedAdminBase = null;

async function getAdminBase() {
    if (cachedAdminBase) return cachedAdminBase;
    const adminUrl = await getAdminUrl();
    if (!adminUrl) return null;
    cachedAdminBase = adminUrl.endsWith('/') ? adminUrl : `${adminUrl}/`;
    return cachedAdminBase;
}

/** Build timer object for immediate UI (no network). */
export function buildClimateTimer(entityId, durationSeconds, action = 'turn_off') {
    const safeAction = action === 'turn_on' ? 'turn_on' : 'turn_off';
    const now = Date.now();
    const endsAtMs = now + durationSeconds * 1000;
    const startedIso = new Date(now).toISOString();
    const endsIso = new Date(endsAtMs).toISOString();
    return {
        entity_id: entityId,
        duration_seconds: durationSeconds,
        started_at: startedIso,
        ends_at: endsIso,
        status: 'active',
        remaining_seconds: durationSeconds,
        ends_at_ms: endsAtMs,
        started_at_ms: now,
        action: safeAction,
    };
}

export async function saveLocalClimateTimer(entityId, timer) {
    if (!entityId) return;
    if (!timer) {
        await SecureStore.deleteItemAsync(timerKey(entityId));
        return;
    }
    await SecureStore.setItemAsync(timerKey(entityId), JSON.stringify(timer));
}

export async function loadLocalClimateTimer(entityId) {
    try {
        const raw = await SecureStore.getItemAsync(timerKey(entityId));
        if (!raw) return null;
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

export async function fetchClimateTimer(entityId) {
    const base = await getAdminBase();
    if (!base || !entityId) return null;
    try {
        const res = await authFetch(
            `${base}api/climate-timers?entity_id=${encodeURIComponent(entityId)}`,
        );
        if (!res.ok) return null;
        const json = await res.json();
        if (!json.success || !json.timer) return null;
        return json.timer;
    } catch {
        return null;
    }
}

/** POST timer to backend — do not call before local UI update. */
export async function syncClimateTimerRemote(entityId, durationSeconds, action = 'turn_off') {
    const base = await getAdminBase();
    if (!base || !entityId) throw new Error('Not configured');
    const res = await authFetch(`${base}api/climate-timers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            entity_id: entityId,
            duration_seconds: durationSeconds,
            action: action === 'turn_on' ? 'turn_on' : 'turn_off',
        }),
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to start timer');
    }
    return json.timer;
}

/** Start: local first (fast), then sync server in background. */
export async function startClimateTimer(entityId, durationSeconds, action = 'turn_off') {
    const local = buildClimateTimer(entityId, durationSeconds, action);
    await saveLocalClimateTimer(entityId, local);
    const remote = await syncClimateTimerRemote(entityId, durationSeconds, action);
    await saveLocalClimateTimer(entityId, remote);
    return remote;
}

/** DELETE on server — safe to call without await from UI. */
export function syncCancelClimateTimerRemote(entityId) {
    return (async () => {
        const base = await getAdminBase();
        if (!base || !entityId) return;
        try {
            await authFetch(
                `${base}api/climate-timers?entity_id=${encodeURIComponent(entityId)}`,
                { method: 'DELETE' },
            );
        } catch (_) { /* offline */ }
    })();
}

/** Clear local cache immediately; cancel server in background. */
export async function cancelClimateTimer(entityId) {
    if (!entityId) return;
    await saveLocalClimateTimer(entityId, null);
    syncCancelClimateTimerRemote(entityId);
}

/** UI-only cancel — instant, no network. */
export async function cancelClimateTimerLocal(entityId) {
    if (!entityId) return;
    await saveLocalClimateTimer(entityId, null);
}
