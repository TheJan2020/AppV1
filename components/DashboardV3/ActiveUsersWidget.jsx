import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { useState, useEffect } from 'react';
import { Users, AlertCircle } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors } from '../../constants/Colors';
import { CF } from '../../utils/typography';
import WidgetCard from './WidgetCard';
import ActiveUsersModal from './ActiveUsersModal';
import { useActiveUsers } from '../../hooks/useActiveUsers';

/**
 * ActiveUsersWidget
 * 
 * Displays active app users with weather information.
 * Shows user avatars and names, with ability to click for more details.
 * 
 * Features:
 * - Real-time active user display
 * - Weather information shown alongside user count
 * - Click to see device details (device name, platform, time active)
 * - Auto-refreshes every 30 seconds
 */
export default function ActiveUsersWidget({ weather, span = 2, totalColumns = 4, backendUrl = null }) {
    const [selectedUser, setSelectedUser] = useState(null);
    const [modalVisible, setModalVisible] = useState(false);
    const { users, loading, error, refetch } = useActiveUsers(backendUrl);

    const handleUserPress = (user) => {
        setSelectedUser(user);
        setModalVisible(true);
    };

    const handleCloseModal = () => {
        setModalVisible(false);
        setSelectedUser(null);
    };

    const getPlatformEmoji = (platform) => {
        if (platform === 'ios') return '🍎';
        if (platform === 'android') return '🤖';
        return '📱';
    };

    const getWeatherEmoji = () => {
        if (!weather) return '☀️';
        const state = (weather.state || '').toLowerCase();
        if (state.includes('rain')) return '🌧️';
        if (state.includes('cloud') || state.includes('overcast')) return '☁️';
        if (state.includes('snow')) return '❄️';
        if (state.includes('thunder')) return '⛈️';
        if (state.includes('sun') || state.includes('clear')) return '☀️';
        return '🌤️';
    };

    const getWeatherState = () => {
        if (!weather) return 'N/A';
        const state = (weather.state || '').toLowerCase();
        if (state.includes('rain')) return 'Rainy';
        if (state.includes('cloud')) return 'Cloudy';
        if (state.includes('overcast')) return 'Overcast';
        if (state.includes('snow')) return 'Snowy';
        if (state.includes('thunder')) return 'Stormy';
        if (state.includes('sun') || state.includes('clear')) return 'Sunny';
        return state.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    };

    const getAppStateColor = (appState) => {
        return appState === 'foreground' ? '#10B981' : '#FBBF24';
    };

    const widthPercent = `${(span / totalColumns) * 100 - 1}%`;

    return (
        <>
            <WidgetCard span={span} totalColumns={totalColumns}>
                <View style={styles.container}>
                    {/* Header */}
                    <View style={styles.header}>
                        <View style={styles.titleRow}>
                            <Users size={18} color={Colors.accent} />
                            <Text style={styles.title}>Active Users</Text>
                            <LinearGradient
                                colors={['rgba(137, 71, 202, 0.2)', 'rgba(137, 71, 202, 0.1)']}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 0 }}
                                style={styles.badge}
                            >
                                <Text style={styles.badgeText}>{users.length}</Text>
                            </LinearGradient>
                        </View>
                        
                        {/* Weather Info */}
                        {weather && (
                            <View style={styles.weatherInfoRow}>
                                <Text style={styles.weatherEmoji}>{getWeatherEmoji()}</Text>
                                <Text style={styles.weatherText}>{getWeatherState()}</Text>
                                {weather.attributes?.temperature != null && (
                                    <>
                                        <Text style={styles.weatherDot}>•</Text>
                                        <Text style={styles.weatherText}>
                                            {Math.round(weather.attributes.temperature)}°C
                                        </Text>
                                    </>
                                )}
                            </View>
                        )}
                    </View>

                    {/* Content */}
                    {loading ? (
                        <View style={styles.centerContent}>
                            <ActivityIndicator size="small" color={Colors.accent} />
                        </View>
                    ) : error ? (
                        <View style={styles.centerContent}>
                            <AlertCircle size={24} color="#EF4444" />
                            <Text style={styles.errorText}>Failed to load users</Text>
                        </View>
                    ) : users.length === 0 ? (
                        <View style={styles.centerContent}>
                            <Text style={styles.emptyText}>No active users</Text>
                        </View>
                    ) : (
                        <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            style={styles.usersScroll}
                            contentContainerStyle={styles.usersContainer}
                        >
                            {users.map((user) => (
                                <TouchableOpacity
                                    key={user.id}
                                    style={styles.userCard}
                                    onPress={() => handleUserPress(user)}
                                    activeOpacity={0.7}
                                >
                                    {/* Avatar */}
                                    <View style={styles.avatarContainer}>
                                        <LinearGradient
                                            colors={['rgba(137, 71, 202, 0.4)', 'rgba(137, 71, 202, 0.2)']}
                                            start={{ x: 0, y: 0 }}
                                            end={{ x: 1, y: 1 }}
                                            style={styles.avatar}
                                        >
                                            <Text style={styles.avatarInitials}>
                                                {user.userName?.[0]?.toUpperCase() || '?'}
                                            </Text>
                                        </LinearGradient>
                                        
                                        {/* Status Dot */}
                                        <View
                                            style={[
                                                styles.statusDot,
                                                { backgroundColor: getAppStateColor(user.appState) }
                                            ]}
                                        />
                                    </View>

                                    {/* User Info */}
                                    <View style={styles.userInfo}>
                                        <Text style={styles.userName} numberOfLines={1}>
                                            {user.userName}
                                        </Text>
                                        <View style={styles.platformRow}>
                                            <Text style={styles.platformEmoji}>
                                                {getPlatformEmoji(user.platform)}
                                            </Text>
                                            <Text style={styles.deviceName} numberOfLines={1}>
                                                {user.deviceName || 'Unknown'}
                                            </Text>
                                        </View>
                                    </View>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    )}
                </View>
            </WidgetCard>

            {/* Modal */}
            <ActiveUsersModal
                visible={modalVisible}
                onClose={handleCloseModal}
                user={selectedUser}
                weather={weather}
            />
        </>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    header: {
        marginBottom: 16,
    },
    titleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 8,
    },
    title: {
        fontSize: 15,
        fontWeight: '600',
        color: Colors.text,
        fontFamily: CF.semibold,
        flex: 1,
    },
    badge: {
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 6,
    },
    badgeText: {
        fontSize: 12,
        fontWeight: '600',
        color: Colors.accent,
        fontFamily: CF.semibold,
    },
    weatherInfoRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    weatherEmoji: {
        fontSize: 16,
    },
    weatherText: {
        fontSize: 12,
        color: 'rgba(237,237,245,0.7)',
        fontFamily: CF.light,
    },
    weatherDot: {
        fontSize: 12,
        color: 'rgba(237,237,245,0.3)',
    },
    centerContent: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        gap: 8,
    },
    errorText: {
        fontSize: 13,
        color: '#EF4444',
        fontFamily: CF.medium,
    },
    emptyText: {
        fontSize: 13,
        color: 'rgba(237,237,245,0.5)',
        fontFamily: CF.light,
    },
    usersScroll: {
        flex: 1,
    },
    usersContainer: {
        paddingRight: 12,
        gap: 12,
    },
    userCard: {
        width: 80,
        alignItems: 'center',
        paddingHorizontal: 8,
        paddingVertical: 8,
        borderRadius: 12,
        backgroundColor: 'rgba(255,255,255,0.03)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    avatarContainer: {
        position: 'relative',
        marginBottom: 8,
    },
    avatar: {
        width: 48,
        height: 48,
        borderRadius: 24,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(137, 71, 202, 0.3)',
    },
    avatarInitials: {
        fontSize: 18,
        fontWeight: '700',
        color: '#FFFFFF',
        fontFamily: CF.bold,
    },
    statusDot: {
        position: 'absolute',
        width: 12,
        height: 12,
        borderRadius: 6,
        bottom: 0,
        right: 0,
        borderWidth: 2,
        borderColor: Colors.background,
    },
    userInfo: {
        flex: 1,
        alignItems: 'center',
        width: '100%',
    },
    userName: {
        fontSize: 12,
        fontWeight: '600',
        color: Colors.text,
        fontFamily: CF.semibold,
        textAlign: 'center',
    },
    platformRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 3,
        marginTop: 4,
    },
    platformEmoji: {
        fontSize: 11,
    },
    deviceName: {
        fontSize: 10,
        color: 'rgba(237,237,245,0.6)',
        fontFamily: CF.light,
    },
});
