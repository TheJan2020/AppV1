import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Image } from 'react-native';
import { useState, useEffect } from 'react';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing } from 'react-native-reanimated';
import { Zap } from 'lucide-react-native';
import { Colors } from '../../constants/Colors';
import { LinearGradient } from 'expo-linear-gradient';
import { getAdminUrl } from '../../utils/storage';
import { checkPreferenceMatch } from '../../utils/preferenceHelpers';
import * as Haptics from 'expo-haptics';
import { authFetch } from '../../utils/authFetch';

export default function ActivatePreferencesButton({ roomName, onActivate, onPreferencesLoaded, logoSource }) {
    const [loading, setLoading] = useState(false);
    const [preferences, setPreferences] = useState([]);
    const [needsChange, setNeedsChange] = useState(0);
    const [applying, setApplying] = useState(false);

    // Glowing animation
    const glowScale = useSharedValue(1);
    const glowOpacity = useSharedValue(0.6);

    useEffect(() => {
        // Pulse animation - Disabled for minimal look
        // glowScale.value = withRepeat(
        //     withTiming(1.3, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
        //     -1,
        //     true
        // );
        // glowOpacity.value = withRepeat(
        //     withTiming(0.2, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
        //     -1,
        //     true
        // );
    }, []);

    const glowStyle = useAnimatedStyle(() => ({
        transform: [{ scale: glowScale.value }],
        opacity: glowOpacity.value,
    }));

    // Load preferences when room changes
    useEffect(() => {
        if (roomName) {
            loadPreferences();
        }
    }, [roomName]);

    const loadPreferences = async () => {
        try {
            setLoading(true);
            const backendUrl = await getAdminUrl();
            if (!backendUrl) return;

            const now = new Date();
            const season = getSeasonFromDate(now);
            const dayType = getDayType(now);
            const hour = now.getHours();

            const response = await authFetch(
                `${backendUrl}/api/preferences/get-room-preferences?room=${encodeURIComponent(roomName)}&season=${season}&dayType=${dayType}&hour=${hour}`
            );

            if (response.ok) {
                const data = await response.json();
                console.log('[ActivatePreferencesButton] API Response:', data);
                if (data.success) {
                    const rawPreferences = data.preferences || [];

                    // Re-calculate 'needs_change' using our fuzzy logic
                    // The backend sends 'needs_change' (boolean) on each entity, but it uses strict matching
                    // We need to override it.
                    const processedPreferences = rawPreferences.map(p => {
                        // Check match. If it matches, then needs_change is FALSE.
                        // If it doesn't match, needs_change is TRUE.
                        // Note: checkPreferenceMatch returns TRUE if it MATCHES preference.
                        const isMatch = checkPreferenceMatch(p);
                        return {
                            ...p,
                            needs_change: !isMatch && p.has_preference
                        };
                    });

                    const changesNeededCount = processedPreferences.filter(p => p.needs_change).length;

                    setPreferences(processedPreferences);
                    setNeedsChange(changesNeededCount);

                    if (onPreferencesLoaded) {
                        onPreferencesLoaded(processedPreferences);
                    }
                }
            } else {
                console.error('[ActivatePreferencesButton] API error:', response.status);
            }
        } catch (error) {
            console.error('[ActivatePreferencesButton] Error loading preferences:', error);
        } finally {
            setLoading(false);
        }
    };

    const activatePreferences = async () => {
        if (preferences.length === 0 || needsChange === 0) return;

        try {
            setApplying(true);
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

            const entitiesToChange = preferences.filter(p => p.needs_change);

            // Call onActivate callback with entities to change
            if (onActivate) {
                await onActivate(entitiesToChange);
            }

            // Refresh preferences after applying
            setTimeout(() => {
                loadPreferences();
            }, 2000);

        } catch (error) {
            console.error('[ActivatePreferencesButton] Error activating:', error);
        } finally {
            setApplying(false);
        }
    };

    const getSeasonFromDate = (date) => {
        const month = date.getMonth() + 1;
        if (month >= 3 && month <= 5) return 'spring';
        if (month >= 6 && month <= 8) return 'summer';
        if (month >= 9 && month <= 11) return 'fall';
        return 'winter';
    };

    const getDayType = (date) => {
        const day = date.getDay();
        return (day === 5 || day === 6) ? 'weekend' : 'weekday';
    };

    // quiet in render

    // Show button for debugging - comment this out later
    // if (loading || preferences.length === 0) {
    //     return null;
    // }

    const isDisabled = applying || needsChange === 0;

    return (
        <View style={styles.container}>
            {/* Cyan glow border — matches the screenshot exactly */}
            <LinearGradient
                colors={['#00D4FF', '#0099FF', '#6C5CE7']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[styles.gradientBorder, isDisabled && styles.disabledOpacity]}
            >
                <TouchableOpacity
                    style={styles.buttonInner}
                    onPress={activatePreferences}
                    activeOpacity={0.8}
                    disabled={isDisabled}
                >
                    {/* Subtle inner glow layer */}
                    <Animated.View style={[styles.glow, glowStyle]} />

                    <View style={styles.innerRow}>
                        {/* Logo — no background, just the image floating on dark */}
                        <View style={styles.logoWrapper}>
                            {logoSource ? (
                                <Image source={logoSource} style={styles.logo} resizeMode="contain" />
                            ) : (
                                <Zap size={32} color="#00D4FF" />
                            )}
                        </View>

                        {/* Vertical divider */}
                        <View style={styles.divider} />

                        <View style={styles.textBlock}>
                            {applying ? (
                                <ActivityIndicator size="small" color="#fff" style={{ marginBottom: 4 }} />
                            ) : null}
                            <Text style={styles.buttonTitle}>
                                {applying ? 'Activating...' : 'Apply Your Preferences'}
                            </Text>
                            <Text style={styles.buttonSubtitle}>
                                Tailored To Your Liking By{' '}
                                <Text style={styles.aiWord}>AI</Text>
                            </Text>
                        </View>
                    </View>
                </TouchableOpacity>
            </LinearGradient>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        // No horizontal padding — RoomDetailView's prefButtonContainer already adds it
        paddingVertical: 8,
        alignItems: 'center',
        width: '100%',
    },
    /* ── 2-px gradient outline pill ── */
    gradientBorder: {
        width: '100%',
        borderRadius: 20,
        padding: 1.5,
        // Outer drop-shadow so the border glows off the dark bg
        shadowColor: '#00D4FF',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.35,
        shadowRadius: 12,
        elevation: 8,
    },
    disabledOpacity: {
        opacity: 0.5,
    },
    /* ── Dark inner pill ── */
    buttonInner: {
        width: '100%',
        height: 82,
        backgroundColor: '#0d0d1a',
        borderRadius: 19,
        paddingHorizontal: 10,
        justifyContent: 'center',
        overflow: 'hidden',
    },
    /* ── Subtle centre glow ── */
    glow: {
        position: 'absolute',
        left: 0,
        right: 0,
        top: 0,
        bottom: 0,
        borderRadius: 19,
        backgroundColor: 'rgba(0, 180, 255, 0.04)',
    },
    innerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 0,
    },
    /* ── Logo block — transparent bg, matches the mock ── */
    logoWrapper: {
        width: 120,
        height: 70,
        alignItems: 'center',
        justifyContent: 'center',
        // no background, no border-radius, logo floats freely
    },
    logo: {
        width: 115,
        height: 65,
    },
    /* ── Thin vertical rule between logo and text ── */
    divider: {
        width: 0,            // invisible — remove if you want a hairline
        height: 44,
        marginRight: 20,
    },
    textBlock: {
        flex: 1,
        justifyContent: 'center',
    },
    buttonTitle: {
        color: '#ffffff',
        fontSize: 20,
        fontWeight: '700',
        letterSpacing: 0.2,
        marginBottom: 5,
    },
    buttonSubtitle: {
        color: 'rgba(255,255,255,0.65)',
        fontSize: 13,
        fontWeight: '400',
    },
    aiWord: {
        color: 'rgba(255,255,255,0.9)',
        fontWeight: '700',
    },
});
