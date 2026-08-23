import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

const SETTINGS_KEY_PROFILES = 'ha_profiles';
const SETTINGS_KEY_ACTIVE_PROFILE = 'ha_active_profile_id';
const PROFILES_ASYNC_KEY = 'ha_profiles_v2';

/** In-memory copy so Add Account can list homes even if SecureStore is empty/oversized. */
let memoryProfiles = [];

function normalizeProfiles(parsed) {
    if (Array.isArray(parsed)) return parsed.filter((p) => p && p.id);
    if (parsed && Array.isArray(parsed.profiles)) return parsed.profiles.filter((p) => p && p.id);
    return [];
}

function parseProfilesRaw(raw) {
    if (!raw) return [];
    try {
        return normalizeProfiles(typeof raw === 'string' ? JSON.parse(raw) : raw);
    } catch {
        return [];
    }
}

function mergeProfiles(...lists) {
    const byId = new Map();
    for (const list of lists) {
        if (!Array.isArray(list)) continue;
        for (const profile of list) {
            if (!profile?.id) continue;
            const prev = byId.get(profile.id);
            byId.set(profile.id, prev ? { ...prev, ...profile } : profile);
        }
    }
    return [...byId.values()];
}

export function rememberHaProfiles(list) {
    memoryProfiles = normalizeProfiles(list);
}

export function peekHaProfiles() {
    return memoryProfiles;
}

export async function loadHaProfiles() {
    let fromAsync = [];
    let fromSecure = [];
    try {
        fromAsync = parseProfilesRaw(await AsyncStorage.getItem(PROFILES_ASYNC_KEY));
    } catch (e) {
        console.log('[Storage] AsyncStorage profiles read failed:', e?.message || e);
    }
    try {
        fromSecure = parseProfilesRaw(await SecureStore.getItemAsync(SETTINGS_KEY_PROFILES));
    } catch (e) {
        console.log('[Storage] SecureStore profiles read failed:', e?.message || e);
    }

    const merged = mergeProfiles(fromAsync, fromSecure, memoryProfiles);
    if (merged.length > 0) {
        rememberHaProfiles(merged);
        if (fromAsync.length === 0) {
            AsyncStorage.setItem(PROFILES_ASYNC_KEY, JSON.stringify(merged)).catch(() => {});
        }
    }
    return merged;
}

export async function saveHaProfiles(profiles) {
    const list = normalizeProfiles(profiles);
    rememberHaProfiles(list);
    const json = JSON.stringify(list);
    await AsyncStorage.setItem(PROFILES_ASYNC_KEY, json);
    try {
        await SecureStore.setItemAsync(SETTINGS_KEY_PROFILES, json);
    } catch (e) {
        console.log('[Storage] SecureStore profiles save skipped:', e?.message || e);
    }
}

/**
 * Retrieves the Admin Backend URL from the active profile in SecureStore.
 * Returns null if no profile or no admin URL is configured.
 */
export const getAdminUrl = async () => {
    try {
        const activeProfileId = await SecureStore.getItemAsync(SETTINGS_KEY_ACTIVE_PROFILE);
        if (!activeProfileId) {
            console.log('[Storage] No active profile ID found.');
            return null;
        }

        const profiles = await loadHaProfiles();
        const activeProfile = profiles.find(p => p.id === activeProfileId);
        if (!activeProfile) {
            console.log('[Storage] Active profile not found in list.');
            return null;
        }

        const adminUrl = activeProfile.adminUrl;
        if (adminUrl) {
            const normalizedUrl = adminUrl.replace(/^https?:\/\//i, (m) => m.toLowerCase());
            console.log('[Storage] Retrieved Admin URL from profile:', normalizedUrl);
            return normalizedUrl;
        }
        console.log('[Storage] Active profile has no Admin URL.');
        return null;
    } catch (error) {
        console.error('[Storage] Error retrieving Admin URL:', error);
        return null;
    }
};

/**
 * Retrieves the HA token from the active profile.
 */
export const getHaToken = async () => {
    try {
        const activeProfileId = await SecureStore.getItemAsync(SETTINGS_KEY_ACTIVE_PROFILE);
        if (!activeProfileId) return null;
        const profiles = await loadHaProfiles();
        const activeProfile = profiles.find(p => p.id === activeProfileId);
        return activeProfile?.haToken || null;
    } catch (error) {
        console.error('[Storage] Error retrieving HA token:', error);
        return null;
    }
};
