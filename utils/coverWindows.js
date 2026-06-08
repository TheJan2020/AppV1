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

/** Physical stack inside → outside (back → front render order). */
export const COVER_LAYER_Z_ORDER = ['chiffon', 'blackout', 'shutter'];

const LAYER_DISPLAY_ORDER = COVER_LAYER_Z_ORDER;

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
    const areaId = String(room.area_id || '').toLowerCase();
    const areaName = String(room.name || '').toLowerCase();
    return coverWindows.filter((w) => {
        if (!w.area_id) return true;
        const wa = String(w.area_id).toLowerCase();
        return wa === areaId || wa === areaName || areaName.includes(wa) || wa.includes(areaName);
    });
}

/**
 * Split room covers into window groups + ungrouped (no windowId).
 * @returns {{ windowGroups: Array<{ window, covers }>, ungrouped: object[] }}
 */
export function groupCoversByWindow(covers, coverWindows, room) {
    const windows = windowsForRoom(coverWindows, room);
    const windowGroups = windows.map((window) => ({
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
