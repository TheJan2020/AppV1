import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { AppState, Platform } from 'react-native';
import { getAdminUrl } from '../utils/storage';
import * as SecureStore from 'expo-secure-store';
import IntercomCall from '../modules/expo-intercom-call';

const isExpoGo = Constants.appOwnership === 'expo'
    || Constants.executionEnvironment === 'storeClient';

let Notifications = null;
try {
    Notifications = require('expo-notifications');
    Notifications.setNotificationHandler({
        handleNotification: async (notification) => {
            const type = notification?.request?.content?.data?.type;
            const isIntercom = type === 'intercom';
            const event = notification?.request?.content?.data?.event;
            const nativeCall = !isExpoGo && IntercomCall.isAvailable() && isIntercom && event === 'ringing';
            return {
                shouldShowAlert: !nativeCall,
                shouldPlaySound: isIntercom && !nativeCall,
                shouldSetBadge: isIntercom,
                shouldShowBanner: !nativeCall,
                shouldShowList: true,
            };
        },
    });
} catch {
    Notifications = null;
}

let lastExpoToken = '';
let nativeStarted = false;

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

async function registerTokenWithBackend(token, voipToken) {
    const adminUrl = await getAdminUrl();
    const voip = String(voipToken || IntercomCall.getVoipToken() || '').trim();
    const expo = String(token || lastExpoToken || '').trim();
    const rowToken = expo || (voip ? `voip:${voip}` : '');
    if (!adminUrl || !rowToken) return;
    const userId = await getCurrentUserId();
    const base = adminUrl.endsWith('/') ? adminUrl : `${adminUrl}/`;
    await fetch(`${base}api/notifications/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            token: rowToken,
            voipToken: voip || undefined,
            platform: Platform.OS,
            deviceName: Device.deviceName || Device.modelName || 'phone',
            userId,
        }),
    });
}

function maybeReportAndroidIncoming(data) {
    if (Platform.OS !== 'android') return;
    if (!IntercomCall.isAvailable()) return;
    if (data?.type !== 'intercom' || data?.event !== 'ringing') return;
    if (AppState.currentState === 'active') return;
    IntercomCall.reportIncoming(data.callId || '', data.label || 'Front door');
}

export function startNativeIncomingCalls() {
    if (nativeStarted) return;
    nativeStarted = true;
    IntercomCall.addListener('onVoipToken', ({ token } = {}) => {
        if (!token) return;
        registerTokenWithBackend(lastExpoToken || `voip:${token}`, token).catch(() => {});
    });
    if (!Notifications) return;
    Notifications.addNotificationReceivedListener((notification) => {
        maybeReportAndroidIncoming(notification?.request?.content?.data);
    });
}

export async function registerForPushNotificationsAsync() {
    startNativeIncomingCalls();
    const voipNow = IntercomCall.getVoipToken() || '';
    if (voipNow) {
        registerTokenWithBackend(lastExpoToken || `voip:${voipNow}`, voipNow).catch(() => {});
    }
    if (!Notifications) return voipNow || undefined;
    try {
        if (Platform.OS === 'android') {
            await Notifications.setNotificationChannelAsync('intercom', {
                name: 'Door intercom',
                importance: Notifications.AndroidImportance.MAX,
                vibrationPattern: [0, 800, 400, 800, 400, 800, 400, 800, 400, 800],
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
            const { status } = await Notifications.requestPermissionsAsync({
                ios: {
                    allowAlert: true,
                    allowBadge: true,
                    allowSound: true,
                    allowAnnouncements: true,
                },
            });
            finalStatus = status;
        }
        if (finalStatus !== 'granted') {
            if (voipNow) await registerTokenWithBackend(`voip:${voipNow}`, voipNow);
            return undefined;
        }

        const projectId = Constants.expoConfig?.extra?.eas?.projectId;
        const tokenRes = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : {});
        const token = tokenRes?.data;
        if (token) {
            lastExpoToken = token;
            await registerTokenWithBackend(token, IntercomCall.getVoipToken() || voipNow);
            if (Platform.OS === 'ios') {
                let tries = 0;
                const retry = setInterval(() => {
                    tries += 1;
                    const voip = IntercomCall.getVoipToken() || '';
                    if (voip || tries >= 20) {
                        clearInterval(retry);
                        if (voip) registerTokenWithBackend(token, voip).catch(() => {});
                    }
                }, 1000);
            }
        }
        return token;
    } catch (err) {
        console.warn('[Push] register skipped:', err?.message || err);
        if (voipNow) registerTokenWithBackend(`voip:${voipNow}`, voipNow).catch(() => {});
        return undefined;
    }
}

export async function unregisterPushTokenAsync() {
    if (!Notifications) return;
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
