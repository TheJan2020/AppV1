import { useState, useEffect, useMemo } from 'react';
import { getRoomAreaTabs } from '../utils/roomAreas';
import { getRoomEntities } from '../utils/roomHelpers';
import { areaAllowedForRole } from '../services/appRole';

/**
 * Sub-area tabs + entity bundle for a parent room (e.g. Majlis → Main | Wash Area).
 */
export function useRoomAreaEntities({
    room,
    registryAreas = [],
    registryDevices = [],
    registryEntities = [],
    allEntities = [],
    sensorMappings = [],
    coverMappings = [],
    mediaMappings = [],
    climateMappings = [],
    musicAssistantEntryIds = [],
    resolveDisplayName,
    badgeConfig = null,
    appRole = null,
}) {
    const areaTabs = useMemo(() => {
        const tabs = getRoomAreaTabs(room, registryAreas, resolveDisplayName, badgeConfig);
        if (!tabs.length) return tabs;
        if (!appRole || appRole.roleId === 'pending') return [];
        if (appRole.allRooms !== false) return tabs;
        return tabs.filter((t) => areaAllowedForRole(t.key, appRole, badgeConfig));
    }, [room, registryAreas, resolveDisplayName, badgeConfig, appRole]);

    const [activeAreaKey, setActiveAreaKey] = useState(room?.area_id);

    useEffect(() => {
        const preferred = room?.area_id;
        const hasPreferred = areaTabs.some((t) => t.key === preferred);
        setActiveAreaKey(hasPreferred ? preferred : (areaTabs[0]?.key || preferred));
    }, [room?.area_id, areaTabs]);

    const activeArea = useMemo(() => {
        const tab = areaTabs.find((t) => t.key === activeAreaKey);
        if (tab?.area) return tab.area;
        if (areaTabs[0]?.area) return areaTabs[0].area;
        if (!appRole || appRole.allRooms !== false || areaAllowedForRole(room?.area_id, appRole, badgeConfig)) {
            return room;
        }
        return null;
    }, [areaTabs, activeAreaKey, room, appRole, badgeConfig]);

    const entities = useMemo(
        () => getRoomEntities(
            activeArea,
            registryDevices,
            registryEntities,
            allEntities,
            sensorMappings,
            coverMappings,
            mediaMappings,
            musicAssistantEntryIds,
            climateMappings,
        ),
        [
            activeArea,
            registryDevices,
            registryEntities,
            allEntities,
            sensorMappings,
            coverMappings,
            mediaMappings,
            musicAssistantEntryIds,
            climateMappings,
        ],
    );

    return {
        areaTabs,
        activeAreaKey,
        setActiveAreaKey,
        activeArea,
        ...entities,
    };
}
