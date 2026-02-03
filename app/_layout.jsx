import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Colors } from '../constants/Colors';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

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

import { useEffect } from 'react';
import { registerForPushNotificationsAsync } from '../services/notifications';

export default function RootLayout() {
    useEffect(() => {
        registerForPushNotificationsAsync().then(token => {
            if (token) console.log('Push Token Registered:', token);
        });
    }, []);

    return (
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
                <Stack.Screen name="room" options={{ headerShown: false }} />
            </Stack>
        </GestureHandlerRootView>
    );
}
