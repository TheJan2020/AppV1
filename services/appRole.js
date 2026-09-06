import { Alert } from 'react-native';
import { buildExplicitParentMap } from '../utils/roomAreas';

const DEFAULT_SCREENS = ['home', 'cctv', 'rooms', 'butler', 'settings', 'tablet'];

export const DEFAULT_APP_ROLE = {
    screens: DEFAULT_SCREENS,
    roleId: 'admin',
    roleName: 'Admin',
    allCameras: true,
    cameras: [],
    allRooms: true,
    rooms: [],
};

/** Used until the signed-in user is known — never grant all cameras. */
export const PENDING_APP_ROLE = {
    screens: ['home', 'settings'],
    roleId: 'pending',
    roleName: 'Pending',
    allCameras: false,
    cameras: [],
    allRooms: false,
    rooms: [],
};

export function hasAppUserIdentity(userId, username) {
    return !!(String(userId || '').trim() || String(username || '').trim());
}

export async function fetchAppRole({ adminUrl, token, userId, username }) {
    if (!hasAppUserIdentity(userId, username)) {
        return { ...PENDING_APP_ROLE };
    }
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), 8000) : null;
    try {
        const base = String(adminUrl || '').replace(/\/+$/, '');
        if (!base) return { ...PENDING_APP_ROLE };
        const qs = new URLSearchParams({
            userId: String(userId || ''),
            username: String(username || ''),
        });
        const res = await fetch(`${base}/api/app-role?${qs}`, {
            headers: {
                Accept: 'application/json',
                Authorization: token ? `Bearer ${token}` : '',
            },
            signal: controller?.signal,
        });
        const data = await res.json().catch(() => null);
        if (res.ok && data && (data.roleId || Array.isArray(data.screens))) {
            const role = {
                roleId: data.roleId || 'admin',
                roleName: data.roleName || 'Admin',
                screens: Array.isArray(data.screens) && data.screens.length
                    ? data.screens
                    : ['home'],
                allCameras: data.allCameras !== false,
                cameras: Array.isArray(data.cameras) ? data.cameras : [],
                allRooms: data.allRooms !== false,
                rooms: Array.isArray(data.rooms) ? data.rooms : [],
            };
            return { ...role, screens: screensForRole(role) };
        }
    } catch (e) {
        console.log('[AppRole] fetch failed:', e?.message || e);
    } finally {
        if (timer) clearTimeout(timer);
    }
    return { ...PENDING_APP_ROLE };
}

export function canShowScreen(screens, id) {
    if (!Array.isArray(screens)) return true;
    if (screens.length === 0) return id === 'home' || id === 'settings';
    return screens.includes(id);
}

/** Role may view cameras if all-cameras is on, or a camera allow-list is set. */
export function roleHasCameraAccess(role) {
    if (!role || role.roleId === 'pending') return false;
    if (role.allCameras !== false) return true;
    return (role.cameras || []).length > 0;
}

/** Home strip + CCTV. Camera allow-list counts even if the Cameras screen toggle is off. */
export function roleCanSeeCameras(role, screens = null) {
    if (roleHasCameraAccess(role)) return true;
    const list = Array.isArray(screens) ? screens : role?.screens;
    return Array.isArray(list) && list.includes('cctv') && role?.allCameras !== false;
}

/** Open Cameras tab when the screen is on, or when this role was given cameras. */
export function screensForRole(role) {
    const screens = Array.isArray(role?.screens) && role.screens.length
        ? [...role.screens]
        : ['home'];
    if (roleHasCameraAccess(role) && !screens.includes('cctv')) {
        screens.push('cctv');
    }
    return screens;
}

/** Keep only Home cameras this role is allowed to see. Empty selection → none. */
export function filterHomeCameraIds(selectedIds, allowedCameras) {
    const allowed = Array.isArray(allowedCameras) ? allowedCameras : [];
    const selected = Array.isArray(selectedIds) ? selectedIds.filter(Boolean) : [];
    if (!allowed.length || !selected.length) return [];
    const allowedKeys = allowed.map((c) => cameraKey(
        typeof c === 'string' ? c : (c?.entity_id || c?.id || c?.name || ''),
    )).filter(Boolean);
    return selected.filter((id) => allowedKeys.includes(cameraKey(id))
        || allowed.some((c) => cameraKeysMatch(
            cameraKey(id),
            cameraKey(typeof c === 'string' ? c : (c?.entity_id || c?.id || c?.name || '')),
        )));
}

/** Home is always open. Settings is always open so any role can log out. */
export function canOpenTab(screens, id) {
    if (id === 'home' || id === 'settings') return true;
    return canShowScreen(screens, id);
}

const SCREEN_LABELS = {
    home: 'Home',
    cctv: 'Cameras',
    rooms: 'Rooms',
    butler: 'Butler',
    settings: 'Settings',
    tablet: 'Kids Tablet',
    ai: 'Butler',
};

export function notifyRestrictedScreen(tabId) {
    const label = SCREEN_LABELS[tabId] || SCREEN_LABELS[tabId === 'ai' ? 'butler' : tabId] || 'this screen';
    Alert.alert('Restricted', `${label} is restricted for your role.`);
}

export function cameraKey(value) {
    return String(value || '')
        .toLowerCase()
        .replace(/^camera\./, '')
        .replace(/-/g, '_')
        .replace(/\s+/g, '_')
        .trim();
}

function coreCameraToken(key) {
    return cameraKey(key)
        .replace(/^(demo_|engineer_|office_|outdoor_|front_)/, '')
        .replace(/_live$/, '');
}

export function cameraKeysMatch(a, b) {
    if (!a || !b) return false;
    if (a === b) return true;
    const ca = coreCameraToken(a);
    const cb = coreCameraToken(b);
    return !!(ca && cb && ca === cb);
}

export function mapHaCameras(list) {
    if (!Array.isArray(list)) return [];
    return list.map((c) => {
        const entityId = c?.entity_id || (c?.id ? String(c.id) : '');
        if (!entityId) return null;
        const id = entityId.startsWith('camera.') ? entityId : `camera.${entityId}`;
        const name = id.replace(/^camera\./, '');
        return {
            id,
            name,
            entity_id: id,
            friendly_name: c.name || c.friendly_name || name.replace(/_/g, ' '),
            feed: 'ha',
        };
    }).filter(Boolean);
}

export function toDisplayCameras(list) {
    if (!Array.isArray(list)) return [];
    return list.map((c) => {
        const raw = typeof c === 'string' || typeof c === 'number'
            ? String(c)
            : String(c?.entity_id || c?.id || c?.name || '').trim();
        if (!raw) return null;
        const ha = c?.feed === 'ha' || c?.source === 'ha' || raw.startsWith('camera.');
        const label = String(
            (typeof c === 'object' && (c.friendly_name || c.attributes?.friendly_name || c.name)) || raw
        ).replace(/^camera\./, '');
        const name = label.replace(/_/g, ' ').trim() || raw.replace(/^camera\./, '');
        const streamName = raw.replace(/^camera\./, '');
        return {
            id: ha ? raw : streamName,
            name: streamName,
            entity_id: raw,
            friendly_name: name,
            feed: ha ? 'ha' : 'frigate',
            source: ha ? 'ha' : 'frigate',
        };
    }).filter(Boolean);
}

/** Role-filtered cameras from GET /api/cameras — do not merge in the full Frigate list. */
export function camerasFromBackendPayload(data) {
    if (!data || typeof data !== 'object') return [];
    const restricted = data.allCameras === false;
    if (Array.isArray(data.accessible_cameras) && (data.accessible_cameras.length || restricted)) {
        return toDisplayCameras(data.accessible_cameras);
    }
    return toDisplayCameras(data.cameras || []);
}

export async function fetchRoleCameras({ adminUrl, token, userId, username }) {
    const base = String(adminUrl || '').replace(/\/+$/, '');
    if (!base) return { cameras: [], homeCameras: [], allCameras: true };
    const qs = new URLSearchParams({
        t: String(Date.now()),
        userId: String(userId || ''),
        username: String(username || ''),
    });
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), 8000) : null;
    try {
        const res = await fetch(`${base}/api/cameras?${qs}`, {
            headers: {
                Accept: 'application/json',
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            signal: controller?.signal,
        });
        if (!res.ok) throw new Error(`cameras ${res.status}`);
        const data = await res.json();
        return {
            cameras: camerasFromBackendPayload(data),
            homeCameras: Array.isArray(data.home_cameras) ? data.home_cameras : [],
            allCameras: data.allCameras !== false,
        };
    } finally {
        if (timer) clearTimeout(timer);
    }
}

export function camerasFromIds(ids) {
    return mapHaCameras((ids || []).map((id) => ({ entity_id: id, name: String(id || '').replace(/^camera\./, '').replace(/_/g, ' ') })));
}

export function cameraUsesHaFeed(cam) {
    if (!cam) return false;
    if (cam.feed === 'frigate') return false;
    if (cam.feed === 'ha') return true;
    if (!cam.entity_id) return false;
    const id = String(cam.id || cam.name || '');
    if (id && !id.startsWith('camera.') && !id.includes('.')) return false;
    return true;
}

function cameraLookupKeys(cam) {
    return [cam?.entity_id, cam?.id, cam?.name, cam?.friendly_name].map(cameraKey).filter(Boolean);
}

function findCameraIndex(list, cam) {
    const keys = cameraLookupKeys(cam);
    if (!keys.length) return -1;
    return list.findIndex((prev) => {
        const prevKeys = cameraLookupKeys(prev);
        return keys.some((k) => prevKeys.some((p) => cameraKeysMatch(k, p)));
    });
}

export function mergeCameraLists(existing, incoming) {
    const list = Array.isArray(existing) ? [...existing] : [];
    for (const cam of incoming || []) {
        const keys = cameraLookupKeys(cam);
        if (!keys.length) continue;
        const hit = findCameraIndex(list, cam);
        if (hit < 0) {
            list.push(cam);
            continue;
        }
        const prev = list[hit];
        if (!cameraUsesHaFeed(cam) && cameraUsesHaFeed(prev)) {
            list[hit] = cam;
        }
    }
    return list;
}

export function selectedCameraIdsForRole(role, dashboardSelected) {
    if (role?.allCameras === false) {
        return Array.isArray(role.cameras) ? role.cameras : [];
    }
    return Array.isArray(dashboardSelected) ? dashboardSelected : [];
}

function haCamerasForIds(haCameras, ids) {
    const wanted = Array.isArray(ids) ? ids.filter(Boolean) : [];
    if (!wanted.length) return [];
    const mapped = mapHaCameras(haCameras);
    const hits = [];
    for (const id of wanted) {
        const key = cameraKey(id);
        const match = mapped.find((c) => cameraLookupKeys(c).some((k) => cameraKeysMatch(k, key)));
        if (match) {
            hits.push(match);
            continue;
        }
        const stub = camerasFromIds([id])[0];
        if (stub) hits.push(stub);
    }
    return hits;
}

export function cameraAllowedForRole(cam, role) {
    if (!role) return false;
    if (!roleCanSeeCameras(role)) return false;
    if (role.allCameras !== false) return true;
    const allowed = (role.cameras || []).map(cameraKey).filter(Boolean);
    if (!allowed.length) return false;
    const keys = [cam?.entity_id, cam?.name, cam?.id, cam?.friendly_name]
        .filter(Boolean)
        .map(cameraKey);
    return keys.some((k) => allowed.some((a) => cameraKeysMatch(k, a)));
}

export function filterCamerasForRole(cameras, role) {
    if (!Array.isArray(cameras)) return [];
    return cameras.filter((c) => cameraAllowedForRole(c, role));
}

function filterCamerasByIds(cameras, ids) {
    const wanted = (Array.isArray(ids) ? ids : []).map(cameraKey).filter(Boolean);
    if (!wanted.length) return [];
    return (Array.isArray(cameras) ? cameras : []).filter((c) => {
        const keys = cameraLookupKeys(c);
        return keys.some((k) => wanted.some((w) => cameraKeysMatch(k, w)));
    });
}

/**
 * Surveillance / picker pool:
 * - Role with a camera allow-list → those cameras (Frigate stream when names match).
 * - Role with all cameras → admin Cameras page list (selected_cameras).
 * Home tiles are a per-user subset of this pool, not this list itself.
 */
export function accessibleCamerasForRole(frigateCameras, role, haCameras = [], dashboardSelected = []) {
    if (!role) return [];
    const frigate = Array.isArray(frigateCameras) ? frigateCameras : [];
    const houseSelected = Array.isArray(dashboardSelected) ? dashboardSelected.filter(Boolean) : [];
    const roleCameras = Array.isArray(role?.cameras) ? role.cameras.filter(Boolean) : [];
    const useRoleList = role.allCameras === false && roleCameras.length > 0;
    const wanted = useRoleList ? roleCameras : houseSelected;

    // Admin/Family with all cameras: Frigate list is the house list.
    // Empty selected_cameras means "use every Frigate camera" (worker will fill it).
    if (!useRoleList && !wanted.length) return frigate;

    if (!wanted.length) return [];

    const fromFrigate = filterCamerasByIds(frigate, wanted);
    const extras = haCamerasForIds(haCameras, wanted);
    return mergeCameraLists(fromFrigate, extras);
}

export function camerasForRoleDisplay(frigateCameras, haCameras, role, dashboardSelected) {
    return accessibleCamerasForRole(frigateCameras, role, haCameras, dashboardSelected);
}

function activeAreaIds(badgeConfig) {
    return new Set(
        (Array.isArray(badgeConfig?.selected_areas) ? badgeConfig.selected_areas : [])
            .map((a) => a?.area_id)
            .filter(Boolean),
    );
}

export function areaAllowedForRole(areaId, role, badgeConfig) {
    if (!role || role.roleId === 'pending') return false;
    if (!areaId) return false;
    const active = activeAreaIds(badgeConfig);
    // Floors & Rooms is the only pool. Empty selection or unknown id → hidden.
    if (!active.has(areaId)) return false;
    if (role.allRooms !== false) return true;
    const allowed = new Set(role.rooms || []);
    if (!allowed.size) return false;
    if (allowed.has(areaId)) return true;
    const parentMap = buildExplicitParentMap(badgeConfig);
    let cur = areaId;
    const seen = new Set();
    while (parentMap.has(cur) && !seen.has(cur)) {
        seen.add(cur);
        cur = parentMap.get(cur);
        if (allowed.has(cur)) return true;
    }
    return false;
}

/** Home cards: allowed areas plus parents of allowed children (grid hides children). */
export function areaVisibleForRole(areaId, role, badgeConfig) {
    if (areaAllowedForRole(areaId, role, badgeConfig)) return true;
    if (!role || role.roleId === 'pending' || role.allRooms !== false) return false;
    const allowed = new Set(role.rooms || []);
    if (!allowed.size || !areaId) return false;
    const active = activeAreaIds(badgeConfig);
    if (!active.has(areaId)) return false;
    const parentMap = buildExplicitParentMap(badgeConfig);
    for (const id of allowed) {
        if (!active.has(id)) continue;
        let cur = id;
        const seen = new Set();
        while (parentMap.has(cur) && !seen.has(cur)) {
            seen.add(cur);
            cur = parentMap.get(cur);
            if (cur === areaId) return true;
        }
    }
    return false;
}

export function filterRoomsForRole(rooms, role, badgeConfig) {
    if (!Array.isArray(rooms)) return [];
    if (!role || role.roleId === 'pending') return [];
    return rooms.filter((r) => areaVisibleForRole(r?.area_id, role, badgeConfig));
}
