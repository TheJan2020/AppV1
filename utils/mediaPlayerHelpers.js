/**
 * Home Assistant media_player helpers (position, play state).
 *
 * Time data path in the app:
 *   HA WebSocket → `state_changed` events → `entities[]` state → MusicMediaCard
 *   Attributes used: `media_position`, `media_position_updated_at`, `media_duration`
 *
 * Music Assistant and some speakers use `on` while playing; position drifts without
 * `media_position_updated_at` interpolation.
 */

import { isMusicAssistantMediaPlayer } from './roomHelpers';

const PLAYING_STATES = new Set(['playing', 'buffering']);

/** Parse HA UTC timestamps (with or without explicit timezone). */
export function parseHaTimestamp(value) {
    if (value == null || value === '') return NaN;
    const s = String(value).trim();
    const hasTz = /[zZ]$|[+-]\d{2}:\d{2}$/.test(s);
    const normalized = hasTz ? s : `${s}Z`;
    return new Date(normalized).getTime();
}

function statePriority(state) {
    const s = (state || '').toLowerCase();
    if (s === 'playing') return 4;
    if (s === 'buffering') return 3;
    if (s === 'paused') return 2;
    if (s === 'on') return 1;
    return 0;
}

/** True when HA reports active playback (incl. `on` with track metadata). */
export function isMediaPlayerPlaying(state, attributes = {}) {
    const s = (state || '').toLowerCase();
    if (PLAYING_STATES.has(s)) return true;
    if (s === 'on') {
        return !!(
            attributes.media_title ||
            attributes.media_content_id ||
            attributes.media_artist ||
            attributes.media_album_name
        );
    }
    return false;
}

export function isMediaPlayerPaused(state) {
    return (state || '').toLowerCase() === 'paused';
}

/** States that may carry transport controls (parent/child picker). */
export function isMediaPlayerEngaged(state, attributes = {}) {
    const s = (state || '').toLowerCase();
    if (['playing', 'buffering', 'paused', 'on'].includes(s)) return true;
    if (s === 'idle' && (attributes.media_title || attributes.media_content_id)) return true;
    return false;
}

/**
 * Current playback position in seconds (interpolates while playing).
 */
export function getMediaPlayerPosition(state, attributes = {}) {
    const pos = Number(attributes.media_position);
    const base = Number.isFinite(pos) ? pos : 0;

    if (!isMediaPlayerPlaying(state, attributes)) return base;

    const updatedAt = attributes.media_position_updated_at;
    if (!updatedAt) return base;

    const updatedMs = parseHaTimestamp(updatedAt);
    if (!Number.isFinite(updatedMs)) return base;

    const elapsed = (Date.now() - updatedMs) / 1000;
    if (elapsed < 0) return base;

    const duration = Number(attributes.media_duration);
    const next = base + elapsed;
    if (Number.isFinite(duration) && duration > 0) return Math.min(next, duration);
    return next;
}

/** Duration in seconds; normalizes ms if integration sends huge values. */
export function getMediaPlayerDuration(attributes = {}) {
    const raw = Number(attributes.media_duration);
    if (!Number.isFinite(raw) || raw <= 0) return 0;
    // Some integrations send milliseconds (e.g. 240000 for a 4 min track).
    if (raw > 36000) return Math.round(raw / 1000);
    return raw;
}

/**
 * Pick the media_player row with the freshest playback metadata.
 * Grouped child speakers often lag behind the Music Assistant parent queue player.
 */
export function pickMediaControlTarget(player, childPlayers = [], musicAssistantEntryIds = null) {
    const candidates = [player, ...(childPlayers || [])].filter(c => c?.stateObj);
    if (!candidates.length) return player;

    const engaged = candidates.filter(c =>
        isMediaPlayerEngaged(c.stateObj.state, c.stateObj.attributes || {})
    );
    if (!engaged.length) return player;

    const scored = engaged.map(entity => {
        const attrs = entity.stateObj.attributes || {};
        const updatedMs = parseHaTimestamp(attrs.media_position_updated_at);
        return {
            entity,
            isMa: isMusicAssistantMediaPlayer(entity, entity.stateObj, musicAssistantEntryIds),
            statePriority: statePriority(entity.stateObj.state),
            updatedMs: Number.isFinite(updatedMs) ? updatedMs : 0,
            position: Number(attrs.media_position) || 0,
            hasPositionMeta: attrs.media_position_updated_at != null,
        };
    });

    scored.sort((a, b) => {
        if (a.isMa !== b.isMa) return (b.isMa ? 1 : 0) - (a.isMa ? 1 : 0);
        if (a.statePriority !== b.statePriority) return b.statePriority - a.statePriority;
        if (a.hasPositionMeta !== b.hasPositionMeta) return (b.hasPositionMeta ? 1 : 0) - (a.hasPositionMeta ? 1 : 0);
        if (a.updatedMs !== b.updatedMs) return b.updatedMs - a.updatedMs;
        return b.position - a.position;
    });

    return scored[0].entity;
}

/** Debug snapshot of position fields for all grouped players (dev logging). */
export function getMediaPositionDebugSnapshot(player, childPlayers = []) {
    return [player, ...(childPlayers || [])]
        .filter(c => c?.stateObj)
        .map(c => {
            const attrs = c.stateObj.attributes || {};
            return {
                entity_id: c.entity_id,
                state: c.stateObj.state,
                media_position: attrs.media_position,
                media_position_updated_at: attrs.media_position_updated_at,
                media_duration: attrs.media_duration,
                computed: getMediaPlayerPosition(c.stateObj.state, attrs),
            };
        });
}
