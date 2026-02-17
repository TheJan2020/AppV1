import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, SafeAreaView } from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { ChevronLeft, Lightbulb, ToggleLeft, Activity, Eye, Thermometer, Play, Lock, Video, Box } from 'lucide-react-native';
import { StatusBar } from 'expo-status-bar';
import { getAdminUrl } from '../utils/storage';

export default function EntityHistoryPicker() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [homeStats, setHomeStats] = useState(null);
    const [adminUrl, setAdminUrl] = useState(null);

    useEffect(() => {
        getAdminUrl().then(url => {
            if (!url) {
                console.error("EntityHistoryPicker: Admin URL not found in profile");
                setLoading(false);
                return;
            }
            setAdminUrl(url);
        });
    }, []);

    useEffect(() => {
        if (!adminUrl) return;

        const fetchStats = async () => {
            const now = new Date();
            const start = new Date(now); start.setHours(0, 0, 0, 0);
            const end = new Date(now); end.setHours(23, 59, 59, 999);

            try {
                console.log(`Fetching entity list from ${adminUrl}`);
                const res = await fetch(`${adminUrl}/api/stats/home?start_date=${start.toISOString()}&end_date=${end.toISOString()}`);
                const data = await res.json();
                setHomeStats(data);
                setLoading(false);
            } catch (e) {
                console.error(e);
                setLoading(false);
            }
        };
        fetchStats();
    }, [adminUrl]);

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
                    <View style={{ backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 12, overflow: 'hidden' }}>
                        {groupEntities.map((entity, idx) => (
                            <TouchableOpacity
                                key={entity.entity_id}
                                style={{
                                    padding: 15,
                                    borderBottomWidth: idx === groupEntities.length - 1 ? 0 : 1,
                                    borderBottomColor: 'rgba(255,255,255,0.05)'
                                }}
                                onPress={() => router.push(`/history?entity_id=${entity.entity_id}`)}
                            >
                                <Text style={{ color: 'white', fontWeight: 'bold', fontSize: 15 }}>
                                    {entity.entity_id.split('.')[1].replace(/_/g, ' ').toUpperCase()}
                                </Text>
                                <Text style={{ color: '#666', fontSize: 12 }}>{entity.entity_id}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                </View>
            );
        });
    };

    const renderRoles = () => {
        if (!homeStats) return null;
        const areas = Object.keys(homeStats).sort();
        if (areas.length === 0) return <Text style={{ color: '#888', textAlign: 'center', marginTop: 20 }}>No monitored entities found.</Text>;

        return (
            <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 100 }}>
                {areas.map(areaName => {
                    const entities = homeStats[areaName];
                    if (entities.length === 0) return null;
                    return (
                        <View key={areaName} style={{ marginBottom: 25 }}>
                            <Text style={{ color: '#8947ca', fontSize: 18, fontWeight: 'bold', marginBottom: 10, textTransform: 'capitalize' }}>
                                {areaName}
                            </Text>
                            {renderEntityGroup(entities)}
                        </View>
                    );
                })}
            </ScrollView>
        );
    };

    return (
        <View style={styles.container}>
            <Stack.Screen options={{ headerShown: false }} />
            <LinearGradient colors={['#1a1b2e', '#16161e', '#000000']} style={StyleSheet.absoluteFill} />
            <StatusBar style="light" />
            <SafeAreaView style={{ flex: 1 }}>
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                        <ChevronLeft size={24} color="white" />
                    </TouchableOpacity>
                    <Text style={styles.title}>Browse Entities</Text>
                    <View style={{ width: 40 }} />
                </View>

                {loading ? <ActivityIndicator size="large" color="#8947ca" style={{ marginTop: 50 }} /> : renderRoles()}
            </SafeAreaView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 20,
        justifyContent: 'space-between',
    },
    backBtn: { padding: 5, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 20 },
    title: { color: 'white', fontSize: 20, fontWeight: 'bold' },
});
