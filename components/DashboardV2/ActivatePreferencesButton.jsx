import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useState, useEffect } from 'react';
import { getAdminUrl } from '../../utils/storage';
import { checkPreferenceMatch } from '../../utils/preferenceHelpers';
import * as Haptics from 'expo-haptics';
import { authFetch } from '../../utils/authFetch';
import { CF } from '../../utils/typography';
import Svg, { Path } from 'react-native-svg';

// Inline SVG — the apply_preffrences logo (54×31 viewBox, purple)
function ApplyPrefsIcon({ size = 40 }) {
    return (
        <Svg width={size} height={size * (31 / 54)} viewBox="0 0 54 31" fill="none">
            <Path d="M0.856103 29.0508C0.856103 29.0508 0.780705 29.0205 0.765625 28.9751C4.29423 26.4595 7.64189 22.0041 11.1705 17.2911C14.1864 13.2752 17.3079 9.12291 20.7008 5.97082C24.3651 2.57625 27.8334 0.863814 31.3017 0.772888C31.4223 1.19721 31.5279 1.54576 31.6033 1.80338C32.0858 3.34912 32.6287 4.62208 33.7596 7.06193L34.016 7.60748L34.4231 8.28943C34.589 8.5319 34.7247 8.71375 34.8604 8.92591C35.0414 9.15322 35.1771 9.31992 35.3279 9.50177C35.539 9.72909 35.6898 9.89579 35.8557 10.0776C36.0819 10.2898 36.2478 10.4565 36.4136 10.6383C36.6247 10.8202 36.7906 10.9717 36.9565 11.1384C37.1525 11.29 37.2882 11.4264 37.439 11.5476C37.6954 11.7446 37.9065 11.9113 38.1176 12.078C38.3438 12.2447 38.5248 12.3811 38.7057 12.5175C38.9319 12.669 39.1279 12.8054 39.324 12.9418L39.7161 13.1994C40.0176 13.3813 40.274 13.5328 40.5153 13.6995C40.5756 13.7298 40.6359 13.7753 40.6962 13.8056C39.6859 13.7147 38.57 13.6389 37.3636 13.6389C36.8962 13.6389 36.3986 13.6389 35.916 13.6692C31.8295 13.8511 28.2707 15.6393 28.2405 15.6696C27.5016 15.9575 25.8278 16.6091 20.0373 20.6402C14.5634 24.4288 9.4062 28.0203 1.33865 29.0205L0.871181 29.066L0.856103 29.0508Z" fill="#7B2FBE"/>
            <Path d="M30.7438 1.56089C30.7891 1.72759 30.8343 1.87913 30.8796 2.01552C31.3772 3.60673 31.9351 4.89484 33.0962 7.42561L33.3224 7.91055L33.3526 7.98632L33.3978 8.0621C33.5185 8.24395 33.6391 8.45611 33.7597 8.66827L33.805 8.74404L33.8502 8.80466C33.9709 8.97135 34.1066 9.15321 34.2423 9.35021L34.2875 9.41083L34.3328 9.47145C34.4685 9.62299 34.6042 9.78969 34.7399 9.97154L34.7852 10.0322L34.8304 10.0928C34.9812 10.2443 35.132 10.411 35.2828 10.5777L35.328 10.6232L35.3733 10.6686C35.5391 10.8202 35.705 10.9869 35.8558 11.1536L35.901 11.199L35.9463 11.2445C36.0971 11.3809 36.2629 11.5173 36.4137 11.6688L36.459 11.7143L36.5042 11.7597C36.6399 11.8658 36.7756 11.9871 36.9264 12.1083L36.9717 12.1538L37.0169 12.1841C37.213 12.3356 37.4241 12.4872 37.6201 12.6539L37.6653 12.6842L37.7106 12.7145C37.7106 12.7145 37.8614 12.8206 37.9368 12.8812C37.7407 12.8812 37.5447 12.8812 37.3487 12.8812C36.8661 12.8812 36.3685 12.8812 35.8558 12.9115C31.6034 13.1085 27.9089 14.9725 27.9089 14.9725L27.8335 15.0028C27.1851 15.2604 25.4509 15.9423 19.585 20.0037C14.654 23.4286 9.96425 26.6716 3.16338 27.9597C6.04357 25.3835 8.83328 21.6555 11.7587 17.7609C14.7445 13.7753 17.8508 9.6533 21.1985 6.54666C24.516 3.47034 27.6375 1.83367 30.7288 1.57605M31.8748 0H31.6335C27.8637 0 24.1239 1.77305 20.1882 5.41009C16.735 8.60765 13.5984 12.7902 10.5674 16.8364C7.09914 21.4585 3.76656 25.8987 0.373667 28.2325C-0.335071 28.7174 0.0419179 29.8085 0.856213 29.8085C0.886372 29.8085 0.91653 29.8085 0.961769 29.8085C1.11256 29.7934 1.26336 29.7782 1.41415 29.7631C9.49678 28.7629 14.7294 25.2168 20.4445 21.2463C27.0041 16.7001 28.2256 16.503 28.5724 16.3363C28.8287 16.2 32.1764 14.5936 35.9312 14.4269C36.4137 14.4118 36.8963 14.3966 37.3487 14.3966C40.9527 14.3966 43.8027 15.0028 44.8432 15.1998C44.8432 15.1998 44.7376 15.1543 44.436 15.0179C44.3305 14.9573 44.2551 14.927 44.1646 14.8815C43.9535 14.7603 43.7273 14.6542 43.5011 14.5481C43.29 14.4269 43.0789 14.3208 42.8527 14.1996C42.6416 14.0784 42.4305 13.9571 42.2043 13.8359C41.9932 13.7147 41.7821 13.5934 41.5709 13.4722C41.3447 13.3358 41.1186 13.1994 40.8924 13.063C40.636 12.8812 40.3646 12.7145 40.0781 12.5478C39.9574 12.472 39.8368 12.3811 39.7162 12.3053C39.5201 12.1538 39.3241 12.0174 39.113 11.881C38.9169 11.7294 38.736 11.5931 38.54 11.4567C38.3138 11.2748 38.1026 11.1081 37.8765 10.9414C37.7257 10.805 37.5749 10.6838 37.4241 10.5626C37.2431 10.3959 37.0772 10.2443 36.9114 10.0928C36.7304 9.91092 36.5495 9.72907 36.3685 9.56237C36.2026 9.38052 36.0368 9.19867 35.8709 9.01682C35.7201 8.83496 35.5844 8.65311 35.4336 8.48641C35.2979 8.27425 35.1471 8.07725 35.0264 7.91055C34.8907 7.68324 34.7701 7.47108 34.6494 7.28922C34.574 7.12253 34.4986 6.95583 34.4232 6.80429C34.4232 6.80429 34.3931 6.75882 34.3931 6.74367C33.3074 4.3796 32.7494 3.10663 32.2669 1.57605C32.1613 1.2275 31.9954 0.681945 31.8145 0.0151547L31.8748 0Z" fill="#7B2FBE"/>
            <Path d="M36.3081 14.6846C38.6454 14.6846 41.1034 15.2756 44.2852 16.594L44.4209 16.6546H44.4511C44.5415 16.7001 44.632 16.7455 44.7527 16.8062C45.2201 17.0183 45.582 17.185 45.6122 17.2002C46.6225 17.6245 47.5574 18.1397 48.3717 18.7308C50.5432 20.2917 51.9004 22.3981 51.9004 24.2469C51.9004 25.4441 51.3726 26.4292 50.3472 27.1869C49.1559 28.0658 47.3463 28.5659 45.0844 28.6265C44.9185 28.6265 44.7376 28.6265 44.5717 28.6265C41.9931 28.6265 39.1431 27.4142 36.5192 25.2017C33.8502 22.9588 31.7239 20.0492 30.3819 16.7607C30.3366 16.6395 30.2763 16.5182 30.2311 16.397C30.2763 16.2 30.2914 16.0181 30.2914 15.8514C32.6287 15.018 34.4533 14.6543 36.3081 14.6543M36.3081 13.1691C33.9256 13.1691 31.6485 13.7298 29.0096 14.73C28.512 14.927 29.0549 16.0939 28.5874 16.3212C28.6779 16.5637 28.8136 16.9274 28.9795 17.3517C29.6731 19.049 31.4827 22.9588 35.5391 26.3685C38.4343 28.7932 41.6312 30.142 44.5566 30.142C44.7376 30.142 44.9336 30.142 45.1146 30.142C47.663 30.0662 49.7591 29.4752 51.2067 28.3992C52.6242 27.3536 53.3781 25.9139 53.3781 24.2318C53.3781 21.8677 51.825 19.3521 49.2162 17.4881C48.4321 16.9274 47.4217 16.3364 46.1701 15.7908C46.14 15.7908 45.8082 15.6241 45.3558 15.4271C45.1296 15.321 44.9487 15.215 44.8431 15.1847C41.4804 13.7905 38.8264 13.1691 36.293 13.1691H36.3081Z" fill="#7B2FBE"/>
        </Svg>
    );
}

export default function ActivatePreferencesButton({ roomName, onActivate, onPreferencesLoaded, logoSource }) {
    const [loading, setLoading] = useState(false);
    const [preferences, setPreferences] = useState([]);
    const [needsChange, setNeedsChange] = useState(0);
    const [applying, setApplying] = useState(false);

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

    const isDisabled = applying || needsChange === 0;

    return (
        <TouchableOpacity
            style={[styles.card, isDisabled && styles.cardDisabled]}
            onPress={activatePreferences}
            activeOpacity={0.75}
            disabled={isDisabled}
        >
            {/* Icon */}
            <View style={styles.iconContainer}>
                {applying ? (
                    <ActivityIndicator size="small" color="#8947ca" />
                ) : (
                    <ApplyPrefsIcon size={36} />
                )}
            </View>

            {/* Text block */}
            <View style={styles.textBlock}>
                <Text style={styles.title} numberOfLines={2}>
                    {applying ? 'Applying...' : 'Apply Preferences'}
                </Text>
                <Text style={styles.subtitle} numberOfLines={1}>
                    Tailored by AI
                </Text>
            </View>

            {/* Change count badge */}
            {needsChange > 0 && !applying && (
                <View style={styles.badge}>
                    <Text style={styles.badgeText}>{needsChange}</Text>
                </View>
            )}
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    // Exact match of SceneCard
    card: {
        width: '100%',
        height: 62,
        backgroundColor: '#12132a',
        borderRadius: 48,
        borderWidth: 1,
        borderColor: '#212136',
        paddingHorizontal: 12,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    cardDisabled: {
        // keep full opacity so border and text always render at full brightness
    },
    iconContainer: {
        width: 36,
        height: 36,
        borderRadius: 0,
        backgroundColor: 'transparent',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
    },
    textBlock: {
        flex: 1,
        justifyContent: 'center',
    },
    title: {
        color: '#ffffff',
        fontSize: 13,
        fontFamily: CF.medium,
        letterSpacing: 0.1,
        lineHeight: 17,
    },
    subtitle: {
        color: 'rgba(237,237,245,0.45)',
        fontSize: 11,
        fontFamily: CF.medium,
        letterSpacing: 0.1,
        lineHeight: 15,
    },
    badge: {
        minWidth: 20,
        height: 20,
        borderRadius: 10,
        backgroundColor: '#8947ca',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 5,
    },
    badgeText: {
        color: '#fff',
        fontSize: 10,
        fontFamily: CF.semibold,
    },
});
