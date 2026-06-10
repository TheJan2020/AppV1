import { useState, useEffect, useMemo } from 'react';
import { getRoomAreaTabs } from '../utils/roomAreas';
import { getRoomEntities } from '../utils/roomHelpers';

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
    musicAssistantEntryIds = [],
    resolveDisplayName,
    badgeConfig = null,
}) {
    const areaTabs = useMemo(
        () => getRoomAreaTabs(room, registryAreas, resolveDisplayName, badgeConfig),
        [room, registryAreas, resolveDisplayName, badgeConfig],
    );

    const [activeAreaKey, setActiveAreaKey] = useState(room?.area_id);

    useEffect(() => {
        setActiveAreaKey(room?.area_id);
    }, [room?.area_id]);

    const activeArea = useMemo(() => {
        const tab = areaTabs.find((t) => t.key === activeAreaKey);
        return tab?.area ?? room;
    }, [areaTabs, activeAreaKey, room]);

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
