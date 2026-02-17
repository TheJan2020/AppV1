import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Power, Volume2, VolumeX, Tv, AppWindow, Gamepad2 } from 'lucide-react-native';
import { Colors } from '../../../constants/Colors';
import * as Haptics from 'expo-haptics';

export default function TVStateDisplay({ tvState, connected, adapter }) {
    if (!connected) return null;

    const { power, volume, muted, source, app, appName, inputSocketConnected, dpadReady, haFallback } = tvState || {};

    return (
        <View style={styles.container}>
            <Text style={styles.title}>TV State</Text>

            <View style={styles.grid}>
                <View style={styles.stateItem}>
                    <Power size={18} color={power ? '#4CAF50' : Colors.textDim} />
                    <Text style={styles.stateLabel}>Power</Text>
                    <Text style={[styles.stateValue, power && styles.stateActive]}>
                        {power ? 'On' : 'Off'}
                    </Text>
                </View>

                <View style={styles.stateItem}>
                    {muted ? (
                        <VolumeX size={18} color="#FF9800" />
                    ) : (
                        <Volume2 size={18} color={Colors.textDim} />
                    )}
                    <Text style={styles.stateLabel}>Volume</Text>
                    <Text style={styles.stateValue}>
                        {volume != null ? `${volume}${muted ? ' (Muted)' : ''}` : '—'}
                    </Text>
                </View>

                <View style={styles.stateItem}>
                    <Tv size={18} color={Colors.textDim} />
                    <Text style={styles.stateLabel}>Source</Text>
                    <Text style={styles.stateValue} numberOfLines={1}>
                        {source || '—'}
                    </Text>
                </View>

                <View style={styles.stateItem}>
                    <AppWindow size={18} color={Colors.textDim} />
                    <Text style={styles.stateLabel}>App</Text>
                    <Text style={styles.stateValue} numberOfLines={1}>
                        {appName || app || '—'}
                    </Text>
                    {(appName || app) && (
                        <Text style={styles.stateHint} numberOfLines={1}>
                            {app && appName && app !== appName ? app : ''}
                        </Text>
                    )}
                </View>

                {(inputSocketConnected !== undefined || dpadReady !== undefined) && (
                    <View style={[styles.stateItem, { minWidth: '95%' }]}>
                        <Gamepad2 size={18} color={dpadReady || inputSocketConnected ? '#4CAF50' : '#FF5252'} />
                        <Text style={styles.stateLabel}>D-Pad</Text>
                        <Text style={[styles.stateValue, (dpadReady || inputSocketConnected) ? styles.stateActive : { color: '#FF5252' }]}>
                            {inputSocketConnected ? 'Ready' : haFallback ? 'Ready (via HA)' : 'Not Connected'}
                        </Text>
                    </View>
                )}
            </View>
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
    title: {
        color: Colors.text,
        fontSize: 16,
        fontWeight: '600',
        marginBottom: 12,
    },
    grid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 10,
    },
    stateItem: {
        flex: 1,
        minWidth: '45%',
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 12,
        padding: 12,
        alignItems: 'center',
        gap: 6,
    },
    stateLabel: {
        color: Colors.textDim,
        fontSize: 11,
        textTransform: 'uppercase',
    },
    stateValue: {
        color: Colors.text,
        fontSize: 14,
        fontWeight: '600',
    },
    stateActive: {
        color: '#4CAF50',
    },
    stateHint: {
        color: Colors.textDim,
        fontSize: 9,
        opacity: 0.6,
    },
    repairBtn: {
        marginTop: 4,
        backgroundColor: 'rgba(137,71,202,0.3)',
        borderWidth: 1,
        borderColor: 'rgba(137,71,202,0.5)',
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 6,
    },
    repairBtnText: {
        color: '#b388ff',
        fontSize: 12,
        fontWeight: '600',
    },
});
