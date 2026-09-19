import * as SecureStore from 'expo-secure-store';
import { authFetch } from '../utils/authFetch';

function storageKey(profileId) {
    const id = String(profileId || '').trim().replace(/[^a-zA-Z0-9._-]/g, '_');
    return id ? `room_reorder_config.${id}` : 'room_reorder_config';
}

export async function loadLocalRoomOrder(profileId) {
    try {
        const scoped = await SecureStore.getItemAsync(storageKey(profileId));
        if (scoped) return JSON.parse(scoped);
        const legacy = await SecureStore.getItemAsync('room_reorder_config');
        if (!legacy) return [];
        const parsed = JSON.parse(legacy);
        if (profileId && Array.isArray(parsed) && parsed.length) {
            await SecureStore.setItemAsync(storageKey(profileId), legacy);
        }
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

export async function saveLocalRoomOrder(profileId, order) {
    const ids = Array.isArray(order) ? order.filter(Boolean) : [];
    const raw = JSON.stringify(ids);
    try {
        await SecureStore.setItemAsync(storageKey(profileId), raw);
        await SecureStore.setItemAsync('room_reorder_config', raw);
    } catch (e) {
        console.log('[RoomOrder] local save failed:', e?.message || e);
    }
    return ids;
}

export function mergeRoomOrder(prev, reorderedIds, fallbackIds = []) {
    const currentFullOrder = Array.isArray(prev) && prev.length
        ? [...prev]
        : (Array.isArray(fallbackIds) ? [...fallbackIds] : []);
    const ids = Array.isArray(reorderedIds) ? reorderedIds.filter(Boolean) : [];
    const reorderedSet = new Set(ids);
    const indicesToUpdate = [];
    currentFullOrder.forEach((id, index) => {
        if (reorderedSet.has(id)) indicesToUpdate.push(index);
    });
    if (indicesToUpdate.length !== ids.length) {
        const others = currentFullOrder.filter((id) => !reorderedSet.has(id));
        return [...ids, ...others];
    }
    const next = [...currentFullOrder];
    indicesToUpdate.forEach((originalIndex, i) => {
        next[originalIndex] = ids[i];
    });
    return next;
}

export function parentIdsFromConfig(config) {
    if (Array.isArray(config?.dashboard_area_ids) && config.dashboard_area_ids.length) {
        return config.dashboard_area_ids.filter(Boolean);
    }
    const selected = Array.isArray(config?.selected_areas) ? config.selected_areas : [];
    const childIds = new Set();
    for (const entry of selected) {
        if (entry?.parent_area_id) childIds.add(entry.area_id);
        if (Array.isArray(entry?.sub_areas)) {
            for (const sub of entry.sub_areas) {
                const id = typeof sub === 'string' ? sub : sub?.area_id;
                if (id) childIds.add(id);
            }
        }
    }
    return selected.map((entry) => entry?.area_id).filter((id) => id && !childIds.has(id));
}

export async function persistRoomOrder({ adminUrl, token, profileId, order }) {
    const ids = await saveLocalRoomOrder(profileId, order);
    const base = String(adminUrl || '').replace(/\/+$/, '');
    if (!base || !ids.length) return { ok: !!(ids.length) };
    try {
        const res = await authFetch(`${base}/api/room-order`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({ order: ids }),
        }, token);
        const data = await res.json().catch(() => null);
        return { ok: !!(res.ok && data && data.ok !== false), config: data?.config };
    } catch (e) {
        console.log('[RoomOrder] backend save failed:', e?.message || e);
        return { ok: false };
    }
}
