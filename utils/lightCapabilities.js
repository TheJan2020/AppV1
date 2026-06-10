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

export function isMasterControllerLight(light) {
    const id = light?.entity_id?.toLowerCase() || '';
    const name = light?.displayName?.toLowerCase() || '';
    return id.includes('master_controller') || name.includes('master controller');
}
