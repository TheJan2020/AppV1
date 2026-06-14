/**
 * Home Assistant Adaptive Lighting — mobile controls ONLY the 4th main switch:
 * "Adaptive Lighting: CCT" / "Adaptive Lighting: RGB".
 * Sleep / adapt color / adapt brightness are never touched by the app.
 *
 * Main entity ids vary by HA version, e.g.:
 *   switch.demo_area_adaptive_lighting_demo_area  → Adaptive Lighting: CCT
 *   switch.rgb_adaptive_lighting_rgb              → RGB Adaptive Lighting: RGB
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

/** Sub-switches (1–3 in HA): sleep, adapt color, adapt brightness — not the 4th main card. */
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
 * 4th HA card only — friendly name ends with ": CCT" or ": RGB".
 */
export function isAdaptiveLightingMainSwitch(entity) {
    const id = entity?.entity_id || '';
    if (!id.startsWith('switch.')) return false;
    if (isAdaptiveSubSwitch(entity)) return false;

    const friendly = friendlyLower(entity);
    if (!friendly) return false;

    return /:\s*cct\s*$/i.test(friendly)
        || /:\s*rgb\s*$/i.test(friendly)
        || /^adaptive lighting:\s*cct\s*$/i.test(friendly)
        || /^adaptive lighting:\s*rgb\s*$/i.test(friendly);
}

/** @returns {'cct' | 'rgb' | 'unknown'} */
export function classifyMainSwitchType(entity) {
    if (!isAdaptiveLightingMainSwitch(entity)) return 'unknown';

    const friendly = friendlyLower(entity);
    if (/:\s*rgb\s*$/i.test(friendly) || friendly.endsWith(' rgb')) return 'rgb';
    if (/:\s*cct\s*$/i.test(friendly) || friendly.endsWith(' cct')) return 'cct';
    return 'unknown';
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

function pickBestMain(candidates, lookupKeys, lightIdSet, roomHasTypeLights) {
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

    // Shared RGB/CCT config (e.g. switch.rgb_adaptive_lighting_rgb in Demo Area)
    if (candidates.length === 1 && roomHasTypeLights) return candidates[0];

    return null;
}

/**
 * Find main "Adaptive Lighting: CCT" / ": RGB" switches for a room.
 * @returns {{ cct: { main } | null, rgb: { main } | null }}
 */
export function findAdaptiveLightingForRoom(
    allEntities,
    lightEntityIds,
    roomName,
    areaId,
    options = {},
) {
    const empty = { cct: null, rgb: null };
    if (!Array.isArray(allEntities) || !allEntities.length) return empty;

    const lightIdSet = new Set(
        (lightEntityIds || []).filter((id) => typeof id === 'string' && id.startsWith('light.'))
    );
    const lookupKeys = collectRoomAdaptiveLookupKeys(roomName, areaId);
    const roomHasCctLights = options.roomHasCctLights ?? lightIdSet.size > 0;
    const roomHasRgbLights = options.roomHasRgbLights ?? lightIdSet.size > 0;

    const mainSwitches = allEntities.filter(isAdaptiveLightingMainSwitch);

    const cctCandidates = mainSwitches.filter((e) => classifyMainSwitchType(e) === 'cct');
    const rgbCandidates = mainSwitches.filter((e) => classifyMainSwitchType(e) === 'rgb');

    const cctMain = roomHasCctLights
        ? pickBestMain(cctCandidates, lookupKeys, lightIdSet, roomHasCctLights)
        : null;
    const rgbMain = roomHasRgbLights
        ? pickBestMain(rgbCandidates, lookupKeys, lightIdSet, roomHasRgbLights)
        : null;

    return {
        cct: cctMain ? { main: cctMain } : null,
        rgb: rgbMain ? { main: rgbMain } : null,
    };
}

/** Main switch on → sun icon + disabled color slider. */
export function isAdaptiveMainActive(adaptive) {
    return adaptive?.main?.state === 'on';
}
