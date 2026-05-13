import { isMusicAssistantMediaPlayer } from './roomHelpers';

/**
 * Lists Music Assistant `media_player` entities grouped by HA Area (entity `area_id` or device `area_id`).
 *
 * @returns {{ areaKey: string, areaName: string, players: { entityId: string, displayName: string }[] }[]}
 */
export function getMusicAssistantPlayersByArea(
    registryDevices = [],
    registryEntities = [],
    allEntities = [],
    registryAreas = [],
    musicAssistantConfigEntryIds = null
) {
    const safeDevices = Array.isArray(registryDevices) ? registryDevices : [];
    const safeRegs = Array.isArray(registryEntities) ? registryEntities : [];
    const safeStates = Array.isArray(allEntities) ? allEntities : [];
    const safeAreas = Array.isArray(registryAreas) ? registryAreas : [];

    const nameByAreaId = {};
    safeAreas.forEach(a => {
        if (a?.area_id) nameByAreaId[a.area_id] = a.name || a.area_id;
    });

    const flat = [];
    for (const re of safeRegs) {
        if (!re.entity_id?.startsWith('media_player.')) continue;
        const stateObj = safeStates.find(e => e.entity_id === re.entity_id);
        if (!isMusicAssistantMediaPlayer(re, stateObj, musicAssistantConfigEntryIds)) continue;

        let areaId = re.area_id || null;
        if (!areaId && re.device_id) {
            const dev = safeDevices.find(d => d.id === re.device_id);
            areaId = dev?.area_id || null;
        }

        const areaKey = areaId || '_unassigned';
        const areaName = areaId ? (nameByAreaId[areaId] || areaId) : 'No area assigned';

        const displayName =
            re.name ||
            re.original_name ||
            stateObj?.attributes?.friendly_name ||
            re.entity_id;

        flat.push({
            areaKey,
            areaName,
            entityId: re.entity_id,
            displayName,
        });
    }

    const groups = new Map();
    for (const row of flat) {
        if (!groups.has(row.areaKey)) {
            groups.set(row.areaKey, {
                areaKey: row.areaKey,
                areaName: row.areaName,
                players: [],
            });
        }
        groups.get(row.areaKey).players.push({
            entityId: row.entityId,
            displayName: row.displayName,
        });
    }

    const list = Array.from(groups.values());
    list.sort((a, b) => {
        if (a.areaKey === '_unassigned') return 1;
        if (b.areaKey === '_unassigned') return -1;
        return (a.areaName || '').localeCompare(b.areaName || '');
    });
    return list;
}
