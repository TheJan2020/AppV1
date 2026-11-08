import React, { memo, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Cloud, CloudRain, Sun, CloudSnow, CloudLightning, Bell, Users, Phone } from 'lucide-react-native';
import { CF } from '../../utils/typography';
import { getIntercomLineStatus, subscribeIntercomLineStatus } from '../../services/intercomLineStatus';

function HeaderV2({ weather, cityName, userName, humidity, indoorTemp, onBellPress, unreadCount = 0, onUserPress, activeUsersCount = 0, onActiveUsersPress, loadHint = '' }) {
    const insets = useSafeAreaInsets();
    const [line, setLine] = useState(getIntercomLineStatus);
    const [lineOpen, setLineOpen] = useState(false);

    useEffect(() => subscribeIntercomLineStatus(setLine), []);

    const showLine = line.level !== 'off';
    const lineColor = line.level === 'connected' ? '#22c55e' : line.level === 'error' ? '#ef4444' : '#eab308';

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
        <View style={[styles.header, { paddingTop: Math.max(insets.top, 8) + 8 }]}>
            <View style={styles.topRow}>
                <TouchableOpacity
                    style={styles.greetingBlock}
                    onPress={onUserPress}
                    disabled={!onUserPress}
                    activeOpacity={onUserPress ? 0.7 : 1}
                    hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
                    accessibilityRole={onUserPress ? 'button' : undefined}
                    accessibilityLabel={onUserPress ? `Switch account, ${displayName}` : undefined}
                >
                    <Text style={styles.greeting}>{getGreeting()}</Text>
                    <View style={styles.nameSkew}>
                        <Text style={styles.name}>{displayName}</Text>
                    </View>
                    {!!loadHint && (
                        <Text style={styles.loadHint} numberOfLines={1}>{loadHint}</Text>
                    )}
                </TouchableOpacity>
                <View style={styles.headerActions}>
                    {showLine && (
                        <TouchableOpacity
                            style={styles.headerIconBtn}
                            onPress={() => setLineOpen(true)}
                            activeOpacity={0.75}
                            accessibilityLabel={line.title}
                        >
                            <Phone size={18} color={lineColor} />
                        </TouchableOpacity>
                    )}
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
                <View style={styles.weatherLeft}>
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

                {!!onActiveUsersPress && (
                    <TouchableOpacity
                        style={styles.activeUsersPill}
                        onPress={onActiveUsersPress}
                        activeOpacity={0.75}
                        accessibilityLabel={`Active users, ${activeUsersCount}`}
                    >
                        <Users size={12} color={activeUsersCount > 0 ? '#26D07C' : 'rgba(237,237,245,0.4)'} />
                        <Text style={[
                            styles.activeUsersText,
                            activeUsersCount > 0 && styles.activeUsersTextOn,
                        ]}>
                            {activeUsersCount}
                        </Text>
                    </TouchableOpacity>
                )}
            </View>
            <Modal
                visible={showLine && lineOpen}
                transparent
                animationType="fade"
                onRequestClose={() => setLineOpen(false)}
            >
                <Pressable style={styles.lineBackdrop} onPress={() => setLineOpen(false)}>
                    <Pressable style={styles.lineCard} onPress={() => {}}>
                        <View style={[styles.lineMark, { backgroundColor: lineColor }]} />
                        <Text style={styles.lineTitle}>{line.title}</Text>
                        <Text style={styles.lineDetail}>{line.detail}</Text>
                    </Pressable>
                </Pressable>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    header: {
        width: '100%',
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
    nameSkew: {
        alignSelf: 'flex-start',
        transform: [{ skewX: '-8deg' }],
    },
    name: {
        fontSize: 36,
        fontFamily: CF.bold,
        color: '#ededf5',
        letterSpacing: -1.5,
        marginTop: -2,
        lineHeight: 42,
        includeFontPadding: false,
    },
    loadHint: {
        marginTop: 2,
        fontSize: 11,
        fontFamily: CF.regular,
        color: 'rgba(237,237,245,0.38)',
        letterSpacing: 0.1,
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
        marginTop: 2,
        gap: 8,
    },
    weatherLeft: {
        flex: 1,
        minWidth: 0,
        flexDirection: 'row',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 5,
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
    activeUsersPill: {
        flexShrink: 0,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 9,
        paddingVertical: 5,
        borderRadius: 14,
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    activeUsersText: {
        fontSize: 12,
        fontFamily: CF.semibold,
        color: 'rgba(237,237,245,0.5)',
    },
    activeUsersTextOn: {
        color: '#26D07C',
    },
    lineBackdrop: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.45)',
        justifyContent: 'center',
        paddingHorizontal: 28,
    },
    lineCard: {
        backgroundColor: '#14141F',
        borderRadius: 16,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        paddingHorizontal: 18,
        paddingVertical: 18,
        gap: 8,
    },
    lineMark: {
        width: 10,
        height: 10,
        borderRadius: 5,
    },
    lineTitle: {
        color: '#ededf5',
        fontSize: 17,
        fontFamily: CF.semibold,
    },
    lineDetail: {
        color: 'rgba(237,237,245,0.72)',
        fontSize: 14,
        lineHeight: 20,
        fontFamily: CF.regular,
    },
});

export default memo(HeaderV2);
