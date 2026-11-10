import { useEffect, useRef, useState } from 'react';
import { AppState, View, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import LottieView from 'lottie-react-native';
import * as SplashScreen from 'expo-splash-screen';
import * as SecureStore from 'expo-secure-store';
import { preloadDashboardSnapshot, rememberBootProfile } from '../utils/dashboardCache';
import { loadHaProfiles, readSessionMirror, rememberSessionMirror } from '../utils/storage';
import { connectionConfigFromProfile } from '../services/connectionEndpoints';
import { Colors } from '../constants/Colors';

const MIN_SPLASH_MS = 2000;
const INTERCOM_SPLASH_MS = 400;

async function readSplashSession() {
    const [isLoggedIn, activeProfileId, profiles, userJson, mirror] = await Promise.all([
        SecureStore.getItemAsync('is_logged_in'),
        SecureStore.getItemAsync('ha_active_profile_id'),
        loadHaProfiles(),
        SecureStore.getItemAsync('logged_in_user'),
        readSessionMirror(),
    ]);

    if (isLoggedIn === 'true' && activeProfileId && profiles.length && userJson) {
        const activeProfile = profiles.find((p) => p.id === activeProfileId);
        if (activeProfile) {
            return { activeProfile, user: JSON.parse(userJson), profileId: activeProfileId };
        }
    }

    if (mirror?.profileId && profiles.length) {
        const activeProfile = profiles.find((p) => p.id === mirror.profileId) || profiles[0];
        if (activeProfile) {
            return {
                activeProfile,
                user: { name: mirror.name || '', userId: mirror.userId || '' },
                profileId: activeProfile.id,
            };
        }
    }
    return null;
}

export default function Splash() {
    const router = useRouter();
    const lottieRef = useRef(null);
    const [sessionReady, setSessionReady] = useState(false);
    const [minTimeElapsed, setMinTimeElapsed] = useState(false);
    const navigationTarget = useRef(null);

    useEffect(() => {
        let timer;
        let cancelled = false;
        (async () => {
            let ms = MIN_SPLASH_MS;
            try {
                const Constants = require('expo-constants').default;
                const isExpoGo = Constants.appOwnership === 'expo'
                    || Constants.executionEnvironment === 'storeClient';
                if (!isExpoGo) {
                    const Notifications = require('expo-notifications');
                    const last = await Notifications.getLastNotificationResponseAsync();
                    let nativePending = false;
                    try {
                        nativePending = !!require('../modules/expo-intercom-call').default.hasPending();
                    } catch { /* Expo Go / old binary */ }
                    if (nativePending || last?.notification?.request?.content?.data?.type === 'intercom') {
                        ms = INTERCOM_SPLASH_MS;
                    }
                }
            } catch { /* Expo Go / no push */ }
            if (!cancelled) timer = setTimeout(() => setMinTimeElapsed(true), ms);
        })();
        return () => {
            cancelled = true;
            if (timer) clearTimeout(timer);
        };
    }, []);

    useEffect(() => {
        let cancelled = false;
        let timer;
        let activeAt = AppState.currentState === 'active' ? Date.now() : 0;
        const sub = AppState.addEventListener('change', (state) => {
            if (state === 'active' && !activeAt) activeAt = Date.now();
        });

        const sleep = (ms) => new Promise((resolve) => {
            timer = setTimeout(resolve, ms);
        });

        (async () => {
            const started = Date.now();
            let session = null;
            try {
                while (!cancelled && !session) {
                    try {
                        session = await readSplashSession();
                    } catch (err) {
                        console.log('[Splash] session read failed:', err?.message || err);
                        session = null;
                    }
                    if (session || cancelled) break;
                    const now = Date.now();
                    // A door-call launch reads the keychain while the phone is
                    // still locked. Wait until the phone is open, then once more.
                    if (!activeAt && now - started < 45000) {
                        await sleep(400);
                        continue;
                    }
                    if (activeAt && now - activeAt < 2000) {
                        await sleep(300);
                        continue;
                    }
                    break;
                }
                if (cancelled || !session) return;

                const { activeProfile, user, profileId } = session;
                const cfg = connectionConfigFromProfile(activeProfile);
                rememberBootProfile({
                    profileId,
                    url: cfg.url,
                    token: cfg.token,
                    adminUrl: cfg.adminUrl,
                    haUrlLive: cfg.haUrlLive,
                    haUrlLocal: cfg.haUrlLocal,
                    adminUrlLive: cfg.adminUrlLive,
                    adminUrlLocal: cfg.adminUrlLocal,
                });
                rememberSessionMirror({
                    userId: user.userId || '',
                    name: user.name || '',
                    profileId,
                }).catch(() => {});
                const pendingCall = (() => {
                    try {
                        return !!require('../modules/expo-intercom-call').default.hasPending();
                    } catch {
                        return false;
                    }
                })();
                if (!pendingCall) {
                    await preloadDashboardSnapshot(profileId, { haUrl: cfg.url });
                }
                if (cancelled) return;
                navigationTarget.current = {
                    pathname: '/dashboard-v2',
                    params: {
                        userName: user.name || '',
                        userId: user.userId || '',
                    },
                };
            } catch (e) {
                console.log('[Splash] Error checking session:', e);
            } finally {
                if (!cancelled) {
                    if (!navigationTarget.current) {
                        navigationTarget.current = { pathname: '/login' };
                    }
                    setSessionReady(true);
                }
            }
        })();

        return () => {
            cancelled = true;
            if (timer) clearTimeout(timer);
            sub.remove();
        };
    }, []);

    useEffect(() => {
        if (sessionReady && minTimeElapsed && navigationTarget.current) {
            router.replace(navigationTarget.current);
        }
    }, [sessionReady, minTimeElapsed, router]);

    const onAnimationLoaded = () => {
        SplashScreen.hideAsync().catch(() => {});
    };

    return (
        <View style={styles.container} onLayout={onAnimationLoaded}>
            <LottieView
                ref={lottieRef}
                source={require('../assets/PrimeWave2.json')}
                autoPlay
                loop
                style={styles.animation}
                speed={0.6}
                onAnimationLoaded={onAnimationLoaded}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.background,
        justifyContent: 'center',
        alignItems: 'center',
    },
    animation: {
        width: '100%',
        height: '100%',
    },
});
