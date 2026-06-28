/**
 * Infer light icon type from entity_id / display name using keyword rules,
 * then fall back to matching tokens against admin light type names.
 */

export const LIGHT_TYPE_ENTITY_RULES = [
    {
        id: 'up_lights',
        label: 'Up Lights',
        patterns: ['up_lights', 'up_light', 'uplight', 'up lights'],
        typeNames: ['Up Lights'],
        example: 'light.patio_up_lights',
    },
    {
        id: 'spot',
        label: 'Spot Light',
        patterns: ['spotlight', 'spot_light', 'spot'],
        typeNames: ['Spot Light'],
        example: 'light.kitchen_spot_1',
    },
    {
        id: 'chandelier',
        label: 'Chandelier',
        patterns: ['chandelier', 'chandlier'],
        typeNames: ['Chandelier', 'Chandlier'],
        example: 'light.dining_chandelier',
    },
    {
        id: 'track',
        label: 'Track Light',
        patterns: ['track_light', 'track'],
        typeNames: ['Track Light'],
        example: 'light.hall_track',
    },
    {
        id: 'cove',
        label: 'Coved LED',
        patterns: ['coved_led', 'cove_led', 'coved', 'cove'],
        typeNames: ['Coved LED', 'Cove LED'],
        example: 'light.living_cove_led',
    },
    {
        id: 'flood',
        label: 'Flood Light',
        patterns: ['flood_light', 'flood'],
        typeNames: ['Flood Light', 'Flood'],
        example: 'light.small_flood',
    },
    {
        id: 'grill',
        label: 'Grill Light',
        patterns: ['grill_light', 'grill'],
        typeNames: ['Grill Light', 'Grill'],
        example: 'light.big_grill',
    },
    {
        id: 'ball',
        label: 'Ball',
        patterns: ['ball_light', 'ball'],
        typeNames: ['Ball', 'Ball Light'],
        example: 'light.ball',
    },
    {
        id: 'cylinder',
        label: 'Cylinder',
        patterns: ['cylinder_light', 'cylinder'],
        typeNames: ['Cylinder', 'Cylinder Light'],
        example: 'light.cylinder',
    },
    {
        id: 'bulb',
        label: 'Generic Bulb',
        patterns: ['generic_bulb', 'bulb'],
        typeNames: ['Generic Bulb'],
        example: 'light.bedroom_bulb',
    },
];

const GENERIC_TYPE_TOKENS = new Set([
    'light', 'lights', 'led', 'lamp', 'generic', 'default', 'icon', 'type', 'small', 'big',
]);

function normalizeText(text) {
    return String(text || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
}

function normalizeTypeName(name) {
    return String(name || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

function getSearchTexts(entityId, displayName) {
    const texts = [];
    if (entityId) {
        texts.push(entityId);
        const slug = entityId.replace(/^light\./i, '');
        if (slug && slug !== entityId) texts.push(slug);
    }
    if (displayName) texts.push(displayName);
    return texts.map(normalizeText).filter(Boolean);
}

function textMatchesPattern(normalizedText, pattern) {
    const p = normalizeText(pattern);
    if (!p || !normalizedText) return false;
    if (normalizedText.includes(p)) return true;
    const tokens = normalizedText.split('_').filter(Boolean);
    if (tokens.some((token) => token === p)) return true;
    return tokens.some((token) => token.startsWith(`${p}_`) || token.endsWith(`_${p}`));
}

function getTypeNameTokens(typeName) {
    return normalizeText(typeName)
        .split('_')
        .filter((token) => token.length >= 3 && !GENERIC_TYPE_TOKENS.has(token));
}

function findLightTypeByNames(typeNames, lightTypes) {
    if (!Array.isArray(lightTypes) || lightTypes.length === 0) return null;
    const indexed = lightTypes.map((t) => ({ ...t, norm: normalizeTypeName(t.name) }));

    for (const name of typeNames) {
        const norm = normalizeTypeName(name);
        const exact = indexed.find((t) => t.norm === norm);
        if (exact) return exact;
    }
    for (const name of typeNames) {
        const norm = normalizeTypeName(name);
        const partial = indexed.find((t) => t.norm.includes(norm) || norm.includes(t.norm));
        if (partial) return partial;
    }
    return null;
}

function inferFromAdminTypeNames(entityId, displayName, lightTypes) {
    const searchTexts = getSearchTexts(entityId, displayName);
    if (!searchTexts.length) return null;

    const ranked = lightTypes
        .map((type) => ({
            type,
            tokens: getTypeNameTokens(type.name),
        }))
        .filter((entry) => entry.tokens.length > 0)
        .sort((a, b) => {
            const maxA = Math.max(...a.tokens.map((token) => token.length));
            const maxB = Math.max(...b.tokens.map((token) => token.length));
            return maxB - maxA;
        });

    for (const { type, tokens } of ranked) {
        const matched = tokens.some((token) =>
            searchTexts.some((text) => textMatchesPattern(text, token)),
        );
        if (matched) return type;
    }
    return null;
}

/**
 * @returns {object|null} light type row from admin backend (`{ id, name, icon_path }`)
 */
export function inferLightTypeFromEntity(entityId, displayName, lightTypes) {
    if (!entityId) return null;

    const searchTexts = getSearchTexts(entityId, displayName);
    if (searchTexts.length === 0) return null;

    for (const rule of LIGHT_TYPE_ENTITY_RULES) {
        const matched = rule.patterns.some((pattern) =>
            searchTexts.some((text) => textMatchesPattern(text, pattern)),
        );
        if (!matched) continue;
        const type = findLightTypeByNames(rule.typeNames, lightTypes || []);
        if (type) return type;
        return { id: null, name: rule.typeNames[0] };
    }

    return inferFromAdminTypeNames(entityId, displayName, lightTypes || [])
        || { id: null, name: 'Generic Bulb' };
}

/** Attach inferred `lightType` when admin has not set one explicitly. */
export function enrichLightMappings(mappings, lightTypes) {
    if (!Array.isArray(mappings)) return [];

    return mappings.map((mapping) => {
        if (mapping?.lightType) return mapping;
        const inferred = inferLightTypeFromEntity(
            mapping.entity_id,
            mapping.friendly_name || mapping.display_name || null,
            lightTypes || [],
        );
        if (!inferred) return mapping;
        return { ...mapping, lightType: inferred, lightTypeInferred: true };
    });
}
