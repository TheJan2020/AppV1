import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Colors } from '../constants/Colors';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import ErrorBoundary from '../components/ErrorBoundary';

import { LogBox } from 'react-native';

LogBox.ignoreLogs([
    "It looks like you might be using shared value's .value",
]);

// Polyfill console.warn to suppress terminal spam
const originalWarn = console.warn;
console.warn = (...args) => {
    const msg = args.join(' ');
    if (msg.includes("It looks like you might be using shared value's .value")) return;
    originalWarn(...args);
};

// Global error handler — logs native crashes to console before they kill the app
try {
    if (typeof ErrorUtils !== 'undefined') {
        const originalHandler = ErrorUtils.getGlobalHandler();
        ErrorUtils.setGlobalHandler((error, isFatal) => {
            console.error(`[CRASH] ${isFatal ? 'FATAL' : 'NON-FATAL'}:`, error?.message);
            console.error('[CRASH] Stack:', error?.stack);
            if (originalHandler) originalHandler(error, isFatal);
        });
    }
} catch (e) {
    console.log('[ErrorHandler] Could not set global handler:', e);
}

import { useEffect } from 'react';
import { Dimensions } from 'react-native';
import * as ScreenOrientation from 'expo-screen-orientation';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { registerForPushNotificationsAsync } from '../services/notifications';

// ── Helpers (mirrored from useNotifications so _layout has no hook dependency) ──
const NOTIF_STORAGE_KEY = 'app_notifications';
const PENDING_OPEN_KEY  = 'pending_notif_open';
const TTL_MS            = 3 * 24 * 60 * 60 * 1000;

function makeId() {
    return `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

async function persistPushNotification(title, body, category) {
    try {
        const raw      = await AsyncStorage.getItem(NOTIF_STORAGE_KEY);
        const existing = raw ? JSON.parse(raw) : [];
        const cutoff   = Date.now() - TTL_MS;
        const fresh    = existing.filter(n => n.timestamp >= cutoff);
        const newItem  = {
            id:        makeId(),
            title:     title    || '',
            body:      body     || '',
            category:  category || 'default',
            timestamp: Date.now(),
            unread:    true,
        };
        const updated = [newItem, ...fresh].slice(0, 100);
        await AsyncStorage.setItem(NOTIF_STORAGE_KEY, JSON.stringify(updated));
    } catch (e) {
        console.warn('[_layout] persistPushNotification error:', e);
    }
}

export default function RootLayout() {
    useEffect(() => {
        registerForPushNotificationsAsync().then(token => {
            if (token) console.log('Push Token Registered:', token);
        });

        // Lock phones to portrait, allow tablets to rotate
        const { width, height } = Dimensions.get('screen');
        const shortSide = Math.min(width, height);
        const isTablet = shortSide >= 768;

        if (!isTablet) {
            ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
        }

        // ── Tap from lock screen / notification centre ────────────────────────
        // Fires whenever the user taps a push notification (app killed, background, or foreground)
        const tapSub = Notifications.addNotificationResponseReceivedListener(response => {
            const { title, body, data } = response.notification.request.content;
            const category = data?.category || 'default';

            // Persist the notification itself (covers the "app was killed" case where
            // the foreground listener never ran)
            if (title || body) {
                persistPushNotification(title, body, category);
            }

            // Signal dashboard-v2 to open the notification modal
            AsyncStorage.setItem(PENDING_OPEN_KEY, '1').catch(() => {});
        });

        // ── Push received while app is in the FOREGROUND ──────────────────────
        // expo-notifications does NOT auto-show a banner when the app is open, so
        // we save it here so the in-memory state (via useNotifications hook) can
        // pick it up through the shared AsyncStorage store.
        const fgSub = Notifications.addNotificationReceivedListener(notification => {
            const { title, body, data } = notification.request.content;
            // Only persist backend-originated pushes (entity_notification flag set in ha-notifier)
            if (data?.entity_notification) {
                persistPushNotification(title, body, data?.category || 'default');
            }
        });

        return () => {
            tapSub.remove();
            fgSub.remove();
        };
    }, []);

    return (
        <ErrorBoundary>
            <GestureHandlerRootView style={{ flex: 1 }}>
                <StatusBar style="light" />
                <Stack
                    screenOptions={{
                        headerStyle: {
                            backgroundColor: Colors.background,
                        },
                        headerTintColor: Colors.text,
                        headerTitleStyle: {
                            fontWeight: 'bold',
                        },
                        contentStyle: {
                            backgroundColor: Colors.background,
                        },
                        animation: 'slide_from_right',
                    }}
                >
                    <Stack.Screen name="index" options={{ headerShown: false }} />
                    <Stack.Screen name="login" options={{ headerShown: false, gestureEnabled: false }} />
                    <Stack.Screen name="dashboard" options={{ headerShown: false, gestureEnabled: false }} />
                    <Stack.Screen name="dashboard-v2" options={{ headerShown: false, gestureEnabled: false }} />
                    <Stack.Screen name="dashboard-v2-tablet" options={{ headerShown: false, gestureEnabled: false }} />
                    <Stack.Screen name="room" options={{ headerShown: false }} />
                    <Stack.Screen name="tv-lab" options={{ headerShown: false }} />
                    <Stack.Screen name="dashboard-v3" options={{ headerShown: false }} />
                </Stack>
            </GestureHandlerRootView>
        </ErrorBoundary>
    );
}
