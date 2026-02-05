import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Dimensions, ActivityIndicator, Modal } from 'react-native';
import { Stack, useRouter, useFocusEffect } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { ChevronLeft, Smartphone, PieChart as PieIcon, Calendar, X, Lightbulb, ToggleLeft, Activity, Eye, Thermometer, Play, Lock, Video, Box, Speaker, Plus, Minus } from 'lucide-react-native';
import { PieChart, LineChart } from 'react-native-chart-kit';
import AnalogClockPresence from '../components/AnalogClockPresence';

const screenWidth = Dimensions.get('window').width;

export default function StatisticsPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState(null);
    const [user, setUser] = useState(null);
    const [error, setError] = useState(null);

    // New State for Home Stats
    const [activeTab, setActiveTab] = useState('my'); // 'my' | 'home'
    const [homeStats, setHomeStats] = useState(null);
    const [homeStatsLoading, setHomeStatsLoading] = useState(false);
    const [expandedRooms, setExpandedRooms] = useState({}); // { roomKey: boolean }

    const toggleRoom = (key) => {
        setExpandedRooms(prev => ({
            ...prev,
            [key]: !prev[key]
        }));
    };

    const adminUrl = process.env.EXPO_PUBLIC_ADMIN_URL;

    // View State (Shared)
    const [viewMode, setViewMode] = useState('daily');
    const [aggregationMode, setAggregationMode] = useState('accumulated');
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [showCalendar, setShowCalendar] = useState(false);

    // Helpers
    // Helpers
    // Use Local Time YYYY-MM-DD to match backend's en-CA format
    const formatDate = (date) => {
        const offset = date.getTimezoneOffset();
        const localDate = new Date(date.getTime() - (offset * 60 * 1000));
        return localDate.toISOString().split('T')[0];
    };

    const formatDuration = (hours) => {
        if (!hours && hours !== 0) return '0s';
        if (hours < (1 / 60)) { // < 1 min
            const seconds = Math.round(hours * 3600);
            if (seconds < 1 && hours > 0) return '< 1s';
            return `${seconds}s`;
        }
        if (hours < 1) { // < 1 hour
            const minutes = Math.round(hours * 60);
            return `${minutes}m`;
        }
        return `${Number(hours).toFixed(1)}h`;
    };

    // Helper to calculate Start/End/Label based on viewMode and selectedDate
    const getRange = () => {
        let start = new Date(selectedDate);
        let end = new Date(selectedDate);
        let label = '';

        if (viewMode === 'daily') {
            start.setHours(0, 0, 0, 0);
            end.setHours(23, 59, 59, 999);
            label = new Date(selectedDate).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
        } else if (viewMode === 'weekly') {
            const day = start.getDay();
            const diff = start.getDate() - day; // Start on Sunday
            start.setDate(diff); start.setHours(0, 0, 0, 0);

            end = new Date(start);
            end.setDate(start.getDate() + 6); end.setHours(23, 59, 59, 999);

            label = `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
        } else if (viewMode === 'monthly') {
            start.setDate(1); start.setHours(0, 0, 0, 0);
            end.setMonth(start.getMonth() + 1); end.setDate(0); end.setHours(23, 59, 59, 999);

            label = start.toLocaleString('en-US', { month: 'long', year: 'numeric' });
        }

        return { start, end, label };
    };

    const range = getRange(); // Current Range

    // Fetch Data on Mount/Focus and when Range Changes
    useEffect(() => {
        if (!adminUrl) return;
        fetchData();
    }, [adminUrl, viewMode, selectedDate]);

    useFocusEffect(
        useCallback(() => {
            fetchData();
        }, [adminUrl, viewMode, selectedDate])
    );

    const fetchData = async () => {
        setLoading(true);
        try {
            // 1. Users (Only if not loaded)
            let currentUser = user;
            if (!currentUser) {
                const usersRes = await fetch(`${adminUrl}/api/users`);
                const users = await usersRes.json();
                if (users.length === 0) throw new Error("No users configured");
                currentUser = users[0];
                setUser(currentUser);
            }

            // 2. User Stats (My Stats)
            // Use explicit start/end from range
            const { start, end } = getRange(); // Get fresh range
            const url = `${adminUrl}/api/stats/user?user_id=${currentUser.user_id}&entity_id=${currentUser.entity_id}&start_date=${start.toISOString()}&end_date=${end.toISOString()}`;

            console.log('Fetching User Stats:', url);
            const statsRes = await fetch(url);
            if (!statsRes.ok) throw new Error("Failed to fetch user stats");
            const statsData = await statsRes.json();
            if (statsData.error) throw new Error(statsData.error);
            setStats(statsData);

        } catch (e) {
            console.error(e);
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    // Fetch Home Stats when tab active or range changes
    useEffect(() => {
        if (activeTab === 'home' || (activeTab === 'my' && user)) {
            fetchHomeStats();
        }
    }, [activeTab, viewMode, selectedDate, user]);

    const fetchHomeStats = async () => {
        if (!adminUrl) return;
        setHomeStatsLoading(true);
        try {
            const { start, end } = range;
            let url = `${adminUrl}/api/stats/home?start_date=${start.toISOString()}&end_date=${end.toISOString()}`;
            if (activeTab === 'my' && user) {
                url += `&user_id=${user.user_id}`;
            }
            console.log('Fetching Home Stats:', url);

            const res = await fetch(url);
            if (!res.ok) throw new Error("Failed to fetch home stats");
            const data = await res.json();
            setHomeStats(data);
        } catch (e) {
            console.error(e);
        } finally {
            setHomeStatsLoading(false);
        }
    };

    // --- Charts Logic ---
    const chartConfig = {
        backgroundGradientFrom: "#1a1b2e",
        backgroundGradientTo: "#1a1b2e",
        color: (opacity = 1) => `rgba(255, 255, 255, ${opacity})`,
        labelColor: (opacity = 1) => `rgba(255, 255, 255, ${opacity})`,
        barPercentage: 0.5,
    };

    const renderDailyChart = () => {
        if (!stats?.daily_rooms || stats.daily_rooms.length === 0) return <Text style={{ color: '#888' }}>No data available</Text>;
        const allRooms = new Set();
        stats.daily_rooms.forEach(d => {
            Object.keys(d).forEach(k => { if (k !== 'date') allRooms.add(k); });
        });
        const legend = Array.from(allRooms);
        const colors = ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40'];
        const datasets = legend.map((room, index) => {
            const color = colors[index % colors.length];
            return {
                data: stats.daily_rooms.map(d => d[room] || 0),
                color: (opacity = 1) => color,
                strokeWidth: 2,
                withDots: true
            };
        });
        const labels = stats.daily_rooms.map(d => d.date.substring(5));
        return (
            <View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <LineChart
                        data={{ labels: labels, datasets: datasets }}
                        width={Math.max(screenWidth - 40, labels.length * 60)}
                        height={220}
                        chartConfig={{ ...chartConfig, propsForDots: { r: "4" } }}
                        bezier withInnerLines={true} withOuterLines={false} withVerticalLines={false}
                    />
                </ScrollView>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 15, justifyContent: 'center', gap: 15 }}>
                    {legend.map((room, index) => (
                        <View key={room} style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors[index % colors.length], marginRight: 6 }} />
                            <Text style={{ color: '#ccc', fontSize: 12, textTransform: 'capitalize' }}>{room.replace(/_/g, ' ')}</Text>
                        </View>
                    ))}
                </View>
            </View>
        );
    };

    // --- My Stats Breakdown ---
    const getAggregatedStats = () => {
        if (!stats) return { data: {}, numDays: 1 };
        let data = {};
        let numDays = 1;
        const { start, end } = range; // Use centralized range

        if (viewMode === 'daily') {
            const currentStr = formatDate(selectedDate);
            const dayData = stats.daily_rooms.find(d => d.date === currentStr) || {};
            // Maintain precision
            Object.keys(dayData).forEach(k => { if (k !== 'date') data[k] = dayData[k]; });
        } else {
            if (viewMode === 'weekly') numDays = 7;
            if (viewMode === 'monthly') numDays = end.getDate();

            const startStr = formatDate(start);
            const endStr = formatDate(end);

            stats.daily_rooms.forEach(d => {
                if (d.date >= startStr && d.date <= endStr) {
                    Object.keys(d).forEach(k => { if (k !== 'date') data[k] = (data[k] || 0) + d[k]; });
                }
            });

            // Effective Days logic
            const today = new Date();
            const msPerDay = 1000 * 60 * 60 * 24;
            const utcToday = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
            const utcStart = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
            const utcEnd = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());

            let effectiveEndUtc = utcEnd;
            if (utcEnd >= utcToday) effectiveEndUtc = utcToday;
            if (effectiveEndUtc >= utcStart) {
                numDays = Math.floor((effectiveEndUtc - utcStart) / msPerDay) + 1;
            }

            // Average
            if (aggregationMode === 'average') {
                Object.keys(data).forEach(k => { data[k] = parseFloat((data[k] / Math.max(1, numDays)).toFixed(4)); });
            } else {
                Object.keys(data).forEach(k => { data[k] = parseFloat(data[k].toFixed(4)); });
            }
        }
        return { data, numDays };
    };

    const getDomainIcon = (domain) => {
        switch (domain) {
            case 'light': return Lightbulb;
            case 'switch': return ToggleLeft;
            case 'sensor': return Activity;
            case 'binary_sensor': return Eye;
            case 'climate': return Thermometer;
            case 'media_player': return Play;
            case 'lock': return Lock;
            case 'camera': return Video;
            default: return Box;
        }
    };

    const renderEntityGroup = (entities) => {
        const groups = entities.reduce((acc, e) => {
            const domain = e.entity_id.split('.')[0];
            if (!acc[domain]) acc[domain] = [];
            acc[domain].push(e);
            return acc;
        }, {});

        return Object.keys(groups).sort().map(domain => {
            const groupEntities = groups[domain];
            const Icon = getDomainIcon(domain);

            return (
                <View key={domain} style={{ marginBottom: 15 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 8 }}>
                        <Icon size={14} color="#aaa" />
                        <Text style={{ color: '#aaa', fontSize: 13, fontWeight: 'bold', textTransform: 'uppercase' }}>
                            {domain.replace(/_/g, ' ')}
                        </Text>
                    </View>

                    <View style={{ backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: 15 }}>
                        {groupEntities.map((entity, idx) => (
                            <View key={entity.entity_id} style={{ marginBottom: idx === groupEntities.length - 1 ? 0 : 15, borderBottomWidth: idx === groupEntities.length - 1 ? 0 : 1, borderBottomColor: 'rgba(255,255,255,0.05)', paddingBottom: 10 }}>
                                <Text style={{ color: 'white', fontWeight: 'bold', fontSize: 15, marginBottom: 5 }}>
                                    {entity.entity_id.split('.')[1].replace(/_/g, ' ').toUpperCase()}
                                    <Text style={{ color: '#666', fontSize: 12, fontWeight: 'normal' }}> ({entity.entity_id})</Text>
                                </Text>
                                {entity.stats.map((stat, sIdx) => (
                                    <View key={sIdx} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingLeft: 10, marginBottom: 4 }}>
                                        <Text style={{ color: '#ccc', fontSize: 14, flex: 1 }}>{stat.state}</Text>
                                        <Text style={{ color: '#4CAF50', fontSize: 14, fontWeight: '600' }}>
                                            {formatDuration(stat.duration_hours)}
                                        </Text>
                                    </View>
                                ))}
                            </View>
                        ))}
                    </View>
                </View>
            );
        });
    };

    const renderMyBreakdown = () => {
        if (!stats) return null;
        const { data, numDays } = getAggregatedStats();
        const roomEntries = Object.entries(data).sort((a, b) => b[1] - a[1]);
        const totalHoursRecorded = roomEntries.reduce((sum, [_, h]) => sum + h, 0);

        const now = new Date();
        const { start, end } = range;
        const isCurrentPeriod = now >= start && now <= end;

        let maxHours = 24;
        let remainingHours = 0;
        let showRemaining = false;

        if (viewMode === 'daily') {
            maxHours = 24;
        } else if (aggregationMode === 'accumulated') {
            maxHours = 24 * numDays;
        } else {
            maxHours = 24; // Average
        }

        if (isCurrentPeriod && (viewMode === 'daily' || aggregationMode === 'accumulated')) {
            const elapsedHours = (now - start) / (1000 * 60 * 60);
            maxHours = elapsedHours;
            const remaining = (end - now) / (1000 * 60 * 60);
            remainingHours = Math.max(0, remaining);
            showRemaining = true;
        }

        const awayHours = Math.max(0, maxHours - totalHoursRecorded);

        return (
            <View style={{ padding: 15 }}>
                {roomEntries.length > 0 ? (
                    roomEntries.map(([room, hours]) => (
                        <View key={room} style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 }}>
                            <Text style={{ color: 'white', fontSize: 16, textTransform: 'capitalize' }}>{room.replace(/_/g, ' ')}</Text>
                            <Text style={{ color: '#4CAF50', fontSize: 16, fontWeight: '600' }}>{formatDuration(hours)}</Text>
                        </View>
                    ))
                ) : <Text style={{ color: '#888', textAlign: 'center' }}>No presence detected</Text>}

                <View style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.1)', marginVertical: 10 }} />
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={{ color: '#ccc', fontSize: 16 }}>Away {aggregationMode === 'average' ? '(Avg)' : ''}</Text>
                    <Text style={{ color: '#F44336', fontSize: 16, fontWeight: '600' }}>{formatDuration(awayHours)}</Text>
                </View>
                {showRemaining && (
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 }}>
                        <Text style={{ color: '#888', fontSize: 16 }}>
                            Time till end of {viewMode === 'daily' ? 'day' : viewMode === 'weekly' ? 'week' : 'month'}
                        </Text>
                        <Text style={{ color: '#ccc', fontSize: 16, fontWeight: '600' }}>{formatDuration(remainingHours)}</Text>
                    </View>
                )}
            </View>
        );
    };

    // --- My Stats Room Details ---
    const renderMyRoomDetails = () => {
        if (!homeStats || !stats) return null;
        if (homeStatsLoading) return <ActivityIndicator color="#8947ca" />;

        const { data } = getAggregatedStats();
        // data keys are e.g. "living_room", values are hours
        // Filter out rooms with 0 hours
        const visitedRooms = Object.keys(data).filter(k => data[k] > 0).sort((a, b) => data[b] - data[a]);

        // Normalize helper
        const normalize = (s) => s.toLowerCase().replace(/ /g, '_').trim();

        if (visitedRooms.length === 0) return null;

        return (
            <View style={{ padding: 15, paddingTop: 0 }}>
                <Text style={{ color: '#fff', fontSize: 18, fontWeight: 'bold', marginBottom: 15, marginTop: 10 }}>Room Details (Visited)</Text>
                {visitedRooms.map(roomKey => {
                    const durationStr = formatDuration(data[roomKey]);
                    const normRoom = normalize(roomKey);

                    // Find matching area in homeStats
                    // homeStats keys are Area Names e.g. "Living Room"
                    const matchingAreaName = Object.keys(homeStats).find(areaName => {
                        const normArea = normalize(areaName);
                        return normArea === normRoom || normArea.includes(normRoom) || normRoom.includes(normArea);
                    });

                    const entities = matchingAreaName ? homeStats[matchingAreaName] : [];

                    // Filter: Hide stats < 1 second. Hide entity if no stats left.
                    const filteredEntities = entities.map(entity => {
                        const validStats = entity.stats.filter(s => (s.duration_hours * 3600) >= 1);
                        return { ...entity, stats: validStats };
                    }).filter(e => e.stats.length > 0);

                    const isExpanded = !!expandedRooms[roomKey];

                    return (
                        <View key={roomKey} style={{ marginBottom: 25 }}>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                                    <TouchableOpacity onPress={() => toggleRoom(roomKey)} style={{ padding: 4 }}>
                                        {isExpanded ? <Minus size={20} color="#8947ca" /> : <Plus size={20} color="#ccc" />}
                                    </TouchableOpacity>

                                    <TouchableOpacity
                                        onPress={() => handleRoomClick(roomKey)}
                                        disabled={processingRoom}
                                        style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                        <Text style={{ color: '#8947ca', fontSize: 18, fontWeight: 'bold', textTransform: 'capitalize' }}>
                                            {matchingAreaName || roomKey.replace(/_/g, ' ')}
                                        </Text>
                                        {processingRoom && selectedRoom?.name === roomKey ? (
                                            <ActivityIndicator size="small" color="#8947ca" />
                                        ) : (
                                            <Eye size={16} color="#8947ca" />
                                        )}
                                    </TouchableOpacity>
                                </View>
                                <Text style={{ color: '#4CAF50', fontSize: 16, fontWeight: '600' }}>{durationStr}</Text>
                            </View>

                            {isExpanded && (
                                <View style={{ paddingLeft: 34 }}>
                                    {filteredEntities.length > 0 ? (
                                        <View style={{ marginBottom: 10 }}>
                                            {renderEntityGroup(filteredEntities)}
                                        </View>
                                    ) : (
                                        <Text style={{ color: 'rgba(255,255,255,0.3)', fontStyle: 'italic', fontSize: 13 }}>
                                            Presence detected, but no device usage recorded.
                                        </Text>
                                    )}
                                </View>
                            )}
                        </View>
                    );

                })}
            </View>
        );
    };

    // --- Home Stats Logic ---
    const renderHomeStats = () => {
        if (homeStatsLoading) return <ActivityIndicator color="#8947ca" style={{ padding: 20 }} />;
        if (!homeStats) return null;

        const areas = Object.keys(homeStats);
        if (areas.length === 0) return <Text style={{ color: '#888', textAlign: 'center', padding: 20 }}>No area statistics available.</Text>;

        return (
            <View style={{ padding: 15 }}>
                {areas.map(areaName => {
                    const entities = homeStats[areaName];
                    if (entities.length === 0) return null;

                    const isExpanded = !!expandedRooms[areaName];

                    return (
                        <View key={areaName} style={{ marginBottom: 25 }}>
                            <TouchableOpacity
                                onPress={() => toggleRoom(areaName)}
                                style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 10 }}
                            >
                                {isExpanded ? <Minus size={20} color="#8947ca" /> : <Plus size={20} color="#ccc" />}
                                <Text style={{ color: '#8947ca', fontSize: 18, fontWeight: 'bold', marginBottom: 0, textTransform: 'capitalize' }}>
                                    {areaName}
                                </Text>
                            </TouchableOpacity>

                            {isExpanded && (
                                <View style={{ marginBottom: 10, paddingLeft: 30 }}>
                                    {renderEntityGroup(entities)}
                                </View>
                            )}
                        </View>
                    );

                })}
            </View>
        );
    };

    // --- Date Navigation & Controls ---
    const changeDate = (direction) => {
        const newDate = new Date(selectedDate);
        if (viewMode === 'daily') newDate.setDate(selectedDate.getDate() + direction);
        if (viewMode === 'weekly') newDate.setDate(selectedDate.getDate() + (direction * 7));
        if (viewMode === 'monthly') newDate.setMonth(selectedDate.getMonth() + direction);
        if (newDate > new Date()) return;
        setSelectedDate(newDate);
    };

    const renderControls = () => {
        const isToday = formatDate(selectedDate) === formatDate(new Date());

        return (
            <View style={[styles.card, { padding: 0, overflow: 'hidden' }]}>
                {/* View Mode Tabs */}
                <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.1)' }}>
                    {['daily', 'weekly', 'monthly'].map(mode => (
                        <TouchableOpacity key={mode} style={{ flex: 1, padding: 12, backgroundColor: viewMode === mode ? 'rgba(255,255,255,0.1)' : 'transparent', alignItems: 'center' }} onPress={() => setViewMode(mode)}>
                            <Text style={{ color: viewMode === mode ? '#8947ca' : '#aaa', fontWeight: 'bold', textTransform: 'capitalize' }}>{mode}</Text>
                        </TouchableOpacity>
                    ))}
                </View>

                {/* Aggregation (Only for MyStats) */}
                {activeTab === 'my' && viewMode !== 'daily' && (
                    <View style={{ flexDirection: 'row', justifyContent: 'center', padding: 8, backgroundColor: 'rgba(0,0,0,0.2)' }}>
                        <TouchableOpacity style={{ marginRight: 20 }} onPress={() => setAggregationMode('accumulated')}>
                            <Text style={{ color: aggregationMode === 'accumulated' ? 'white' : '#666', fontSize: 13, fontWeight: aggregationMode === 'accumulated' ? 'bold' : 'normal' }}>Accumulated</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => setAggregationMode('average')}>
                            <Text style={{ color: aggregationMode === 'average' ? 'white' : '#666', fontSize: 13, fontWeight: aggregationMode === 'average' ? 'bold' : 'normal' }}>Average / Day</Text>
                        </TouchableOpacity>
                    </View>
                )}

                {/* Date Navigator */}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 15, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.1)' }}>
                    <TouchableOpacity onPress={() => changeDate(-1)} style={{ padding: 5 }}><ChevronLeft size={24} color="#ccc" /></TouchableOpacity>
                    <TouchableOpacity onPress={() => setShowCalendar(true)} style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Calendar size={18} color="#ccc" style={{ marginRight: 8 }} />
                        <Text style={{ color: 'white', fontSize: 16, fontWeight: 'bold' }}>{range.label} {viewMode === 'daily' && isToday ? '(Today)' : ''}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => changeDate(1)} style={{ padding: 5, opacity: new Date() < selectedDate ? 0.3 : 1 }}><ChevronLeft size={24} color="#ccc" style={{ transform: [{ rotate: '180deg' }] }} /></TouchableOpacity>
                </View>

                {/* Content */}
                {activeTab === 'my' ? (
                    <>
                        {renderMyBreakdown()}
                        {renderMyRoomDetails()}
                    </>
                ) : renderHomeStats()}
            </View>
        );
    };

    // Calendar Modal (Polished)
    const renderCalendarModal = () => {
        const year = selectedDate.getFullYear();
        const month = selectedDate.getMonth();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
        const monthLabel = selectedDate.toLocaleString('en-US', { month: 'long', year: 'numeric' });
        const firstDayOffset = new Date(year, month, 1).getDay();
        const empties = Array.from({ length: firstDayOffset }, (_, i) => i);
        const weekdays = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

        return (
            <Modal visible={showCalendar} transparent animationType="fade">
                <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', alignItems: 'center' }}>
                    <View style={{ width: '85%', backgroundColor: '#1a1b2e', borderRadius: 16, padding: 20 }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 }}>
                            <Text style={{ color: 'white', fontSize: 18, fontWeight: 'bold' }}>{monthLabel}</Text>
                            <TouchableOpacity onPress={() => setShowCalendar(false)}><X color="white" size={24} /></TouchableOpacity>
                        </View>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 }}>
                            <TouchableOpacity onPress={() => changeDate(-30)}><Text style={{ color: '#8947ca' }}>Prev Month</Text></TouchableOpacity>
                            <TouchableOpacity onPress={() => changeDate(30)}><Text style={{ color: '#8947ca' }}>Next Month</Text></TouchableOpacity>
                        </View>
                        <View style={{ flexDirection: 'row', marginBottom: 10 }}>
                            {weekdays.map((d, i) => (<View key={i} style={{ width: '14.28%', alignItems: 'center' }}><Text style={{ color: '#666', fontWeight: 'bold' }}>{d}</Text></View>))}
                        </View>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-start' }}>
                            {empties.map(i => <View key={`empty-${i}`} style={{ width: '14.28%', aspectRatio: 1 }} />)}
                            {days.map(d => {
                                const isSelected = d === selectedDate.getDate();
                                const checkDate = new Date(year, month, d);
                                const isFuture = checkDate > new Date();
                                return (
                                    <TouchableOpacity key={d} disabled={isFuture}
                                        style={{ width: '14.28%', aspectRatio: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: isSelected ? '#8947ca' : 'transparent', borderRadius: 20, opacity: isFuture ? 0.3 : 1 }}
                                        onPress={() => { const newDate = new Date(selectedDate); newDate.setDate(d); setSelectedDate(newDate); setShowCalendar(false); }}>
                                        <Text style={{ color: 'white' }}>{d}</Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                    </View>
                </View>
            </Modal>
        );
    };

    // --- Room Detail Modal (Clocks + Table) ---
    const [selectedRoom, setSelectedRoom] = useState(null); // { name: 'living_room', intervals: [] }
    const [processingRoom, setProcessingRoom] = useState(false); // Loader state

    const handleRoomClick = async (roomName) => {
        setProcessingRoom(true);
        // Simulate a tiny delay to allow UI to render the loader if calculation is heavy
        // In reality, we just set the state, but if filtering is expensive, this helps.
        setTimeout(() => {
            setSelectedRoom({ name: roomName });
            setProcessingRoom(false);
        }, 50);
    };

    const mergeIntervals = (intervals) => {
        if (!intervals || intervals.length === 0) return [];

        // Sort by start time
        const sorted = [...intervals].sort((a, b) => a.start - b.start);
        const merged = [];
        let current = sorted[0];

        for (let i = 1; i < sorted.length; i++) {
            const next = sorted[i];
            const gap = next.start - current.end;

            // Merge if gap is less than 30 seconds (30000ms)
            if (gap < 30000) {
                current.end = Math.max(current.end, next.end);
            } else {
                merged.push(current);
                current = next;
            }
        }
        merged.push(current);
        return merged;
    };

    const renderRoomDetailModal = () => {
        if (!selectedRoom) return null;

        // Helper to normalize keys for matching
        const normalize = (s) => s.toLowerCase().replace(/_/g, ' ').trim();
        const target = normalize(selectedRoom.name);

        // Get Intervals
        let intervals = [];
        if (stats && stats.presence_intervals) {
            // Try direct match
            if (stats.presence_intervals[selectedRoom.name]) {
                intervals = stats.presence_intervals[selectedRoom.name];
            } else {
                // Try fuzzy match
                const matchKey = Object.keys(stats.presence_intervals).find(k => normalize(k) === target);
                if (matchKey) {
                    intervals = stats.presence_intervals[matchKey];
                }
            }
        }

        // Filter intervals by Date Range (selectedDate/viewMode)
        const { start, end } = range;
        const sTime = start.getTime();
        const eTime = end.getTime();

        const rawFiltered = intervals.filter(int => {
            // Check overlap
            return (int.start <= eTime && int.end >= sTime);
        });

        const filteredIntervals = mergeIntervals(rawFiltered);

        return (
            <Modal visible={true} transparent animationType="slide">
                <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'center', alignItems: 'center' }}>
                    <View style={{ width: '90%', height: '80%', backgroundColor: '#1a1b2e', borderRadius: 20, padding: 20 }}>

                        {/* Header */}
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                            <Text style={{ color: 'white', fontSize: 22, fontWeight: 'bold', textTransform: 'capitalize' }}>
                                {selectedRoom.name.replace(/_/g, ' ')} Details
                            </Text>
                            <TouchableOpacity onPress={() => setSelectedRoom(null)}>
                                <X color="white" size={28} />
                            </TouchableOpacity>
                        </View>

                        <Text style={{ color: '#aaa', fontSize: 14, marginBottom: 20, textAlign: 'center' }}>
                            {range.label}
                        </Text>

                        {/* DEBUG TEXT FOR USER */}
                        {/* DEBUG TEXT FOR USER */}
                        {(filteredIntervals.length === 0 || !stats.presence_intervals) && (
                            <View style={{ backgroundColor: '#331111', padding: 10, borderRadius: 8, marginBottom: 10 }}>
                                <Text style={{ color: 'red', fontSize: 13, fontWeight: 'bold' }}>DEBUG INFO:</Text>
                                <Text style={{ color: '#ffaaaa', fontSize: 11, marginTop: 4 }}>
                                    1. Backend Update: {stats.debug_meta ? "OK (V10)" : "MISSING (Restart Required)"}
                                </Text>
                                {stats.debug_meta && (
                                    <>
                                        <Text style={{ color: '#faaaaa', fontSize: 10 }}>Start: {stats.debug_meta.start_received || 'NULL'}</Text>
                                        <Text style={{ color: '#faaaaa', fontSize: 10 }}>End: {stats.debug_meta.end_received || 'NULL'}</Text>
                                        <Text style={{ color: '#faaaaa', fontSize: 10 }}>Ignored: {JSON.stringify(stats.debug_meta.ignored_config)}</Text>
                                        <Text style={{ color: '#faaaaa', fontSize: 10 }}>Entities: {JSON.stringify(stats.debug_meta.user_entities)}</Text>
                                    </>
                                )}
                                <Text style={{ color: '#faaaaa', fontSize: 10 }}>2. Room: {selectedRoom.name}</Text>
                                <Text style={{ color: '#faaaaa', fontSize: 10 }}>3. Intervals Found: {rawFiltered.length}</Text>
                            </View>
                        )}

                        <ScrollView showsVerticalScrollIndicator={false}>
                            {/* Clocks */}
                            <View style={{ flexDirection: 'row', justifyContent: 'space-around', marginBottom: 30 }}>
                                <AnalogClockPresence intervals={filteredIntervals} type="AM" size={120} />
                                <AnalogClockPresence intervals={filteredIntervals} type="PM" size={120} />
                            </View>

                            {/* Interval Table */}
                            <Text style={{ color: '#ccc', fontSize: 16, fontWeight: 'bold', marginBottom: 10 }}>Presence Log (From - To)</Text>

                            {filteredIntervals.length > 0 ? (
                                <View style={{ backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: 10 }}>
                                    {filteredIntervals.sort((a, b) => a.start - b.start).map((int, i) => {
                                        const s = new Date(Math.max(int.start, sTime)); // Clamp to window
                                        const e = new Date(Math.min(int.end, eTime));   // Clamp to window

                                        const sStr = s.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                                        const eStr = e.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                                        const dateLabel = viewMode !== 'daily' ? `(${s.getDate()}/${s.getMonth() + 1}) ` : '';

                                        // Calculate duration 
                                        const durMins = Math.round((e - s) / 60000);

                                        return (
                                            <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: i === filteredIntervals.length - 1 ? 0 : 1, borderBottomColor: 'rgba(255,255,255,0.05)' }}>
                                                <Text style={{ color: 'white', fontSize: 14 }}>{dateLabel}{sStr} - {eStr}</Text>
                                                <Text style={{ color: '#8947ca', fontSize: 14 }}>{durMins} mins</Text>
                                            </View>
                                        );
                                    })}
                                </View>
                            ) : (
                                <Text style={{ color: '#666', fontStyle: 'italic' }}>No detailed intervals recorded for this period.</Text>
                            )}

                        </ScrollView>
                    </View>
                </View>
            </Modal>
        );
    };

    return (
        <View style={styles.container}>
            <Stack.Screen options={{ headerShown: false }} />
            <LinearGradient colors={['#1a1b2e', '#16161e', '#000000']} style={styles.background} />
            {renderCalendarModal()}
            {renderRoomDetailModal()}

            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backButton}><ChevronLeft color="white" size={28} /></TouchableOpacity>
                <Text style={styles.headerTitle}>Statistics</Text>
            </View>

            {/* Top Level Tabs */}
            <View style={{ flexDirection: 'row', marginHorizontal: 20, marginBottom: 20, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: 4 }}>
                <TouchableOpacity onPress={() => setActiveTab('my')} style={{ flex: 1, paddingVertical: 10, alignItems: 'center', backgroundColor: activeTab === 'my' ? '#8947ca' : 'transparent', borderRadius: 8 }}>
                    <Text style={{ color: 'white', fontWeight: 'bold' }}>My Statistics</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setActiveTab('home')} style={{ flex: 1, paddingVertical: 10, alignItems: 'center', backgroundColor: activeTab === 'home' ? '#8947ca' : 'transparent', borderRadius: 8 }}>
                    <Text style={{ color: 'white', fontWeight: 'bold' }}>Home Statistics</Text>
                </TouchableOpacity>
            </View>

            {loading ? <View style={styles.center}><ActivityIndicator size="large" color="#8947ca" /></View> : error ? <View style={styles.center}><Text style={{ color: 'red' }}>Error: {error}</Text></View> : (
                <ScrollView contentContainerStyle={styles.content}>
                    {activeTab === 'my' && (
                        <>
                            {/* Tracked Devices */}
                            <View style={styles.card}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
                                    <Smartphone color="#8947ca" size={24} />
                                    <Text style={styles.cardTitle}>Tracking Status</Text>
                                </View>
                                <Text style={{ color: '#ccc', fontSize: 14 }}>Tracking <Text style={{ color: 'white', fontWeight: 'bold' }}>{stats.tracked_devices_count}</Text> devices for {user.name}.</Text>
                            </View>

                            {/* Charts Only show in 'My Stats' or 'All'? User said separate tabs. */}
                            {/* Assuming Charts are part of My Stats user experience. */}
                            <View style={styles.card}>
                                <Text style={styles.cardTitle}>Home Presence (Last 7 Days)</Text>
                                <PieChart data={[{ name: 'Home', population: stats.home_ratio.home, color: '#4CAF50', legendFontColor: '#ccc', legendFontSize: 12 }, { name: 'Away', population: stats.home_ratio.not_home, color: '#F44336', legendFontColor: '#ccc', legendFontSize: 12 }]} width={screenWidth - 80} height={150} chartConfig={chartConfig} accessor="population" backgroundColor="transparent" paddingLeft="15" absolute={false} />
                                <Text style={{ textAlign: 'center', color: '#888', marginTop: 10, fontSize: 12 }}>{stats.home_ratio.percent_home}% Time at Home</Text>
                            </View>

                            <View style={styles.card}>
                                <Text style={styles.cardTitle}>Daily Room Usage (Hours)</Text>
                                {renderDailyChart()}
                            </View>

                            <View style={styles.card}>
                                <Text style={styles.cardTitle}>Total Room Distribution</Text>
                                <View style={{ alignItems: 'center' }}>
                                    <PieChart data={stats.total_room_usage.map((item, index) => ({ ...item, color: ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40', '#8AC926', '#1982C4', '#6A4C93'][index % 9] }))} width={screenWidth - 80} height={220} chartConfig={chartConfig} accessor="hours" backgroundColor="transparent" paddingLeft={screenWidth / 4} hasLegend={false} absolute={false} />
                                </View>
                                <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 15, justifyContent: 'center', gap: 15 }}>
                                    {stats.total_room_usage.map((item, index) => (
                                        <View key={item.name} style={{ flexDirection: 'row', alignItems: 'center' }}>
                                            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40', '#8AC926', '#1982C4', '#6A4C93'][index % 9], marginRight: 6 }} />
                                            <Text style={{ color: '#ccc', fontSize: 12, textTransform: 'capitalize' }}>{item.name.replace(/_/g, ' ')} ({item.hours}h)</Text>
                                        </View>
                                    ))}
                                </View>
                            </View>
                        </>
                    )}

                    {/* Controls & Breakdown (Shared Location, Different Content) */}
                    {renderControls()}
                </ScrollView>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    background: { position: 'absolute', width: '100%', height: '100%' },
    header: { flexDirection: 'row', alignItems: 'center', paddingTop: 60, paddingHorizontal: 20, marginBottom: 20 },
    backButton: { marginRight: 15 },
    headerTitle: { fontSize: 28, fontWeight: 'bold', color: 'white' },
    content: { paddingHorizontal: 20, paddingBottom: 40 },
    card: { backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 16, padding: 20, marginBottom: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
    cardTitle: { color: 'white', fontSize: 18, fontWeight: '600', marginBottom: 15, marginLeft: 10 },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' }
});
