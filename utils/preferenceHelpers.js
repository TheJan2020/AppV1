
/**
 * Checks if the current state matches the preferred state using fuzzy logic.
 * - Temperature/Climate: Matches if within +/- 1 degree.
 * - Humidity: Matches if within +/- 5 points.
 * - Others: Exact match.
 * 
 * @param {Object} entity - The entity object containing entity_id, current_state, preferred_state, and matches(bool).
 * @returns {boolean} - True if it matches the preference, False otherwise.
 */
export const checkPreferenceMatch = (entity) => {
    const current = parseFloat(entity.current_state);
    const preferred = parseFloat(entity.preferred_state);

    // If not numbers, fall back to backend's boolean or string comparison
    if (isNaN(current) || isNaN(preferred)) {
        // If 'matches' is defined, use it.
        if (entity.matches !== undefined) {
            return entity.matches;
        }
        // If 'needs_change' is defined, use the inverse.
        if (entity.needs_change !== undefined) {
            return !entity.needs_change;
        }
        // Fallback to strict string equality
        if (entity.preferred_state !== undefined && entity.preferred_state !== null) {
            return entity.current_state === entity.preferred_state;
        }

        return false; // No preference data? unique mismatch?
    }

    if (entity.entity_id.includes('temperature') || entity.entity_id.includes('climate')) {
        // +/- 1 degree for temperature
        return Math.abs(current - preferred) <= 1.01; // slightly loose for float precision
    }

    if (entity.entity_id.includes('humidity')) {
        // +/- 5 points for humidity
        return Math.abs(current - preferred) <= 5;
    }

    // Default to strict equality for numbers if not specific domain (though usually backend handles this)
    // But since backend sends 'matches', we can technically fallback to that if we want strictness.
    // However, if we parsed them as numbers, we might want strict number equality.
    // Let's rely on the boolean passed from backend for non-fuzzy types to be safe,
    // OR just use strict equality here.
    // Return backend match for non-fuzzy domains to ensure we don't break textual states that parsed as numbers by accident (unlikely but possible).

    if (entity.matches !== undefined) {
        return entity.matches;
    }
    // If 'needs_change' is defined, use the inverse.
    if (entity.needs_change !== undefined) {
        return !entity.needs_change;
    }

    return current === preferred;
};

/**
 * Formats the state value for display.
 * - Temperature/Climate: 1 decimal place.
 * - Others: Original string.
 * 
 * @param {string} state - The raw state string.
 * @param {string} entityId - The entity ID.
 * @returns {string} - Formatted state.
 */
export const formatPreferenceState = (state, entityId) => {
    const val = parseFloat(state);
    if (isNaN(val)) return state;

    if (entityId.includes('temperature') || entityId.includes('climate')) {
        return val.toFixed(1);
    }
    return state;
};
