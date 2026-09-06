import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Colors } from '../constants/Colors';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import ErrorBoundary from '../components/ErrorBoundary';
import { useEffect, useState, useCallback } from 'react';
import { LogBox, Dimensions, Image, StyleSheet, View, Platform } from 'react-native';
import { useFonts } from 'expo-font';
import * as ScreenOrientation from 'expo-screen-orientation';
import * as Notifications from 'expo-notifications';
import { registerForPushNotificationsAsync } from '../services/notifications';
import { NotifContext } from '../services/NotifContext';
import { preloadLocalLightIcons } from '../utils/lightTypeAssets';
import { CF } from '../utils/typography';
import * as SplashScreen from 'expo-splash-screen';
import * as SecureStore from 'expo-secure-store';
import { preloadDashboardSnapshot } from '../utils/dashboardCache';
import { loadHaProfiles } from '../utils/storage';

SplashScreen.preventAutoHideAsync().catch(() => {});

LogBox.ignoreLogs([
    "It looks like you might be using shared value's .value",
    /\[Mappings\]/,
    /\[Cameras\]/,
    /\[Config\]/,
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

export default function RootLayout() {
    const [fontsLoaded] = useFonts({
        'ClashDisplay-Extralight': require('../assets/fonts/ClashDisplay-Extralight.otf'),
        'ClashDisplay-Light':      require('../assets/fonts/ClashDisplay-Light.otf'),
        'ClashDisplay-Regular':    require('../assets/fonts/ClashDisplay-Regular.otf'),
        'ClashDisplay-Medium':     require('../assets/fonts/ClashDisplay-Medium.otf'),
        'ClashDisplay-Semibold':   require('../assets/fonts/ClashDisplay-Semibold.otf'),
        'ClashDisplay-Bold':       require('../assets/fonts/ClashDisplay-Bold.otf'),
    });

    // ── Notification state — shared with all screens via context ─────────────
    const [pendingNotif, setPendingNotif] = useState(null);

    // Convert a raw Expo notification response object to our modal shape
    const extractNotif = (response) => {
        if (!response) return null;
        const content = response?.notification?.request?.content ?? {};
        return {
            title:     content.title              || '',
            body:      content.body               || '',
            category:  content.data?.category     || 'default',
            timestamp: new Date().toISOString(),
        };
    };

    const onLayoutRootView = useCallback(async () => {
        if (fontsLoaded) {
            await SplashScreen.hideAsync().catch(() => {});
        }
    }, [fontsLoaded]);

    useEffect(() => {
        preloadLocalLightIcons().catch(() => {});
        (async () => {
            try {
                const [id, profiles] = await Promise.all([
                    SecureStore.getItemAsync('ha_active_profile_id'),
                    loadHaProfiles(),
                ]);
                if (!id) return;
                const active = (profiles || []).find((p) => p.id === id);
                await preloadDashboardSnapshot(id, { haUrl: active?.haUrl });
            } catch {
                // ignore boot cache errors
            }
        })();
    }, []);

    useEffect(() => {
        registerForPushNotificationsAsync().then(token => {
            if (token) console.log('Push Token Registered:', token);
        });

        // Lock phones to portrait, allow tablets to rotate
        const { width, height } = Dimensions.get('screen');
        const shortSide = Math.min(width, height);
        const isTablet = shortSide >= 768;

        if (!isTablet) {
            ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
        }

        // ── Cold start ────────────────────────────────────────────────────────
        // When the app was killed and the user tapped a notification to launch it,
        // getLastNotificationResponseAsync() returns that response.
        // This runs in _layout (which wraps all screens) so it fires BEFORE any
        // screen mounts — the value will be ready in context when dashboard-v2 loads.
        Notifications.getLastNotificationResponseAsync()
            .then(response => {
                const notif = extractNotif(response);
                if (notif) {
                    console.log('[Notif] Cold-start notification captured:', notif.title);
                    setPendingNotif(notif);
                }
            })
            .catch(() => {});

        // ── Background → foreground ───────────────────────────────────────────
        // Fires when user taps a notification while app is running/suspended.
        const tapSub = Notifications.addNotificationResponseReceivedListener(response => {
            const notif = extractNotif(response);
            if (notif) {
                console.log('[Notif] Tap notification captured:', notif.title);
                setPendingNotif(notif);
            }
        });

        return () => {
            tapSub.remove();
        };
    }, []);

    if (!fontsLoaded) {
        return null;
    }

    return (
        <NotifContext.Provider value={{ pendingNotif, clearNotif: () => setPendingNotif(null) }}>
            <ErrorBoundary>
                <GestureHandlerRootView style={{ flex: 1 }} onLayout={onLayoutRootView}>
                    <StatusBar style="light" />
                    <Stack
                        screenOptions={{
                            headerStyle: {
                                backgroundColor: Colors.background,
                            },
                            headerTintColor: Colors.text,
                            headerTitleStyle: {
                                fontFamily: CF.bold,
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
                    {/* Purple glow over screens.
                        On Android/Samsung, an Image overlay above the navigator often still
                        intercepts taps even with pointerEvents="none" (blocks Settings tabs).
                        Skip the overlay on Android; keep it on iOS where pointerEvents works. */}
                    {Platform.OS !== 'android' ? (
                        <View
                            pointerEvents="none"
                            collapsable={false}
                            style={layoutStyles.topShadowWrap}
                        >
                            <Image
                                source={require('../assets/shadow.png')}
                                style={layoutStyles.topShadow}
                                resizeMode="contain"
                            />
                        </View>
                    ) : null}
                </GestureHandlerRootView>
            </ErrorBoundary>
        </NotifContext.Provider>
    );
}

const layoutStyles = StyleSheet.create({
    topShadowWrap: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 462.37,
        alignItems: 'center',
        // Keep visual stacking without Android elevation touch bugs
        zIndex: 1,
        elevation: 0,
    },
    topShadow: {
        width: 521.82,
        height: 462.37,
    },
});
