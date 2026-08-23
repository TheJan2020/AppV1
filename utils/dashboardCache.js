import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { loadHaProfiles } from './storage';

/**
 * Last-known Home snapshot (stale-while-revalidate).
 * UI (rooms, scenes, locks) is stored separately from HA entities so a large
 * house (~3000 states) cannot prevent rooms from being cached.
 */

const UI_PREFIX = 'dashboard_ui_v2:';
const ENT_PREFIX = 'dashboard_ent_v2:';
const LEGACY_PREFIX = 'dashboard_snapshot_v1:';
const MAX_ENTITIES = 600;

/** Last snapshot kept in RAM so Home can paint it on the first frame. */
let memorySnapshot = null;
let memoryProfile = null;
let bootPromise = null;

const ATTR_KEYS = [
    'friendly_name',
    'device_class',
    'unit_of_measurement',
    'temperature',
    'humidity',
    'current_temperature',
    'current_humidity',
    'hvac_modes',
    'hvac_mode',
    'hvac_action',
    'min_temp',
    'max_temp',
    'fan_mode',
    'preset_mode',
    'brightness',
    'rgb_color',
    'hs_color',
    'color_temp',
    'color_temp_kelvin',
    'color_mode',
    'supported_color_modes',
    'supported_features',
    'current_position',
    'current_tilt_position',
    'entity_picture',
    'lock_status',
    'passage_mode',
    'occupancy',
    'latitude',
    'longitude',
    'device_id',
    'is_volume_muted',
    'volume_level',
    'media_title',
    'source',
    'source_list',
    'assumed_state',
    'effect',
    'effect_list',
    'icon',
];

function cacheKey(profileId) {
    return `${LEGACY_PREFIX}${profileId || 'default'}`;
}

function uiKey(profileId) {
    return `${UI_PREFIX}${profileId || 'default'}`;
}

function entKey(profileId) {
    return `${ENT_PREFIX}${profileId || 'default'}`;
}

const HOME_DOMAINS = new Set([
    'weather', 'person', 'lock', 'cover', 'climate', 'script', 'scene', 'camera',
    'sun', 'light', 'binary_sensor', 'device_tracker', 'alarm_control_panel',
    'media_player',
]);

function isHomeEntity(entity) {
    const id = entity?.entity_id || '';
    const domain = id.split('.')[0];
    if (HOME_DOMAINS.has(domain)) return true;
    return domain === 'sensor' && /temp|humid|weather/i.test(id);
}

export function toHaHttpUrl(url) {
    if (!url) return '';
    return url
        .replace(/^ws:\/\//i, 'http://')
        .replace(/^wss:\/\//i, 'https://')
        .replace(/\/api\/websocket\/?$/i, '');
}

export function peekBootProfile() {
    return memoryProfile;
}

export function rememberBootProfile(profile) {
    if (!profile?.profileId) return;
    memoryProfile = profile;
}

function slimAttributes(attrs) {
    if (!attrs || typeof attrs !== 'object') return {};
    const next = {};
    for (let i = 0; i < ATTR_KEYS.length; i++) {
        const key = ATTR_KEYS[i];
        if (attrs[key] !== undefined) next[key] = attrs[key];
    }
    return next;
}

function slimEntity(entity) {
    if (!entity?.entity_id) return null;
    return {
        entity_id: entity.entity_id,
        state: entity.state,
        attributes: slimAttributes(entity.attributes),
    };
}

function slimDevice(device) {
    if (!device?.id) return null;
    return {
        id: device.id,
        area_id: device.area_id ?? null,
        name: device.name ?? null,
        name_by_user: device.name_by_user ?? null,
        config_entries: device.config_entries,
        disabled_by: device.disabled_by ?? null,
    };
}

function slimRegistryEntity(row) {
    if (!row?.entity_id) return null;
    return {
        entity_id: row.entity_id,
        device_id: row.device_id ?? null,
        area_id: row.area_id ?? null,
        platform: row.platform ?? null,
        original_name: row.original_name ?? null,
        name: row.name ?? null,
        disabled_by: row.disabled_by ?? null,
        hidden_by: row.hidden_by ?? null,
        entity_category: row.entity_category ?? null,
    };
}

function slimArea(area) {
    if (!area?.area_id) return null;
    return {
        area_id: area.area_id,
        name: area.name ?? null,
        floor_id: area.floor_id ?? area.floor ?? null,
        picture: area.picture ?? null,
        icon: area.icon ?? null,
        aliases: area.aliases,
        labels: area.labels,
    };
}

function slimFloor(floor) {
    if (!floor?.floor_id) return null;
    return {
        floor_id: floor.floor_id,
        name: floor.name ?? null,
        level: floor.level ?? 0,
        icon: floor.icon ?? null,
    };
}

function slimRoom(room) {
    if (!room?.area_id) return null;
    return {
        area_id: room.area_id,
        name: room.name ?? null,
        picture: room.picture ?? null,
        floor_id: room.floor_id ?? room.floor ?? null,
        icon: room.icon ?? null,
        aliases: room.aliases,
        labels: room.labels,
        deviceCount: room.deviceCount || 0,
        activeLights: room.activeLights || 0,
        activeAC: room.activeAC || 0,
        activeCovers: room.activeCovers || 0,
        activeDoors: room.activeDoors || 0,
        hasPresenceSensor: !!room.hasPresenceSensor,
    };
}

function slimCamera(cam) {
    if (!cam) return null;
    return {
        id: cam.id || cam.name || cam.entity_id,
        name: cam.name || cam.id,
        entity_id: cam.entity_id,
        friendly_name: cam.friendly_name,
    };
}

function compact(list, slimFn) {
    if (!Array.isArray(list)) return [];
    const out = [];
    for (let i = 0; i < list.length; i++) {
        const item = slimFn(list[i]);
        if (item) out.push(item);
    }
    return out;
}

function buildUiPayload(profileId, snapshot) {
    return {
        profileId,
        savedAt: Date.now(),
        cityName: snapshot.cityName || 'Home',
        haHttpUrl: snapshot.haHttpUrl || '',
        badgeConfig: snapshot.badgeConfig || null,
        rooms: compact(snapshot.rooms, slimRoom),
        allowedQuickScenes: Array.isArray(snapshot.allowedQuickScenes) ? snapshot.allowedQuickScenes : [],
        selectedLockIds: snapshot.selectedLockIds ?? null,
        selectedCoverIds: snapshot.selectedCoverIds ?? null,
        lockPassageConfigs: snapshot.lockPassageConfigs || {},
        lightMappings: snapshot.lightMappings || [],
        mediaMappings: snapshot.mediaMappings || [],
        sensorMappings: snapshot.sensorMappings || [],
        coverMappings: snapshot.coverMappings || [],
        coverWindows: snapshot.coverWindows || [],
        climateMappings: snapshot.climateMappings || [],
        frigateCameras: compact(snapshot.frigateCameras, slimCamera),
        roomTrackingLookup: snapshot.roomTrackingLookup || {},
        musicAssistantEntryIds: snapshot.musicAssistantEntryIds || [],
        alertRules: snapshot.alertRules || [],
        registryAreas: compact(snapshot.registryAreas, slimArea),
        registryFloors: compact(snapshot.registryFloors, slimFloor),
    };
}

function mergeLoaded(ui, entities) {
    return {
        ...ui,
        entities: Array.isArray(entities) ? entities : (ui.entities || []),
    };
}

export async function loadDashboardSnapshot(profileId) {
    if (!profileId) return null;
    if (memorySnapshot?.profileId === profileId) return memorySnapshot;
    try {
        const [uiRaw, entRaw, legacyRaw] = await Promise.all([
            AsyncStorage.getItem(uiKey(profileId)),
            AsyncStorage.getItem(entKey(profileId)),
            AsyncStorage.getItem(cacheKey(profileId)),
        ]);
        let ui = uiRaw ? JSON.parse(uiRaw) : null;
        let entities = [];
        if (entRaw) {
            const ent = JSON.parse(entRaw);
            entities = Array.isArray(ent?.entities) ? ent.entities : [];
        }
        if (!ui && legacyRaw) {
            ui = JSON.parse(legacyRaw);
            if (!entities.length && Array.isArray(ui?.entities)) entities = ui.entities;
        }
        if (!ui || ui.profileId !== profileId) return null;
        memorySnapshot = mergeLoaded(ui, entities);
        return memorySnapshot;
    } catch (e) {
        console.log('[DashboardCache] load failed:', e?.message);
        return null;
    }
}

/** Load snapshot into memory before Home mounts (splash / login). */
export async function preloadDashboardSnapshot(profileId) {
    return loadDashboardSnapshot(profileId);
}

export function peekDashboardSnapshot() {
    return memorySnapshot;
}

export function bootValue(key, fallback) {
    const snap = memorySnapshot;
    if (!snap || !Object.prototype.hasOwnProperty.call(snap, key)) return fallback;
    return snap[key];
}

export async function saveDashboardSnapshot(profileId, snapshot) {
    if (!profileId || !snapshot) return;
    try {
        const prev = memorySnapshot?.profileId === profileId ? memorySnapshot : null;
        const merged = {
            ...prev,
            ...snapshot,
            rooms: (Array.isArray(snapshot.rooms) && snapshot.rooms.length)
                ? snapshot.rooms
                : (prev?.rooms || []),
            badgeConfig: snapshot.badgeConfig || prev?.badgeConfig || null,
            haHttpUrl: snapshot.haHttpUrl || prev?.haHttpUrl || '',
        };
        const ui = buildUiPayload(profileId, merged);
        const homeEntities = compact(
            (Array.isArray(merged.entities) ? merged.entities : []).filter(isHomeEntity),
            slimEntity,
        ).slice(0, MAX_ENTITIES);

        memorySnapshot = mergeLoaded(ui, homeEntities);
        await AsyncStorage.setItem(uiKey(profileId), JSON.stringify(ui));
        await AsyncStorage.setItem(
            entKey(profileId),
            JSON.stringify({ profileId, entities: homeEntities }),
        );
    } catch (e) {
        console.log('[DashboardCache] save failed:', e?.message);
    }
}

export async function startBackgroundBoot() {
    if (bootPromise) return bootPromise;
    bootPromise = (async () => {
        try {
            const [activeProfileId, profiles] = await Promise.all([
                SecureStore.getItemAsync('ha_active_profile_id'),
                loadHaProfiles(),
            ]);
            if (!activeProfileId || !profiles.length) return null;
            const active = profiles.find((p) => p.id === activeProfileId);
            if (!active) return null;
            const normalizedHaUrl = active.haUrl?.replace(/^https?:\/\//i, (m) => m.toLowerCase()) || active.haUrl;
            const normalizedAdminUrl = active.adminUrl?.replace(/^https?:\/\//i, (m) => m.toLowerCase()) || active.adminUrl;
            rememberBootProfile({
                profileId: activeProfileId,
                url: normalizedHaUrl,
                token: active.haToken,
                adminUrl: normalizedAdminUrl,
            });
            await loadDashboardSnapshot(activeProfileId);
            return peekDashboardSnapshot();
        } catch (e) {
            console.log('[DashboardCache] boot failed:', e?.message);
            return null;
        }
    })();
    return bootPromise;
}

startBackgroundBoot();

export function applyDashboardSnapshot(snapshot, setters) {
    if (!snapshot || !setters) return false;
    const {
        setEntities,
        setCityName,
        setRegistryDevices,
        setRegistryEntities,
        setRegistryAreas,
        setRegistryFloors,
        setBadgeConfig,
        setAllowedQuickScenes,
        setSelectedLockIds,
        setSelectedCoverIds,
        setLockPassageConfigs,
        setLightMappings,
        setMediaMappings,
        setSensorMappings,
        setCoverMappings,
        setCoverWindows,
        setClimateMappings,
        setFrigateCameras,
        setRoomTrackingLookup,
        setMusicAssistantEntryIds,
        setAlertRules,
        setCachedHomeRooms,
    } = setters;

    if (Array.isArray(snapshot.entities) && snapshot.entities.length && setEntities) {
        setEntities(snapshot.entities);
    }
    if (snapshot.cityName && setCityName) setCityName(snapshot.cityName);
    if (Array.isArray(snapshot.registryDevices) && snapshot.registryDevices.length && setRegistryDevices) {
        setRegistryDevices(snapshot.registryDevices);
    }
    if (Array.isArray(snapshot.registryEntities) && snapshot.registryEntities.length && setRegistryEntities) {
        setRegistryEntities(snapshot.registryEntities);
    }
    if (Array.isArray(snapshot.registryAreas) && snapshot.registryAreas.length && setRegistryAreas) {
        setRegistryAreas(snapshot.registryAreas);
    }
    if (Array.isArray(snapshot.registryFloors) && snapshot.registryFloors.length && setRegistryFloors) {
        setRegistryFloors(snapshot.registryFloors);
    }
    if (snapshot.badgeConfig && setBadgeConfig) setBadgeConfig(snapshot.badgeConfig);
    if (Array.isArray(snapshot.allowedQuickScenes) && setAllowedQuickScenes) {
        setAllowedQuickScenes(snapshot.allowedQuickScenes);
    }
    if (snapshot.selectedLockIds !== undefined && setSelectedLockIds) {
        setSelectedLockIds(snapshot.selectedLockIds);
    }
    if (snapshot.selectedCoverIds !== undefined && setSelectedCoverIds) {
        setSelectedCoverIds(snapshot.selectedCoverIds);
    }
    if (snapshot.lockPassageConfigs && setLockPassageConfigs) {
        setLockPassageConfigs(snapshot.lockPassageConfigs);
    }
    if (Array.isArray(snapshot.lightMappings) && snapshot.lightMappings.length && setLightMappings) {
        setLightMappings(snapshot.lightMappings);
    }
    if (Array.isArray(snapshot.mediaMappings) && snapshot.mediaMappings.length && setMediaMappings) {
        setMediaMappings(snapshot.mediaMappings);
    }
    if (Array.isArray(snapshot.sensorMappings) && snapshot.sensorMappings.length && setSensorMappings) {
        setSensorMappings(snapshot.sensorMappings);
    }
    if (Array.isArray(snapshot.coverMappings) && snapshot.coverMappings.length && setCoverMappings) {
        setCoverMappings(snapshot.coverMappings);
    }
    if (Array.isArray(snapshot.coverWindows) && snapshot.coverWindows.length && setCoverWindows) {
        setCoverWindows(snapshot.coverWindows);
    }
    if (Array.isArray(snapshot.climateMappings) && snapshot.climateMappings.length && setClimateMappings) {
        setClimateMappings(snapshot.climateMappings);
    }
    if (Array.isArray(snapshot.frigateCameras) && snapshot.frigateCameras.length && setFrigateCameras) {
        setFrigateCameras(snapshot.frigateCameras);
    }
    if (snapshot.roomTrackingLookup && setRoomTrackingLookup) {
        setRoomTrackingLookup(snapshot.roomTrackingLookup);
    }
    if (Array.isArray(snapshot.musicAssistantEntryIds) && setMusicAssistantEntryIds) {
        setMusicAssistantEntryIds(snapshot.musicAssistantEntryIds);
    }
    if (Array.isArray(snapshot.alertRules) && snapshot.alertRules.length && setAlertRules) {
        setAlertRules(snapshot.alertRules);
    }
    if (Array.isArray(snapshot.rooms) && snapshot.rooms.length && setCachedHomeRooms) {
        setCachedHomeRooms(snapshot.rooms);
    }
    return true;
}
