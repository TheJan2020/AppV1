/**
 * Fast Home Assistant snapshot from AppBackendV1's in-memory ha-cache
 * (`/api/states`, `/api/areas`, `/api/floors`) so Home does not wait for
 * the phone's WebSocket `get_states` (~3000 entities).
 */

function adminBase(adminUrl) {
    return String(adminUrl || '').replace(/\/+$/, '');
}

async function fetchJson(url, headers, signal) {
    const res = await fetch(url, {
        method: 'GET',
        headers,
        signal,
    });
    if (!res.ok) return null;
    return res.json().catch(() => null);
}

export async function fetchBackendHaSnapshot(adminUrl, token, signal) {
    const base = adminBase(adminUrl);
    if (!base) return null;
    const headers = {
        Accept: 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
    const [states, areas, floors] = await Promise.all([
        fetchJson(`${base}/api/states`, headers, signal),
        fetchJson(`${base}/api/areas`, headers, signal),
        fetchJson(`${base}/api/floors`, headers, signal),
    ]);
    return {
        states: Array.isArray(states) ? states : null,
        areas: Array.isArray(areas) ? areas : null,
        floors: Array.isArray(floors) ? floors : null,
    };
}

export function mergeEntitySlice(prev, incoming) {
    if (!Array.isArray(incoming) || incoming.length === 0) {
        return Array.isArray(prev) ? prev : [];
    }
    const next = Array.isArray(prev) ? [...prev] : [];
    const indexById = new Map(next.map((e, i) => [e?.entity_id, i]));
    for (const entity of incoming) {
        const id = entity?.entity_id;
        if (!id) continue;
        const hit = indexById.get(id);
        if (hit == null) {
            indexById.set(id, next.length);
            next.push(entity);
        } else {
            next[hit] = entity;
        }
    }
    return next;
}

export async function fetchLockStates(adminUrl, token, signal) {
    const base = adminBase(adminUrl);
    if (!base) return [];
    const headers = {
        Accept: 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
    const states = await fetchJson(`${base}/api/states?domain=lock`, headers, signal);
    return Array.isArray(states) ? states : [];
}

export function applyBackendHaSnapshot(snapshot, { haLiveRef, setEntities, setRegistryAreas, setRegistryFloors }) {
    if (!snapshot || haLiveRef?.current) return false;
    let applied = false;
    if (Array.isArray(snapshot.states) && snapshot.states.length && setEntities) {
        setEntities(snapshot.states);
        applied = true;
    }
    if (Array.isArray(snapshot.areas) && snapshot.areas.length && setRegistryAreas) {
        setRegistryAreas(snapshot.areas);
        applied = true;
    }
    if (Array.isArray(snapshot.floors) && snapshot.floors.length && setRegistryFloors) {
        const sorted = [...snapshot.floors].sort((a, b) => (a.level || 0) - (b.level || 0));
        setRegistryFloors(sorted);
        applied = true;
    }
    return applied;
}
