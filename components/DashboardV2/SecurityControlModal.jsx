import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { BlurView } from 'expo-blur';
import { Shield, ShieldAlert, ShieldCheck, Moon, Briefcase, X, Lock, Delete } from 'lucide-react-native';
import { Colors } from '../../constants/Colors';
import Animated, { FadeInUp, FadeOutDown } from 'react-native-reanimated';

export default function SecurityControlModal({ visible, onClose, entity, onCallService }) {
    const [loading, setLoading] = useState(false);
    const [showKeypad, setShowKeypad] = useState(false);
    const [code, setCode] = useState('');
    const [pendingAction, setPendingAction] = useState(null);

    useEffect(() => {
        if (!visible) {
            // Reset state on close
            setShowKeypad(false);
            setCode('');
            setPendingAction(null);
            setLoading(false);
        }
    }, [visible]);

    if (!entity) return null;

    const state = entity.state;
    const supportedFeatures = entity.attributes?.supported_features || 0;
    const codeFormat = entity.attributes?.code_format;

    // Bitmask helpers
    const supports = (feature) => (supportedFeatures & feature) !== 0;

    // Feature bitmasks
    const FEATURES = {
        ARM_HOME: 1,
        ARM_AWAY: 2,
        ARM_NIGHT: 4,
        ARM_VACATION: 8,
        ARM_CUSTOM_BYPASS: 16,
        TRIGGER: 32
    };

    const getIcon = () => {
        if (state === 'disarmed') return <ShieldCheck size={64} color="#4CAF50" />;
        if (state === 'triggered') return <ShieldAlert size={64} color="#F44336" />;
        return <Shield size={64} color="#FF9800" />;
    };

    const getStatusText = () => {
        if (state === 'disarmed') return 'System Disarmed';
        if (state === 'triggered') return 'ALARM TRIGGERED';
        if (state === 'armed_home') return 'Armed (Home)';
        if (state === 'armed_away') return 'Armed (Away)';
        if (state === 'armed_night') return 'Armed (Night)';
        if (state === 'armed_vacation') return 'Armed (Vacation)';
        return state.replace(/_/g, ' ').toUpperCase();
    };

    const handleAction = (serviceName) => {
        if (codeFormat === 'number') {
            setPendingAction(serviceName);
            setShowKeypad(true);
        } else {
            performAction(serviceName);
        }
    };

    const performAction = async (serviceName, actionCode = null) => {
        setLoading(true);
        try {
            const data = { entity_id: entity.entity_id };
            if (actionCode) data.code = actionCode;

            await onCallService('alarm_control_panel', serviceName, data);

            setTimeout(() => {
                setLoading(false);
                onClose();
            }, 1000);
        } catch (e) {
            Alert.alert("Error", e.message);
            setLoading(false);
            setCode(''); // Clear code on error
        }
    };

    const handleDigitPress = (digit) => {
        if (code.length < 6) {
            setCode(prev => prev + digit);
        }
    };

    const handleBackspace = () => {
        setCode(prev => prev.slice(0, -1));
    };

    const submitCode = () => {
        if (pendingAction) {
            performAction(pendingAction, code);
        }
    };

    const renderKeypad = () => (
        <View style={styles.keypadContainer}>
            <View style={styles.codeDisplay}>
                <Text style={styles.codeText}>
                    {code.split('').map(() => '•').join(' ')}
                </Text>
            </View>
            <View style={styles.keypadGrid}>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
                    <TouchableOpacity
                        key={num}
                        style={styles.keypadBtn}
                        onPress={() => handleDigitPress(num.toString())}
                    >
                        <Text style={styles.keypadText}>{num}</Text>
                    </TouchableOpacity>
                ))}
                <TouchableOpacity style={[styles.keypadBtn, styles.keypadActionBtn]} onPress={handleBackspace}>
                    <Delete size={24} color="#fff" />
                </TouchableOpacity>
                <TouchableOpacity
                    style={styles.keypadBtn}
                    onPress={() => handleDigitPress('0')}
                >
                    <Text style={styles.keypadText}>0</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.keypadBtn, styles.keypadActionBtn]} onPress={submitCode}>
                    <Text style={[styles.keypadText, { fontSize: 18, color: Colors.primary }]}>GO</Text>
                </TouchableOpacity>
            </View>
            <TouchableOpacity
                onPress={() => setShowKeypad(false)}
                style={styles.cancelLink}
            >
                <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
        </View>
    );

    return (
        <Modal
            animationType="fade"
            transparent={true}
            visible={visible}
            onRequestClose={onClose}
        >
            <BlurView intensity={20} style={styles.container} tint="dark">
                <TouchableOpacity style={styles.backdrop} onPress={onClose} />

                <Animated.View
                    entering={FadeInUp.springify()}
                    exiting={FadeOutDown}
                    style={styles.modalContent}
                >
                    <View style={styles.header}>
                        <Text style={styles.title}>
                            {showKeypad ? 'Enter Code' : 'Security Control'}
                        </Text>
                        <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                            <X size={20} color="#fff" />
                        </TouchableOpacity>
                    </View>

                    {!showKeypad ? (
                        <>
                            <View style={styles.statusContainer}>
                                {getIcon()}
                                <Text style={styles.statusText}>{getStatusText()}</Text>
                            </View>

                            <View style={styles.actions}>
                                {state === 'disarmed' ? (
                                    <>
                                        {supports(FEATURES.ARM_HOME) && (
                                            <TouchableOpacity
                                                style={[styles.actionBtn, styles.armBtn]}
                                                onPress={() => handleAction('alarm_arm_home')}
                                                disabled={loading}
                                            >
                                                <Shield size={24} color="#fff" />
                                                <Text style={styles.btnText}>Arm Home</Text>
                                            </TouchableOpacity>
                                        )}
                                        {supports(FEATURES.ARM_AWAY) && (
                                            <TouchableOpacity
                                                style={[styles.actionBtn, styles.armBtn]}
                                                onPress={() => handleAction('alarm_arm_away')}
                                                disabled={loading}
                                            >
                                                <Briefcase size={24} color="#fff" />
                                                <Text style={styles.btnText}>Arm Away</Text>
                                            </TouchableOpacity>
                                        )}
                                        {supports(FEATURES.ARM_NIGHT) && (
                                            <TouchableOpacity
                                                style={[styles.actionBtn, styles.armBtn]}
                                                onPress={() => handleAction('alarm_arm_night')}
                                                disabled={loading}
                                            >
                                                <Moon size={24} color="#fff" />
                                                <Text style={styles.btnText}>Arm Night</Text>
                                            </TouchableOpacity>
                                        )}
                                    </>
                                ) : (
                                    <TouchableOpacity
                                        style={[styles.actionBtn, styles.disarmBtn]}
                                        onPress={() => handleAction('alarm_disarm')}
                                        disabled={loading}
                                    >
                                        <Lock size={24} color="#fff" />
                                        <Text style={styles.btnText}>Disarm</Text>
                                    </TouchableOpacity>
                                )}
                            </View>
                        </>
                    ) : (
                        renderKeypad()
                    )}

                    {loading && (
                        <View style={styles.loadingOverlay}>
                            <ActivityIndicator size="large" color="#fff" />
                        </View>
                    )}

                </Animated.View>
            </BlurView>
        </Modal>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.5)'
    },
    backdrop: {
        ...StyleSheet.absoluteFillObject,
    },
    modalContent: {
        width: '85%',
        backgroundColor: '#1E1E2C',
        borderRadius: 20,
        padding: 24,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.5,
        shadowRadius: 20,
        elevation: 10,
    },
    header: {
        width: '100%',
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20
    },
    title: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#fff'
    },
    closeBtn: {
        padding: 5,
        backgroundColor: 'rgba(255,255,255,0.1)',
        borderRadius: 15
    },
    statusContainer: {
        alignItems: 'center',
        marginBottom: 30,
        gap: 16
    },
    statusText: {
        fontSize: 22,
        fontWeight: 'bold',
        color: '#fff',
        letterSpacing: 0.5
    },
    actions: {
        width: '100%',
        gap: 12
    },
    actionBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        borderRadius: 16,
        gap: 12,
    },
    armBtn: {
        backgroundColor: 'rgba(137, 71, 202, 0.2)',
        borderWidth: 1,
        borderColor: Colors.primary
    },
    disarmBtn: {
        backgroundColor: 'rgba(76, 175, 80, 0.2)',
        borderWidth: 1,
        borderColor: '#4CAF50'
    },
    btnText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600'
    },
    loadingOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        alignItems: 'center',
        borderRadius: 20
    },
    // Keypad Styles
    keypadContainer: {
        width: '100%',
        alignItems: 'center',
        gap: 20
    },
    codeDisplay: {
        width: '100%',
        height: 60,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.3)',
        borderRadius: 12,
        marginBottom: 10
    },
    codeText: {
        fontSize: 32,
        color: '#fff',
        letterSpacing: 8,
        fontWeight: 'bold'
    },
    keypadGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'center',
        gap: 15,
        width: 280
    },
    keypadBtn: {
        width: 70,
        height: 70,
        borderRadius: 35,
        backgroundColor: 'rgba(255,255,255,0.1)',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.05)'
    },
    keypadActionBtn: {
        backgroundColor: 'rgba(255,255,255,0.05)',
    },
    keypadText: {
        fontSize: 24,
        fontWeight: '600',
        color: '#fff'
    },
    cancelLink: {
        padding: 10,
    },
    cancelText: {
        color: 'rgba(255,255,255,0.5)',
        fontSize: 16
    }
});
