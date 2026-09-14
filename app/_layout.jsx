import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Colors } from '../constants/Colors';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import ErrorBoundary from '../components/ErrorBoundary';
import PurpleTopGlow from '../components/PurpleTopGlow';
import { useEffect, useCallback } from 'react';
import { LogBox, Dimensions } from 'react-native';
import { useFonts } from 'expo-font';
import * as ScreenOrientation from 'expo-screen-orientation';
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

    const onLayoutRootView = useCallback(() => {
        // Native splash stays up until the Lottie splash in index.jsx is painted.
    }, []);

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
        // Lock phones to portrait, allow tablets to rotate
        const { width, height } = Dimensions.get('screen');
        const shortSide = Math.min(width, height);
        const isTablet = shortSide >= 768;

        if (!isTablet) {
            ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
        }
    }, []);

    if (!fontsLoaded) {
        return null;
    }

    return (
        <NotifContext.Provider value={{ pendingNotif: null, clearNotif: () => {} }}>
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
                    <PurpleTopGlow />
                </GestureHandlerRootView>
            </ErrorBoundary>
        </NotifContext.Provider>
    );
}
