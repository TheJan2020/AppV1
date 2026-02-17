import { useState, useRef, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, ScrollView } from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import * as Haptics from 'expo-haptics';

import { Colors } from '../constants/Colors';
import { TV_TYPES } from '../features/direct-tv-lab/constants';
import { getAdminUrl } from '../utils/storage';
import SamsungTVAdapter from '../features/direct-tv-lab/services/SamsungTVAdapter';
import LGTVAdapter from '../features/direct-tv-lab/services/LGTVAdapter';
import AndroidTVAdapter from '../features/direct-tv-lab/services/AndroidTVAdapter';

import TVConnectionPanel from '../features/direct-tv-lab/components/TVConnectionPanel';
import TVStateDisplay from '../features/direct-tv-lab/components/TVStateDisplay';
import TVRemoteControls from '../features/direct-tv-lab/components/TVRemoteControls';
import TVMediaLauncher from '../features/direct-tv-lab/components/TVMediaLauncher';
import TVAppLauncher from '../features/direct-tv-lab/components/TVAppLauncher';

const TV_OPTIONS = [
    { key: TV_TYPES.SAMSUNG, label: 'Samsung' },
    { key: TV_TYPES.LG, label: 'LG' },
    { key: TV_TYPES.ANDROID, label: 'Android TV' },
];

function createAdapter(tvType, config) {
    switch (tvType) {
        case TV_TYPES.SAMSUNG: return new SamsungTVAdapter(config);
        case TV_TYPES.LG: return new LGTVAdapter(config);
        case TV_TYPES.ANDROID: return new AndroidTVAdapter(config);
        default: return null;
    }
}

export default function TVLabPage() {
    const router = useRouter();
    const [tvType, setTvType] = useState(TV_TYPES.SAMSUNG);
    const [connected, setConnected] = useState(false);
    const [connecting, setConnecting] = useState(false);
    const [tvState, setTvState] = useState({});
    const [connectionLogs, setConnectionLogs] = useState([]);
    const [adminUrl, setAdminUrl] = useState(null);
    const adapterRef = useRef(null);

    useEffect(() => {
        getAdminUrl().then(url => {
            if (url) setAdminUrl(url);
        });
    }, []);

    const handleConnect = useCallback(async (config) => {
        // Disconnect existing
        if (adapterRef.current) {
            try { await adapterRef.current.disconnect(); } catch { }
        }

        setConnecting(true);
        setConnected(false);
        setTvState({});
        setConnectionLogs([]);

        // Inject admin URL + HA entity ID for LG proxy mode
        const adapterConfig = tvType === TV_TYPES.LG && adminUrl
            ? { ...config, adminUrl, haEntityId: 'media_player.guest_room_tv' }
            : config;

        const adapter = createAdapter(tvType, adapterConfig);
        if (!adapter) throw new Error('Unknown TV type');

        adapter.onStateChange((state) => {
            setTvState(prev => ({ ...prev, ...state }));
        });

        adapter.onConnect(() => {
            setConnected(true);
            setConnecting(false);
        });

        adapter.onDisconnect(() => {
            setConnected(false);
            setConnecting(false);
        });

        adapter.onError((err) => {
            console.log('[TVLab] Error:', err);
        });

        adapter.onLog((msg) => {
            setConnectionLogs(prev => [...prev, msg]);
        });

        adapterRef.current = adapter;

        try {
            await adapter.connect();
            setConnected(true);
            setConnecting(false);
        } catch (err) {
            setConnecting(false);
            adapterRef.current = null;
            throw err;
        }
    }, [tvType, adminUrl]);

    const handleDisconnect = useCallback(async () => {
        if (adapterRef.current) {
            try { await adapterRef.current.disconnect(); } catch { }
            adapterRef.current = null;
        }
        setConnected(false);
        setConnecting(false);
        setTvState({});
    }, []);

    const handleTvTypeChange = async (newType) => {
        if (newType === tvType) return;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        // Disconnect before switching
        await handleDisconnect();
        setTvType(newType);
    };

    return (
        <View style={styles.container}>
            <Stack.Screen options={{ headerShown: false }} />
            <LinearGradient colors={['#1a1b2e', '#16161e', '#000000']} style={StyleSheet.absoluteFill} />
            <StatusBar style="light" />
            <SafeAreaView style={{ flex: 1 }}>
                {/* Header */}
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                        <Ionicons name="arrow-back" size={24} color="white" />
                    </TouchableOpacity>
                    <Text style={styles.title}>TV Control Lab</Text>
                    <View style={{ width: 40 }} />
                </View>

                {/* TV Type Selector */}
                <View style={styles.segmentContainer}>
                    {TV_OPTIONS.map(opt => (
                        <TouchableOpacity
                            key={opt.key}
                            style={[styles.segment, tvType === opt.key && styles.segmentActive]}
                            onPress={() => handleTvTypeChange(opt.key)}
                        >
                            <Text style={[styles.segmentText, tvType === opt.key && styles.segmentTextActive]}>
                                {opt.label}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>

                {/* Content */}
                <ScrollView
                    style={styles.scrollView}
                    contentContainerStyle={styles.content}
                    keyboardShouldPersistTaps="handled"
                >
                    <TVConnectionPanel
                        tvType={tvType}
                        onConnect={handleConnect}
                        onDisconnect={handleDisconnect}
                        connected={connected}
                        connecting={connecting}
                        connectionLogs={connectionLogs}
                        adminUrl={adminUrl}
                        receivedClientKey={tvState.clientKey}
                    />

                    <TVStateDisplay
                        tvState={tvState}
                        connected={connected}
                        adapter={adapterRef.current}
                    />

                    <TVRemoteControls
                        adapter={adapterRef.current}
                        connected={connected}
                    />

                    <TVMediaLauncher
                        adapter={adapterRef.current}
                        connected={connected}
                    />

                    <TVAppLauncher
                        adapter={adapterRef.current}
                        connected={connected}
                        currentSource={tvState.source}
                    />

                    <View style={{ height: 40 }} />
                </ScrollView>
            </SafeAreaView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingVertical: 15,
    },
    backBtn: {
        padding: 5,
        backgroundColor: 'rgba(255,255,255,0.1)',
        borderRadius: 20,
    },
    title: {
        color: 'white',
        fontSize: 20,
        fontWeight: 'bold',
    },
    segmentContainer: {
        flexDirection: 'row',
        marginHorizontal: 20,
        marginBottom: 16,
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 12,
        padding: 3,
    },
    segment: {
        flex: 1,
        paddingVertical: 10,
        borderRadius: 10,
        alignItems: 'center',
    },
    segmentActive: {
        backgroundColor: '#8947ca',
    },
    segmentText: {
        color: Colors.textDim,
        fontSize: 14,
        fontWeight: '500',
    },
    segmentTextActive: {
        color: 'white',
        fontWeight: '600',
    },
    scrollView: {
        flex: 1,
    },
    content: {
        paddingHorizontal: 20,
    },
});
