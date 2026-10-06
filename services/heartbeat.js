import * as Device from 'expo-device';
import * as Application from 'expo-application';
import { Platform } from 'react-native';
import { authFetch } from '../utils/authFetch';

let heartbeatInterval = null;
let currentAppState = 'foreground';
let cachedDevice = null;

async function getDeviceInfo() {
    if (cachedDevice) return cachedDevice;
    let deviceId = null;
    try {
        deviceId = Platform.OS === 'ios'
            ? await Application.getIosIdForVendorAsync()
            : Application.getAndroidId();
    } catch {
        deviceId = null;
    }
    cachedDevice = {
        deviceId,
        deviceName: Device.modelName || 'Unknown Device',
        platform: Platform.OS,
    };
    return cachedDevice;
}

async function sendHeartbeat(adminUrl, userId, userName) {
    if (!adminUrl || !userId) return;

    try {
        const device = await getDeviceInfo();
        const url = `${adminUrl.replace(/\/$/, '')}/api/sessions/heartbeat`;

        await authFetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId,
                userName,
                deviceName: device.deviceName,
                deviceId: device.deviceId,
                platform: device.platform,
                appState: currentAppState,
            }),
            timeoutMs: 5000,
        });
    } catch (e) {
        // Silent fail — heartbeat is best-effort
    }
}

export function startHeartbeat(adminUrl, userId, userName) {
    stopHeartbeat();

    // Send initial heartbeat immediately
    sendHeartbeat(adminUrl, userId, userName);

    // Then every 30 seconds
    heartbeatInterval = setInterval(() => {
        sendHeartbeat(adminUrl, userId, userName);
    }, 30000);
}

export function stopHeartbeat() {
    if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
    }
}

export function updateAppState(state) {
    currentAppState = state;
}
