/**
 * HA entity updates: apply only fields that actually changed.
 * - WebSocket state_changed: diff old_state → new_state
 * - Local climate actions: patch only the field that service touched
 */

function attrsEqual(a, b) {
    if (a === b) return true;
    if (a == null || b == null) return false;
    if (Array.isArray(a) && Array.isArray(b)) {
        return a.length === b.length && a.every((v, i) => v === b[i]);
    }
    return false;
}

/**
 * Merge a state_changed event by applying only attribute/state diffs from this event.
 */
export function applyHaStateChangedEvent(prevEntity, eventData) {
    const { old_state: oldState, new_state: newState } = eventData || {};
    if (!newState) return prevEntity;
    if (!prevEntity || prevEntity.entity_id !== newState.entity_id) {
        return newState;
    }
    if (!oldState) {
        return newState;
    }

    const oldAttrs = oldState.attributes || {};
    const newAttrs = newState.attributes || {};
    const changedAttrs = {};
    const allKeys = new Set([...Object.keys(oldAttrs), ...Object.keys(newAttrs)]);

    for (const key of allKeys) {
        const nextVal = newAttrs[key];
        const prevVal = oldAttrs[key];
        if (!attrsEqual(nextVal, prevVal) && nextVal !== undefined) {
            changedAttrs[key] = nextVal;
        }
    }

    const nextEntityState = newState.state !== oldState.state
        ? newState.state
        : prevEntity.state;

    return {
        ...prevEntity,
        state: nextEntityState,
        attributes: {
            ...(prevEntity.attributes || {}),
            ...changedAttrs,
        },
        last_changed: newState.last_changed ?? prevEntity.last_changed,
        last_updated: newState.last_updated ?? prevEntity.last_updated,
    };
}

export function getClimateTempBounds(attributes = {}) {
    const min = attributes.min_temp;
    const max = attributes.max_temp;
    return {
        min: min != null && !Number.isNaN(Number(min)) ? Number(min) : null,
        max: max != null && !Number.isNaN(Number(max)) ? Number(max) : null,
    };
}

export function isClimateTemperatureValid(temp, attributes = {}) {
    if (temp == null || Number.isNaN(Number(temp))) return false;
    const t = Number(temp);
    const { min, max } = getClimateTempBounds(attributes);
    if (min != null && t < min) return false;
    if (max != null && t > max) return false;
    return true;
}

/** Apply only the fields our climate service call is meant to change. */
export function applyClimateServiceToEntity(entity, service, data) {
    if (!entity) return entity;

    const patch = { attributes: {} };

    switch (service) {
        case 'set_temperature':
            if (data.temperature != null) {
                if (!isClimateTemperatureValid(data.temperature, entity.attributes)) {
                    return entity;
                }
                patch.attributes.temperature = data.temperature;
            }
            break;
        case 'set_fan_mode':
            if (data.fan_mode != null) {
                patch.attributes.fan_mode = data.fan_mode;
            }
            break;
        case 'set_hvac_mode':
            if (data.hvac_mode != null) {
                patch.state = data.hvac_mode;
                patch.attributes.hvac_mode = data.hvac_mode;
            }
            break;
        case 'set_preset_mode':
            if (data.preset_mode != null) {
                patch.attributes.preset_mode = data.preset_mode;
            }
            break;
        default:
            return entity;
    }

    return {
        ...entity,
        ...(patch.state != null ? { state: patch.state } : {}),
        attributes: {
            ...(entity.attributes || {}),
            ...patch.attributes,
        },
    };
}

/** @deprecated Use applyHaStateChangedEvent for websocket updates */
export function mergeHaEntityUpdate(prev, newState) {
    if (!newState) return prev;
    if (!prev || prev.entity_id !== newState.entity_id) return newState;
    return applyHaStateChangedEvent(prev, {
        old_state: prev,
        new_state: newState,
    });
}
