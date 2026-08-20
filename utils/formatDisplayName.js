/**
 * Humanize HA / Frigate / slug-style identifiers for UI labels.
 *
 * Examples:
 *   demo_area          → Demo Area
 *   front-door-cam     → Front Door Cam
 *   camera.demo_area   → Demo Area
 *   CEO Office         → CEO Office  (already titled — left alone)
 *   living room        → Living Room
 */

const ENTITY_ID_RE = /^[a-z][a-z0-9_]*\.[a-z0-9_]+$/i;

/**
 * @param {unknown} raw
 * @returns {string}
 */
export function formatDisplayName(raw) {
    if (raw == null) return '';
    let s = String(raw).trim();
    if (!s) return '';

    // Strip HA entity domain: camera.demo_area → demo_area
    if (ENTITY_ID_RE.test(s)) {
        s = s.slice(s.indexOf('.') + 1);
    }

    // Already a proper display name (spaces + some capitals) — keep as-is
    // so acronyms like "CEO Office" / "HVAC Zone" are not mangled.
    if (/\s/.test(s) && /[A-Z]/.test(s)) {
        return s;
    }

    // Normalize separators (underscores / hyphens) and collapse whitespace
    s = s
        .replace(/[_-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    if (!s) return '';

    // Title-case each word
    return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Alias for camera labels (Frigate keys, HA camera entity ids, friendly names). */
export function formatCameraName(raw) {
    return formatDisplayName(raw);
}
