import { View, Text, TouchableOpacity, StyleSheet, TextInput } from 'react-native';
import { useState } from 'react';
import {
    Power, Volume2, VolumeX, ChevronUp, ChevronDown, ChevronLeft, ChevronRight,
    Circle, CornerDownLeft, Home, Menu, ArrowUp, ArrowDown, Send, Type,
} from 'lucide-react-native';
import { Colors } from '../../../constants/Colors';
import * as Haptics from 'expo-haptics';

function RemoteButton({ icon: Icon, label, onPress, color = Colors.text, size = 22, style }) {
    const handlePress = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress?.();
    };

    return (
        <TouchableOpacity style={[styles.remoteBtn, style]} onPress={handlePress} activeOpacity={0.6}>
            <Icon size={size} color={color} />
            {label && <Text style={[styles.btnLabel, { color }]}>{label}</Text>}
        </TouchableOpacity>
    );
}

export default function TVRemoteControls({ adapter, connected }) {
    const [textInput, setTextInput] = useState('');
    const [lastError, setLastError] = useState(null);

    if (!connected || !adapter) return null;

    const cmd = (fn) => async () => {
        setLastError(null);
        try {
            await adapter[fn]();
        } catch (e) {
            setLastError(e.message || 'Command failed');
            setTimeout(() => setLastError(null), 3000);
        }
    };

    const sendTextInput = () => {
        if (!textInput.trim()) return;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        adapter.sendText(textInput.trim()).catch(() => { });
        setTextInput('');
    };

    return (
        <View style={styles.container}>
            <Text style={styles.title}>Remote</Text>

            {/* Power + Volume/Mute row */}
            <View style={styles.topRow}>
                <RemoteButton icon={Power} onPress={cmd('power')} color="#FF5252" label="Power" />
                <View style={styles.spacer} />
                <RemoteButton icon={VolumeX} onPress={cmd('mute')} label="Mute" />
            </View>

            {/* Main control area */}
            <View style={styles.mainArea}>
                {/* Volume column (left) */}
                <View style={styles.sideColumn}>
                    <RemoteButton icon={ArrowUp} onPress={cmd('volumeUp')} label="Vol+" size={18} />
                    <View style={styles.sideLabel}>
                        <Volume2 size={14} color={Colors.textDim} />
                    </View>
                    <RemoteButton icon={ArrowDown} onPress={cmd('volumeDown')} label="Vol-" size={18} />
                </View>

                {/* D-pad (center) */}
                <View style={styles.dpad}>
                    <RemoteButton icon={ChevronUp} onPress={cmd('up')} style={styles.dpadBtn} />
                    <View style={styles.dpadMiddle}>
                        <RemoteButton icon={ChevronLeft} onPress={cmd('left')} style={styles.dpadBtn} />
                        <TouchableOpacity
                            style={styles.okBtn}
                            onPress={async () => {
                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                                try {
                                    await adapter.ok();
                                } catch (e) {
                                    setLastError(e.message || 'Command failed');
                                    setTimeout(() => setLastError(null), 3000);
                                }
                            }}
                            activeOpacity={0.6}
                        >
                            <Text style={styles.okText}>OK</Text>
                        </TouchableOpacity>
                        <RemoteButton icon={ChevronRight} onPress={cmd('right')} style={styles.dpadBtn} />
                    </View>
                    <RemoteButton icon={ChevronDown} onPress={cmd('down')} style={styles.dpadBtn} />
                </View>

                {/* Channel column (right) */}
                <View style={styles.sideColumn}>
                    <RemoteButton icon={ArrowUp} onPress={cmd('channelUp')} label="CH+" size={18} />
                    <View style={styles.sideLabel}>
                        <Text style={styles.chLabel}>CH</Text>
                    </View>
                    <RemoteButton icon={ArrowDown} onPress={cmd('channelDown')} label="CH-" size={18} />
                </View>
            </View>

            {/* Bottom navigation row */}
            <View style={styles.navRow}>
                <RemoteButton icon={CornerDownLeft} onPress={cmd('back')} label="Back" size={20} />
                <RemoteButton icon={Home} onPress={cmd('home')} label="Home" size={20} />
                <RemoteButton icon={Menu} onPress={cmd('menu')} label="Menu" size={20} />
            </View>

            {lastError && (
                <Text style={styles.errorText}>{lastError}</Text>
            )}

            {/* Text input */}
            <View style={styles.textSection}>
                <View style={styles.textRow}>
                    <Type size={16} color={Colors.textDim} />
                    <TextInput
                        style={styles.textInput}
                        value={textInput}
                        onChangeText={setTextInput}
                        placeholder="Type text to TV..."
                        placeholderTextColor={Colors.textDim}
                        onSubmitEditing={sendTextInput}
                        returnKeyType="send"
                    />
                    <TouchableOpacity onPress={sendTextInput} style={styles.sendBtn}>
                        <Send size={16} color={textInput.trim() ? '#8947ca' : Colors.textDim} />
                    </TouchableOpacity>
                </View>
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
        marginBottom: 16,
    },
    topRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 20,
        paddingHorizontal: 20,
    },
    spacer: { flex: 1 },
    mainArea: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 20,
    },
    sideColumn: {
        alignItems: 'center',
        gap: 4,
        width: 56,
    },
    sideLabel: {
        paddingVertical: 4,
    },
    chLabel: {
        color: Colors.textDim,
        fontSize: 11,
        fontWeight: '600',
    },
    dpad: {
        alignItems: 'center',
        gap: 2,
    },
    dpadMiddle: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 2,
    },
    dpadBtn: {
        width: 54,
        height: 54,
        borderRadius: 12,
    },
    okBtn: {
        width: 60,
        height: 60,
        borderRadius: 30,
        backgroundColor: 'rgba(137,71,202,0.3)',
        borderWidth: 2,
        borderColor: 'rgba(137,71,202,0.5)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    okText: {
        color: 'white',
        fontSize: 16,
        fontWeight: 'bold',
    },
    navRow: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        marginBottom: 16,
    },
    remoteBtn: {
        width: 54,
        height: 54,
        borderRadius: 12,
        backgroundColor: 'rgba(255,255,255,0.08)',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
    },
    btnLabel: {
        fontSize: 9,
        opacity: 0.7,
    },
    textSection: {
        borderTopWidth: 1,
        borderTopColor: 'rgba(255,255,255,0.05)',
        paddingTop: 12,
    },
    textRow: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.08)',
        borderRadius: 10,
        paddingHorizontal: 12,
        gap: 8,
    },
    textInput: {
        flex: 1,
        color: Colors.text,
        fontSize: 14,
        paddingVertical: 10,
    },
    sendBtn: {
        padding: 6,
    },
    errorText: {
        color: '#FF5252',
        fontSize: 11,
        textAlign: 'center',
        marginBottom: 8,
    },
});
