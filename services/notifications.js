import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { getAdminUrl } from '../utils/storage';
import * as SecureStore from 'expo-secure-store';

const isExpoGo = Constants.appOwnership === 'expo'
    || Constants.executionEnvironment === 'storeClient';

let Notifications = null;
if (!isExpoGo) {
    try {
        Notifications = require('expo-notifications');
        Notifications.setNotificationHandler({
            handleNotification: async (notification) => {
                const type = notification?.request?.content?.data?.type;
                return {
                    shouldShowAlert: true,
                    shouldPlaySound: type === 'intercom',
                    shouldSetBadge: type === 'intercom',
                };
            },
        });
    } catch {
        Notifications = null;
    }
}

async function getCurrentUserId() {
    try {
        const raw = await SecureStore.getItemAsync('logged_in_user');
        if (!raw) return '';
        const user = JSON.parse(raw);
        return String(user?.userId || user?.user_id || user?.id || '').trim();
    } catch {
        return '';
    }
}

async function registerTokenWithBackend(token) {
    const adminUrl = await getAdminUrl();
    if (!adminUrl || !token) return;
    const userId = await getCurrentUserId();
    const base = adminUrl.endsWith('/') ? adminUrl : `${adminUrl}/`;
    await fetch(`${base}api/notifications/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            token,
            deviceName: Device.deviceName || Device.modelName || 'phone',
            userId,
        }),
    });
}

export async function registerForPushNotificationsAsync() {
    if (isExpoGo || !Notifications) return undefined;
    try {
        if (Platform.OS === 'android') {
            await Notifications.setNotificationChannelAsync('intercom', {
                name: 'Door intercom',
                importance: Notifications.AndroidImportance.MAX,
                vibrationPattern: [0, 400, 200, 400],
                sound: 'default',
                enableVibrate: true,
                lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
                bypassDnd: true,
            });
            await Notifications.setNotificationChannelAsync('default', {
                name: 'Notifications',
                importance: Notifications.AndroidImportance.HIGH,
            });
        }

        const { status: existing } = await Notifications.getPermissionsAsync();
        let finalStatus = existing;
        if (existing !== 'granted') {
            const { status } = await Notifications.requestPermissionsAsync();
            finalStatus = status;
        }
        if (finalStatus !== 'granted') return undefined;

        const projectId = Constants.expoConfig?.extra?.eas?.projectId;
        const tokenRes = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : {});
        const token = tokenRes?.data;
        if (token) await registerTokenWithBackend(token);
        return token;
    } catch (err) {
        console.warn('[Push] register skipped:', err?.message || err);
        return undefined;
    }
}

export async function unregisterPushTokenAsync() {
    if (isExpoGo || !Notifications) return;
    try {
        const projectId = Constants.expoConfig?.extra?.eas?.projectId;
        const tokenRes = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : {});
        const token = tokenRes?.data;
        const adminUrl = await getAdminUrl();
        if (!token || !adminUrl) return;
        const base = adminUrl.endsWith('/') ? adminUrl : `${adminUrl}/`;
        await fetch(`${base}api/notifications/register?token=${encodeURIComponent(token)}`, {
            method: 'DELETE',
        });
    } catch (err) {
        console.warn('[Push] unregister skipped:', err?.message || err);
    }
}
