import { useState, useRef } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors } from '../constants/Colors';
import { Play, Square, ChevronLeft } from 'lucide-react-native';
import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';

export default function AnalysisMonitorScreen() {
    const [running, setRunning] = useState(false);
    const [logs, setLogs] = useState([]);
    const scrollViewRef = useRef(null);

    const startAnalysis = async () => {
        setLogs([]);
        setRunning(true);

        try {
            addLog('� Loading backend configuration...', 'info');
            const backendUrl = await SecureStore.getItemAsync('admin_url');

            addLog(`Backend URL: ${backendUrl || 'NOT FOUND'}`, 'info');

            if (!backendUrl) {
                addLog('❌ Backend URL not configured', 'error');
                setRunning(false);
                return;
            }

            const url = `${backendUrl}/api/preferences/analyze`;
            addLog(`📡 Calling: ${url}`, 'info');

            // Create abort controller for timeout (2 minutes)
            const controller = new AbortController();
            const timeoutId = setTimeout(() => {
                controller.abort();
                addLog('⚠️ Request timeout after 2 minutes', 'error');
            }, 120000);

            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                signal: controller.signal
            });

            clearTimeout(timeoutId);
            addLog(`Response status: ${response.status}`, 'info');

            const result = await response.json();
            addLog(`Response: ${JSON.stringify(result)}`, 'info');

            if (result.success) {
                addLog('✅ Analysis started!', 'success');
                addLog('⏱️ Running in background (30-60s)...', 'info');
                addLog('💡 Check "AI Learned Preferences" when done', 'info');

                setTimeout(() => {
                    addLog('✅ Complete - Check AI Preferences now!', 'success');
                    setRunning(false);
                }, 30000);
            } else {
                addLog(`❌ Failed: ${result.error}`, 'error');
                setRunning(false);
            }

        } catch (error) {
            addLog(`❌ ERROR: ${error.message}`, 'error');
            console.error(error);
            setRunning(false);
        }
    };

    const stopAnalysis = () => {
        setRunning(false);
        addLog('⏸️ Stopped', 'info');
    };

    const addLog = (message, type = 'log') => {
        const timestamp = new Date().toLocaleTimeString();
        setLogs(prev => [...prev, { message, type, timestamp }]);
        setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);
    };

    const getLogStyle = (type) => {
        const colors = {
            error: '#ff6b6b',
            success: '#51cf66',
            info: '#74c0fc',
            progress: '#ffd43b'
        };
        return { color: colors[type] || Colors.text };
    };

    return (
        <LinearGradient colors={[Colors.background, Colors.backgroundDim]} style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                    <ChevronLeft size={24} color={Colors.text} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>AI Analysis Monitor</Text>
                <View style={{ width: 24 }} />
            </View>

            <View style={styles.controlPanel}>
                <TouchableOpacity
                    style={[styles.button, running && styles.buttonStop]}
                    onPress={running ? stopAnalysis : startAnalysis}
                >
                    {running ? (
                        <>
                            <Square size={20} color={Colors.text} fill={Colors.text} />
                            <Text style={styles.buttonText}>Stop</Text>
                        </>
                    ) : (
                        <>
                            <Play size={20} color={Colors.text} fill={Colors.text} />
                            <Text style={styles.buttonText}>Start Analysis</Text>
                        </>
                    )}
                </TouchableOpacity>
            </View>

            <View style={styles.logContainer}>
                <View style={styles.logHeader}>
                    <Text style={styles.logHeaderText}>Output Log</Text>
                    {running && <ActivityIndicator size="small" color={Colors.primary} />}
                </View>

                <ScrollView ref={scrollViewRef} style={styles.logScroll} contentContainerStyle={styles.logContent}>
                    {logs.length === 0 ? (
                        <Text style={styles.logPlaceholder}>Press "Start Analysis" to begin...</Text>
                    ) : (
                        logs.map((log, index) => (
                            <View key={index} style={styles.logEntry}>
                                <Text style={styles.logTimestamp}>{log.timestamp}</Text>
                                <Text style={[styles.logMessage, getLogStyle(log.type)]}>
                                    {log.message}
                                </Text>
                            </View>
                        ))
                    )}
                </ScrollView>
            </View>
        </LinearGradient>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, paddingTop: 60 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, marginBottom: 20 },
    backButton: { padding: 8 },
    headerTitle: { fontSize: 20, fontWeight: '600', color: Colors.text },
    controlPanel: { paddingHorizontal: 20, marginBottom: 20 },
    button: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.primary, borderRadius: 12, paddingVertical: 16, gap: 8 },
    buttonStop: { backgroundColor: '#ff6b6b' },
    buttonText: { color: Colors.text, fontSize: 16, fontWeight: '600' },
    logContainer: { flex: 1, marginHorizontal: 20, backgroundColor: Colors.card + '80', borderRadius: 12, overflow: 'hidden' },
    logHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: Colors.cardBorder },
    logHeaderText: { color: Colors.text, fontSize: 14, fontWeight: '600' },
    logScroll: { flex: 1 },
    logContent: { padding: 16 },
    logPlaceholder: { color: Colors.textDim, fontSize: 14, textAlign: 'center', marginTop: 40 },
    logEntry: { marginBottom: 12 },
    logTimestamp: { color: Colors.textDim, fontSize: 10, marginBottom: 2 },
    logMessage: { fontSize: 13, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
});
