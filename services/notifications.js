import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { getAdminUrl } from '../utils/storage';
import { authFetch } from '../utils/authFetch';

const SETTINGS_KEY_PROFILES = 'ha_profiles';
const SETTINGS_KEY_ACTIVE_PROFILE = 'ha_active_profile_id';

/**
 * Extracts the current userId from the active profile.
 * Returns null if no profile or no userId is configured.
 */
async function getCurrentUserId() {
    try {
        const activeProfileId = await SecureStore.getItemAsync(SETTINGS_KEY_ACTIVE_PROFILE);
        if (!activeProfileId) return null;

        const profilesJson = await SecureStore.getItemAsync(SETTINGS_KEY_PROFILES);
        if (!profilesJson) return null;

        const profiles = JSON.parse(profilesJson);
        const activeProfile = profiles.find(p => p.id === activeProfileId);
        return activeProfile?.userId || null;
    } catch (error) {
        console.error('[Push] Error extracting userId:', error.message);
        return null;
    }
}

// Configure how notifications behave when the app is in foreground
try {
    Notifications.setNotificationHandler({
        handleNotification: async () => ({
            shouldShowAlert: true,
            shouldShowBanner: true,
            shouldShowList: true,
            shouldPlaySound: true,
            shouldSetBadge: true,
        }),
    });
} catch (e) {
    console.log('[Push] setNotificationHandler failed:', e?.message || e);
}

export async function registerForPushNotificationsAsync() {
    let token;

    if (Platform.OS === 'android') {
        // Android: high-priority channel (shows on lock screen like WhatsApp)
        await Notifications.setNotificationChannelAsync('default', {
            name: 'Primewave Alerts',
            importance: Notifications.AndroidImportance.MAX,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: '#832ea9',
            lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
            bypassDnd: false,
            sound: 'default',
            showBadge: true,
        });
    }

    if (Device.isDevice) {
        // Request all required permissions explicitly (alert + badge + sound)
        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;
        if (existingStatus !== 'granted') {
            const { status } = await Notifications.requestPermissionsAsync({
                ios: {
                    allowAlert: true,
                    allowBadge: true,
                    allowSound: true,
                    allowDisplayInCarPlay: false,
                    allowCriticalAlerts: false,
                    provideAppNotificationSettings: false,
                    allowProvisional: false,
                },
            });
            finalStatus = status;
        }
        if (finalStatus !== 'granted') {
            console.warn('[Push] Notification permission denied');
            return;
        }

        try {
            const projectId = Constants?.expoConfig?.extra?.eas?.projectId ?? Constants?.easConfig?.projectId;

            if (!projectId) {
                console.error('[Push] Missing Expo Project ID');
                return;
            }

            const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
            token = tokenData.data;
            console.log('[Push] Token:', token);

            // Register with backend
            const backendUrl = await getAdminUrl();
            if (!backendUrl) {
                console.error('[Push] No backend URL — cannot register token');
                return token;
            }
            await registerTokenWithBackend(token, backendUrl);
        } catch (e) {
            console.error('[Push] Error getting push token:', e.message);
        }
    } else {
        console.log('[Push] Push notifications require a physical device');
    }

    return token;
}

async function registerTokenWithBackend(token, backendUrl) {
    try {
        const deviceName = Device.modelName || 'Unknown Device';
        const userId = await getCurrentUserId();

        const response = await authFetch(`${backendUrl}/api/notifications/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token, deviceName, userId }),
        });

        if (response.ok) {
            console.log(`[Push] Token registered with backend (userId: ${userId || 'unknown'})`);
        } else {
            console.error('[Push] Backend registration failed:', response.status);
        }
    } catch (error) {
        console.error('[Push] Network error registering token:', error.message);
    }
}

/**
 * Unregisters the current device's push token from the backend.
 * Call this on logout so the server stops sending pushes to this device.
 * This ensures that when switching accounts, old notifications don't leak to the new account.
 */
export async function unregisterPushTokenAsync() {
    try {
        const projectId = Constants?.expoConfig?.extra?.eas?.projectId ?? Constants?.easConfig?.projectId;
        if (!projectId || !Device.isDevice) {
            console.log('[Push] Skipping unregister: no projectId or not a device');
            return;
        }

        const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
        const token = tokenData?.data;
        if (!token) {
            console.warn('[Push] No token to unregister');
            return;
        }

        const backendUrl = await getAdminUrl();
        if (!backendUrl) {
            console.warn('[Push] No backend URL — cannot unregister token');
            return;
        }

        const url = `${backendUrl}/api/notifications/register?token=${encodeURIComponent(token)}`;
        const response = await authFetch(url, { method: 'DELETE' });
        
        if (response.ok) {
            console.log('[Push] ✓ Token unregistered on logout (device cleanup successful)');
        } else {
            console.error('[Push] Unregister failed with status:', response.status);
        }
    } catch (e) {
        // Non-fatal — logout should always proceed even if this fails
        console.warn('[Push] Failed to unregister token on logout:', e.message);
    }
}

