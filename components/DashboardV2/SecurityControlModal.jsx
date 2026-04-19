import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ActivityIndicator, Alert, ScrollView, Switch } from 'react-native';
import { BlurView } from 'expo-blur';
import { Shield, ShieldAlert, ShieldCheck, Moon, Briefcase, X, Lock, Delete, ChevronDown } from 'lucide-react-native';
import { Colors } from '../../constants/Colors';
import Animated, { FadeInUp, FadeOutDown } from 'react-native-reanimated';

/**
 * Default zone definitions — shown when the alarm panel has no sub-zone entities.
 * In a real setup you'd pass real zone entities via the `zones` prop.
 */
const DEFAULT_ZONES = [
    { id: 'main_entrance',   name: 'Main Entrance',   detail: 'Door closed',       armed: true  },
    { id: 'perimeter',       name: 'Perimeter',        detail: '4 sensors active',  armed: true  },
    { id: 'interior_motion', name: 'Interior Motion',  detail: 'Home mode',         armed: false },
    { id: 'cameras',         name: 'Cameras',          detail: '3 live feeds',      armed: true  },
    { id: 'guest_access',    name: 'Guest Access',     detail: 'No guests',         armed: false },
];

export default function SecurityControlModal({ visible, onClose, entity, onCallService, zones }) {
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

    // ── Zones list — uses passed `zones` prop or DEFAULT_ZONES ─────────────
    const resolvedZones = (zones && zones.length > 0) ? zones : DEFAULT_ZONES;

    const renderZoneRow = (zone) => (
        <View key={zone.id} style={styles.zoneRow}>
            {/* Status dot */}
            <View style={[styles.zoneDot, zone.armed ? styles.zoneDotArmed : styles.zoneDotDisarmed]} />

            {/* Name + detail */}
            <View style={styles.zoneInfo}>
                <Text style={styles.zoneName}>{zone.name}</Text>
                <Text style={styles.zoneDetail}>
                    {zone.armed ? 'Armed' : 'Disarmed'}
                    {zone.detail ? ` · ${zone.detail}` : ''}
                </Text>
            </View>

            {/* Toggle — visual only (real toggle needs per-zone service calls) */}
            <Switch
                value={zone.armed}
                onValueChange={() => {}}
                trackColor={{ false: 'rgba(255,255,255,0.1)', true: 'rgba(137,71,202,0.55)' }}
                thumbColor={zone.armed ? Colors.primary : 'rgba(255,255,255,0.4)'}
                ios_backgroundColor="rgba(255,255,255,0.1)"
            />
        </View>
    );

    return (
        <Modal
            animationType="slide"
            transparent={true}
            visible={visible}
            onRequestClose={onClose}
        >
            <View style={styles.container}>
                <TouchableOpacity style={styles.backdrop} onPress={onClose} />

                <Animated.View
                    entering={FadeInUp.springify()}
                    exiting={FadeOutDown}
                    style={styles.modalContent}
                >
                    {/* Drag handle */}
                    <View style={styles.dragHandle} />

                    {/* Header */}
                    <View style={styles.header}>
                        <Text style={styles.title}>Security Zones</Text>
                        <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                            <ChevronDown size={22} color="rgba(237,237,245,0.7)" />
                        </TouchableOpacity>
                    </View>

                    {!showKeypad ? (
                        <>
                            {/* Zones list */}
                            <ScrollView
                                style={styles.zonesList}
                                showsVerticalScrollIndicator={false}
                                contentContainerStyle={{ paddingBottom: 8 }}
                            >
                                {resolvedZones.map(renderZoneRow)}
                            </ScrollView>

                            {/* Arm / Disarm actions */}
                            <View style={styles.actions}>
                                {state === 'disarmed' ? (
                                    <>
                                        {supports(FEATURES.ARM_HOME) && (
                                            <TouchableOpacity
                                                style={[styles.actionBtn, styles.armBtn]}
                                                onPress={() => handleAction('alarm_arm_home')}
                                                disabled={loading}
                                            >
                                                <Shield size={18} color="#fff" />
                                                <Text style={styles.btnText}>Arm Home</Text>
                                            </TouchableOpacity>
                                        )}
                                        {supports(FEATURES.ARM_AWAY) && (
                                            <TouchableOpacity
                                                style={[styles.actionBtn, styles.armBtn]}
                                                onPress={() => handleAction('alarm_arm_away')}
                                                disabled={loading}
                                            >
                                                <Briefcase size={18} color="#fff" />
                                                <Text style={styles.btnText}>Arm Away</Text>
                                            </TouchableOpacity>
                                        )}
                                        {supports(FEATURES.ARM_NIGHT) && (
                                            <TouchableOpacity
                                                style={[styles.actionBtn, styles.armBtn]}
                                                onPress={() => handleAction('alarm_arm_night')}
                                                disabled={loading}
                                            >
                                                <Moon size={18} color="#fff" />
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
                                        <Lock size={18} color="#fff" />
                                        <Text style={styles.btnText}>Disarm All</Text>
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
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'flex-end',
        backgroundColor: 'rgba(0,0,0,0.55)',
    },
    backdrop: {
        ...StyleSheet.absoluteFillObject,
    },
    modalContent: {
        backgroundColor: '#16161F',
        borderTopLeftRadius: 28,
        borderTopRightRadius: 28,
        paddingHorizontal: 20,
        paddingBottom: 32,
        paddingTop: 12,
        borderTopWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -6 },
        shadowOpacity: 0.45,
        shadowRadius: 18,
        elevation: 16,
        minHeight: 420,
    },
    dragHandle: {
        width: 38,
        height: 4,
        borderRadius: 2,
        backgroundColor: 'rgba(255,255,255,0.18)',
        alignSelf: 'center',
        marginBottom: 16,
    },
    header: {
        width: '100%',
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 18,
    },
    title: {
        fontSize: 20,
        fontWeight: '700',
        color: '#ededf5',
        letterSpacing: -0.3,
    },
    closeBtn: {
        padding: 6,
        backgroundColor: 'rgba(255,255,255,0.07)',
        borderRadius: 14,
    },
    // ── Zone rows ─────────────────────────────────────────────────────────────
    zonesList: {
        marginBottom: 16,
    },
    zoneRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 14,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.05)',
        gap: 12,
    },
    zoneDot: {
        width: 10,
        height: 10,
        borderRadius: 5,
    },
    zoneDotArmed: {
        backgroundColor: '#26C6DA',
    },
    zoneDotDisarmed: {
        backgroundColor: 'rgba(237,237,245,0.15)',
    },
    zoneInfo: {
        flex: 1,
        gap: 2,
    },
    zoneName: {
        fontSize: 15,
        fontWeight: '600',
        color: '#ededf5',
    },
    zoneDetail: {
        fontSize: 12,
        color: 'rgba(237,237,245,0.4)',
        fontWeight: '400',
    },
    // ── Arm / Disarm actions ──────────────────────────────────────────────────
    actions: {
        gap: 10,
    },
    actionBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 14,
        borderRadius: 16,
        gap: 10,
    },
    armBtn: {
        backgroundColor: 'rgba(137, 71, 202, 0.18)',
        borderWidth: 1,
        borderColor: 'rgba(137,71,202,0.45)',
    },
    disarmBtn: {
        backgroundColor: 'rgba(76, 175, 80, 0.15)',
        borderWidth: 1,
        borderColor: 'rgba(76,175,80,0.45)',
    },
    btnText: {
        color: '#fff',
        fontSize: 15,
        fontWeight: '600',
    },
    loadingOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        alignItems: 'center',
        borderRadius: 28,
    },
    // ── Keypad ────────────────────────────────────────────────────────────────
    keypadContainer: {
        width: '100%',
        alignItems: 'center',
        gap: 20,
    },
    codeDisplay: {
        width: '100%',
        height: 60,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.3)',
        borderRadius: 12,
        marginBottom: 10,
    },
    codeText: {
        fontSize: 32,
        color: '#fff',
        letterSpacing: 8,
        fontWeight: 'bold',
    },
    keypadGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'center',
        gap: 15,
        width: 280,
    },
    keypadBtn: {
        width: 70,
        height: 70,
        borderRadius: 35,
        backgroundColor: 'rgba(255,255,255,0.1)',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.05)',
    },
    keypadActionBtn: {
        backgroundColor: 'rgba(255,255,255,0.05)',
    },
    keypadText: {
        fontSize: 24,
        fontWeight: '600',
        color: '#fff',
    },
    cancelLink: {
        padding: 10,
    },
    cancelText: {
        color: 'rgba(255,255,255,0.5)',
        fontSize: 16,
    },
});
