export const getRoomEntities = (room, registryDevices = [], registryEntities = [], allEntities = [], sensorMappings = [], coverMappings = []) => {
    if (!room) return { lights: [], fans: [], climates: [], covers: [], medias: [], switches: [] };

    const safeRegistryDevices = Array.isArray(registryDevices) ? registryDevices : [];
    const safeRegistryEntities = Array.isArray(registryEntities) ? registryEntities : [];
    const safeAllEntities = Array.isArray(allEntities) ? allEntities : [];
    const safeSensorMappings = Array.isArray(sensorMappings) ? sensorMappings : [];
    const safeCoverMappings = Array.isArray(coverMappings) ? coverMappings : [];

    const areaDevices = safeRegistryDevices.filter(d => d.area_id === room.area_id);
    const areaDeviceIds = areaDevices.map(d => d.id);

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
    const mediaEntries = potentialEntities.filter(re => re.entity_id.startsWith('media_player.'));
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
        covers: coverEntries.map(mapEntity).filter(c => c.coverType),
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
        })
    };
};
