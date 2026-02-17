import * as SecureStore from 'expo-secure-store';
import { STORAGE_KEYS, TV_TYPES } from '../constants';

export async function saveConfig(tvType, config) {
    const key = STORAGE_KEYS[tvType];
    if (!key) return;
    await SecureStore.setItemAsync(key, JSON.stringify(config));
}

export async function loadConfig(tvType) {
    const key = STORAGE_KEYS[tvType];
    if (!key) return null;
    try {
        const raw = await SecureStore.getItemAsync(key);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

export async function clearAll() {
    const keys = Object.values(STORAGE_KEYS);
    for (const key of keys) {
        try { await SecureStore.deleteItemAsync(key); } catch { }
    }
}
