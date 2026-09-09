/**
 * Push registration is disabled. expo-notifications crashes Expo Go on Android
 * (SDK 53+) and is not needed for local testing.
 */
export async function registerForPushNotificationsAsync() {
    return undefined;
}

export async function unregisterPushTokenAsync() {
    return undefined;
}
