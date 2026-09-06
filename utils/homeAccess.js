/**
 * Home Access selection lives on /api/config (config.json).
 * Do not wait for /api/home-access or room cards before showing locks.
 */

export function readHomeAccessFromConfig(config) {
    if (!config || typeof config !== 'object') {
        return { locks: undefined, covers: undefined, passage: undefined };
    }
    return {
        locks: Object.prototype.hasOwnProperty.call(config, 'selected_locks')
            ? (Array.isArray(config.selected_locks) ? config.selected_locks : [])
            : undefined,
        covers: Object.prototype.hasOwnProperty.call(config, 'selected_home_covers')
            ? (Array.isArray(config.selected_home_covers) ? config.selected_home_covers : [])
            : undefined,
        passage: config.lock_passage_configs && typeof config.lock_passage_configs === 'object'
            ? config.lock_passage_configs
            : undefined,
    };
}

export function filterHomeLocks(entities = [], {
    selectedLockIds = null,
    registryEntities = [],
    registryDevices = [],
    selectedAreaIds = [],
} = {}) {
    const locks = (Array.isArray(entities) ? entities : [])
        .filter((e) => e?.entity_id?.startsWith('lock.'));

    if (selectedLockIds && selectedLockIds.length > 0) {
        const wanted = new Set(selectedLockIds);
        return locks.filter((e) => wanted.has(e.entity_id));
    }
    if (selectedLockIds !== null) return [];

    const areaSet = new Set((selectedAreaIds || []).filter(Boolean));
    if (!areaSet.size) return locks;

    const deviceArea = new Map();
    for (const d of registryDevices || []) {
        if (d?.id && d.area_id) deviceArea.set(d.id, d.area_id);
    }
    const entityArea = new Map();
    for (const re of registryEntities || []) {
        if (!re?.entity_id) continue;
        entityArea.set(re.entity_id, re.area_id || deviceArea.get(re.device_id) || null);
    }

    const matched = locks.filter((e) => areaSet.has(entityArea.get(e.entity_id)));
    return matched.length ? matched : locks;
}
