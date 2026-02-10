import { View, Text, ActivityIndicator, Dimensions, StyleSheet } from 'react-native';
import { useState, useEffect } from 'react';
import { LineChart } from 'react-native-chart-kit';
import { Colors } from '../../constants/Colors';
import { Thermometer, Droplets } from 'lucide-react-native';

export default function RoomClimateChart({ tempEntityId, humidityEntityId }) {
    const [chartData, setChartData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [currentTemp, setCurrentTemp] = useState(null);
    const [currentHum, setCurrentHum] = useState(null);

    useEffect(() => {
        if (!tempEntityId && !humidityEntityId) return;

        const fetchData = async () => {
            try {
                // Fetch both
                const adminUrl = process.env.EXPO_PUBLIC_ADMIN_URL;
                if (!adminUrl) {
                    console.error("RoomClimateChart: EXPO_PUBLIC_ADMIN_URL is missing");
                    setLoading(false);
                    return;
                }
                const baseUrl = adminUrl.endsWith('/') ? adminUrl : adminUrl + '/';

                const ids = [];
                if (tempEntityId) ids.push(tempEntityId);
                if (humidityEntityId) ids.push(humidityEntityId);

                if (ids.length === 0) return;

                const url = `${baseUrl}api/history?mode=raw&entity_ids=${ids.join(',')}&limit=100`;
                const res = await fetch(url);
                const json = await res.json();

                if (Array.isArray(json)) {
                    // Split data
                    const tempData = json.filter(x => x.entity_id === tempEntityId).reverse();
                    const humData = json.filter(x => x.entity_id === humidityEntityId).reverse();

                    const processPoints = (raw) => {
                        const cutoff = Date.now() - 24 * 60 * 60 * 1000;
                        const filtered = raw.filter(item => new Date(item.timestamp).getTime() > cutoff);
                        return filtered.map(item => ({
                            val: parseFloat(item.state),
                            time: new Date(item.timestamp)
                        })).filter(p => !isNaN(p.val));
                    };

                    const tPoints = processPoints(tempData);
                    const hPoints = processPoints(humData);

                    // Downsample
                    const downsample = (points, targetCount = 20) => {
                        if (points.length <= targetCount) return points;
                        const step = Math.ceil(points.length / targetCount);
                        return points.filter((_, i) => i % step === 0);
                    };

                    const tFinal = downsample(tPoints);
                    const hFinal = downsample(hPoints);

                    // Logic to handle potential mismatches or missing data
                    let len = 0;
                    if (tFinal.length > 0 && hFinal.length > 0) {
                        len = Math.min(tFinal.length, hFinal.length);
                    } else {
                        len = Math.max(tFinal.length, hFinal.length);
                    }

                    const datasets = [];
                    let finalLabels = [];

                    if (tFinal.length > 0) {
                        const dataSlice = tFinal.slice(0, len || tFinal.length);
                        datasets.push({
                            data: dataSlice.map(d => d.val),
                            color: (opacity = 1) => `rgba(255, 152, 0, ${opacity})`, // Orange
                            strokeWidth: 2
                        });
                        finalLabels = dataSlice.map(d => {
                            const h = d.time.getHours();
                            return h + ':00';
                        });
                        setCurrentTemp(tFinal[tFinal.length - 1].val);
                    }

                    if (hFinal.length > 0) {
                        const dataSlice = hFinal.slice(0, len || hFinal.length);
                        datasets.push({
                            data: dataSlice.map(d => d.val),
                            color: (opacity = 1) => `rgba(41, 182, 246, ${opacity})`, // Blue
                            strokeWidth: 2
                        });
                        setCurrentHum(hFinal[hFinal.length - 1].val);

                        // Use humidity labels if temp missing/empty or we prefer humidity labels in single mode
                        if (datasets.length === 1) {
                            finalLabels = dataSlice.map(d => {
                                const h = d.time.getHours();
                                return h + ':00';
                            });
                        }
                    }

                    if (datasets.length > 0) {
                        setData({
                            labels: finalLabels,
                            datasets
                        });
                    }
                }
            } catch (e) {
                console.log("Error fetching chart data", e);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [tempEntityId, humidityEntityId]);

    const displayData = chartData || null;
    if (!displayData) return null;

    // Condense labels
    const condensedLabels = displayData?.labels?.map((l, i) => i % 4 === 0 ? l : '') || [];

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <View style={styles.stat}>
                    {currentTemp !== null && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Thermometer size={16} color="#FF9800" />
                            <Text style={[styles.statValue, { color: '#FF9800' }]}>{currentTemp?.toFixed(1)}°C</Text>
                        </View>
                    )}
                </View>
                <View style={styles.stat}>
                    {currentHum !== null && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Droplets size={16} color="#29B6F6" />
                            <Text style={[styles.statValue, { color: '#29B6F6' }]}>{currentHum?.toFixed(1)}%</Text>
                        </View>
                    )}
                </View>
            </View>

            <LineChart
                data={{
                    labels: condensedLabels,
                    datasets: displayData.datasets,
                    legend: [] // We use custom header legend
                }}
                width={Dimensions.get('window').width - 60}
                height={180}
                chartConfig={{
                    backgroundColor: 'transparent',
                    backgroundGradientFrom: '#1e1e2d',
                    backgroundGradientTo: '#1e1e2d',
                    backgroundGradientFromOpacity: 0,
                    backgroundGradientToOpacity: 0,
                    decimalPlaces: 0,
                    color: (opacity = 1) => `rgba(255, 255, 255, ${opacity})`,
                    labelColor: (opacity = 1) => `rgba(255, 255, 255, ${opacity})`,
                    propsForLabels: {
                        fontSize: 10,
                    },
                    propsForDots: {
                        r: "0",
                    },
                    propsForBackgroundLines: {
                        strokeDasharray: '',
                        stroke: 'rgba(255,255,255,0.05)'
                    }
                }}
                bezier
                style={{
                    marginVertical: 8,
                    borderRadius: 16,
                    paddingRight: 10
                }}
                withVerticalLines={false}
                fromZero={false}
                yAxisInterval={1}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        marginBottom: 20,
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 16,
        padding: 15,
        paddingBottom: 5
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'flex-start',
        alignItems: 'center',
        marginBottom: 10,
        gap: 20,
        paddingHorizontal: 10
    },
    stat: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    statValue: {
        fontSize: 18,
        fontWeight: 'bold',
    }
});
