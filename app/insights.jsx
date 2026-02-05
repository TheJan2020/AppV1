import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Dimensions, ActivityIndicator } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { ChevronLeft, Calendar, Lightbulb, Thermometer, Tv, Activity, ArrowRight } from 'lucide-react-native';
import { BarChart, LineChart } from 'react-native-chart-kit';

const screenWidth = Dimensions.get('window').width;

export default function InsightsPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState(null);
    const [period, setPeriod] = useState('day'); // 'day' | 'week' | 'month' (Mapped to backend period)
    const [selectedDate, setSelectedDate] = useState(new Date());

    const adminUrl = process.env.EXPO_PUBLIC_ADMIN_URL;

    // Helper: Get Start/End/BackendPeriod based on UI selection
    const getQuery = () => {
        let start = new Date(selectedDate);
        let end = new Date(selectedDate);
        let backendPeriod = 'hour'; // Default for Daily view

        if (period === 'day') {
            // Daily View -> Hourly buckets
            start.setHours(0, 0, 0, 0);
            end.setHours(23, 59, 59, 999);
            backendPeriod = 'hour';
        } else if (period === 'week') {
            // Weekly View -> Daily buckets
            const day = start.getDay();
            const diff = start.getDate() - day; // Sunday
            start.setDate(diff); start.setHours(0, 0, 0, 0);
            end = new Date(start);
            end.setDate(start.getDate() + 6); end.setHours(23, 59, 59, 999);
            backendPeriod = 'day';
        } else if (period === 'month') {
            // Monthly View -> Daily buckets
            start.setDate(1); start.setHours(0, 0, 0, 0);
            end.setMonth(start.getMonth() + 1); end.setDate(0); end.setHours(23, 59, 59, 999);
            backendPeriod = 'day';
        }

        return { start, end, backendPeriod };
    };

    useEffect(() => {
        fetchInsights();
    }, [period, selectedDate]);

    const fetchInsights = async () => {
        if (!adminUrl) return;
        setLoading(true);
        try {
            const { start, end, backendPeriod } = getQuery();
            const url = `${adminUrl}/api/stats/insights?start_date=${start.toISOString()}&end_date=${end.toISOString()}&period=${backendPeriod}`;
            console.log('Fetching Insights:', url);

            const res = await fetch(url);
            if (!res.ok) throw new Error("Failed to fetch insights");
            const json = await res.json();
            setData(json);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const changeDate = (dir) => {
        const newDate = new Date(selectedDate);
        if (period === 'day') newDate.setDate(selectedDate.getDate() + dir);
        if (period === 'week') newDate.setDate(selectedDate.getDate() + (dir * 7));
        if (period === 'month') newDate.setMonth(selectedDate.getMonth() + dir);
        if (newDate > new Date()) return;
        setSelectedDate(newDate);
    };

    // Chart Config
    const chartConfig = {
        backgroundGradientFrom: "#1a1b2e",
        backgroundGradientTo: "#1a1b2e",
        color: (opacity = 1) => `rgba(137, 71, 202, ${opacity})`, // Purple primary
        strokeWidth: 2,
        barPercentage: 0.6,
        decimalPlaces: 1,
        labelColor: (opacity = 1) => `rgba(255, 255, 255, ${opacity})`,
        propsForBackgroundLines: {
            strokeDasharray: "", // solid lines
            stroke: "rgba(255,255,255,0.1)"
        }
    };

    const renderHeader = () => {
        const { start, end } = getQuery();
        let label = '';
        if (period === 'day') label = start.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
        else if (period === 'week') label = `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
        else label = start.toLocaleString('en-US', { month: 'long', year: 'numeric' });

        return (
            <View style={styles.controlsCard}>
                {/* Tabs */}
                <View style={styles.tabContainer}>
                    {['day', 'week', 'month'].map(mode => (
                        <TouchableOpacity key={mode} style={[styles.tab, period === mode && styles.activeTab]} onPress={() => setPeriod(mode)}>
                            <Text style={[styles.tabText, period === mode && styles.activeTabText]}>
                                {mode === 'day' ? 'Daily' : mode === 'week' ? 'Weekly' : 'Monthly'}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>

                {/* Date Nav */}
                <View style={styles.dateNav}>
                    <TouchableOpacity onPress={() => changeDate(-1)} style={styles.navBtn}><ChevronLeft size={24} color="#ccc" /></TouchableOpacity>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Calendar size={18} color="#ccc" style={{ marginRight: 8 }} />
                        <Text style={styles.dateLabel}>{label}</Text>
                    </View>
                    <TouchableOpacity onPress={() => changeDate(1)} style={[styles.navBtn, { opacity: new Date() < selectedDate ? 0.3 : 1 }]} disabled={new Date() < selectedDate}>
                        <ChevronLeft size={24} color="#ccc" style={{ transform: [{ rotate: '180deg' }] }} />
                    </TouchableOpacity>
                </View>
            </View>
        );
    };

    const renderLightStats = () => {
        if (!data || !data.data || data.data.length === 0) return null;
        const labels = data.data.map((d, i) => {
            if (period === 'day') return i % 4 === 0 ? d.label.split(':')[0] : ''; // Hour
            return d.label.split('-')[2]; // Day
        });
        const values = data.data.map(d => d.lights_usage);
        const total = values.reduce((a, b) => a + b, 0).toFixed(1);

        return (
            <View style={styles.card}>
                <View style={[styles.cardHeader, { borderLeftColor: '#FFCE56' }]}>
                    <Lightbulb color="#FFCE56" size={24} />
                    <View>
                        <Text style={styles.cardTitle}>Lighting</Text>
                        <Text style={styles.cardSub}>{total} hours active</Text>
                    </View>
                </View>
                <BarChart
                    data={{ labels, datasets: [{ data: values }] }}
                    width={screenWidth - 60}
                    height={220}
                    yAxisSuffix="h"
                    chartConfig={{ ...chartConfig, color: (opacity = 1) => `rgba(255, 206, 86, ${opacity})` }}
                    verticalLabelRotation={period === 'month' ? 45 : 0}
                    fromZero
                    flatColor={true}
                    withInnerLines={true}
                />
            </View>
        );
    };

    const renderClimateStats = () => {
        if (!data || !data.data || data.data.length === 0) return null;

        // Use indexes to avoid label clutter
        const labels = data.data.map((d, i) => {
            if (period === 'day') return i % 4 === 0 ? d.label.split(':')[0] : '';
            return d.label.split('-')[2];
        });

        const avgTemps = data.data.map(d => d.avg_temp || 0); // Fill gaps?
        const setTemps = data.data.map(d => d.avg_set_temp || 0);
        const cooling = data.data.map(d => d.cooling_usage);
        const totalCooling = cooling.reduce((a, b) => a + b, 0).toFixed(1);

        // Calculate average temp over period (non-zero)
        const validTemps = avgTemps.filter(t => t > 0);
        const periodAvg = validTemps.length ? (validTemps.reduce((a, b) => a + b, 0) / validTemps.length).toFixed(1) : '--';

        return (
            <View style={styles.card}>
                <View style={[styles.cardHeader, { borderLeftColor: '#4BC0C0' }]}>
                    <Thermometer color="#4BC0C0" size={24} />
                    <View>
                        <Text style={styles.cardTitle}>Climate</Text>
                        <Text style={styles.cardSub}>{totalCooling}h Cooling • Avg {periodAvg}°</Text>
                    </View>
                </View>

                {/* Sub-Card: Temps */}
                <View style={{ marginBottom: 20 }}>
                    <Text style={{ color: '#aaa', marginBottom: 5, fontSize: 12 }}>Indoor (Solid) vs Set (Dot)</Text>
                    <LineChart
                        data={{
                            labels,
                            datasets: [
                                { data: avgTemps, color: (opacity = 1) => `rgba(75, 192, 192, ${opacity})`, strokeWidth: 2 },
                                { data: setTemps, color: (opacity = 1) => `rgba(255, 255, 255, ${opacity})`, strokeWidth: 2, withDots: false, withShadow: false, strokeDashArray: [5, 5] }
                            ]
                        }}
                        width={screenWidth - 60}
                        height={200}
                        verticalLabelRotation={period === 'month' ? 45 : 0}
                        chartConfig={{ ...chartConfig, propsForDots: { r: "3" } }}
                        bezier
                        withInnerLines={false}
                    />
                </View>

                {/* Sub-Card: Cooling */}
                <Text style={{ color: '#aaa', marginBottom: 5, fontSize: 12 }}>Cooling Activity</Text>
                <BarChart
                    data={{ labels, datasets: [{ data: cooling }] }}
                    width={screenWidth - 60}
                    height={180}
                    yAxisSuffix="h"
                    chartConfig={{ ...chartConfig, color: (opacity = 1) => `rgba(54, 162, 235, ${opacity})` }}
                    verticalLabelRotation={period === 'month' ? 45 : 0}
                    fromZero
                    flatColor={true}
                />
            </View>
        );
    };

    const renderMediaStats = () => {
        if (!data || !data.data || data.data.length === 0) return null;
        const labels = data.data.map((d, i) => {
            if (period === 'day') return i % 4 === 0 ? d.label.split(':')[0] : '';
            return d.label.split('-')[2];
        });
        const values = data.data.map(d => d.media_usage);
        const total = values.reduce((a, b) => a + b, 0).toFixed(1);

        return (
            <View style={styles.card}>
                <View style={[styles.cardHeader, { borderLeftColor: '#FF6384' }]}>
                    <Tv color="#FF6384" size={24} />
                    <View>
                        <Text style={styles.cardTitle}>Entertainment</Text>
                        <Text style={styles.cardSub}>{total} hours active</Text>
                    </View>
                </View>
                <BarChart
                    data={{ labels, datasets: [{ data: values }] }}
                    width={screenWidth - 60}
                    height={220}
                    yAxisSuffix="h"
                    chartConfig={{ ...chartConfig, color: (opacity = 1) => `rgba(255, 99, 132, ${opacity})` }}
                    verticalLabelRotation={period === 'month' ? 45 : 0}
                    fromZero
                    flatColor={true}
                    withInnerLines={true}
                />
            </View>
        );
    };

    return (
        <View style={styles.container}>
            <Stack.Screen options={{ headerShown: false }} />
            <LinearGradient colors={['#1a1b2e', '#16161e', '#000000']} style={styles.background} />

            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                    <ChevronLeft color="white" size={28} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Home Insights</Text>
            </View>

            <ScrollView contentContainerStyle={styles.content}>
                {renderHeader()}

                {loading ? (
                    <ActivityIndicator size="large" color="#8947ca" style={{ marginTop: 50 }} />
                ) : (
                    <>
                        {renderLightStats()}
                        {renderClimateStats()}
                        {renderMediaStats()}
                        <View style={{ height: 40 }} />
                    </>
                )}
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#000' },
    background: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 },
    header: { flexDirection: 'row', alignItems: 'center', paddingTop: 60, paddingHorizontal: 20, paddingBottom: 20 },
    backButton: { marginRight: 15 },
    headerTitle: { fontSize: 24, fontWeight: 'bold', color: 'white' },
    content: { padding: 20 },

    controlsCard: { backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 16, padding: 5, marginBottom: 20 },
    tabContainer: { flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: 12, padding: 2, marginBottom: 10 },
    tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 10 },
    activeTab: { backgroundColor: '#8947ca' },
    tabText: { color: '#888', fontWeight: 'bold' },
    activeTabText: { color: 'white' },

    dateNav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 10, paddingBottom: 5 },
    navBtn: { padding: 5 },
    dateLabel: { color: 'white', fontSize: 16, fontWeight: 'bold' },

    card: { backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 16, padding: 15, marginBottom: 20 },
    cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 15, paddingLeft: 10, borderLeftWidth: 3 },
    cardTitle: { color: 'white', fontSize: 18, fontWeight: 'bold' },
    cardSub: { color: '#ccc', fontSize: 13 },
});
