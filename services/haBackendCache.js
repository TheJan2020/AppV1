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

function withTimeoutSignal(signal, timeoutMs = 10000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    if (signal) {
        if (signal.aborted) controller.abort();
        else signal.addEventListener('abort', () => controller.abort(), { once: true });
    }
    return {
        signal: controller.signal,
        clear: () => clearTimeout(timer),
    };
}

export async function fetchBackendHaSnapshot(adminUrl, token, signal) {
    const base = adminBase(adminUrl);
    if (!base) return null;
    const headers = {
        Accept: 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
    const timed = withTimeoutSignal(signal, 20000);
    try {
        const [states, areas, floors, structureRes] = await Promise.all([
            fetchJson(`${base}/api/states`, headers, timed.signal),
            fetchJson(`${base}/api/areas`, headers, timed.signal),
            fetchJson(`${base}/api/floors`, headers, timed.signal),
            fetchJson(`${base}/api/structure`, headers, timed.signal),
        ]);
        const structure = Array.isArray(structureRes?.structure) ? structureRes.structure : [];
        const registryEntities = [];
        const structureStates = [];
        const structureAreas = [];
        for (const room of structure) {
            const areaId = room?.id || room?.area_id;
            if (areaId) {
                structureAreas.push({ area_id: areaId, name: room?.name || areaId });
            }
            for (const entry of Array.isArray(room?.entities) ? room.entities : []) {
                if (!entry?.entity_id) continue;
                registryEntities.push({
                    entity_id: entry.entity_id,
                    area_id: areaId || entry.area_id || null,
                });
                structureStates.push({
                    entity_id: entry.entity_id,
                    state: entry.state,
                    attributes: entry.attributes && typeof entry.attributes === 'object'
                        ? entry.attributes
                        : {},
                });
            }
        }
        const liveStates = Array.isArray(states) && states.length ? states : structureStates;
        const liveAreas = Array.isArray(areas) && areas.length ? areas : structureAreas;
        return {
            states: liveStates.length ? liveStates : null,
            areas: liveAreas.length ? liveAreas : null,
            floors: Array.isArray(floors) ? floors : null,
            registryEntities: registryEntities.length ? registryEntities : null,
        };
    } finally {
        timed.clear();
    }
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
    const timed = withTimeoutSignal(signal, 8000);
    try {
        const states = await fetchJson(`${base}/api/states?domain=lock`, headers, timed.signal);
        return Array.isArray(states) ? states : [];
    } finally {
        timed.clear();
    }
}

export function applyBackendHaSnapshot(snapshot, {
    haLiveRef,
    setEntities,
    setRegistryAreas,
    setRegistryFloors,
    setRegistryEntities,
}) {
    if (!snapshot) return false;
    let applied = false;
    if (Array.isArray(snapshot.states) && snapshot.states.length && setEntities) {
        setEntities((prev) => {
            if (haLiveRef?.current && Array.isArray(prev) && prev.length >= snapshot.states.length) {
                return prev;
            }
            return snapshot.states;
        });
        applied = true;
    }
    if (Array.isArray(snapshot.areas) && snapshot.areas.length && setRegistryAreas) {
        setRegistryAreas((prev) => (Array.isArray(prev) && prev.length ? prev : snapshot.areas));
        applied = true;
    }
    if (Array.isArray(snapshot.floors) && snapshot.floors.length && setRegistryFloors) {
        const sorted = [...snapshot.floors].sort((a, b) => (a.level || 0) - (b.level || 0));
        setRegistryFloors((prev) => (Array.isArray(prev) && prev.length ? prev : sorted));
        applied = true;
    }
    if (Array.isArray(snapshot.registryEntities) && snapshot.registryEntities.length && setRegistryEntities) {
        setRegistryEntities((prev) => (Array.isArray(prev) && prev.length ? prev : snapshot.registryEntities));
        applied = true;
    }
    return applied;
}
