import { useEffect } from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withSpring,
    withSequence,
    withDelay,
    runOnJS
} from 'react-native-reanimated';
import { Home } from 'lucide-react-native';
import { Colors } from '../constants/Colors';
import * as SecureStore from 'expo-secure-store';

export default function Splash() {
    const router = useRouter();
    const scale = useSharedValue(0);
    const opacity = useSharedValue(0);

    useEffect(() => {
        scale.value = withSequence(
            withSpring(1.2),
            withSpring(1)
        );
        opacity.value = withDelay(500, withSpring(1));

        let cancelled = false;
        (async () => {
            try {
                const [isLoggedIn, activeProfileId, profilesJson, userJson] = await Promise.all([
                    SecureStore.getItemAsync('is_logged_in'),
                    SecureStore.getItemAsync('ha_active_profile_id'),
                    SecureStore.getItemAsync('ha_profiles'),
                    SecureStore.getItemAsync('logged_in_user'),
                ]);
                if (cancelled) return;

                // Restore session only if we have a valid profile AND a saved user
                if (isLoggedIn === 'true' && activeProfileId && profilesJson && userJson) {
                    const profiles = JSON.parse(profilesJson);
                    const activeProfile = profiles.find(p => p.id === activeProfileId);
                    if (activeProfile) {
                        const user = JSON.parse(userJson);
                        router.replace({
                            pathname: '/dashboard-v2',
                            params: {
                                userName: user.name || '',
                                userId: user.userId || ''
                            }
                        });
                        return;
                    }
                }
            } catch (e) {
                console.log('[Splash] Error checking session:', e);
            }
            if (!cancelled) router.replace('/login');
        })();

        return () => {
            cancelled = true;
        };
    }, []);

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [{ scale: scale.value }],
        opacity: opacity.value
    }));

    return (
        <View style={styles.container}>
            <Animated.View style={[styles.imageContainer, animatedStyle]}>
                <Image
                    source={require('../assets/splash-screen-dark.png')}
                    style={styles.logo}
                    resizeMode="contain"
                />
            </Animated.View>
            <Animated.Text style={[styles.text, { opacity: opacity }]}>
                Control Your Home
            </Animated.Text>
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
    imageContainer: {
        marginBottom: 20,
        alignItems: 'center',
    },
    logo: {
        width: 300,
        height: 120,
    },
    text: {
        color: Colors.text,
        fontSize: 32,
        fontWeight: 'bold',
        letterSpacing: 1,
    }
});
