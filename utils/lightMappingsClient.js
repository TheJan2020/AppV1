import { enrichLightMappings, inferLightTypeFromEntity } from './lightTypeInference';
import { authFetch } from './authFetch';
import { preloadLocalLightIcons } from './lightTypeAssets';

let cachedLightTypes = [];

/** Light types from the most recent admin fetch (used for runtime inference). */
export function getLightTypes() {
    return cachedLightTypes;
}

function normalizeBaseUrl(baseUrl) {
    return baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
}

async function fetchAdminJson(url, fetchFn, options = {}) {
    let res = await fetch(url, options);
    if (!res.ok) res = await fetchFn(url, options);
    return res;
}

/** Fetch and cache light types from admin (used when mappings load separately). */
export async function fetchLightTypesCache(baseUrl, fetchFn = authFetch, options = {}) {
    const url = normalizeBaseUrl(baseUrl);
    const res = await fetchAdminJson(`${url}api/light-types?t=${Date.now()}`, fetchFn, options);
    if (res.ok) {
        const types = await res.json();
        if (Array.isArray(types)) {
            cachedLightTypes = types;
            preloadLocalLightIcons();
        }
    }
    return cachedLightTypes;
}

/**
 * Resolve mapping for a light entity, inferring icon type when needed.
 * Explicit admin `lightTypeId` always wins over inference.
 */
export function getLightMapping(entityId, lightMappings = [], lightTypes, displayName = null) {
    const explicit = lightMappings.find((m) => m.entity_id === entityId);
    if (explicit?.lightType) return explicit;

    const types = lightTypes ?? cachedLightTypes;
    const inferredType = inferLightTypeFromEntity(entityId, displayName, types);
    if (inferredType) {
        return {
            ...(explicit || { entity_id: entityId }),
            lightType: inferredType,
            lightTypeInferred: !explicit?.lightTypeId,
        };
    }
    return explicit || null;
}

/**
 * Fetch light entity mappings and light types from admin backend, enriching
 * mappings with inferred icon types when none is set in admin.
 */
export async function fetchEnrichedLightMappings(baseUrl, fetchFn, options = {}) {
    const { signal } = options;
    const url = normalizeBaseUrl(baseUrl);
    const t = Date.now();

    const [entitiesRes, typesRes] = await Promise.all([
        fetchAdminJson(`${url}api/monitored-entities?type=light&t=${t}`, fetchFn, { signal }),
        fetchAdminJson(`${url}api/light-types?t=${t}`, fetchFn, { signal }),
    ]);

    const entities = entitiesRes.ok ? await entitiesRes.json() : [];
    const types = typesRes.ok ? await typesRes.json() : [];
    cachedLightTypes = Array.isArray(types) ? types : [];

    if (!Array.isArray(entities)) return [];

    const enriched = enrichLightMappings(entities, cachedLightTypes);
    preloadLocalLightIcons();
    return enriched;
}
