import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

const BACKEND_URL = process.env.EXPO_PUBLIC_ADMIN_URL?.replace(/\/$/, '');

if (!BACKEND_URL) {
    console.error('[Push] EXPO_PUBLIC_ADMIN_URL is not defined in .env');
}

// Configure how notifications behave when the app is in foreground
Notifications.setNotificationHandler({
    handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
    }),
});

export async function registerForPushNotificationsAsync() {
    let token;

    if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
            name: 'default',
            importance: Notifications.AndroidImportance.MAX,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: '#FF231F7C',
        });
    }

    if (Device.isDevice) {
        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;
        if (existingStatus !== 'granted') {
            const { status } = await Notifications.requestPermissionsAsync();
            finalStatus = status;
        }
        if (finalStatus !== 'granted') {
            alert('Failed to get push token for push notification!');
            return;
        }

        // Get the token (Project ID is automatically inferred from eas.json if present, or handled by Expo)
        try {
            const projectId = Constants?.expoConfig?.extra?.eas?.projectId ?? Constants?.easConfig?.projectId;

            if (!projectId) {
                console.log('[Push] Missing Project ID. Ensure you have run "eas init" or linked your project.');
                alert('Push Notifications Setup: Project ID not found.\n\nPlease run "npx eas-cli init" in your terminal to link an Expo project.');
                return;
            }

            const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
            token = tokenData.data;
            console.log('[Push] Notification Token:', token);

            // Send to backend
            await registerTokenWithBackend(token);
        } catch (e) {
            console.error('[Push] Error getting token:', e);
            if (e.message.includes('projectId')) {
                alert('Push Notifications Setup: Project ID not found.\n\nPlease run "eas init" in your project terminal to link an Expo project.');
            }
        }
    } else {
        console.log('[Push] Must use physical device for Push Notifications');
    }

    return token;
}

async function registerTokenWithBackend(token) {
    try {
        const deviceName = Device.modelName || 'Unknown Device';
        const response = await fetch(`${BACKEND_URL}/api/notifications/register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                token,
                deviceName
            }),
        });

        if (response.ok) {
            console.log('[Push] Token successfully registered with backend');
        } else {
            console.error('[Push] Backend registration failed:', response.status);
        }
    } catch (error) {
        console.error('[Push] Network error registering token:', error);
    }
}
