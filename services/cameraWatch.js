import * as Device from 'expo-device';
import * as Application from 'expo-application';
import { Platform } from 'react-native';
import { authFetch } from '../utils/authFetch';

let cachedDevice = null;

async function deviceInfo() {
    if (cachedDevice) return cachedDevice;
    let deviceId = '';
    try {
        deviceId = Platform.OS === 'ios'
            ? await Application.getIosIdForVendorAsync()
            : Application.getAndroidId();
    } catch {
        deviceId = '';
    }
    cachedDevice = {
        deviceId: deviceId || '',
        deviceName: Device.deviceName || Device.modelName || 'phone',
        platform: Platform.OS,
    };
    return cachedDevice;
}

function endpoint(adminUrl) {
    return `${String(adminUrl || '').replace(/\/$/, '')}/api/camera-watches`;
}

export function cameraWatchName(camera) {
    return String(camera?.name || camera?.id || camera?.entity_id || '')
        .replace(/^camera\./, '')
        .trim();
}

async function postWatch(adminUrl, body) {
    if (!adminUrl) return;
    const device = await deviceInfo();
    await authFetch(endpoint(adminUrl), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...device, ...body }),
        timeoutMs: 5000,
    });
}

export async function pulseCameraWatch({ adminUrl, camera, userId, userName }) {
    const name = cameraWatchName(camera);
    if (!adminUrl || !name) return;
    try {
        await postWatch(adminUrl, {
            camera: name,
            userId: userId || '',
            userName: userName || '',
            active: true,
        });
    } catch {
        // Best effort. A missed beat just hides the eye until the next one.
    }
}

export async function endCameraWatch({ adminUrl, camera }) {
    const name = cameraWatchName(camera);
    if (!adminUrl || !name) return;
    try {
        await postWatch(adminUrl, { camera: name, active: false });
    } catch {
        // The server closes the row after 20s if this request never lands.
    }
}

export async function fetchLiveWatchers(adminUrl) {
    if (!adminUrl) return [];
    try {
        const res = await authFetch(`${endpoint(adminUrl)}?live=1`, { timeoutMs: 5000 });
        if (!res.ok) return [];
        const data = await res.json();
        return Array.isArray(data?.watchers) ? data.watchers : [];
    } catch {
        return [];
    }
}

export async function fetchCameraWatchHistory(adminUrl, camera) {
    if (!adminUrl) return [];
    const name = cameraWatchName(camera);
    const qs = name ? `?camera=${encodeURIComponent(name)}&limit=30` : '?limit=30';
    try {
        const res = await authFetch(`${endpoint(adminUrl)}${qs}`, { timeoutMs: 8000 });
        if (!res.ok) return [];
        const data = await res.json();
        return Array.isArray(data?.history) ? data.history : [];
    } catch {
        return [];
    }
}
