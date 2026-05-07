import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Colors } from '../constants/Colors';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import ErrorBoundary from '../components/ErrorBoundary';
import { useEffect } from 'react';
import { LogBox, Dimensions, Image, StyleSheet, View } from 'react-native';
import { useFonts } from 'expo-font';
import * as ScreenOrientation from 'expo-screen-orientation';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { registerForPushNotificationsAsync } from '../services/notifications';

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

// ── Tap signal key stored in SecureStore (tiny value, always available) ──────
const PENDING_OPEN_KEY = 'pending_notif_open';

export default function RootLayout() {
    const [fontsLoaded] = useFonts({
        'ClashDisplay-Extralight': require('../assets/fonts/ClashDisplay-Extralight.otf'),
        'ClashDisplay-Light':      require('../assets/fonts/ClashDisplay-Light.otf'),
        'ClashDisplay-Regular':    require('../assets/fonts/ClashDisplay-Regular.otf'),
        'ClashDisplay-Medium':     require('../assets/fonts/ClashDisplay-Medium.otf'),
        'ClashDisplay-Semibold':   require('../assets/fonts/ClashDisplay-Semibold.otf'),
        'ClashDisplay-Bold':       require('../assets/fonts/ClashDisplay-Bold.otf'),
    });

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
        // Set a tiny SecureStore flag so dashboard-v2 opens the notification modal
        // when the app comes to the foreground after a lock-screen tap.
        const tapSub = Notifications.addNotificationResponseReceivedListener((response) => {
            // Save the full notification content so the dashboard can show a modal
            const content = response?.notification?.request?.content ?? {};
            const payload = JSON.stringify({
                title:     content.title    || '',
                body:      content.body     || '',
                category:  content.data?.category || 'default',
                timestamp: new Date().toISOString(),
            });
            SecureStore.setItemAsync('pending_notif_data', payload).catch(() => {});
            SecureStore.setItemAsync(PENDING_OPEN_KEY, '1').catch(() => {});
        });

        return () => {
            tapSub.remove();
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
                            backgroundColor: '#09091A',
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
                {/* Global top-center purple glow — rendered OVER screens, touches pass through */}
                <Image
                    source={require('../assets/shadow.png')}
                    style={layoutStyles.topShadow}
                    resizeMode="contain"
                    pointerEvents="none"
                />
            </GestureHandlerRootView>
        </ErrorBoundary>
    );
}

const layoutStyles = StyleSheet.create({
    topShadow: {
        position: 'absolute',
        top: 0,
        alignSelf: 'center',
        width: 521.82,
        height: 462.37,
        zIndex: 9999,
    },
});
