import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Cloud, CloudRain, Sun, CloudSnow, CloudDrizzle, Wind, Droplets, Gauge } from 'lucide-react-native';
import { Colors } from '../../constants/Colors';

const CONDITION_ICONS = {
    'clear-night': { icon: Sun, color: '#B0BEC5' },
    'cloudy': { icon: Cloud, color: '#90A4AE' },
    'fog': { icon: Cloud, color: '#78909C' },
    'hail': { icon: CloudSnow, color: '#80DEEA' },
    'lightning': { icon: Cloud, color: '#FFD54F' },
    'lightning-rainy': { icon: CloudRain, color: '#FFD54F' },
    'partlycloudy': { icon: Cloud, color: '#B0BEC5' },
    'pouring': { icon: CloudRain, color: '#42A5F5' },
    'rainy': { icon: CloudDrizzle, color: '#64B5F6' },
    'snowy': { icon: CloudSnow, color: '#E0E0E0' },
    'snowy-rainy': { icon: CloudSnow, color: '#B0BEC5' },
    'sunny': { icon: Sun, color: '#FFB74D' },
    'windy': { icon: Wind, color: '#80CBC4' },
    'windy-variant': { icon: Wind, color: '#80CBC4' },
    'exceptional': { icon: Cloud, color: '#EF5350' },
};

function getCondition(state) {
    return CONDITION_ICONS[state] || CONDITION_ICONS['cloudy'];
}

function formatCondition(state) {
    if (!state) return 'Unknown';
    return state.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export default function WeatherWidget({ weather, cityName, span = 2, totalColumns = 4 }) {
    if (!weather) return null;

    const temp = weather.attributes?.temperature;
    const state = weather.state;
    const humidity = weather.attributes?.humidity;
    const windSpeed = weather.attributes?.wind_speed;
    const pressure = weather.attributes?.pressure;
    const forecast = weather.attributes?.forecast || [];
    const tempUnit = weather.attributes?.temperature_unit || '°C';

    const { icon: CondIcon, color: condColor } = getCondition(state);
    const widthPercent = `${(span / totalColumns) * 100 - 1}%`;

    return (
        <View style={[styles.card, { width: widthPercent }]}>
            {/* Main temp + condition */}
            <View style={styles.mainRow}>
                <View style={styles.tempSection}>
                    <Text style={styles.temp}>{temp != null ? Math.round(temp) : '--'}</Text>
                    <Text style={styles.tempUnit}>{tempUnit}</Text>
                </View>
                <View style={styles.conditionSection}>
                    <CondIcon size={28} color={condColor} />
                    <Text style={styles.conditionText}>{formatCondition(state)}</Text>
                    <Text style={styles.cityText}>{cityName || 'Home'}</Text>
                </View>
            </View>

            {/* Stats row */}
            <View style={styles.statsRow}>
                {humidity != null && (
                    <View style={styles.stat}>
                        <Droplets size={14} color="#64B5F6" />
                        <Text style={styles.statVal}>{humidity}%</Text>
                    </View>
                )}
                {windSpeed != null && (
                    <View style={styles.stat}>
                        <Wind size={14} color="#80CBC4" />
                        <Text style={styles.statVal}>{Math.round(windSpeed)} km/h</Text>
                    </View>
                )}
                {pressure != null && (
                    <View style={styles.stat}>
                        <Gauge size={14} color="#B0BEC5" />
                        <Text style={styles.statVal}>{Math.round(pressure)} hPa</Text>
                    </View>
                )}
            </View>

            {/* Forecast strip */}
            {forecast.length > 0 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.forecastScroll}>
                    {forecast.slice(0, 7).map((day, i) => {
                        const { icon: DayIcon, color: dayColor } = getCondition(day.condition);
                        const date = new Date(day.datetime);
                        const label = i === 0 ? 'Today' : date.toLocaleDateString([], { weekday: 'short' });
                        return (
                            <View key={i} style={styles.forecastItem}>
                                <Text style={styles.forecastDay}>{label}</Text>
                                <DayIcon size={18} color={dayColor} />
                                <Text style={styles.forecastHigh}>{Math.round(day.temperature)}°</Text>
                                {day.templow != null && (
                                    <Text style={styles.forecastLow}>{Math.round(day.templow)}°</Text>
                                )}
                            </View>
                        );
                    })}
                </ScrollView>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    card: {
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
        borderRadius: 20,
        padding: 16,
        marginBottom: 10,
    },
    mainRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 14,
    },
    tempSection: {
        flexDirection: 'row',
        alignItems: 'flex-start',
    },
    temp: {
        color: Colors.text,
        fontSize: 48,
        fontWeight: '700',
        letterSpacing: -2,
    },
    tempUnit: {
        color: Colors.textDim,
        fontSize: 18,
        fontWeight: '500',
        marginTop: 8,
    },
    conditionSection: {
        alignItems: 'flex-end',
        gap: 4,
    },
    conditionText: {
        color: Colors.text,
        fontSize: 14,
        fontWeight: '500',
    },
    cityText: {
        color: Colors.textDim,
        fontSize: 12,
    },
    statsRow: {
        flexDirection: 'row',
        gap: 16,
        marginBottom: 14,
    },
    stat: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    statVal: {
        color: Colors.textDim,
        fontSize: 12,
        fontWeight: '500',
    },
    forecastScroll: {
        marginTop: 2,
    },
    forecastItem: {
        alignItems: 'center',
        marginRight: 16,
        gap: 4,
    },
    forecastDay: {
        color: Colors.textDim,
        fontSize: 11,
        fontWeight: '500',
    },
    forecastHigh: {
        color: Colors.text,
        fontSize: 13,
        fontWeight: '600',
    },
    forecastLow: {
        color: Colors.textDim,
        fontSize: 11,
    },
});
