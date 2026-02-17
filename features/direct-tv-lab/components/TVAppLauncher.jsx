import { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, FlatList, ActivityIndicator, ScrollView } from 'react-native';
import { AppWindow, RefreshCw, Monitor, Hdmi, Check } from 'lucide-react-native';
import { Colors } from '../../../constants/Colors';
import * as Haptics from 'expo-haptics';

export default function TVAppLauncher({ adapter, connected, currentSource }) {
    const [apps, setApps] = useState([]);
    const [inputs, setInputs] = useState([]);
    const [loading, setLoading] = useState(false);
    const [loadingInputs, setLoadingInputs] = useState(false);
    const [switchingInput, setSwitchingInput] = useState(null);

    const fetchApps = async () => {
        if (!adapter || !connected) return;
        setLoading(true);
        try {
            const list = await adapter.getApps();
            setApps(list || []);
        } catch { }
        setLoading(false);
    };

    const fetchInputs = async () => {
        if (!adapter || !connected || !adapter.getInputs) return;
        setLoadingInputs(true);
        try {
            const list = await adapter.getInputs();
            setInputs(list || []);
        } catch { }
        setLoadingInputs(false);
    };

    useEffect(() => {
        if (connected && adapter) {
            fetchApps();
            fetchInputs();
        } else {
            setApps([]);
            setInputs([]);
        }
    }, [connected]);

    if (!connected || !adapter) return null;

    const handleLaunch = (app) => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        adapter.launchApp(app.id).catch(() => { });
    };

    const handleSwitchInput = async (inputId) => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        setSwitchingInput(inputId);
        try {
            await adapter.switchInput(inputId);
        } catch { }
        setTimeout(() => setSwitchingInput(null), 1500);
    };

    const renderApp = ({ item }) => (
        <TouchableOpacity style={styles.appItem} onPress={() => handleLaunch(item)} activeOpacity={0.6}>
            <AppWindow size={16} color={Colors.textDim} />
            <Text style={styles.appName} numberOfLines={1}>{item.name}</Text>
        </TouchableOpacity>
    );

    return (
        <View style={styles.container}>
            {/* Sources / Inputs */}
            {(inputs.length > 0 || loadingInputs) && (
                <>
                    <View style={styles.header}>
                        <Text style={styles.title}>Sources</Text>
                        <TouchableOpacity onPress={fetchInputs} style={styles.refreshBtn}>
                            {loadingInputs ? (
                                <ActivityIndicator size="small" color={Colors.textDim} />
                            ) : (
                                <RefreshCw size={16} color={Colors.textDim} />
                            )}
                        </TouchableOpacity>
                    </View>
                    <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        style={styles.inputsScroll}
                        contentContainerStyle={styles.inputsRow}
                    >
                        {inputs.map((input) => {
                            const isActive = currentSource && (
                                currentSource === input.id ||
                                currentSource === input.label ||
                                currentSource.includes(input.id)
                            );
                            const isSwitching = switchingInput === input.id;
                            return (
                                <TouchableOpacity
                                    key={input.id}
                                    style={[styles.inputBtn, isActive && styles.inputBtnActive]}
                                    onPress={() => handleSwitchInput(input.id)}
                                    activeOpacity={0.6}
                                    disabled={isSwitching}
                                >
                                    {isSwitching ? (
                                        <ActivityIndicator size="small" color="white" />
                                    ) : isActive ? (
                                        <Check size={16} color="white" />
                                    ) : (
                                        <Monitor size={16} color={Colors.textDim} />
                                    )}
                                    <Text style={[styles.inputLabel, isActive && styles.inputLabelActive]} numberOfLines={1}>
                                        {input.label || input.id}
                                    </Text>
                                    {input.connected && (
                                        <View style={styles.connectedDot} />
                                    )}
                                </TouchableOpacity>
                            );
                        })}
                    </ScrollView>
                    <View style={styles.divider} />
                </>
            )}

            {/* Apps */}
            <View style={styles.header}>
                <Text style={styles.title}>Apps</Text>
                <TouchableOpacity onPress={fetchApps} style={styles.refreshBtn}>
                    {loading ? (
                        <ActivityIndicator size="small" color={Colors.textDim} />
                    ) : (
                        <RefreshCw size={16} color={Colors.textDim} />
                    )}
                </TouchableOpacity>
            </View>

            {apps.length === 0 && !loading ? (
                <Text style={styles.empty}>
                    No apps found. Tap refresh or check TV connection.
                </Text>
            ) : (
                <FlatList
                    data={apps}
                    keyExtractor={(item) => item.id}
                    renderItem={renderApp}
                    numColumns={2}
                    columnWrapperStyle={styles.row}
                    scrollEnabled={false}
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 16,
        padding: 16,
        marginBottom: 16,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 12,
    },
    title: {
        color: Colors.text,
        fontSize: 16,
        fontWeight: '600',
    },
    refreshBtn: {
        padding: 6,
    },
    row: {
        gap: 8,
        marginBottom: 8,
    },
    appItem: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        backgroundColor: 'rgba(255,255,255,0.08)',
        borderRadius: 10,
        paddingVertical: 10,
        paddingHorizontal: 12,
    },
    appName: {
        flex: 1,
        color: Colors.text,
        fontSize: 13,
    },
    empty: {
        color: Colors.textDim,
        fontSize: 13,
        textAlign: 'center',
        paddingVertical: 16,
    },
    inputsScroll: {
        marginBottom: 12,
    },
    inputsRow: {
        gap: 8,
    },
    inputBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: 'rgba(255,255,255,0.08)',
        borderRadius: 10,
        paddingVertical: 10,
        paddingHorizontal: 14,
        borderWidth: 1,
        borderColor: 'transparent',
    },
    inputBtnActive: {
        backgroundColor: 'rgba(137,71,202,0.25)',
        borderColor: 'rgba(137,71,202,0.5)',
    },
    inputLabel: {
        color: Colors.text,
        fontSize: 13,
        fontWeight: '500',
    },
    inputLabelActive: {
        color: 'white',
        fontWeight: '600',
    },
    connectedDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: '#4CAF50',
        marginLeft: 2,
    },
    divider: {
        height: 1,
        backgroundColor: 'rgba(255,255,255,0.05)',
        marginBottom: 12,
    },
});
