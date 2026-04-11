import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { getAdminUrl } from '../utils/storage';
import { authFetch } from '../utils/authFetch';

// Configure how notifications behave when the app is in foreground
Notifications.setNotificationHandler({
    handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
    }),
});

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
        const response = await authFetch(`${backendUrl}/api/notifications/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token, deviceName }),
        });

        if (response.ok) {
            console.log('[Push] Token registered with backend');
        } else {
            console.error('[Push] Backend registration failed:', response.status);
        }
    } catch (error) {
        console.error('[Push] Network error registering token:', error.message);
    }
}

