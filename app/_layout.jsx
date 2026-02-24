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
import { registerForPushNotificationsAsync } from '../services/notifications';

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
