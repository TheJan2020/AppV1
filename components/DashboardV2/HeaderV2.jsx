import React, { memo } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity } from 'react-native';
import { Colors } from '../../constants/Colors';
import { Cloud, CloudRain, Sun, Moon } from 'lucide-react-native';

function HeaderV2({ weather, cityName, userName, entities = [], config = {}, onRoomPress }) {

    const getGreeting = () => {
        const hour = new Date().getHours();
        if (hour < 12) return 'Good Morning,';
        if (hour < 18) return 'Good Afternoon,';
        return 'Good Evening,';
    };

    const getWeatherIcon = (state) => {
        if (!state) return <Cloud size={15} color={Colors.primary} />;
        if (state.includes('rain')) return <CloudRain size={15} color="#64B5F6" />;
        if (state.includes('cloud')) return <Cloud size={15} color="#90A4AE" />;
        // Simple check for night/day could be improved
        return <Sun size={15} color="#FFB74D" />;
    };

    const temp = weather?.attributes?.temperature || '--';
    const state = weather?.state || 'Unknown';
    const city = cityName || 'Home';

    // Find current user's person entity to get ID
    const personEntity = entities.find(e =>
        e.entity_id.startsWith('person.') &&
        (e.attributes?.friendly_name?.toLowerCase() === userName?.toLowerCase() ||
            e.entity_id.includes(userName?.toLowerCase()))
    );

    const userId = personEntity?.attributes?.user_id;

    // Get tracked sensors for this user
    const trackedSensors = (config?.tracked_devices_list || [])
        .filter(t => t.user_id === userId)
        .map(t => {
            const sensor = entities.find(e => e.entity_id === t.entity_id);
            if (!sensor) return null;
            return `${sensor.state}${sensor.attributes?.unit_of_measurement || ''}`;
        })
        .filter(Boolean);

    return (
        <View style={styles.header}>
            <View style={styles.topRow}>
                <View>
                    <Text style={styles.greeting}>{getGreeting()}</Text>
                    <Text style={styles.name}>{userName || 'Zeyad'}</Text>
                </View>
                <View style={styles.logoContainer}>
                    <Image
                        source={require('../../assets/header-logo.png')}
                        style={styles.logo}
                        resizeMode="contain"
                    />
                </View>
            </View>

            <View style={styles.weatherRow}>
                {getWeatherIcon(state)}
                <Text style={styles.weatherText}>
                    {temp}° {state}
                </Text>
                <Text style={styles.weatherDivider}>•</Text>
                <Text style={styles.weatherCity}>{city}</Text>

                {trackedSensors.length > 0 && (
                    <>
                        <Text style={styles.weatherDivider}>|</Text>
                        {trackedSensors.map((val, idx) => (
                            <React.Fragment key={idx}>
                                <Text style={styles.weatherCity}>{val}</Text>
                                {idx < trackedSensors.length - 1 && <Text style={styles.weatherDivider}>•</Text>}
                            </React.Fragment>
                        ))}
                    </>
                )}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    header: {
        paddingTop: 60,
        paddingHorizontal: 20,
        marginBottom: 10,
        gap: 5 // Spacing between name and weather row
    },
    greeting: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#fff',
        opacity: 0.8
    },
    topRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    logoContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8 // increased gap for horizontal separation
    },
    logo: {
        width: 80, // 20% smaller (was 100)
        height: 32, // 20% smaller (was 40)
        opacity: 1
    },
    subLogo: {
        width: 64, // 20% smaller (was 80)
        height: 24, // 20% smaller (was 30)
        opacity: 0.8
    },
    name: {
        fontSize: 32,
        fontWeight: 'bold',
        color: '#fff',
    },
    weatherRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6, // Reduced gap too
        marginTop: -2 // Pull it up slightly
    },
    weatherText: {
        color: '#fff',
        fontSize: 12, // Reduced from 16
        fontWeight: '600',
    },
    weatherDivider: {
        color: 'rgba(255,255,255,0.4)',
        fontSize: 11, // Reduced from 14
    },
    weatherCity: {
        color: 'rgba(255,255,255,0.6)',
        fontSize: 12, // Reduced from 16
        fontWeight: '500'
    }
});

export default memo(HeaderV2);
