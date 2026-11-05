import { cameraAllowedForRole, mergeCameraLists } from '../services/appRole';

export function cameraAccessToken(entity) {
    const direct = entity?.attributes?.access_token || entity?.access_token || entity?.accessToken;
    if (direct) return String(direct);
    const picture = String(entity?.attributes?.entity_picture || entity?.entity_picture || '');
    const match = picture.match(/[?&]token=([^&]+)/);
    return match ? decodeURIComponent(match[1]) : '';
}

/** Live Home Assistant cameras, including intercom cameras that are not in Frigate. */
export function liveHaCameras(entities = []) {
    return entities
        .filter((entity) => entity?.entity_id?.startsWith('camera.') && entity.state !== 'unavailable')
        .map((entity) => {
            const id = entity.entity_id;
            const friendly = entity.attributes?.friendly_name
                || id.replace(/^camera\./, '').replace(/_/g, ' ');
            return {
                id,
                name: id.replace(/^camera\./, ''),
                entity_id: id,
                friendly_name: friendly,
                feed: 'ha',
                source: 'ha',
                access_token: cameraAccessToken(entity),
            };
        });
}

/** Keep the existing camera list and add HA cameras the role is allowed to see. */
export function withLiveHaCameras(cameras, entities, role) {
    const incoming = liveHaCameras(entities).filter((camera) => {
        if (!role || role.allCameras !== false) return true;
        return cameraAllowedForRole(camera, role);
    });
    return mergeCameraLists(Array.isArray(cameras) ? cameras : [], incoming);
}

/** Door contact sensors. Battery and tamper sensors use a different device class. */
export function doorContactSensors(entities = []) {
    return entities.filter((entity) => (
        entity?.entity_id?.startsWith('binary_sensor.')
        && entity.attributes?.device_class === 'door'
        && entity.state !== 'unavailable'
    ));
}

/** Momentary door openers. This house uses a script instead of a lock entity. */
export function doorOpenScripts(entities = []) {
    return entities.filter((entity) => {
        if (!entity?.entity_id?.startsWith('script.')) return false;
        const blob = `${entity.entity_id} ${entity.attributes?.friendly_name || ''}`.toLowerCase();
        return blob.includes('door') && (blob.includes('open') || blob.includes('unlock'));
    });
}

export function doorSensorIsOpen(entity) {
    return entity?.state === 'on' || entity?.state === 'open';
}

/** Pair "open main door" with the main-entrance contact when both exist. */
export function sensorForDoorScript(script, sensors = []) {
    const blob = `${script?.entity_id || ''} ${script?.attributes?.friendly_name || ''}`.toLowerCase();
    if (blob.includes('main')) {
        return sensors.find((sensor) => /main/.test(`${sensor.entity_id} ${sensor.attributes?.friendly_name || ''}`)) || null;
    }
    return null;
}

function configuredSensorId(lockPassageConfigs, lockId) {
    const id = lockPassageConfigs?.[lockId]?.sensor_entity_id;
    if (!id || id === 'test' || !String(id).includes('.')) return null;
    return id;
}

/**
 * Locks that have a contact show that contact on the lock.
 * Contacts with no lock stay as their own rows in the same locks area.
 */
export function partitionDoorAccess({
    locks = [],
    sensors = [],
    openers = [],
    lockPassageConfigs = {},
    entities = [],
}) {
    const byId = new Map();
    for (const entity of [...sensors, ...entities]) {
        if (entity?.entity_id) byId.set(entity.entity_id, entity);
    }

    const used = new Set();
    const lockSensors = {};
    for (const lock of locks) {
        const id = configuredSensorId(lockPassageConfigs, lock?.entity_id);
        const sensor = id ? byId.get(id) : null;
        if (!sensor || sensor.state === 'unavailable') continue;
        lockSensors[lock.entity_id] = sensor;
        used.add(id);
    }

    const openerSensors = {};
    const remaining = sensors.filter((sensor) => sensor?.entity_id && !used.has(sensor.entity_id));
    for (const script of openers) {
        const sensor = sensorForDoorScript(script, remaining.filter((item) => !used.has(item.entity_id)));
        if (!sensor) continue;
        openerSensors[script.entity_id] = sensor;
        used.add(sensor.entity_id);
    }

    const standalone = sensors.filter((sensor) => sensor?.entity_id && !used.has(sensor.entity_id));
    return { lockSensors, openerSensors, standalone };
}

/**
 * One dot per lock. A linked door sensor shares that lock's dot.
 * A door sensor with no lock gets its own dot.
 */
export function accessStatusDots({ locks = [], openers = [], doorAccess }) {
    const dots = [];
    for (const lock of locks) {
        const sensor = doorAccess?.lockSensors?.[lock.entity_id];
        const unlocked = lock.state === 'unlocked' || lock.state === 'open';
        const open = doorSensorIsOpen(sensor);
        dots.push({
            key: lock.entity_id,
            tone: open ? 'open' : (unlocked ? 'unlocked' : 'closed'),
        });
    }
    for (const script of openers) {
        const sensor = doorAccess?.openerSensors?.[script.entity_id];
        if (!sensor) continue;
        dots.push({
            key: script.entity_id,
            tone: doorSensorIsOpen(sensor) ? 'open' : 'closed',
        });
    }
    for (const sensor of doorAccess?.standalone || []) {
        dots.push({
            key: sensor.entity_id,
            tone: doorSensorIsOpen(sensor) ? 'open' : 'closed',
        });
    }
    return dots;
}
