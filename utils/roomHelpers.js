/**
 * Music Assistant players: prefer matching entity registry `config_entry_id` to a Music Assistant
 * integration entry (most reliable). Fallback: legacy `platform`, state `mass_player_type`.
 *
 * @param {object} re — entity registry row (may include `config_entry_id`)
 * @param {object|null} stateObj — live state for `mass_player_type`
 * @param {string[]|Set|null} musicAssistantConfigEntryIds — `entry_id`s where domain is `music_assistant`
 */
import { inferCoverLayer, findCoverMapping, isMasterCover } from './coverWindows';
import { findLinkedRemote } from './tvRemote';
import { attachAcPowerSwitches } from './acPowerSwitch';
import { sortByNaturalName } from './naturalSort';

export function isMusicAssistantMediaPlayer(re, stateObj, musicAssistantConfigEntryIds = null) {
    const ids =
        musicAssistantConfigEntryIds instanceof Set
            ? musicAssistantConfigEntryIds
            : Array.isArray(musicAssistantConfigEntryIds) && musicAssistantConfigEntryIds.length > 0
              ? new Set(musicAssistantConfigEntryIds)
              : null;
    if (ids?.size && re?.config_entry_id && ids.has(re.config_entry_id)) return true;
    if (re?.platform === 'music_assistant') return true;
    const v = stateObj?.attributes?.mass_player_type;
    return v != null && v !== '';
}

/** Infer temperature / humidity when admin sensorType is unset ("Auto"). */
export function inferSensorType(entityId, stateObj, mappedType = null) {
    if (mappedType) return mappedType;

    const dc = (stateObj?.attributes?.device_class || '').toLowerCase();
    if (dc === 'temperature') return 'temperature';
    if (dc === 'humidity') return 'humidity';
    if (dc === 'door' || dc === 'window' || dc === 'opening' || dc === 'garage_door') return 'door';
    if (dc === 'motion') return 'motion';
    if (dc === 'occupancy') return 'occupancy';
    if (dc === 'battery') return 'battery';
    if (dc === 'power' || dc === 'energy') return 'power';
    if (dc === 'smoke' || dc === 'gas' || dc === 'carbon_monoxide') return 'smoke';
    if (dc === 'moisture') return 'water';

    const id = (entityId || '').toLowerCase();
    if (id.includes('humidity')) return 'humidity';
    if (
        id.includes('temperature') ||
        id.includes('_temp') ||
        id.endsWith('.temp') ||
        id.includes('indoor_temp') ||
        id.includes('room_temp')
    ) {
        return 'temperature';
    }
    return null;
}

/** Temp/humidity sensors are often HA "diagnostic" — still show them in rooms. */
function isRoomClimateSensor(re, stateObj, mappedType) {
    if (!re?.entity_id?.startsWith('sensor.')) return false;
    const type = inferSensorType(re.entity_id, stateObj, mappedType);
    return type === 'temperature' || type === 'humidity';
}

/** Entity ids assigned to any of the given area_ids (direct or via device area). */
export function getEntityIdsForAreaIds(areaIds, registryDevices = [], registryEntities = []) {
    const areaSet = areaIds instanceof Set ? areaIds : new Set(areaIds || []);
    if (!areaSet.size) return new Set();

    const deviceInScope = new Set();
    for (const d of registryDevices) {
        if (d?.id && d.area_id && areaSet.has(d.area_id)) deviceInScope.add(d.id);
    }

    const entityIds = new Set();
    for (const re of registryEntities) {
        if (!re?.entity_id) continue;
        if (re.area_id && areaSet.has(re.area_id)) {
            entityIds.add(re.entity_id);
            continue;
        }
        if (re.device_id && deviceInScope.has(re.device_id)) {
            entityIds.add(re.entity_id);
        }
    }
    return entityIds;
}

export const getRoomEntities = (
    room,
    registryDevices = [],
    registryEntities = [],
    allEntities = [],
    sensorMappings = [],
    coverMappings = [],
    mediaMappings = [],
    musicAssistantConfigEntryIds = null,
    climateMappings = [],
) => {
    if (!room) {
        return {
            lights: [],
            fans: [],
            climates: [],
            covers: [],
            cameras: [],
            sensors: [],
            doors: [],
            switches: [],
            automations: [],
            scripts: [],
            medias: [],
            musicMedias: [],
        };
    }

    const safeRegistryDevices = Array.isArray(registryDevices) ? registryDevices : [];
    const safeRegistryEntities = Array.isArray(registryEntities) ? registryEntities : [];
    const safeAllEntities = Array.isArray(allEntities) ? allEntities : [];
    const safeSensorMappings = Array.isArray(sensorMappings) ? sensorMappings : [];
    const safeCoverMappings = Array.isArray(coverMappings) ? coverMappings : [];
    const safeMediaMappings = Array.isArray(mediaMappings) ? mediaMappings : [];
    const safeClimateMappings = Array.isArray(climateMappings) ? climateMappings : [];

    const areaDevices = safeRegistryDevices.filter(d => d.area_id === room.area_id);
    const areaDeviceIds = areaDevices.map(d => d.id);

    /**
     * Room membership follows Home Assistant **Areas** (Settings → Areas & Zones → Areas),
     * not geographic **Zones** (used for presence / automations).
     * An entity is in this room when either:
     * - the entity registry assigns `area_id` to this room, or
     * - the entity’s device is assigned to this room (`device.area_id` matches via registry).
     * TV and music `media_player` entities use the same rules as lights and climate.
     */
    const potentialEntities = safeRegistryEntities.filter(re => {
        const directMatch = re.area_id === room.area_id;
        const deviceMatch = re.device_id && areaDeviceIds.includes(re.device_id);
        if (!(directMatch || deviceMatch)) return false;
        // Filter out disabled, hidden, and non-user-facing entities (matches HA frontend behavior)
        if (re.disabled_by) return false;
        if (re.hidden_by) return false;
        if (re.entity_category === 'config') return false;
        if (re.entity_category === 'diagnostic') {
            const stateObj = safeAllEntities.find(e => e.entity_id === re.entity_id);
            const mapping = safeSensorMappings.find(m => m.entity_id === re.entity_id);
            // Keep indoor temp/humidity sensors even when HA marks them diagnostic
            if (!isRoomClimateSensor(re, stateObj, mapping?.sensorType || null)) return false;
        }
        return true;
    });


    const lightEntries = potentialEntities.filter(re => re.entity_id.startsWith('light.'));
    const lockEntries = potentialEntities.filter(re => re.entity_id.startsWith('lock.'));
    const fanEntries = potentialEntities.filter(re => re.entity_id.startsWith('fan.'));
    const climateEntries = potentialEntities.filter(re => re.entity_id.startsWith('climate.'));
    const coverEntries = potentialEntities.filter(re => re.entity_id.startsWith('cover.'));
    /**
     * Room “Media” = TV-style players only. Many integrations omit `device_class: tv`,
     * so we **exclude** obvious music/speaker entities instead of requiring a TV signal.
     */
    const excludedMediaTypes = new Set(['speaker', 'music']);
    const isTvMediaPlayer = re => {
        const map = safeMediaMappings.find(m => m.entity_id === re.entity_id);
        const t = (map?.mediaType?.type || '').toLowerCase();
        if (excludedMediaTypes.has(t)) return false;

        const stateObj = safeAllEntities.find(e => e.entity_id === re.entity_id);
        if (isMusicAssistantMediaPlayer(re, stateObj, musicAssistantConfigEntryIds)) return false;

        const dc = stateObj?.attributes?.device_class;
        if (dc === 'speaker' || dc === 'receiver') return false;

        return true;
    };
    const mediaEntries = potentialEntities.filter(
        re => re.entity_id.startsWith('media_player.') && isTvMediaPlayer(re)
    );

    /** Room music / speakers: admin mapping, HA `device_class: speaker`, or Music Assistant players */
    const isMusicMediaPlayer = re => {
        if (!re.entity_id.startsWith('media_player.')) return false;
        const stateObj = safeAllEntities.find(e => e.entity_id === re.entity_id);
        if (isMusicAssistantMediaPlayer(re, stateObj, musicAssistantConfigEntryIds)) return true;
        const map = safeMediaMappings.find(m => m.entity_id === re.entity_id);
        const t = (map?.mediaType?.type || '').toLowerCase();
        if (t === 'speaker' || t === 'music') return true;
        const dc = stateObj?.attributes?.device_class;
        return dc === 'speaker' || dc === 'receiver';
    };
    const musicEntries = potentialEntities.filter(isMusicMediaPlayer);
    const switchEntries = potentialEntities.filter(re => re.entity_id.startsWith('switch.'));
    const automationEntries = potentialEntities.filter(re => re.entity_id.startsWith('automation.'));
    const scriptEntries = potentialEntities.filter(re => re.entity_id.startsWith('script.'));
    const remoteEntries = potentialEntities.filter(re => re.entity_id.startsWith('remote.'));
    // Remotes may live on the same device but not be assigned to the room area —
    // still link them so Samsung/Apple KEY / send_command targeting works.
    const allRemoteEntries = safeRegistryEntities.filter(re => re.entity_id.startsWith('remote.'));
    const binaryEntries = potentialEntities.filter(re => re.entity_id.startsWith('binary_sensor.'));
    const sensorEntries = potentialEntities.filter(re => re.entity_id.startsWith('sensor.'));

    const mapEntity = (reg) => {
        const stateObj = safeAllEntities.find(e => e.entity_id === reg.entity_id);
        const mapping = safeSensorMappings.find(m => m.entity_id === reg.entity_id);
        const coverMapping = findCoverMapping(reg.entity_id, safeCoverMappings);
        return {
            ...reg,
            stateObj: stateObj || { state: 'unavailable', attributes: {} },
            displayName: reg.name || reg.original_name || stateObj?.attributes?.friendly_name || reg.entity_id,
            sensorType: inferSensorType(reg.entity_id, stateObj, mapping?.sensorType || null),
            coverType: coverMapping?.coverType || null,
            coverLayer: inferCoverLayer(reg.entity_id, coverMapping?.coverLayer),
            windowId: coverMapping?.windowId || null,
            linkedSensorId: coverMapping?.linkedSensorId || null
        };
    };

    const mappedRemotes = [
        ...remoteEntries.map(mapEntity),
        ...allRemoteEntries
            .filter(re => !remoteEntries.some(r => r.entity_id === re.entity_id))
            .map(mapEntity),
    ];

    const mappedSensors = sensorEntries.map(mapEntity);
    const mappedBinaries = binaryEntries.map(mapEntity);
    const mappedLocks = lockEntries.map(mapEntity);
    const mappedSwitches = switchEntries.map(mapEntity);
    const mappedClimates = climateEntries.map(mapEntity).map(climate => {
        const cm = safeClimateMappings.find(m => m.entity_id === climate.entity_id);
        const damperEntityId = cm?.damperEntityId || null;
        const damperStateObj = damperEntityId
            ? (safeAllEntities.find(e => e.entity_id === damperEntityId) || null)
            : null;
        return { ...climate, damperEntityId, damperStateObj };
    });
    const climateDeviceIds = new Set(mappedClimates.map((c) => c.device_id).filter(Boolean));
    const extraPowerSwitches = safeAllEntities
        .filter((e) => (
            e?.entity_id?.startsWith('switch.')
            && e.device_id
            && climateDeviceIds.has(e.device_id)
            && !mappedSwitches.some((s) => s.entity_id === e.entity_id)
        ))
        .map((e) => {
            const reg = safeRegistryEntities.find((r) => r.entity_id === e.entity_id)
                || { entity_id: e.entity_id, name: e.attributes?.friendly_name, device_id: e.device_id };
            return mapEntity(reg);
        });
    const { climates: climatesWithPower, leftoverSwitches: pairedLeftover } = attachAcPowerSwitches(
        mappedClimates,
        [...mappedSwitches, ...extraPowerSwitches],
        safeAllEntities,
    );
    const leftoverSwitches = pairedLeftover.filter((sw) => mappedSwitches.some((s) => s.entity_id === sw.entity_id));

    // Filter Doors (Strict Sensor Mapping)
    const doorEntities = [
        ...mappedSensors.filter(s => s.sensorType === 'door'),
        ...mappedBinaries.filter(b => b.sensorType === 'door')
    ];

    return {
        lights: [...sortByNaturalName(lightEntries.map(mapEntity)), ...mappedLocks],
        fans: fanEntries.map(mapEntity),
        climates: climatesWithPower,
        covers: (() => {
            const mapped = coverEntries.map(mapEntity);

            // Garage covers are handled exclusively in HomeAccess — exclude them here.
            // Shutters belong in the room section (sorted last). Window-grouped covers
            // must still show even when coverType was never set in admin — but each
            // entity_id must appear only once (windowId + shutter used to double-add).
            const included = mapped.filter((c) => {
                if (isMasterCover(c)) return true;
                if (c.coverType === 'garage') return false;
                if (c.windowId) return true;
                if (!c.coverType) return false;
                return true;
            });

            const nonShutters = included.filter((c) => c.coverType !== 'shutter');
            const shutters = included.filter((c) => c.coverType === 'shutter');

            return [...nonShutters, ...shutters];
        })(),
        cameras: potentialEntities.filter(re => re.entity_id.startsWith('camera.')).map(mapEntity),
        sensors: mappedSensors,
        doors: doorEntities,
        switches: leftoverSwitches,
        automations: automationEntries.map(mapEntity),
        scripts: scriptEntries.map(mapEntity),
        medias: mediaEntries.map(mapEntity).map(media => ({
            ...media,
            linkedRemote: findLinkedRemote(media, mappedRemotes),
        })),
        musicMedias: musicEntries.map(mapEntity).map(media => ({
            ...media,
            linkedRemote: findLinkedRemote(media, mappedRemotes),
        })),
    };
};
