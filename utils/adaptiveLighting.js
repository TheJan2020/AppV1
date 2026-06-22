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
    return String(entity?.attributes?.friendly_name || '').trim().toLowerCase();
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

/**
 * Main adaptive lighting switch for a room — friendly name "Adaptive Lighting"
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
    if (/^adaptive lighting\b/i.test(friendly)) return true;

    return false;
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

function pickBestMain(candidates, lookupKeys, lightIdSet, roomHasLights) {
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

    if (candidates.length === 1 && roomHasLights) return candidates[0];

    return null;
}

/**
 * Find the single "Adaptive Lighting" switch for a room.
 * @returns {{ main: object } | null}
 */
export function findAdaptiveLightingForRoom(
    allEntities,
    lightEntityIds,
    roomName,
    areaId,
) {
    if (!Array.isArray(allEntities) || !allEntities.length) return null;

    const lightIdSet = new Set(
        (lightEntityIds || []).filter((id) => typeof id === 'string' && id.startsWith('light.'))
    );
    if (!lightIdSet.size) return null;

    const lookupKeys = collectRoomAdaptiveLookupKeys(roomName, areaId);
    const candidates = allEntities.filter(isAdaptiveLightingMainSwitch);
    const main = pickBestMain(candidates, lookupKeys, lightIdSet, lightIdSet.size > 0);

    return main ? { main } : null;
}

/** Main switch on → hide manual CCT/RGB sliders. */
export function isAdaptiveMainActive(adaptive) {
    return adaptive?.main?.state === 'on';
}
