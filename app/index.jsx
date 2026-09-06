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

export default function Splash() {
    const router = useRouter();
    const lottieRef = useRef(null);
    const [sessionReady, setSessionReady] = useState(false);
    const [minTimeElapsed, setMinTimeElapsed] = useState(false);
    const navigationTarget = useRef(null);

    useEffect(() => {
        const timer = setTimeout(() => setMinTimeElapsed(true), MIN_SPLASH_MS);
        return () => clearTimeout(timer);
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
