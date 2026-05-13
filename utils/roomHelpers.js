/**
 * Music Assistant players: prefer matching entity registry `config_entry_id` to a Music Assistant
 * integration entry (most reliable). Fallback: legacy `platform`, state `mass_player_type`.
 *
 * @param {object} re — entity registry row (may include `config_entry_id`)
 * @param {object|null} stateObj — live state for `mass_player_type`
 * @param {string[]|Set|null} musicAssistantConfigEntryIds — `entry_id`s where domain is `music_assistant`
 */
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

export const getRoomEntities = (
    room,
    registryDevices = [],
    registryEntities = [],
    allEntities = [],
    sensorMappings = [],
    coverMappings = [],
    mediaMappings = [],
    musicAssistantConfigEntryIds = null
) => {
    if (!room) return { lights: [], fans: [], climates: [], covers: [], medias: [], musicMedias: [], switches: [] };

    const safeRegistryDevices = Array.isArray(registryDevices) ? registryDevices : [];
    const safeRegistryEntities = Array.isArray(registryEntities) ? registryEntities : [];
    const safeAllEntities = Array.isArray(allEntities) ? allEntities : [];
    const safeSensorMappings = Array.isArray(sensorMappings) ? sensorMappings : [];
    const safeCoverMappings = Array.isArray(coverMappings) ? coverMappings : [];
    const safeMediaMappings = Array.isArray(mediaMappings) ? mediaMappings : [];

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
        if (re.entity_category === 'config' || re.entity_category === 'diagnostic') return false;
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
    const binaryEntries = potentialEntities.filter(re => re.entity_id.startsWith('binary_sensor.'));
    const sensorEntries = potentialEntities.filter(re => re.entity_id.startsWith('sensor.'));

    const mapEntity = (reg) => {
        const stateObj = safeAllEntities.find(e => e.entity_id === reg.entity_id);
        const mapping = safeSensorMappings.find(m => m.entity_id === reg.entity_id);
        const coverMapping = safeCoverMappings.find(m => m.entity_id === reg.entity_id);
        return {
            ...reg,
            stateObj: stateObj || { state: 'unavailable', attributes: {} },
            displayName: reg.name || reg.original_name || stateObj?.attributes?.friendly_name || reg.entity_id,
            sensorType: mapping?.sensorType || null,
            coverType: coverMapping?.coverType || null,
            linkedSensorId: coverMapping?.linkedSensorId || null
        };
    };

    const mappedRemotes = remoteEntries.map(mapEntity);
    const mappedSensors = sensorEntries.map(mapEntity);
    const mappedBinaries = binaryEntries.map(mapEntity);
    const mappedLocks = lockEntries.map(mapEntity);

    // Filter Doors (Strict Sensor Mapping)
    const doorEntities = [
        ...mappedSensors.filter(s => s.sensorType === 'door'),
        ...mappedBinaries.filter(b => b.sensorType === 'door')
    ];

    return {
        lights: [...lightEntries.map(mapEntity), ...mappedLocks],
        fans: fanEntries.map(mapEntity),
        climates: climateEntries.map(mapEntity),
        covers: (() => {
            const mapped = coverEntries.map(mapEntity);

            // Garage covers are handled exclusively in HomeAccess — exclude them here.
            // Shutter covers belong in the room curtains section, sorted to the end.
            const nonShutters = mapped.filter(c => {
                const id   = (c.entity_id   || '').toLowerCase();
                const name = (c.displayName || '').toLowerCase();
                const isMaster = id.includes('master_curtain') || id.includes('master curtain') ||
                                 name.includes('master curtain') || name.includes('master_curtain');
                // master always included; garage always excluded; shutter handled separately
                if (isMaster) return true;
                if (!c.coverType) return false;
                return c.coverType !== 'shutter' && c.coverType !== 'garage';
            });

            const shutters = mapped.filter(c => c.coverType === 'shutter');

            // Shutters go last, after all curtain types
            return [...nonShutters, ...shutters];
        })(),
        cameras: potentialEntities.filter(re => re.entity_id.startsWith('camera.')).map(mapEntity),
        sensors: mappedSensors,
        doors: doorEntities,
        switches: switchEntries.map(mapEntity),
        automations: automationEntries.map(mapEntity),
        scripts: scriptEntries.map(mapEntity),
        medias: mediaEntries.map(mapEntity).map(media => {
            // Link Remote if device_id matches
            const linkedRemote = mappedRemotes.find(r => r.device_id && r.device_id === media.device_id);
            return { ...media, linkedRemote };
        }),
        musicMedias: musicEntries.map(mapEntity).map(media => {
            const linkedRemote = mappedRemotes.find(r => r.device_id && r.device_id === media.device_id);
            return { ...media, linkedRemote };
        })
    };
};
