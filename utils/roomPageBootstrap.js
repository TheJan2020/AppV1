/**
 * In-memory handoff from Dashboard → /room so the room route can paint immediately
 * with the same HA snapshot the dashboard already has (modal path behavior).
 * Slot is overwritten on each navigation; no explicit clear (Strict Mode safe).
 */

let slot = null;

function slotKey(area_id, name) {
    return `${String(area_id ?? '')}::${String(name ?? '')}`;
}

/**
 * Call right before router.push to /room (rooms tab).
 * @param {object} payload — entities, registries, mappings, haUrl, haToken, adminUrl, etc.
 */
export function setRoomPageBootstrap(area_id, name, payload) {
    slot = {
        key: slotKey(area_id, name),
        payload: { ...payload, area_id, name },
    };
}

/** Read bootstrap for this room if the dashboard just queued one (does not remove slot). */
export function peekRoomPageBootstrap(area_id, name) {
    if (!slot) return null;
    return slot.key === slotKey(area_id, name) ? slot.payload : null;
}

/** Drop the in-memory room handoff so a new home cannot open the previous house's room. */
export function clearRoomPageBootstrap() {
    slot = null;
}
