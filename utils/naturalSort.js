/**
 * Natural name order: Light 1, Light 2, Light 10 — and Light A, Light B / Bulb A, Bulb B.
 */
const COLLATOR = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

export function compareNaturalNames(a, b) {
    return COLLATOR.compare(String(a || ''), String(b || ''));
}

export function entityNaturalName(entity) {
    return String(
        entity?.displayName
        || entity?.name
        || entity?.attributes?.friendly_name
        || entity?.stateObj?.attributes?.friendly_name
        || entity?.entity_id
        || '',
    );
}

export function sortByNaturalName(list, getName = entityNaturalName) {
    if (!Array.isArray(list) || list.length < 2) return Array.isArray(list) ? [...list] : [];
    return [...list].sort((a, b) => compareNaturalNames(getName(a), getName(b)));
}
