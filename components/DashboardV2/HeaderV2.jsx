import React, { memo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Cloud, CloudRain, Sun, Bell } from 'lucide-react-native';

function HeaderV2({ weather, cityName, userName, entities = [], config = {}, onRoomPress, onBellPress, unreadCount = 0 }) {

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
                    <Text style={styles.name}>{userName || 'Home'}</Text>
                </View>
                {/* Bell button */}
                <TouchableOpacity
                    style={styles.bellBtn}
                    onPress={onBellPress}
                    activeOpacity={0.75}
                >
                    <Bell size={20} color="rgba(237,237,245,0.85)" />
                    {unreadCount > 0 && <View style={styles.bellBadge} />}
                </TouchableOpacity>
            </View>

            <View style={styles.weatherRow}>
                {getWeatherIcon(state)}
                <Text style={styles.weatherText}>
                    {temp}° {state}
                </Text>
                <Text style={styles.weatherDivider}>·</Text>
                <Text style={styles.weatherCity}>{city}</Text>

                {trackedSensors.length > 0 && (
                    <>
                        <Text style={styles.weatherDivider}>·</Text>
                        {trackedSensors.map((val, idx) => (
                            <React.Fragment key={idx}>
                                <Text style={styles.weatherCity}>{val}</Text>
                                {idx < trackedSensors.length - 1 && <Text style={styles.weatherDivider}>·</Text>}
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
        gap: 5,
    },
    topRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    greeting: {
        fontSize: 12.5,
        fontWeight: '400',
        color: 'rgba(237,237,245,0.45)',
        letterSpacing: 0.1,
    },
    name: {
        fontSize: 28,
        fontWeight: '800',
        color: '#ededf5',
        letterSpacing: -0.8,
        marginTop: 1,
    },
    bellBtn: {
        width: 42,
        height: 42,
        borderRadius: 14,
        backgroundColor: 'rgba(255,255,255,0.06)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    bellBadge: {
        position: 'absolute',
        top: 8,
        right: 8,
        width: 7,
        height: 7,
        borderRadius: 3.5,
        backgroundColor: '#832ea9',
    },
    weatherRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        marginTop: 2,
    },
    weatherText: {
        color: 'rgba(237,237,245,0.7)',
        fontSize: 12,
        fontWeight: '500',
    },
    weatherDivider: {
        color: 'rgba(237,237,245,0.3)',
        fontSize: 11,
    },
    weatherCity: {
        color: 'rgba(237,237,245,0.55)',
        fontSize: 12,
        fontWeight: '400',
    },
});

export default memo(HeaderV2);
