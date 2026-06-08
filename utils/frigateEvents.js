/**
 * Frigate event list helpers — dedupe + cursor pagination.
 */

/** @param {unknown} id */
export function normalizeEventId(id) {
    if (id == null || id === '') return null;
    return String(id);
}

/**
 * Secondary key when Frigate returns duplicate rows (same camera/time/label, different id).
 * @param {object} event
 */
export function eventFingerprint(event) {
    if (!event) return '';
    const cam = String(event.camera || '').toLowerCase();
    const label = String(event.label || event.sub_label || '').toLowerCase();
    const t = Number(event.start_time);
    const bucket = Number.isFinite(t) ? Math.floor(t) : 0;
    return `${cam}|${bucket}|${label}`;
}

/**
 * @param {Array} list
 * @param {Set<string>} [seenIds]
 * @param {Set<string>} [seenFingerprints]
 */
export function dedupeEventsById(list, seenIds, seenFingerprints) {
    if (!Array.isArray(list) || list.length === 0) return [];

    const idSet = seenIds || new Set();
    const fpSet = seenFingerprints || new Set();
    const out = [];

    for (const raw of list) {
        const id = normalizeEventId(raw?.id);
        if (!id) continue;

        const fp = eventFingerprint(raw);
        if (idSet.has(id) || (fp && fpSet.has(fp))) continue;

        idSet.add(id);
        if (fp) fpSet.add(fp);

        out.push(id === raw.id ? raw : { ...raw, id });
    }

    return out;
}

/**
 * @param {Array} existing
 * @param {Array} incoming
 * @param {boolean} reset
 * @param {{ seenIds: Set<string>, seenFingerprints: Set<string> }} [tracker]
 */
export function mergeEventLists(existing, incoming, reset, tracker) {
    const seenIds = reset ? new Set() : (tracker?.seenIds || buildSeenIds(existing));
    const seenFingerprints = reset
        ? new Set()
        : (tracker?.seenFingerprints || buildSeenFingerprints(existing));

    const base = reset ? [] : existing;
    const added = dedupeEventsById(incoming, seenIds, seenFingerprints);

    if (tracker) {
        tracker.seenIds = seenIds;
        tracker.seenFingerprints = seenFingerprints;
    }

    return [...base, ...added];
}

function buildSeenIds(list) {
    const s = new Set();
    for (const e of list || []) {
        const id = normalizeEventId(e?.id);
        if (id) s.add(id);
    }
    return s;
}

function buildSeenFingerprints(list) {
    const s = new Set();
    for (const e of list || []) {
        const fp = eventFingerprint(e);
        if (fp) s.add(fp);
    }
    return s;
}

/** @param {object} lastEvent */
export function paginationBeforeCursor(lastEvent) {
    if (!lastEvent) return null;

    const id = normalizeEventId(lastEvent.id);
    const t = Number(lastEvent.start_time);

    if (Number.isFinite(t)) {
        return t - 0.001;
    }

    return id || null;
}

/** Encode event id for URL path (dots in Frigate ids stay unencoded). */
export function encodeEventIdForPath(eventId) {
    const id = normalizeEventId(eventId);
    return id ? encodeURIComponent(id) : '';
}

/** @param {string} adminUrl */
export function getEventClipUrl(adminUrl, eventId) {
    const base = adminUrl.endsWith('/') ? adminUrl : `${adminUrl}/`;
    const enc = encodeEventIdForPath(eventId);
    return enc ? `${base}api/frigate/events/${enc}/clip.mp4` : '';
}

/** Alternate Frigate path when clip.mp4 is not ready. */
export function getEventClipUrlNoExt(adminUrl, eventId) {
    const base = adminUrl.endsWith('/') ? adminUrl : `${adminUrl}/`;
    const enc = encodeEventIdForPath(eventId);
    return enc ? `${base}api/frigate/events/${enc}/clip` : '';
}

const CLIP_LOG = '[EventClip]';

/** Resolve end timestamp — Frigate list API often omits end_time on active events. */
export function resolveEventEndTime(event) {
    const start = Number(event?.start_time);
    if (!Number.isFinite(start)) return null;

    const candidates = [
        event?.end_time,
        event?.data?.end_time,
        event?.data?.end,
    ];
    for (const raw of candidates) {
        const n = Number(raw);
        if (Number.isFinite(n) && n > start) return n;
    }
    return start + 30;
}

/** Same-origin path for HTML <video> (keeps progressive stream open in WKWebView). */
export function getClipRelativePath(adminUrl, clipUrl) {
    if (!clipUrl) return '';
    try {
        return new URL(clipUrl).pathname;
    } catch {
        const base = (adminUrl || '').replace(/\/$/, '');
        if (base && clipUrl.startsWith(base)) return clipUrl.slice(base.length) || '/';
        return clipUrl;
    }
}

/** Recording window clip — works in browser/WebView via admin proxy. */
export function getRecordingClipUrl(adminUrl, event) {
    const camera = event?.camera;
    const start = Number(event?.start_time);
    const end = resolveEventEndTime(event);
    if (!camera || !Number.isFinite(start) || end == null) return null;
    const usedDefault = !Number.isFinite(Number(event?.end_time)) || Number(event?.end_time) <= start;
    if (usedDefault) {
        console.log(`${CLIP_LOG} end_time missing for event ${event?.id} — using start+30 (${start}→${end})`);
    }
    const base = adminUrl.endsWith('/') ? adminUrl : `${adminUrl}/`;
    return `${base}api/frigate/${encodeURIComponent(camera)}/start/${start}/end/${end}/clip.mp4`;
}

/**
 * Primary playback URL for an event.
 * Prefers recording window clip (reliable in WebView); falls back to event clip.
 * @param {string} adminUrl
 * @param {object} event
 * @returns {string|null}
 */
export function getEventPlayUrl(adminUrl, event) {
    if (!adminUrl || !event) return null;
    const recording = getRecordingClipUrl(adminUrl, event);
    if (recording) return recording;
    const id = normalizeEventId(event.id);
    return id ? getEventClipUrl(adminUrl, id) : null;
}

/** @param {string} adminUrl */
export function getEventThumbnailUrl(adminUrl, eventId) {
    const base = adminUrl.endsWith('/') ? adminUrl : `${adminUrl}/`;
    const enc = encodeEventIdForPath(eventId);
    return enc ? `${base}api/frigate/events/${enc}/thumbnail` : '';
}

function normalizeAuthHeaders(headers) {
    if (!headers || typeof headers !== 'object') return {};
    const out = {};
    for (const [key, value] of Object.entries(headers)) {
        if (typeof value === 'string' && value.length > 0) out[key] = value;
    }
    return out;
}

function clipLabelFromUrl(url) {
    if (!url) return 'unknown';
    if (url.includes('/clip.mp4') && url.includes('/events/')) return 'event clip (.mp4)';
    if (url.endsWith('/clip') || url.includes('/events/') && url.includes('/clip')) return 'event clip';
    if (url.includes('/start/') && url.includes('/end/')) return 'recording window';
    return url;
}

/**
 * @returns {Promise<{ url: string|null, headers: Record<string, string>, source: string }>}
 */
export async function resolveEventClipUrl(adminUrl, event, headers = {}, opts = {}) {
    const onProgress = opts.onProgress;
    const eventId = normalizeEventId(event?.id);
    const url = getEventPlayUrl(adminUrl, event);
    const source = url?.includes('/start/') ? 'recording' : 'event-mp4';

    if (url) {
        const msg = `Using ${clipLabelFromUrl(url)}`;
        console.log(`${CLIP_LOG} [${eventId || '?'}] ${msg}`);
        onProgress?.(msg);
        return { url, headers: normalizeAuthHeaders(headers), source, candidates: [] };
    }

    console.log(`${CLIP_LOG} [${eventId || '?'}] No clip URL available`);
    onProgress?.('No clip URL available');
    return { url: null, headers: {}, source: null, candidates: [] };
}
