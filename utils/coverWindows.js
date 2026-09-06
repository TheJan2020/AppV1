/**
 * Cover window grouping — layers filter shutter / chiffon / blackout per window.
 */

export const COVER_LAYERS = [
    { id: 'shutter', label: 'Shutter' },
    { id: 'chiffon', label: 'Chiffon' },
    { id: 'blackout', label: 'Blackout' },
];

/** Combined tab — control every layer on a window together */
export const ALL_LAYERS_ID = 'all';

/** Normalize area id / name for loose matching (living_room ↔ Living Room). */
export function normalizeAreaKey(value) {
    return String(value || '').toLowerCase().replace(/_/g, ' ').trim();
}

/** Infer layer from entity_id when admin saved the wrong layer (e.g. both as blackout). */
export function inferCoverLayer(entity_id, coverLayer) {
    const id = String(entity_id || '').toLowerCase();
    if (id.includes('chiffon')) return 'chiffon';
    if (id.includes('blackout')) return 'blackout';
    if (id.includes('shutter')) return 'shutter';
    return coverLayer || null;
}

/** Alternate entity_ids for the same physical cover (HA vs admin naming). */
export function coverEntityIdAliases(entityId) {
    const id = String(entityId || '');
    if (!id) return [];
    const aliases = new Set([id]);
    if (id.includes('master_bedroom')) {
        aliases.add(id.replace(/master_bedroom/g, 'masterbedroom'));
    }
    if (id.includes('masterbedroom')) {
        aliases.add(id.replace(/masterbedroom/g, 'master_bedroom'));
    }
    // HA renamed some curtains with _1 / _2 suffixes after admin was configured
    // e.g. cover.living_room_chiffon → cover.living_room_chiffon_1
    const bareMatch = id.match(/^(cover\..+?)(?:_(\d+))?$/);
    if (bareMatch) {
        const base = bareMatch[1];
        const suffix = bareMatch[2];
        aliases.add(base);
        if (!suffix) {
            aliases.add(`${base}_1`);
            aliases.add(`${base}_2`);
        } else {
            aliases.add(`${base}_${suffix}`);
        }
    }
    return [...aliases];
}

/** Resolve MonitoredEntity row when HA entity_id differs from admin-configured id. */
export function findCoverMapping(entityId, coverMappings) {
    if (!entityId || !Array.isArray(coverMappings)) return null;
    const aliases = coverEntityIdAliases(entityId);
    for (const alias of aliases) {
        const match = coverMappings.find((m) => m.entity_id === alias);
        if (match) return match;
    }
    return null;
}

/** Physical stack inside → outside (back → front render order). */
export const COVER_LAYER_Z_ORDER = ['chiffon', 'blackout', 'shutter'];

const LAYER_DISPLAY_ORDER = COVER_LAYER_Z_ORDER;

/**
 * Master curtain controller (name / entity_id contains "master_curtain").
 * Position semantics match normal covers and the UI slider:
 *   0%   = closed
 *   100% = open
 * Always prefer `current_position` over HA state ("open"/"closed") — state can lag.
 */
export function isMasterCover(coverOrId) {
    const id =
        typeof coverOrId === 'string'
            ? coverOrId
            : coverOrId?.entity_id || '';
    const name =
        typeof coverOrId === 'string'
            ? ''
            : coverOrId?.displayName ||
              coverOrId?.name ||
              coverOrId?.stateObj?.attributes?.friendly_name ||
              '';
    const hay = `${id} ${name}`.toLowerCase();
    return hay.includes('master_curtain') || hay.includes('master curtain');
}

/**
 * Raw HA `current_position` (0–100), or null when unknown.
 * Does not invent a value from state — callers decide fallbacks.
 */
export function readCoverHaPosition(cover) {
    const attrs = cover?.stateObj?.attributes || cover?.attributes || {};
    if (attrs.current_position !== undefined && attrs.current_position !== null) {
        return Number(attrs.current_position);
    }
    return null;
}

/**
 * UI open percent: 0 = closed, 100 = open.
 * Uses position only when available (including master curtains).
 */
export function readCoverOpenPercent(cover) {
    const ha = readCoverHaPosition(cover);
    if (ha != null && !Number.isNaN(ha)) {
        return Math.max(0, Math.min(100, ha));
    }
    // No position: non-master may fall back to state; master stays closed until position arrives
    if (isMasterCover(cover)) return 0;
    const state = cover?.stateObj?.state || cover?.state || 'closed';
    return state === 'open' || state === 'opening' ? 100 : 0;
}

/** UI open% (0 closed … 100 open) → value for `cover.set_cover_position`. */
export function uiOpenPercentToHaPosition(_coverOrId, uiOpenPercent) {
    return Math.max(0, Math.min(100, Math.round(Number(uiOpenPercent) || 0)));
}

/** True when the cover is meaningfully open — position-based when possible. */
export function isCoverUiOpen(cover) {
    return readCoverOpenPercent(cover) > 5;
}

/** Status label from position only (ignores HA open/closed state). */
export function coverOpenStatusLabel(cover, { opening = false, closing = false } = {}) {
    if (opening) return 'Opening...';
    if (closing) return 'Closing...';
    const pct = Math.round(readCoverOpenPercent(cover));
    if (pct < 5) return 'Closed';
    if (pct >= 95) return 'Opened 100%';
    return `Opened ${pct}%`;
}

/**
 * All tab — show an inner layer only when it is more closed than the layer above it
 * (lower open % = wider panel peeking behind opaque outer fabric).
 */
export function shouldShowLayerInAllTab(stackedCovers, index) {
    if (!stackedCovers?.length) return false;
    if (index === stackedCovers.length - 1) return true;
    const innerPos = readCoverOpenPercent(stackedCovers[index]);
    const abovePos = readCoverOpenPercent(stackedCovers[index + 1]);
    return innerPos < abovePos;
}

export function coversInStackOrder(covers) {
    if (!covers?.length) return [];
    return [...covers].sort(
        (a, b) => COVER_LAYER_Z_ORDER.indexOf(a.coverLayer) - COVER_LAYER_Z_ORDER.indexOf(b.coverLayer),
    );
}

export function layerLabel(id) {
    if (id === ALL_LAYERS_ID) return 'All';
    return COVER_LAYERS.find(l => l.id === id)?.label || id;
}

/** Default layer tab for a window (prefers All when multiple layers exist). */
export function defaultLayerTab(layers) {
    return layers.find(l => l.id === ALL_LAYERS_ID)?.id ?? layers[0]?.id ?? 'blackout';
}

/** Pick the cover used for the grouped “All” card visual (outermost layer first). */
export function primaryCoverForGroup(covers) {
    if (!covers?.length) return null;
    const byLayer = (layer) => covers.find(c => c.coverLayer === layer);
    for (const layer of LAYER_DISPLAY_ORDER) {
        const match = byLayer(layer);
        if (match) return match;
    }
    return covers[0];
}

/**
 * Shared token so "Window C" can group HA names like "Curtain C"
 * or entity ids like cover.men_majlis_curtain_c.
 */
export function coverWindowMatchKey(nameOrId) {
    const s = String(nameOrId || '')
        .toLowerCase()
        .replace(/[_-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    if (!s) return '';
    const labeled = s.match(/\b(?:window|curtain|cover|blind)\s+([a-z0-9]+)\b/);
    if (labeled?.[1]) return labeled[1];
    return '';
}

function coverDisplayHaystack(cover) {
    return normalizeAreaKey(
        `${cover?.displayName || ''} ${cover?.name || ''} ${cover?.entity_id || ''}`,
    );
}

/** True when this cover should sit in this named window (explicit id or name). */
export function coverBelongsToWindow(cover, window, roomWindows = []) {
    if (!cover || !window?.id) return false;
    if (cover.windowId && cover.windowId === window.id) return true;

    const windowName = normalizeAreaKey(window.name);
    const hay = coverDisplayHaystack(cover);
    if (windowName.length >= 4 && hay.includes(windowName)) return true;

    const windowToken = coverWindowMatchKey(window.name);
    if (!windowToken) return false;
    const tokenPeers = (roomWindows.length ? roomWindows : [window])
        .filter((w) => coverWindowMatchKey(w.name) === windowToken);
    if (tokenPeers.length !== 1) return false;
    const coverToken = coverWindowMatchKey(cover.displayName || cover.name)
        || coverWindowMatchKey(cover.entity_id);
    return coverToken === windowToken;
}

/**
 * Windows for a room — exact area id or name (no substring leaks).
 * Also keeps windows with no room ("Any area") when a cover or contact
 * sensor in this room is linked to them.
 */
export function windowsForRoom(coverWindows, room, options = {}) {
    if (!Array.isArray(coverWindows) || !room) return [];
    const keys = [room.area_id, room.name].map(normalizeAreaKey).filter(Boolean);
    const covers = Array.isArray(options.covers) ? options.covers : [];
    const roomEntityIds = new Set(options.roomEntityIds || []);

    return coverWindows.filter((w) => {
        if (!w?.id) return false;
        const wa = normalizeAreaKey(w.area_id);
        if (wa && keys.includes(wa)) return true;
        if (covers.some((c) => c.windowId === w.id)) return true;
        const sensorIds = Array.isArray(w.sensor_ids) ? w.sensor_ids : [];
        if (sensorIds.some((id) => roomEntityIds.has(id))) return true;
        return false;
    }).sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
}

/**
 * Split room covers into window groups + ungrouped (no windowId).
 * @returns {{ windowGroups: Array<{ window, covers }>, ungrouped: object[] }}
 */
export function groupCoversByWindow(covers, coverWindows, room, options = {}) {
    const allWindows = Array.isArray(coverWindows) ? coverWindows : [];
    const roomWindows = windowsForRoom(allWindows, room, { ...options, covers });
    const windowsById = new Map(allWindows.map((w) => [w.id, w]));
    const seenWindowIds = new Set(roomWindows.map((w) => w.id));

    // If area matching fails but covers reference a window id, still group them.
    for (const cover of covers) {
        const winId = cover.windowId;
        if (!winId || seenWindowIds.has(winId)) continue;
        const win = windowsById.get(winId);
        if (win) {
            seenWindowIds.add(winId);
            roomWindows.push(win);
        }
    }

    const assigned = new Map();
    for (const cover of covers) {
        if (cover.windowId && seenWindowIds.has(cover.windowId)) {
            assigned.set(cover.entity_id, cover.windowId);
        }
    }
    for (const cover of covers) {
        if (assigned.has(cover.entity_id)) continue;
        const match = roomWindows.find((w) => coverBelongsToWindow(cover, w, roomWindows));
        if (match) assigned.set(cover.entity_id, match.id);
    }

    const windowGroups = roomWindows.map((window) => ({
        window,
        covers: covers.filter((c) => assigned.get(c.entity_id) === window.id),
    }));

    const groupedIds = new Set(windowGroups.flatMap(g => g.covers.map(c => c.entity_id)));
    const ungrouped = covers.filter(c => !groupedIds.has(c.entity_id));

    return { windowGroups, ungrouped };
}

/** Layers present on a window's covers (ordered), with All tab when 2+ layers. */
export function layersForWindow(covers) {
    const set = new Set(covers.map(c => c.coverLayer).filter(Boolean));
    const layers = COVER_LAYERS.filter(l => set.has(l.id));
    if (layers.length > 1) {
        return [{ id: ALL_LAYERS_ID, label: 'All' }, ...layers];
    }
    return layers;
}
