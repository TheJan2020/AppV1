/**
 * Build light.turn_on payloads that match what Home Assistant entities accept
 * (kelvin vs mireds, rgb vs hs, brightness when off).
 */

const RGB_MODES = new Set(['rgb', 'rgbw', 'rgbww']);
const HS_MODES = new Set(['hs', 'xy']);

export function getLightAttributes(entityOrLight) {
    if (!entityOrLight) return {};
    if (entityOrLight.stateObj?.attributes) return entityOrLight.stateObj.attributes;
    return entityOrLight.attributes || {};
}

export function getLightState(entityOrLight) {
    if (!entityOrLight) return 'unknown';
    if (entityOrLight.stateObj?.state) return entityOrLight.stateObj.state;
    return entityOrLight.state ?? 'unknown';
}

function kelvinToMired(kelvin) {
    return Math.round(1000000 / kelvin);
}

function clampKelvin(kelvin, attrs) {
    const min = attrs.min_color_temp_kelvin ?? 2000;
    const max = attrs.max_color_temp_kelvin ?? 6500;
    return Math.max(min, Math.min(max, Math.round(kelvin)));
}

function clampMired(mired, attrs) {
    const min = attrs.min_mireds ?? 153;
    const max = attrs.max_mireds ?? 500;
    return Math.max(min, Math.min(max, Math.round(mired)));
}

/** Prefer mireds when entity reports them and not kelvin. */
function prefersMiredColorTemp(attrs) {
    if (attrs.min_color_temp_kelvin != null || attrs.max_color_temp_kelvin != null) return false;
    if (attrs.color_temp_kelvin != null && attrs.color_temp == null) return false;
    return attrs.min_mireds != null || attrs.max_mireds != null || attrs.color_temp != null;
}

function rgbToHue([r, g, b]) {
    r /= 255;
    g /= 255;
    b /= 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    if (max === min) return 0;
    let h;
    if (max === r) h = ((g - b) / (max - min)) % 6;
    else if (max === g) h = (b - r) / (max - min) + 2;
    else h = (r - g) / (max - min) + 4;
    return ((h * 60) + 360) % 360;
}

function ensureBrightness(payload, entityOrLight, attrs) {
    if (payload.brightness != null) return payload;
    const state = getLightState(entityOrLight);
    if (state === 'on') return payload;
    payload.brightness = attrs.brightness ?? 255;
    return payload;
}

/** Read kelvin from HA attrs (kelvin or mired). */
export function readColorTempKelvin(attrs = {}) {
    if (attrs.color_temp_kelvin != null) return attrs.color_temp_kelvin;
    if (attrs.color_temp != null) return Math.round(1000000 / attrs.color_temp);
    return null;
}

export function buildLightColorTempPayload(entityId, entityOrLight, kelvin) {
    const attrs = getLightAttributes(entityOrLight);
    const payload = { entity_id: entityId };
    const clamped = clampKelvin(kelvin, attrs);

    if (prefersMiredColorTemp(attrs)) {
        payload.color_temp = clampMired(kelvinToMired(clamped), attrs);
    } else {
        payload.color_temp_kelvin = clamped;
    }

    return ensureBrightness(payload, entityOrLight, attrs);
}

export function buildLightRgbPayload(entityId, entityOrLight, rgb) {
    const attrs = getLightAttributes(entityOrLight);
    const modes = attrs.supported_color_modes || [];
    const payload = { entity_id: entityId };

    const hasRgbMode = modes.some((m) => RGB_MODES.has(m));
    const hasHsMode = modes.some((m) => HS_MODES.has(m));

    if (hasHsMode && !hasRgbMode) {
        payload.hs_color = [Math.round(rgbToHue(rgb)), 100];
    } else {
        payload.rgb_color = rgb;
    }

    return ensureBrightness(payload, entityOrLight, attrs);
}
