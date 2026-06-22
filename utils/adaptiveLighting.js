/**
 * Home Assistant Adaptive Lighting — one main switch per room:
 * friendly name "Adaptive Lighting" (not separate CCT/RGB configs).
 * Sleep / adapt color / adapt brightness sub-switches are never touched by the app.
 */

function slugify(value) {
    if (!value) return '';
    return String(value).trim().toLowerCase().replace(/\s+/g, '_');
}

function labelizeSlug(value) {
    if (!value) return '';
    const t = String(value).trim();
    if (t.includes(' ')) return t;
    return t.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Collect room name / area_id variants for fuzzy matching config names. */
export function collectRoomAdaptiveLookupKeys(roomName, areaId) {
    const keys = new Set();
    const add = (raw) => {
        const s = String(raw || '').trim();
        if (!s) return;
        keys.add(s.toLowerCase());
        keys.add(slugify(s));
        keys.add(labelizeSlug(s).toLowerCase());
    };
    add(areaId);
    add(roomName);
    return [...keys];
}

function friendlyLower(entity) {
    return String(
        entity?.attributes?.friendly_name
        || entity?.displayName
        || entity?.name
        || entity?.original_name
        || '',
    ).trim().toLowerCase();
}

/** Sub-switches (1–3 in HA): sleep, adapt color, adapt brightness — not the main card. */
function isAdaptiveSubSwitch(entity) {
    const id = entity?.entity_id || '';
    const friendly = friendlyLower(entity);

    if (id.includes('adapt_color') || id.includes('adapt_brightness') || id.includes('sleep_mode')) {
        return true;
    }
    if (friendly.includes('sleep mode') || friendly.includes('sleep m')) return true;
    if (friendly.includes('adapt color')) return true;
    if (friendly.includes('adapt brightness')) return true;

    return false;
}

/** Main adaptive lighting switch for a room — friendly name "Adaptive Lighting"
 * (legacy ": CCT" / ": RGB" suffix switches are ignored).
 */
export function isAdaptiveLightingMainSwitch(entity) {
    const id = entity?.entity_id || '';
    if (!id.startsWith('switch.')) return false;
    if (isAdaptiveSubSwitch(entity)) return false;

    const friendly = friendlyLower(entity);
    if (!friendly) return false;

    // Legacy split configs — no longer used in the app
    if (/:\s*(cct|rgb)\s*$/i.test(friendly)) return false;

    if (friendly === 'adaptive lighting') return true;
    if (/\badaptive lighting\b/i.test(friendly)) return true;

    return false;
}

function isAdaptiveLightingMainByEntityId(entity) {
    const id = (entity?.entity_id || '').toLowerCase();
    if (!id.startsWith('switch.') || !id.includes('adaptive_lighting')) return false;
    return !isAdaptiveSubSwitch(entity);
}

/** Name or entity_id match for the single main adaptive switch (not sub-features). */
export function isAdaptiveLightingMainEntity(entity) {
    return isAdaptiveLightingMainSwitch(entity) || isAdaptiveLightingMainByEntityId(entity);
}

function normalizeRoomSwitchEntity(sw, fromAll) {
    const entityId = sw?.entity_id;
    const attrs = {
        ...(sw?.stateObj?.attributes || {}),
        ...(fromAll?.attributes || {}),
    };
    if (!attrs.friendly_name) {
        const registryName = sw?.displayName || sw?.name || sw?.original_name;
        if (registryName) attrs.friendly_name = registryName;
    }
    return {
        ...(fromAll || {}),
        entity_id: entityId,
        state: fromAll?.state ?? sw?.stateObj?.state,
        attributes: attrs,
        displayName: sw?.displayName,
        name: sw?.name,
        original_name: sw?.original_name,
    };
}

function scoreMainForRoom(mainEntity, lookupKeys, lightIdSet) {
    const id = mainEntity.entity_id.toLowerCase();
    const friendly = friendlyLower(mainEntity);
    let score = 0;

    for (const key of lookupKeys) {
        if (!key) continue;
        const k = key.toLowerCase();
        const slug = slugify(key);
        if (id.includes(slug) || friendly.includes(k)) score += 20;
        else if (slug.length > 2 && friendly.includes(slug.replace(/_/g, ' '))) score += 12;
    }

    const lights = mainEntity.attributes?.lights;
    if (Array.isArray(lights) && lights.length && lightIdSet.size) {
        score += lights.filter((lid) => lightIdSet.has(lid)).length * 8;
    }

    return score;
}

function pickBestMain(candidates, lookupKeys, lightIdSet) {
    let best = null;
    let bestScore = 0;

    for (const main of candidates) {
        const score = scoreMainForRoom(main, lookupKeys, lightIdSet);
        if (score > bestScore) {
            bestScore = score;
            best = main;
        }
    }

    if (best && bestScore > 0) return best;

    // Name may be generic ("Adaptive Lighting") — match by controlled lights overlap
    if (lightIdSet.size) {
        let bestOverlap = 0;
        let bestByLights = null;
        for (const main of candidates) {
            const controlled = main.attributes?.lights;
            if (!Array.isArray(controlled)) continue;
            const overlap = controlled.filter((lid) => lightIdSet.has(lid)).length;
            if (overlap > bestOverlap) {
                bestOverlap = overlap;
                bestByLights = main;
            }
        }
        if (bestByLights && bestOverlap > 0) return bestByLights;
    }

    return null;
}

/**
 * Find the single "Adaptive Lighting" switch for a room.
 * @param {object[]} [roomSwitches] — switch entities assigned to this room (preferred)
 * @returns {{ main: object } | null}
 */
export function findAdaptiveLightingForRoom(
    allEntities,
    lightEntityIds,
    roomName,
    areaId,
    roomSwitches = [],
) {
    if (!Array.isArray(allEntities) || !allEntities.length) return null;

    const lightIdSet = new Set(
        (lightEntityIds || []).filter((id) => typeof id === 'string' && id.startsWith('light.'))
    );
    if (!lightIdSet.size) return null;

    // Prefer the main switch assigned to this room in HA (entity registry / area).
    for (const sw of roomSwitches) {
        const entityId = sw?.entity_id;
        if (!entityId?.startsWith('switch.')) continue;
        const fromAll = allEntities.find((e) => e.entity_id === entityId);
        const entity = normalizeRoomSwitchEntity(sw, fromAll);
        if (isAdaptiveLightingMainEntity(entity)) {
            return { main: entity };
        }
    }

    const lookupKeys = collectRoomAdaptiveLookupKeys(roomName, areaId);
    const candidates = allEntities.filter(isAdaptiveLightingMainEntity);
    const main = pickBestMain(candidates, lookupKeys, lightIdSet);

    return main ? { main } : null;
}

/** Main switch on → hide manual CCT/RGB sliders. */
export function isAdaptiveMainActive(adaptive) {
    return adaptive?.main?.state === 'on';
}
