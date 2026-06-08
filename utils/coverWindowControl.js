/**
 * Batch cover control via backend — toggle all covers on a window.
 */

import { getAdminUrl } from './storage';
import { authFetch } from './authFetch';

let cachedAdminBase = null;

async function getAdminBase() {
    if (cachedAdminBase) return cachedAdminBase;
    const adminUrl = await getAdminUrl();
    if (!adminUrl) return null;
    cachedAdminBase = adminUrl.endsWith('/') ? adminUrl : `${adminUrl}/`;
    return cachedAdminBase;
}

/**
 * Toggle / open / close all covers in a window or entity list.
 * @param {{ windowId?: string, entity_ids?: string[], action?: 'toggle'|'open'|'close' }} opts
 */
export async function controlCoverGroup({ windowId, entity_ids, action = 'toggle' }) {
    const base = await getAdminBase();
    if (!base) throw new Error('Admin URL not configured');

    const res = await authFetch(`${base}api/cover-windows/control`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ windowId, entity_ids, action }),
    });

    const json = await res.json();
    if (!res.ok || !json.success) {
        throw new Error(json.error || 'Cover control failed');
    }
    return json;
}

/** Convenience: toggle all covers on a window. */
export function toggleCoverWindow(windowId) {
    return controlCoverGroup({ windowId, action: 'toggle' });
}

/** Toggle all covers in a list (room-level when no master curtain). */
export function toggleCoverEntities(entity_ids) {
    return controlCoverGroup({ entity_ids, action: 'toggle' });
}
