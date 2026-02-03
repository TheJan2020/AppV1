export const getRoomEntities = (room, registryDevices = [], registryEntities = [], allEntities = []) => {
    if (!room) return { lights: [], fans: [], climates: [], covers: [], medias: [] };

    const areaDevices = registryDevices.filter(d => d.area_id === room.area_id);
    const areaDeviceIds = areaDevices.map(d => d.id);

    const potentialEntities = registryEntities.filter(re => {
        const directMatch = re.area_id === room.area_id;
        const deviceMatch = re.device_id && areaDeviceIds.includes(re.device_id);
        return directMatch || deviceMatch;
    });    // DEBUG: Camera Visibility (Removed to clean up logs)


    const lightEntries = potentialEntities.filter(re => re.entity_id.startsWith('light.'));
    const fanEntries = potentialEntities.filter(re => re.entity_id.startsWith('fan.'));
    const climateEntries = potentialEntities.filter(re => re.entity_id.startsWith('climate.'));
    const coverEntries = potentialEntities.filter(re => re.entity_id.startsWith('cover.'));
    const mediaEntries = potentialEntities.filter(re => re.entity_id.startsWith('media_player.'));
    const remoteEntries = potentialEntities.filter(re => re.entity_id.startsWith('remote.'));
    const binaryEntries = potentialEntities.filter(re => re.entity_id.startsWith('binary_sensor.'));
    const sensorEntries = potentialEntities.filter(re => re.entity_id.startsWith('sensor.'));

    const mapEntity = (reg) => {
        const stateObj = allEntities.find(e => e.entity_id === reg.entity_id);
        return {
            ...reg,
            stateObj: stateObj || { state: 'unavailable', attributes: {} },
            displayName: reg.name || reg.original_name || stateObj?.attributes?.friendly_name || reg.entity_id
        };
    };

    const mappedRemotes = remoteEntries.map(mapEntity);
    const mappedSensors = sensorEntries.map(mapEntity);
    const mappedBinaries = binaryEntries.map(mapEntity);

    // Filter Doors (Specific sensor naming + binary device class)
    const doorEntities = [
        ...mappedSensors.filter(s => s.entity_id.startsWith('sensor.door_')),
        ...mappedBinaries.filter(b => {
            const dc = b.stateObj?.attributes?.device_class;
            return dc === 'door' || dc === 'garage' || dc === 'window' || dc === 'opening' || b.entity_id.includes('door');
        })
    ];

    return {
        lights: lightEntries.map(mapEntity),
        fans: fanEntries.map(mapEntity),
        climates: climateEntries.map(mapEntity),
        covers: coverEntries.map(mapEntity),
        cameras: potentialEntities.filter(re => re.entity_id.startsWith('camera.')).map(mapEntity),
        sensors: mappedSensors,
        doors: doorEntities,
        medias: mediaEntries.map(mapEntity).map(media => {
            // Link Remote if device_id matches
            const linkedRemote = mappedRemotes.find(r => r.device_id && r.device_id === media.device_id);
            return { ...media, linkedRemote };
        })
    };
};
