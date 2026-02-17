import { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Wifi, WifiOff, Link } from 'lucide-react-native';
import { Colors } from '../../../constants/Colors';
import { TV_TYPES, DEFAULT_PORTS } from '../constants';
import { loadConfig, saveConfig } from '../utils/tvLabStorage';
import * as Haptics from 'expo-haptics';

export default function TVConnectionPanel({ tvType, onConnect, onDisconnect, connected, connecting, connectionLogs = [], adminUrl, receivedClientKey }) {
    const [ip, setIp] = useState('');
    const [port, setPort] = useState(String(DEFAULT_PORTS[tvType] || ''));
    const [token, setToken] = useState('');
    const [bridgeUrl, setBridgeUrl] = useState('');
    const [error, setError] = useState(null);

    useEffect(() => {
        loadConfig(tvType).then(cfg => {
            if (cfg) {
                setIp(cfg.ip || '');
                setPort(String(cfg.port || DEFAULT_PORTS[tvType] || ''));
                setToken(cfg.token || cfg.clientKey || '');
                setBridgeUrl(cfg.bridgeUrl || '');
            }
        });
    }, [tvType]);

    // Update token when adapter receives a client key from TV
    useEffect(() => {
        if (receivedClientKey && tvType === TV_TYPES.LG) {
            setToken(receivedClientKey);
        }
    }, [receivedClientKey]);

    // Reset port when TV type changes
    useEffect(() => {
        setPort(String(DEFAULT_PORTS[tvType] || ''));
        setError(null);
    }, [tvType]);

    const handleConnect = async () => {
        setError(null);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

        const config = tvType === TV_TYPES.ANDROID
            ? { bridgeUrl: bridgeUrl.trim() }
            : { ip: ip.trim(), port: parseInt(port) || DEFAULT_PORTS[tvType], token: token || undefined, clientKey: token || undefined };

        if (tvType === TV_TYPES.ANDROID && !config.bridgeUrl) {
            setError('Bridge URL is required');
            return;
        }
        if (tvType !== TV_TYPES.ANDROID && !config.ip) {
            setError('IP address is required');
            return;
        }

        // Save config
        await saveConfig(tvType, config);

        try {
            await onConnect(config);
        } catch (err) {
            setError(err.message || 'Connection failed');
        }
    };

    const handleDisconnect = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onDisconnect();
    };

    const isAndroid = tvType === TV_TYPES.ANDROID;

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <View style={[styles.statusDot, connected ? styles.dotGreen : styles.dotRed]} />
                <Text style={styles.title}>Connection</Text>
            </View>

            {isAndroid ? (
                <View style={styles.field}>
                    <Text style={styles.label}>Bridge URL</Text>
                    <View style={styles.inputRow}>
                        <Link size={16} color={Colors.textDim} />
                        <TextInput
                            style={styles.input}
                            value={bridgeUrl}
                            onChangeText={setBridgeUrl}
                            placeholder="http://192.168.1.x:8080"
                            placeholderTextColor={Colors.textDim}
                            autoCapitalize="none"
                            autoCorrect={false}
                            editable={!connected}
                        />
                    </View>
                </View>
            ) : (
                <>
                    <View style={styles.row}>
                        <View style={[styles.field, { flex: 2 }]}>
                            <Text style={styles.label}>IP Address</Text>
                            <TextInput
                                style={styles.input}
                                value={ip}
                                onChangeText={setIp}
                                placeholder="192.168.1.x"
                                placeholderTextColor={Colors.textDim}
                                keyboardType="decimal-pad"
                                autoCapitalize="none"
                                editable={!connected}
                            />
                        </View>
                        <View style={[styles.field, { flex: 1, marginLeft: 12 }]}>
                            <Text style={styles.label}>Port</Text>
                            <TextInput
                                style={styles.input}
                                value={port}
                                onChangeText={setPort}
                                placeholder={String(DEFAULT_PORTS[tvType])}
                                placeholderTextColor={Colors.textDim}
                                keyboardType="number-pad"
                                editable={!connected}
                            />
                        </View>
                    </View>

                    {tvType === TV_TYPES.SAMSUNG && (
                        <View style={styles.field}>
                            <Text style={styles.label}>Token (auto-saved after first connect)</Text>
                            <TextInput
                                style={styles.input}
                                value={token}
                                onChangeText={setToken}
                                placeholder="Leave empty for first connect"
                                placeholderTextColor={Colors.textDim}
                                autoCapitalize="none"
                                editable={!connected}
                            />
                        </View>
                    )}

                    {tvType === TV_TYPES.LG && (
                        <>
                            <View style={styles.field}>
                                <Text style={styles.label}>Client Key (auto-saved after pairing)</Text>
                                <TextInput
                                    style={styles.input}
                                    value={token}
                                    onChangeText={setToken}
                                    placeholder="Leave empty — pair via TV prompt"
                                    placeholderTextColor={Colors.textDim}
                                    autoCapitalize="none"
                                    editable={!connected}
                                />
                            </View>
                            {adminUrl ? (
                                <View style={styles.proxyBadge}>
                                    <View style={[styles.statusDot, styles.dotGreen]} />
                                    <Text style={styles.proxyText}>Proxy mode via admin backend</Text>
                                </View>
                            ) : (
                                <Text style={styles.hint}>
                                    No admin backend configured. Direct connection may fail on newer LG TVs.
                                </Text>
                            )}
                        </>
                    )}
                </>
            )}

            {error && <Text style={styles.error}>{error}</Text>}

            <TouchableOpacity
                style={[styles.button, connected ? styles.disconnectBtn : styles.connectBtn]}
                onPress={connected ? handleDisconnect : handleConnect}
                disabled={connecting}
            >
                {connecting ? (
                    <ActivityIndicator size="small" color="white" />
                ) : connected ? (
                    <>
                        <WifiOff size={18} color="white" />
                        <Text style={styles.buttonText}>Disconnect</Text>
                    </>
                ) : (
                    <>
                        <Wifi size={18} color="white" />
                        <Text style={styles.buttonText}>
                            {tvType === TV_TYPES.LG && !token ? 'Pair & Connect' : 'Connect'}
                        </Text>
                    </>
                )}
            </TouchableOpacity>

            {connectionLogs.length > 0 && (
                <View style={styles.logContainer}>
                    {connectionLogs.map((log, i) => (
                        <Text key={i} style={styles.logText}>
                            {i === connectionLogs.length - 1 && connecting ? '▸ ' : '✓ '}{log}
                        </Text>
                    ))}
                </View>
            )}

            {isAndroid && !connecting && (
                <Text style={styles.hint}>
                    Requires an ADB bridge server running on your network.
                </Text>
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
        marginBottom: 16,
    },
    statusDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        marginRight: 8,
    },
    dotGreen: { backgroundColor: '#4CAF50' },
    dotRed: { backgroundColor: '#FF5252' },
    title: {
        color: Colors.text,
        fontSize: 16,
        fontWeight: '600',
    },
    row: {
        flexDirection: 'row',
    },
    field: {
        marginBottom: 12,
    },
    label: {
        color: Colors.textDim,
        fontSize: 12,
        marginBottom: 6,
    },
    inputRow: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.08)',
        borderRadius: 10,
        paddingHorizontal: 12,
    },
    input: {
        flex: 1,
        color: Colors.text,
        fontSize: 15,
        paddingVertical: 10,
        paddingHorizontal: 12,
        backgroundColor: 'rgba(255,255,255,0.08)',
        borderRadius: 10,
    },
    error: {
        color: Colors.error,
        fontSize: 13,
        marginBottom: 8,
    },
    button: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingVertical: 12,
        borderRadius: 12,
        marginTop: 4,
    },
    connectBtn: {
        backgroundColor: '#8947ca',
    },
    disconnectBtn: {
        backgroundColor: 'rgba(255,82,82,0.3)',
    },
    buttonText: {
        color: 'white',
        fontSize: 15,
        fontWeight: '600',
    },
    logContainer: {
        backgroundColor: 'rgba(0,0,0,0.3)',
        borderRadius: 10,
        padding: 12,
        marginTop: 10,
    },
    logText: {
        color: Colors.textDim,
        fontSize: 12,
        fontFamily: 'monospace',
        lineHeight: 18,
    },
    hint: {
        color: Colors.textDim,
        fontSize: 12,
        textAlign: 'center',
        marginTop: 10,
        fontStyle: 'italic',
    },
    proxyBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(76,175,80,0.1)',
        borderRadius: 8,
        paddingHorizontal: 10,
        paddingVertical: 6,
        marginBottom: 8,
    },
    proxyText: {
        color: '#4CAF50',
        fontSize: 12,
        fontWeight: '500',
    },
});
