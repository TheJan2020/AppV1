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

export function readCoverOpenPercent(cover) {
    const attrs = cover?.stateObj?.attributes || {};
    const state = cover?.stateObj?.state || 'closed';
    if (attrs.current_position !== undefined) return attrs.current_position;
    return state === 'open' ? 100 : 0;
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

/** Windows for a room (match area_id or area name loosely). */
export function windowsForRoom(coverWindows, room) {
    if (!Array.isArray(coverWindows) || !room) return [];
    const areaId = normalizeAreaKey(room.area_id);
    const areaName = normalizeAreaKey(room.name);
    return coverWindows.filter((w) => {
        if (!w.area_id) return true;
        const wa = normalizeAreaKey(w.area_id);
        if (!wa) return true;
        return wa === areaId || wa === areaName || areaName.includes(wa) || wa.includes(areaName);
    });
}

/**
 * Split room covers into window groups + ungrouped (no windowId).
 * @returns {{ windowGroups: Array<{ window, covers }>, ungrouped: object[] }}
 */
export function groupCoversByWindow(covers, coverWindows, room) {
    const allWindows = Array.isArray(coverWindows) ? coverWindows : [];
    const roomWindows = windowsForRoom(allWindows, room);
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

    const windowGroups = roomWindows.map((window) => ({
        window,
        covers: covers.filter((c) => c.windowId === window.id),
    })).filter((g) => g.covers.length > 0);

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
