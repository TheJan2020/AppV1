import { useEffect, useRef, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import LottieView from 'lottie-react-native';
import * as SplashScreen from 'expo-splash-screen';
import * as SecureStore from 'expo-secure-store';
import { preloadDashboardSnapshot, rememberBootProfile } from '../utils/dashboardCache';
import { loadHaProfiles } from '../utils/storage';
import { connectionConfigFromProfile } from '../services/connectionEndpoints';
import { Colors } from '../constants/Colors';

const MIN_SPLASH_MS = 2000;
const INTERCOM_SPLASH_MS = 400;

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
                    if (last?.notification?.request?.content?.data?.type === 'intercom') {
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
        (async () => {
            try {
                const [isLoggedIn, activeProfileId, profiles, userJson] = await Promise.all([
                    SecureStore.getItemAsync('is_logged_in'),
                    SecureStore.getItemAsync('ha_active_profile_id'),
                    loadHaProfiles(),
                    SecureStore.getItemAsync('logged_in_user'),
                ]);
                if (cancelled) return;

                if (isLoggedIn === 'true' && activeProfileId && profiles.length && userJson) {
                    const activeProfile = profiles.find(p => p.id === activeProfileId);
                    if (activeProfile) {
                        const cfg = connectionConfigFromProfile(activeProfile);
                        rememberBootProfile({
                            profileId: activeProfileId,
                            url: cfg.url,
                            token: cfg.token,
                            adminUrl: cfg.adminUrl,
                            haUrlLive: cfg.haUrlLive,
                            haUrlLocal: cfg.haUrlLocal,
                            adminUrlLive: cfg.adminUrlLive,
                            adminUrlLocal: cfg.adminUrlLocal,
                        });
                        await preloadDashboardSnapshot(activeProfileId, { haUrl: cfg.url });
                        if (cancelled) return;
                        const user = JSON.parse(userJson);
                        navigationTarget.current = {
                            pathname: '/dashboard-v2',
                            params: {
                                userName: user.name || '',
                                userId: user.userId || ''
                            }
                        };
                        setSessionReady(true);
                        return;
                    }
                }
            } catch (e) {
                console.log('[Splash] Error checking session:', e);
            }
            if (!cancelled) {
                navigationTarget.current = { pathname: '/login' };
                setSessionReady(true);
            }
        })();

        return () => {
            cancelled = true;
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
