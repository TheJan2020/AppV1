/**
 * Home Assistant entity / connection health helpers.
 */

export const BAD_ENTITY_STATES = new Set(['unavailable', 'unknown']);

/** Domains we treat as user-controllable when judging data quality. */
const CONTROLLABLE_DOMAINS = new Set([
    'light', 'switch', 'fan', 'climate', 'cover', 'lock', 'media_player',
    'vacuum', 'humidifier', 'water_heater', 'valve', 'button', 'input_boolean',
]);

export function normalizeEntityState(state) {
    return String(state ?? '').toLowerCase().trim();
}

export function isBadEntityState(state) {
    return BAD_ENTITY_STATES.has(normalizeEntityState(state));
}

export function isEntityControllable(entity) {
    if (!entity?.entity_id) return false;
    return !isBadEntityState(entity.state);
}

export function getEntityHealthLabel(state) {
    const s = normalizeEntityState(state);
    if (s === 'unavailable') return 'Unavailable';
    if (s === 'unknown') return 'Unknown';
    return null;
}

/**
 * Summarize how many monitored entities are unknown/unavailable.
 */
export function analyzeEntitiesHealth(entities = [], options = {}) {
    const {
        minCount = 8,
        thresholdPct = 0.35,
    } = options;

    const controllable = (entities || []).filter((e) => {
        const domain = e.entity_id?.split('.')?.[0];
        return domain && CONTROLLABLE_DOMAINS.has(domain);
    });

    const bad = controllable.filter((e) => isBadEntityState(e.state));
    const total = controllable.length;
    const badCount = bad.length;
    const badPct = total > 0 ? badCount / total : 0;

    return {
        total,
        badCount,
        badPct,
        isDegraded: total >= minCount && badPct >= thresholdPct,
    };
}

export const HA_STATUS = {
    LOADING: 'loading',
    CONNECTED: 'connected',
    DISCONNECTED: 'disconnected',
    AUTH_FAILED: 'auth_failed',
    NOT_CONFIGURED: 'not_configured',
};

export const ADMIN_STATUS = {
    UNKNOWN: 'unknown',
    OK: 'ok',
    ERROR: 'error',
};
