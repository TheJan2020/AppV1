/**
 * Room / sub-room layout — driven entirely by backend config (selected_areas).
 * Parent ↔ child links are set in AppBackendV1 admin (Floors & Rooms).
 */

function titleCaseWords(s) {
    return String(s || '')
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** @returns {Map<string, string>} child area_id → parent area_id */
export function buildExplicitParentMap(badgeConfig = null) {
    const map = new Map();
    const selected = badgeConfig?.selected_areas;
    if (!Array.isArray(selected)) return map;

    if (badgeConfig?.room_parent_map && typeof badgeConfig.room_parent_map === 'object') {
        for (const [childId, parentId] of Object.entries(badgeConfig.room_parent_map)) {
            if (childId && parentId && childId !== parentId) {
                map.set(childId, parentId);
            }
        }
        if (map.size) return map;
    }

    for (const entry of selected) {
        if (!entry?.area_id) continue;

        if (entry.parent_area_id) {
            map.set(entry.area_id, entry.parent_area_id);
        }

        if (Array.isArray(entry.sub_areas)) {
            for (const sub of entry.sub_areas) {
                const subId = typeof sub === 'string' ? sub : sub?.area_id;
                if (subId) map.set(subId, entry.area_id);
            }
        }
    }

    return map;
}

/** @returns {Set<string>} sub-area area_ids (hidden from home grid) */
export function getSubAreaIds(badgeConfig = null) {
    return new Set(buildExplicitParentMap(badgeConfig).keys());
}

/**
 * Selected areas from backend, merged with live HA registry metadata.
 * Includes sub-areas (used for stats); filter with filterParentRoomsForDashboard for the grid.
 */
export function getSelectedAreasForDashboard(registryAreas = [], badgeConfig = null) {
    const allAreas = Array.isArray(registryAreas) ? registryAreas : [];
    const selected = badgeConfig?.selected_areas;

    if (!Array.isArray(selected) || selected.length === 0) {
        return allAreas;
    }

    // Show selected rooms even before the HA area registry arrives (cached Home).
    return selected
        .filter((sa) => sa?.area_id)
        .map((sa) => {
            const reg = allAreas.find((ra) => ra.area_id === sa.area_id);
            return reg ? { ...reg, ...sa } : { ...sa };
        });
}

/** Home dashboard grid: hide sub-areas configured in backend. */
export function filterParentRoomsForDashboard(rooms = [], _allAreas = [], badgeConfig = null) {
    const childIds = getSubAreaIds(badgeConfig);
    if (!childIds.size) return rooms;
    return rooms.filter((r) => !childIds.has(r.area_id));
}

/** Parent room + backend-configured sub-areas (for device count aggregation). */
export function getRoomAreaGroup(parentRoom, allAreas = [], badgeConfig = null) {
    if (!parentRoom) return [];
    const parentMap = buildExplicitParentMap(badgeConfig);
    const children = allAreas.filter((a) => parentMap.get(a.area_id) === parentRoom.area_id);
    return [parentRoom, ...children];
}

function getSubAreaLabel(parentRoom, child, badgeConfig) {
    const entry = badgeConfig?.selected_areas?.find((s) => s.area_id === child.area_id);
    if (entry?.sub_area_label) return entry.sub_area_label;

    const parentName = String(parentRoom?.name || parentRoom?.area_id || '').trim();
    const childName = String(child?.name || child?.area_id || '').trim();
    if (parentName && childName.toLowerCase().startsWith(`${parentName.toLowerCase()} `)) {
        return childName.slice(parentName.length).trim();
    }
    return childName || child?.area_id || 'Area';
}

/**
 * Tabs for RoomDetailView nav bar (backend-defined sub-rooms only).
 * @returns {{ key: string, label: string, area: object }[]}
 */
export function getRoomAreaTabs(parentRoom, allAreas = [], resolveDisplayName, badgeConfig = null) {
    if (!parentRoom) return [];

    const parentMap = buildExplicitParentMap(badgeConfig);
    const children = allAreas
        .filter((a) => parentMap.get(a.area_id) === parentRoom.area_id)
        .sort((a, b) => String(a.name || a.area_id).localeCompare(String(b.name || b.area_id)));

    if (!children.length) return [];

    const resolve = typeof resolveDisplayName === 'function'
        ? resolveDisplayName
        : (_id, name) => name;

    return [
        {
            key: parentRoom.area_id,
            label: 'Main',
            area: {
                ...parentRoom,
                name: resolve(parentRoom.area_id, parentRoom.name),
            },
        },
        ...children.map((child) => ({
            key: child.area_id,
            label: titleCaseWords(getSubAreaLabel(parentRoom, child, badgeConfig)),
            area: {
                ...child,
                name: resolve(child.area_id, child.name),
            },
        })),
    ];
}
