import * as Device from 'expo-device';
import * as Application from 'expo-application';
import { Platform } from 'react-native';

let heartbeatInterval = null;
let currentAppState = 'foreground';

async function getDeviceId() {
    try {
        if (Platform.OS === 'ios') {
            return await Application.getIosIdForVendorAsync();
        }
        return Application.getAndroidId();
    } catch {
        return null;
    }
}

async function sendHeartbeat(adminUrl, userId, userName) {
    if (!adminUrl || !userId) return;

    try {
        const deviceId = await getDeviceId();
        const url = `${adminUrl.replace(/\/$/, '')}/api/sessions/heartbeat`;

        await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId,
                userName,
                deviceName: Device.modelName || 'Unknown Device',
                deviceId,
                platform: Platform.OS,
                appState: currentAppState
            })
        });
    } catch (e) {
        // Silent fail — heartbeat is best-effort
        console.log('[Heartbeat] Error:', e.message);
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
