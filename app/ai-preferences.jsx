import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Dimensions } from 'react-native';
import { useState, useEffect } from 'react';
import { router, Stack } from 'expo-router';
import { Colors } from '../constants/Colors';
import { ChevronLeft, Sparkles, RefreshCw } from 'lucide-react-native';
import * as SecureStore from 'expo-secure-store';
import PreferenceCard from '../components/DashboardV2/PreferenceCard';
import Slider from '@react-native-community/slider';

const { width } = Dimensions.get('window');

const SEASONS = ['spring', 'summer', 'fall', 'winter'];
const SEASON_EMOJIS = { spring: '🌸', summer: '☀️', fall: '🍂', winter: '❄️' };

export default function AIPreferencesScreen() {
    const [loading, setLoading] = useState(true);
    const [analyzing, setAnalyzing] = useState(false);
    const [selectedSeason, setSelectedSeason] = useState('summer');
    const [selectedHour, setSelectedHour] = useState(new Date().getHours());
    const [dayType, setDayType] = useState('weekday');
    const [preferences, setPreferences] = useState([]);
    const [backendUrl, setBackendUrl] = useState(null);

    useEffect(() => {
        loadSettings();
    }, []);

    useEffect(() => {
        if (backendUrl) {
            fetchPreferences();
        }
    }, [selectedSeason, selectedHour, dayType, backendUrl]);

    const loadSettings = async () => {
        try {
            const url = await SecureStore.getItemAsync('backendUrl');
            setBackendUrl(url);
        } catch (e) {
            console.error('Failed to load settings:', e);
        }
    };

    const fetchPreferences = async () => {
        if (!backendUrl) return;

        setLoading(true);
        console.log(`[AI Prefs] Fetching: ${backendUrl}/api/preferences/get?season=${selectedSeason}&dayType=${dayType}&hour=${selectedHour}`);
        try {
            const response = await fetch(
                `${backendUrl}/api/preferences/get?season=${selectedSeason}&dayType=${dayType}&hour=${selectedHour}`,
                { method: 'GET' }
            );
            console.log(`[AI Prefs] Response status: ${response.status}`);
            const data = await response.json();
            console.log(`[AI Prefs] Response data:`, data);

            if (data.success) {
                setPreferences(data.preferences);
                console.log(`[AI Prefs] Loaded ${data.preferences.length} preferences`);
            } else {
                console.error('[AI Prefs] Failed to fetch preferences:', data.error);
            }
        } catch (error) {
            console.error('[AI Prefs] Error fetching preferences:', error);
        } finally {
            setLoading(false);
        }
    };

    const triggerAnalysis = async () => {
        if (!backendUrl || analyzing) return;

        console.log(`[AI Prefs] Triggering analysis: ${backendUrl}/api/preferences/analyze`);
        setAnalyzing(true);
        try {
            const response = await fetch(`${backendUrl}/api/preferences/analyze`, {
                method: 'POST'
            });
            console.log(`[AI Prefs] Analysis response status: ${response.status}`);
            const data = await response.json();
            console.log(`[AI Prefs] Analysis response:`, data);

            if (data.success) {
                console.log('[AI Prefs] Analysis started, waiting 3s then refreshing...');
                // Wait a moment then refresh
                setTimeout(() => {
                    fetchPreferences();
                    setAnalyzing(false);
                }, 3000);
            } else {
                console.error('[AI Prefs] Analysis failed:', data.error);
                setAnalyzing(false);
            }
        } catch (error) {
            console.error('[AI Prefs] Error triggering analysis:', error);
            setAnalyzing(false);
        }
    };

    const formatTime = (hour) => {
        return `${hour.toString().padStart(2, '0')}:00`;
    };

    return (
        <View style={styles.container}>
            <Stack.Screen options={{ headerShown: false }} />

            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                    <ChevronLeft size={24} color={Colors.text} />
                </TouchableOpacity>
                <View style={styles.headerContent}>
                    <Sparkles size={20} color={Colors.primary} />
                    <Text style={styles.headerTitle}>AI Learned Preferences</Text>
                </View>
                <TouchableOpacity onPress={triggerAnalysis} disabled={analyzing} style={styles.refreshButton}>
                    <RefreshCw size={20} color={analyzing ? Colors.textSecondary : Colors.primary} />
                </TouchableOpacity>
            </View>

            <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
                {/* Season Selector */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Season</Text>
                    <View style={styles.seasonContainer}>
                        {SEASONS.map(season => (
                            <TouchableOpacity
                                key={season}
                                style={[
                                    styles.seasonButton,
                                    selectedSeason === season && styles.seasonButtonActive
                                ]}
                                onPress={() => setSelectedSeason(season)}
                            >
                                <Text style={styles.seasonEmoji}>{SEASON_EMOJIS[season]}</Text>
                                <Text style={[
                                    styles.seasonText,
                                    selectedSeason === season && styles.seasonTextActive
                                ]}>
                                    {season.charAt(0).toUpperCase() + season.slice(1)}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                </View>

                {/* Timeline Slider */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Time of Day: {formatTime(selectedHour)}</Text>
                    <View style={styles.timelineContainer}>
                        <Text style={styles.timeLabel}>🌅 00:00</Text>
                        <Slider
                            style={styles.slider}
                            minimumValue={0}
                            maximumValue={23}
                            step={1}
                            value={selectedHour}
                            onValueChange={setSelectedHour}
                            minimumTrackTintColor={Colors.primary}
                            maximumTrackTintColor={Colors.border}
                            thumbTintColor={Colors.primary}
                        />
                        <Text style={styles.timeLabel}>🌙 23:00</Text>
                    </View>
                </View>

                {/* Day Type Toggle */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Day Type</Text>
                    <View style={styles.dayTypeContainer}>
                        <TouchableOpacity
                            style={[
                                styles.dayTypeButton,
                                dayType === 'weekday' && styles.dayTypeButtonActive
                            ]}
                            onPress={() => setDayType('weekday')}
                        >
                            <Text style={[
                                styles.dayTypeText,
                                dayType === 'weekday' && styles.dayTypeTextActive
                            ]}>
                                Weekday
                            </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[
                                styles.dayTypeButton,
                                dayType === 'weekend' && styles.dayTypeButtonActive
                            ]}
                            onPress={() => setDayType('weekend')}
                        >
                            <Text style={[
                                styles.dayTypeText,
                                dayType === 'weekend' && styles.dayTypeTextActive
                            ]}>
                                Weekend
                            </Text>
                        </TouchableOpacity>
                    </View>
                </View>

                {/* Preferences List */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Learned Preferences ({preferences.length})</Text>

                    {loading ? (
                        <View style={styles.loadingContainer}>
                            <ActivityIndicator size="large" color={Colors.primary} />
                            <Text style={styles.loadingText}>Loading preferences...</Text>
                        </View>
                    ) : preferences.length === 0 ? (
                        <View style={styles.emptyContainer}>
                            <Sparkles size={48} color={Colors.textSecondary} />
                            <Text style={styles.emptyText}>No preferences learned yet</Text>
                            <Text style={styles.emptySubtext}>
                                Run an analysis or wait for the daily 6 AM update
                            </Text>
                        </View>
                    ) : (
                        preferences.map(pref => (
                            <PreferenceCard
                                key={pref.entity_id}
                                preference={pref}
                                dayType={dayType}
                            />
                        ))
                    )}
                </View>
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.background,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingTop: 60,
        paddingBottom: 16,
        backgroundColor: Colors.background,
        borderBottomWidth: 1,
        borderBottomColor: Colors.border,
    },
    backButton: {
        padding: 8,
    },
    headerContent: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginLeft: 8,
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: Colors.text,
    },
    refreshButton: {
        padding: 8,
    },
    content: {
        flex: 1,
    },
    section: {
        padding: 16,
        borderBottomWidth: 1,
        borderBottomColor: Colors.border,
    },
    sectionTitle: {
        fontSize: 14,
        fontWeight: '600',
        color: Colors.textSecondary,
        marginBottom: 12,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    seasonContainer: {
        flexDirection: 'row',
        gap: 8,
    },
    seasonButton: {
        flex: 1,
        padding: 12,
        borderRadius: 12,
        backgroundColor: Colors.surface,
        borderWidth: 2,
        borderColor: Colors.border,
        alignItems: 'center',
        gap: 4,
    },
    seasonButtonActive: {
        backgroundColor: Colors.primary + '20',
        borderColor: Colors.primary,
    },
    seasonEmoji: {
        fontSize: 24,
    },
    seasonText: {
        fontSize: 12,
        fontWeight: '500',
        color: Colors.textSecondary,
    },
    seasonTextActive: {
        color: Colors.primary,
        fontWeight: '600',
    },
    timelineContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    slider: {
        flex: 1,
        height: 40,
    },
    timeLabel: {
        fontSize: 12,
        color: Colors.textSecondary,
    },
    dayTypeContainer: {
        flexDirection: 'row',
        gap: 12,
    },
    dayTypeButton: {
        flex: 1,
        padding: 14,
        borderRadius: 12,
        backgroundColor: Colors.surface,
        borderWidth: 2,
        borderColor: Colors.border,
        alignItems: 'center',
    },
    dayTypeButtonActive: {
        backgroundColor: Colors.primary + '20',
        borderColor: Colors.primary,
    },
    dayTypeText: {
        fontSize: 14,
        fontWeight: '500',
        color: Colors.textSecondary,
    },
    dayTypeTextActive: {
        color: Colors.primary,
        fontWeight: '600',
    },
    loadingContainer: {
        alignItems: 'center',
        padding: 40,
        gap: 12,
    },
    loadingText: {
        fontSize: 14,
        color: Colors.textSecondary,
    },
    emptyContainer: {
        alignItems: 'center',
        padding: 40,
        gap: 8,
    },
    emptyText: {
        fontSize: 16,
        fontWeight: '600',
        color: Colors.text,
    },
    emptySubtext: {
        fontSize: 14,
        color: Colors.textSecondary,
        textAlign: 'center',
    },
});
