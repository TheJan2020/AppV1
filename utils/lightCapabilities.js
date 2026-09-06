import { sortByNaturalName } from './naturalSort';

/** HA color modes that imply brightness control (not plain on/off). */
const BRIGHTNESS_COLOR_MODES = new Set([
    'brightness',
    'hs',
    'xy',
    'rgb',
    'rgbw',
    'rgbww',
    'color_temp',
    'white',
]);

const RGB_MODES = new Set(['rgb', 'rgbw', 'rgbww', 'hs', 'xy']);

/**
 * True when the entity supports brightness (HA attrs + optional admin mapping).
 * Does not depend on the light currently being on or reporting a brightness value.
 */
export function lightSupportsBrightness(attrs = {}, mapping = null) {
    const cap = mapping?.colorCapability;
    if (cap === 'dimmable' || cap === 'cct' || cap === 'rgb') return true;
    if (cap === 'normal') {
        // Admin marked as non-dimmable — still allow HA to override if modes say otherwise
    }

    const modes = attrs.supported_color_modes || [];

    if (modes.length === 1 && modes[0] === 'onoff') return false;

    if (modes.some((m) => BRIGHTNESS_COLOR_MODES.has(m))) return true;

    if (attrs.supported_features != null && (attrs.supported_features & 1) !== 0) {
        return true;
    }

    return false;
}

/** Effective capability for borders, color UI, and grouping. */
export function getLightEffectiveCapability(light, mapping = null) {
    const attrs = light?.stateObj?.attributes ?? {};
    const cap = mapping?.colorCapability || 'normal';

    if (cap === 'rgb' || cap === 'cct' || cap === 'dimmable') return cap;

    const modes = attrs.supported_color_modes || [];
    const hasRGBMode = modes.some((m) => RGB_MODES.has(m));
    const hasCCTMode = modes.includes('color_temp');

    if (hasRGBMode && hasCCTMode) return 'rgb';
    if (hasRGBMode) return 'rgb';
    if (hasCCTMode) return 'cct';
    if (lightSupportsBrightness(attrs, mapping)) return 'dimmable';

    return 'normal';
}

/**
 * True only for the room “Master Controller” entity — not named groups that
 * happen to contain `master_controller` in the id (Track Light, Board A, …).
 * Those named groups count as normal groups (1 unit; members hidden).
 */
export function isMasterControllerLight(light) {
    const id = (light?.entity_id || '').toLowerCase();
    const name = (
        light?.displayName ||
        light?.stateObj?.attributes?.friendly_name ||
        light?.attributes?.friendly_name ||
        ''
    ).toLowerCase().trim();

    // light.master_controller / light.master_controller_2 / …
    if (/^light\.master_controller(_\d+)?$/.test(id)) return true;
    // Exact friendly name only (not "Track Light", "Board A", etc.)
    if (name === 'master controller') return true;
    return false;
}

function lightAttributes(light) {
    return light?.stateObj?.attributes || light?.attributes || {};
}

/** HA light group / helper — `attributes.entity_id` lists member lights. */
export function isLightGroupEntity(light) {
    const members = lightAttributes(light).entity_id;
    return Array.isArray(members) && members.some((id) => String(id).startsWith('light.'));
}

export function getLightGroupMemberIds(light) {
    const members = lightAttributes(light).entity_id;
    if (!Array.isArray(members)) return [];
    return members.filter((id) => typeof id === 'string' && id.startsWith('light.'));
}

/**
 * Non-master HA group — counts as 1 unit; its member bulbs do not.
 * Master controllers are excluded (members of masters still count individually).
 */
export function isAggregatedLightEntity(light) {
    if (isMasterControllerLight(light)) return false;
    return isLightGroupEntity(light);
}

/**
 * Member entity_ids of **non-master** light groups in the given list.
 * Master-controller members are intentionally omitted so those bulbs still count.
 * Pass room-scoped lights (not the whole house).
 */
export function collectGroupedLightMemberIds(lights = []) {
    const set = new Set();
    for (const light of lights) {
        if (!light) continue;
        if (isMasterControllerLight(light)) continue;
        if (!isLightGroupEntity(light)) continue;
        for (const id of getLightGroupMemberIds(light)) set.add(id);
    }
    return set;
}

/**
 * Per-room quantity units (must match what the room lights grid counts):
 * - Master Controller only → skip (never count)
 * - Other groups (Track Light, Spots, Board A, …) → count as 1; skip their members
 * - Individual lights (including members of Master Controller) → count each
 *
 * Pass `groupedMemberIds` from `collectGroupedLightMemberIds(roomLights)`.
 */
export function isLightCountableUnit(light, groupedMemberIds) {
    const id = light?.entity_id;
    if (!id || !String(id).startsWith('light.')) return false;
    if (isMasterControllerLight(light)) return false;
    if (isAggregatedLightEntity(light)) return true;
    if (groupedMemberIds?.has?.(id)) return false;
    return true;
}

export function filterCountableLights(lights = []) {
    const memberIds = collectGroupedLightMemberIds(lights);
    return sortByNaturalName(lights.filter((l) => isLightCountableUnit(l, memberIds)));
}

/** On + countable units within a light list (room-scoped). */
export function countActiveCountableLights(lights = []) {
    const memberIds = collectGroupedLightMemberIds(lights);
    return lights.filter((l) => {
        const state = l?.stateObj?.state ?? l?.state;
        return state === 'on' && isLightCountableUnit(l, memberIds);
    }).length;
}

/** True when entity supports color temperature (mapping or HA color_temp mode). */
export function lightSupportsCCT(light, mapping = null) {
    const cap = getLightEffectiveCapability(light, mapping);
    if (cap === 'cct' || cap === 'rgb') return true;
    const modes = light?.stateObj?.attributes?.supported_color_modes || [];
    if (modes.includes('color_temp')) return true;
    return light?.stateObj?.attributes?.color_temp_kelvin != null;
}

/** True when entity supports RGB / HS color (mapping or HA modes). */
export function lightSupportsRGB(light, mapping = null) {
    const cap = getLightEffectiveCapability(light, mapping);
    if (cap === 'rgb') return true;
    const modes = light?.stateObj?.attributes?.supported_color_modes || [];
    if (modes.some((m) => RGB_MODES.has(m))) return true;
    return Array.isArray(light?.stateObj?.attributes?.rgb_color);
}
