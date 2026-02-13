import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useState, useEffect } from 'react';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing } from 'react-native-reanimated';
import { Zap } from 'lucide-react-native';
import { Colors } from '../../constants/Colors';
import { getAdminUrl } from '../../utils/storage';
import { checkPreferenceMatch } from '../../utils/preferenceHelpers';
import * as Haptics from 'expo-haptics';

export default function ActivatePreferencesButton({ roomName, onActivate, onPreferencesLoaded }) {
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

            const response = await fetch(
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

    console.log('[ActivatePreferencesButton] Render state:', { roomName, loading, preferencesCount: preferences.length, needsChange });

    // Show button for debugging - comment this out later
    // if (loading || preferences.length === 0) {
    //     return null;
    // }

    return (
        <View style={styles.container}>
            <TouchableOpacity
                style={styles.button}
                onPress={activatePreferences}
                activeOpacity={0.8}
                disabled={applying || needsChange === 0}
            >
                {/* Glow effect */}
                <Animated.View style={[styles.glow, glowStyle]} />

                {/* Button content */}
                <View style={styles.buttonContent}>
                    {applying ? (
                        <ActivityIndicator size="small" color="#fff" />
                    ) : (
                        <Zap size={24} color="#fff" fill="#fff" />
                    )}
                    <View>
                        <Text style={styles.buttonText}>
                            {applying ? 'Activating...' : 'Activate Preferences'}
                        </Text>
                        {needsChange > 0 && !applying && (
                            <Text style={styles.badgeText}>{needsChange} changes needed</Text>
                        )}
                    </View>
                </View>
            </TouchableOpacity>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        paddingHorizontal: 20,
        paddingVertical: 12,
        alignItems: 'center',
    },
    button: {
        backgroundColor: 'rgba(137, 71, 202, 0.1)', // Slight purple tint background
        borderRadius: 16,
        paddingVertical: 16,
        paddingHorizontal: 24,
        position: 'relative',
        overflow: 'visible',
        borderWidth: 1,
        borderColor: '#8947ca', // Purple border
        // Minimal glow
        shadowColor: '#8947ca',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.6,
        shadowRadius: 8,
        elevation: 5,
    },
    glow: {
        display: 'none', // Remove the previous pulse animation element if we want just a static glow, or keep it subtle
    },
    buttonContent: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    buttonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '700',
    },
    badgeText: {
        color: 'rgba(255,255,255,0.8)',
        fontSize: 12,
        marginTop: 2,
    },
});
