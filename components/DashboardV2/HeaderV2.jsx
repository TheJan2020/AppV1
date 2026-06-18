import React, { memo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Cloud, CloudRain, Sun, CloudSnow, CloudLightning, Bell } from 'lucide-react-native';
import { CF } from '../../utils/typography';

function HeaderV2({ weather, cityName, userName, entities = [], config = {}, humidity, indoorTemp, onRoomPress, onBellPress, unreadCount = 0 }) {

    const capitalizeWords = (str) => {
        if (!str) return str;
        return str.replace(/\b\w/g, c => c.toUpperCase());
    };

    const displayName = capitalizeWords(userName) || 'Home';

    const getGreeting = () => {
        const hour = new Date().getHours();
        if (hour < 12) return 'Good morning,';
        if (hour < 18) return 'Good afternoon,';
        return 'Good evening,';
    };

    const getWeatherIcon = (state) => {
        if (!state) return <Cloud size={13} color="#90A4AE" />;
        const s = state.toLowerCase();
        if (s.includes('rain') || s.includes('drizzle')) return <CloudRain size={13} color="#64B5F6" />;
        if (s.includes('snow')) return <CloudSnow size={13} color="#B0BEC5" />;
        if (s.includes('thunder') || s.includes('lightning')) return <CloudLightning size={13} color="#FFD54F" />;
        if (s.includes('cloud') || s.includes('overcast') || s.includes('fog') || s.includes('mist')) return <Cloud size={13} color="#90A4AE" />;
        return <Sun size={13} color="#FFB74D" />;
    };

    const temp = weather?.attributes?.temperature ?? '--';
    const state = weather?.state || '';

    // Resolve state to a friendly label
    const stateLabel = (() => {
        if (!state) return 'Clear';
        const s = state.toLowerCase();
        if (s.includes('sunny') || s === 'clear-night' || s === 'clear') return 'Sunny';
        if (s.includes('partlycloudy') || s.includes('partly_cloudy')) return 'Partly Cloudy';
        if (s.includes('cloudy') || s.includes('overcast')) return 'Cloudy';
        if (s.includes('fog') || s.includes('mist')) return 'Foggy';
        if (s.includes('rain') || s.includes('drizzle')) return 'Rainy';
        if (s.includes('snow')) return 'Snow';
        if (s.includes('thunder')) return 'Thunderstorm';
        return state.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    })();

    // Humidity: prefer prop, then weather attributes
    const humidityVal = humidity ?? weather?.attributes?.humidity ?? null;

    // Indoor temperature: prop-driven — guard against NaN
    const indoorVal = (indoorTemp !== null && indoorTemp !== undefined && !isNaN(indoorTemp))
        ? indoorTemp
        : null;

    return (
        <View style={styles.header}>
            <View style={styles.topRow}>
                <View style={styles.greetingBlock}>
                    <Text style={styles.greeting}>{getGreeting()}</Text>
                    <Text style={styles.name}>{displayName}</Text>
                </View>
                <View style={styles.headerActions}>
                    <TouchableOpacity
                        style={styles.headerIconBtn}
                        onPress={onBellPress}
                        activeOpacity={0.75}
                        accessibilityLabel="Notifications"
                    >
                        <Bell size={19} color="#FFFFFF" />
                        {unreadCount > 0 && <View style={styles.bellBadge} />}
                    </TouchableOpacity>
                </View>
            </View>

            {/* Weather info row */}
            <View style={styles.weatherRow}>
                {getWeatherIcon(state)}
                <Text style={styles.weatherText}>{stateLabel}, {temp}°C</Text>

                <Text style={styles.dot}>·</Text>
                <Text style={styles.weatherText}>
                    Humidity {humidityVal !== null ? `${humidityVal}%` : '--'}
                </Text>

                {indoorVal !== null && (
                    <>
                        <Text style={styles.dot}>·</Text>
                        <Text style={styles.weatherText}>Indoor {indoorVal}°C</Text>
                    </>
                )}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    header: {
        paddingTop: 60,
        paddingBottom: 12,
        gap: 6,
    },
    topRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
    },
    greetingBlock: {
        gap: 0,
    },
    greeting: {
        fontSize: 13,
        fontFamily: CF.regular,
        color: 'rgba(237,237,245,0.45)',
        letterSpacing: 0.1,
    },
    name: {
        fontSize: 36,
        fontFamily: CF.bold,
        fontStyle: 'italic',
        color: '#ededf5',
        letterSpacing: -1.5,
        marginTop: -2,
        lineHeight: 42,
    },
    headerActions: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    headerIconBtn: {
        width: 42,
        height: 42,
        alignItems: 'center',
        justifyContent: 'center',
    },
    bellBadge: {
        position: 'absolute',
        top: 9,
        right: 9,
        width: 7,
        height: 7,
        borderRadius: 3.5,
        backgroundColor: '#ED1E79',
    },
    weatherRow: {
        flexDirection: 'row',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 5,
        marginTop: 2,
    },
    weatherText: {
        color: 'rgba(237,237,245,0.6)',
        fontSize: 12,
        fontFamily: CF.light,
    },
    dot: {
        color: 'rgba(237,237,245,0.25)',
        fontSize: 12,
    },
});

export default memo(HeaderV2);
