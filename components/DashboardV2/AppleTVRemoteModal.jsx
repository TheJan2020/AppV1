import { useState } from 'react';
import { Modal, View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { BlurView } from 'expo-blur';
import { X, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Circle } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

export default function AppleTVRemoteModal({ visible, onClose, remoteEntityId, callService }) {
    const [lastCommand, setLastCommand] = useState('');

    const sendCommand = async (command) => {
        try {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            setLastCommand(command);

            console.log('[Apple TV Remote] Sending command:', command);
            console.log('[Apple TV Remote] Entity ID:', remoteEntityId);

            // Call Home Assistant remote.send_command service
            await callService('remote', 'send_command', {
                entity_id: remoteEntityId,
                command: command
            });

            console.log('[Apple TV Remote] Command sent successfully');

            // Clear last command after 500ms
            setTimeout(() => setLastCommand(''), 500);

        } catch (err) {
            console.error('[Apple TV Remote] Error:', err);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        }
    };

    return (
        <Modal
            visible={visible}
            transparent={true}
            animationType="fade"
            onRequestClose={onClose}
        >
            <BlurView intensity={30} style={styles.overlay}>
                <TouchableOpacity style={styles.backdrop} onPress={onClose} />

                <View style={styles.modal}>
                    {/* Header */}
                    <View style={styles.header}>
                        <Text style={styles.title}>Apple TV Remote</Text>
                        <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                            <X size={24} color="#fff" />
                        </TouchableOpacity>
                    </View>

                    {/* Remote Control */}
                    <View style={styles.remoteContainer}>
                        {/* D-Pad */}
                        <View style={styles.dpad}>
                            {/* Up Button */}
                            <TouchableOpacity
                                style={[styles.dpadBtn, styles.dpadUp, lastCommand === 'up' && styles.dpadBtnActive]}
                                onPress={() => sendCommand('up')}
                            >
                                <ChevronUp size={32} color="#fff" />
                            </TouchableOpacity>

                            {/* Middle Row: Left, Select, Right */}
                            <View style={styles.dpadMiddle}>
                                {/* Left Button */}
                                <TouchableOpacity
                                    style={[styles.dpadBtn, styles.dpadLeft, lastCommand === 'left' && styles.dpadBtnActive]}
                                    onPress={() => sendCommand('left')}
                                >
                                    <ChevronLeft size={32} color="#fff" />
                                </TouchableOpacity>

                                {/* Select Button */}
                                <TouchableOpacity
                                    style={[styles.selectBtn, lastCommand === 'select' && styles.selectBtnActive]}
                                    onPress={() => sendCommand('select')}
                                >
                                    <Circle size={20} color="#fff" fill="#fff" />
                                </TouchableOpacity>

                                {/* Right Button */}
                                <TouchableOpacity
                                    style={[styles.dpadBtn, styles.dpadRight, lastCommand === 'right' && styles.dpadBtnActive]}
                                    onPress={() => sendCommand('right')}
                                >
                                    <ChevronRight size={32} color="#fff" />
                                </TouchableOpacity>
                            </View>

                            {/* Down Button */}
                            <TouchableOpacity
                                style={[styles.dpadBtn, styles.dpadDown, lastCommand === 'down' && styles.dpadBtnActive]}
                                onPress={() => sendCommand('down')}
                            >
                                <ChevronDown size={32} color="#fff" />
                            </TouchableOpacity>
                        </View>

                        {/* Command Indicator */}
                        {lastCommand && (
                            <Text style={styles.commandText}>
                                {lastCommand.toUpperCase()}
                            </Text>
                        )}
                    </View>
                </View>
            </BlurView>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    backdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.6)',
    },
    modal: {
        width: '100%',
        maxWidth: 400,
        backgroundColor: '#1E1E24',
        borderRadius: 24,
        overflow: 'hidden',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 20,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.1)',
    },
    title: {
        color: '#fff',
        fontSize: 20,
        fontWeight: 'bold',
    },
    closeBtn: {
        padding: 4,
    },
    remoteContainer: {
        padding: 40,
        alignItems: 'center',
    },
    dpad: {
        width: 240,
        height: 240,
        alignItems: 'center',
        justifyContent: 'center',
    },
    dpadMiddle: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 0,
    },
    dpadBtn: {
        width: 80,
        height: 80,
        backgroundColor: 'rgba(255,255,255,0.1)',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 2,
        borderColor: 'rgba(255,255,255,0.2)',
    },
    dpadBtnActive: {
        backgroundColor: '#8947ca',
        borderColor: '#8947ca',
    },
    dpadUp: {
        borderTopLeftRadius: 16,
        borderTopRightRadius: 16,
        borderBottomWidth: 0,
    },
    dpadDown: {
        borderBottomLeftRadius: 16,
        borderBottomRightRadius: 16,
        borderTopWidth: 0,
    },
    dpadLeft: {
        borderTopLeftRadius: 0,
        borderBottomLeftRadius: 16,
        borderRightWidth: 0,
    },
    dpadRight: {
        borderTopRightRadius: 0,
        borderBottomRightRadius: 16,
        borderLeftWidth: 0,
    },
    selectBtn: {
        width: 80,
        height: 80,
        backgroundColor: 'rgba(255,255,255,0.15)',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 2,
        borderColor: 'rgba(255,255,255,0.2)',
        borderLeftWidth: 0,
        borderRightWidth: 0,
    },
    selectBtnActive: {
        backgroundColor: '#8947ca',
        borderColor: '#8947ca',
    },
    commandText: {
        color: '#8947ca',
        fontSize: 16,
        fontWeight: 'bold',
        marginTop: 20,
        letterSpacing: 2,
    },
});
