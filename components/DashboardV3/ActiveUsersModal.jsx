import { Modal, View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { X, Smartphone, Clock, Zap } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors } from '../../constants/Colors';
import { CF } from '../../utils/typography';

/**
 * ActiveUsersModal
 * 
 * Shows details for a selected active user including:
 * - Device name
 * - Last seen / Time active
 * - Platform (iOS/Android)
 * - App state (foreground/background)
 */
export default function ActiveUsersModal({ visible, onClose, user, weather }) {
    const insets = useSafeAreaInsets();

    if (!user) return null;

    const getPlatformEmoji = () => {
        if (user.platform === 'ios') return '🍎';
        if (user.platform === 'android') return '🤖';
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
        if (!weather) return 'Unknown';
        const state = (weather.state || '').toLowerCase();
        if (state.includes('rain')) return 'Rainy';
        if (state.includes('cloud')) return 'Cloudy';
        if (state.includes('overcast')) return 'Overcast';
        if (state.includes('snow')) return 'Snowy';
        if (state.includes('thunder')) return 'Thunderstorm';
        if (state.includes('sun') || state.includes('clear')) return 'Sunny';
        return state.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    };

    const formatTimeAgo = (date) => {
        const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
        if (seconds < 10) return 'Just now';
        if (seconds < 60) return `${seconds}s ago`;
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) return `${minutes}m ago`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours}h ago`;
        const days = Math.floor(hours / 24);
        return `${days}d ago`;
    };

    const getAppStateColor = () => {
        return user.appState === 'foreground' ? '#10B981' : '#FBBF24';
    };

    const getAppStateLabel = () => {
        return user.appState === 'foreground' ? 'Active' : 'Background';
    };

    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
            <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
                <TouchableOpacity style={styles.backdrop} onPress={onClose} activeOpacity={1} />

                <View style={[styles.modal, { paddingBottom: Math.max(20, insets.bottom) }]}>
                    {/* Header */}
                    <View style={styles.header}>
                        <View style={styles.userInitials}>
                            <Text style={styles.initialsText}>
                                {user.userName?.[0]?.toUpperCase() || '?'}
                            </Text>
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.userName}>{user.userName}</Text>
                            <Text style={styles.subtitle}>{user.deviceName || 'Unknown device'}</Text>
                        </View>
                        <TouchableOpacity onPress={onClose}>
                            <X size={24} color={Colors.text} />
                        </TouchableOpacity>
                    </View>

                    <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
                        {/* Weather Info */}
                        {weather && (
                            <View style={styles.section}>
                                <Text style={styles.sectionTitle}>Weather Conditions</Text>
                                <LinearGradient
                                    colors={['rgba(255,255,255,0.05)', 'rgba(255,255,255,0.02)']}
                                    start={{ x: 0, y: 0 }}
                                    end={{ x: 1, y: 1 }}
                                    style={styles.infoCard}
                                >
                                    <Text style={styles.weatherEmoji}>{getWeatherEmoji()}</Text>
                                    <View style={styles.weatherDetails}>
                                        <Text style={styles.weatherState}>{getWeatherState()}</Text>
                                        {weather.attributes?.temperature != null && (
                                            <Text style={styles.weatherTemp}>
                                                {Math.round(weather.attributes.temperature)}°C
                                            </Text>
                                        )}
                                        {weather.attributes?.humidity != null && (
                                            <Text style={styles.weatherHumidity}>
                                                Humidity {Math.round(weather.attributes.humidity)}%
                                            </Text>
                                        )}
                                    </View>
                                </LinearGradient>
                            </View>
                        )}

                        {/* Device Information */}
                        <View style={styles.section}>
                            <Text style={styles.sectionTitle}>Device Information</Text>
                            <View style={styles.infoRow}>
                                <Smartphone size={18} color={Colors.accent} />
                                <View style={styles.infoContent}>
                                    <Text style={styles.infoLabel}>Device</Text>
                                    <Text style={styles.infoValue}>{user.deviceName || 'Unknown'}</Text>
                                </View>
                            </View>
                        </View>

                        {/* Platform */}
                        <View style={styles.section}>
                            <Text style={styles.sectionTitle}>Platform</Text>
                            <View style={styles.infoRow}>
                                <Text style={styles.platformEmoji}>{getPlatformEmoji()}</Text>
                                <View style={styles.infoContent}>
                                    <Text style={styles.infoLabel}>Platform</Text>
                                    <Text style={styles.infoValue}>
                                        {user.platform === 'ios' ? 'iPhone/iPad' : user.platform === 'android' ? 'Android' : 'Unknown'}
                                    </Text>
                                </View>
                            </View>
                        </View>

                        {/* Status */}
                        <View style={styles.section}>
                            <Text style={styles.sectionTitle}>Status</Text>
                            <View style={styles.infoRow}>
                                <View style={[styles.statusDot, { backgroundColor: getAppStateColor() }]} />
                                <View style={styles.infoContent}>
                                    <Text style={styles.infoLabel}>App State</Text>
                                    <Text style={styles.infoValue}>{getAppStateLabel()}</Text>
                                </View>
                            </View>
                        </View>

                        {/* Last Seen / Active Time */}
                        <View style={styles.section}>
                            <Text style={styles.sectionTitle}>Activity</Text>
                            <View style={styles.infoRow}>
                                <Clock size={18} color={Colors.accent} />
                                <View style={styles.infoContent}>
                                    <Text style={styles.infoLabel}>Last Seen</Text>
                                    <Text style={styles.infoValue}>{formatTimeAgo(user.lastSeen)}</Text>
                                </View>
                            </View>
                            {user.startedAt && (
                                <View style={[styles.infoRow, { marginTop: 12 }]}>
                                    <Zap size={18} color={Colors.accent} />
                                    <View style={styles.infoContent}>
                                        <Text style={styles.infoLabel}>Session Started</Text>
                                        <Text style={styles.infoValue}>
                                            {new Date(user.startedAt).toLocaleString()}
                                        </Text>
                                    </View>
                                </View>
                            )}
                        </View>
                    </ScrollView>
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.7)',
        justifyContent: 'flex-end',
    },
    backdrop: {
        ...StyleSheet.absoluteFillObject,
    },
    modal: {
        backgroundColor: Colors.background,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        maxHeight: '80%',
        paddingTop: 20,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingBottom: 20,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.1)',
    },
    userInitials: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: 'rgba(137, 71, 202, 0.3)',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    initialsText: {
        fontSize: 18,
        fontWeight: '600',
        color: Colors.accent,
        fontFamily: CF.semibold,
    },
    userName: {
        fontSize: 16,
        fontWeight: '600',
        color: Colors.text,
        fontFamily: CF.semibold,
    },
    subtitle: {
        fontSize: 13,
        color: 'rgba(237,237,245,0.6)',
        marginTop: 2,
        fontFamily: CF.light,
    },
    content: {
        paddingHorizontal: 20,
        paddingTop: 20,
    },
    section: {
        marginBottom: 24,
    },
    sectionTitle: {
        fontSize: 13,
        fontWeight: '600',
        color: 'rgba(237,237,245,0.5)',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginBottom: 12,
        fontFamily: CF.semibold,
    },
    infoCard: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 16,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    weatherEmoji: {
        fontSize: 32,
        marginRight: 12,
    },
    weatherDetails: {
        flex: 1,
    },
    weatherState: {
        fontSize: 15,
        fontWeight: '600',
        color: Colors.text,
        fontFamily: CF.semibold,
    },
    weatherTemp: {
        fontSize: 13,
        color: 'rgba(237,237,245,0.7)',
        marginTop: 4,
        fontFamily: CF.medium,
    },
    weatherHumidity: {
        fontSize: 12,
        color: 'rgba(237,237,245,0.5)',
        marginTop: 2,
        fontFamily: CF.light,
    },
    infoRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        backgroundColor: 'rgba(255,255,255,0.03)',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    infoContent: {
        flex: 1,
        marginLeft: 12,
    },
    infoLabel: {
        fontSize: 12,
        color: 'rgba(237,237,245,0.5)',
        fontFamily: CF.light,
    },
    infoValue: {
        fontSize: 14,
        fontWeight: '500',
        color: Colors.text,
        marginTop: 2,
        fontFamily: CF.medium,
    },
    platformEmoji: {
        fontSize: 24,
        marginRight: 4,
    },
    statusDot: {
        width: 12,
        height: 12,
        borderRadius: 6,
        marginRight: 12,
    },
});
