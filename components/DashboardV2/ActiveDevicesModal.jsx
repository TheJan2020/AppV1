import { Modal, View, Text, StyleSheet, TouchableOpacity, SectionList, Pressable } from 'react-native';
import { BlurView } from 'expo-blur';
import { X, Power, RotateCcw } from 'lucide-react-native';
import { Colors } from '../../constants/Colors';
import { useState, useRef, useEffect } from 'react';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing, runOnJS, cancelAnimation } from 'react-native-reanimated';

export default function ActiveDevicesModal({ visible, title, devices, onClose, onToggle }) {
    // Map of entity_id -> { timeoutId }
    const [pendingActions, setPendingActions] = useState({});

    // We also need animated values for each row, but in a functional component with a list, 
    // it's cleaner to make a sub-component for the row or manage a map of shared values.
    // For simplicity with SectionList, let's create a RenderItem component.

    const handleToggle = (item) => {
        if (!onToggle) return;

        // If already pending, do nothing (or maybe cancel?)
        if (pendingActions[item.entity_id]) return;

        // Start 5s Timer
        const timeoutId = setTimeout(() => {
            // Execute Action
            const domain = item.entity_id.split('.')[0];
            const service = domain === 'light' ? 'turn_off' :
                domain === 'climate' ? 'turn_off' :
                    domain === 'switch' ? 'turn_off' :
                        'turn_off';

            onToggle(domain, service, { entity_id: item.entity_id });

            // Remove from pending
            setPendingActions(prev => {
                const next = { ...prev };
                delete next[item.entity_id];
                return next;
            });
        }, 5000);

        setPendingActions(prev => ({
            ...prev,
            [item.entity_id]: { timeoutId }
        }));
    };

    const handleUndo = (item) => {
        const pending = pendingActions[item.entity_id];
        if (pending) {
            clearTimeout(pending.timeoutId);
            setPendingActions(prev => {
                const next = { ...prev };
                delete next[item.entity_id];
                return next;
            });
        }
    };

    return (
        <Modal
            animationType="fade"
            transparent={true}
            visible={visible}
            onRequestClose={onClose}
        >
            <Pressable style={styles.backdrop} onPress={onClose}>
                <BlurView intensity={20} style={styles.absolute} />
            </Pressable>

            <View style={styles.centeredView}>
                <View style={styles.modalView}>
                    <View style={styles.header}>
                        <Text style={styles.title}>{title}</Text>
                        <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                            <X size={24} color="#fff" />
                        </TouchableOpacity>
                    </View>

                    {devices.length === 0 ? (
                        <View style={styles.emptyState}>
                            <Text style={styles.emptyText}>No active devices found</Text>
                        </View>
                    ) : (
                        <SectionList
                            sections={devices}
                            keyExtractor={item => item.entity_id}
                            renderSectionHeader={({ section: { title } }) => (
                                <View style={styles.sectionHeader}>
                                    <Text style={styles.sectionHeaderText}>{title}</Text>
                                </View>
                            )}
                            renderItem={({ item }) => (
                                <DeviceRow
                                    item={item}
                                    isPending={!!pendingActions[item.entity_id]}
                                    onToggle={handleToggle}
                                    onUndo={handleUndo}
                                />
                            )}
                            contentContainerStyle={styles.listContent}
                            stickySectionHeadersEnabled={false}
                        />
                    )}
                </View>
            </View>
        </Modal>
    );
}

// Sub-component for Row to handle its own animation state cheaply
const DeviceRow = ({ item, isPending, onToggle, onUndo }) => {
    const progress = useSharedValue(0);

    // Use a ref to track if we've already started the animation for this specific pending state
    // This prevents re-renders from resetting the shared value
    const hasStarted = useRef(false);

    useEffect(() => {
        if (isPending) {
            if (!hasStarted.current) {
                hasStarted.current = true;
                progress.value = 0;
                progress.value = withTiming(1, { duration: 5000, easing: Easing.linear });
            }
        } else {
            hasStarted.current = false;
            cancelAnimation(progress);
            progress.value = 0;
        }
    }, [isPending]);

    const animatedStyle = useAnimatedStyle(() => {
        return {
            width: `${progress.value * 100}%`,
            opacity: isPending ? 1 : 0
        };
    });

    return (
        <View style={styles.deviceRow}>
            {/* Progress Background */}
            <View style={[StyleSheet.absoluteFill, { overflow: 'hidden', borderRadius: 0 }]}>
                <Animated.View style={[styles.progressBar, animatedStyle]} />
            </View>

            <View style={{ zIndex: 1 }}>
                <Text style={styles.deviceName}>
                    {item.attributes.friendly_name || item.entity_id}
                </Text>
                <Text style={styles.deviceState}>
                    {isPending ? 'Turning off in 5s...' : `${item.state} ${item.attributes.temperature ? `(${item.attributes.temperature}°C)` : ''}`}
                </Text>
            </View>

            {isPending ? (
                <TouchableOpacity onPress={() => onUndo(item)} style={[styles.powerBtn, styles.undoBtn]}>
                    <RotateCcw size={20} color="#fff" />
                </TouchableOpacity>
            ) : (
                <TouchableOpacity onPress={() => onToggle(item)} style={styles.powerBtn}>
                    <Power size={20} color="#EF5350" />
                </TouchableOpacity>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    backdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.5)',
    },
    absolute: {
        ...StyleSheet.absoluteFillObject,
    },
    centeredView: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    modalView: {
        width: '100%',
        maxWidth: 400,
        backgroundColor: '#1E1E2C',
        borderRadius: 20,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        overflow: 'hidden',
        maxHeight: '60%',
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
        fontSize: 20,
        fontWeight: 'bold',
        color: '#fff',
    },
    sectionHeader: {
        paddingVertical: 8,
        paddingHorizontal: 10,
        backgroundColor: 'rgba(255,255,255,0.05)',
        marginTop: 10,
        borderRadius: 8
    },
    sectionHeaderText: {
        color: '#8947ca',
        fontWeight: 'bold',
        fontSize: 14,
        textTransform: 'uppercase'
    },
    listContent: {
        padding: 20,
        paddingTop: 10
    },
    deviceRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.05)',
        paddingLeft: 10,
        position: 'relative' // For absolute fill progress
    },
    deviceName: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '500',
    },
    deviceState: {
        color: '#aaa',
        fontSize: 14,
    },
    emptyState: {
        padding: 40,
        alignItems: 'center',
    },
    emptyText: {
        color: '#aaa',
        fontSize: 16,
    },
    powerBtn: {
        padding: 8
    },
    undoBtn: {
        backgroundColor: 'rgba(255,255,255,0.1)',
        borderRadius: 20,
    },
    progressBar: {
        position: 'absolute',
        left: 0,
        top: 0,
        bottom: 0,
        backgroundColor: 'rgba(137, 71, 202, 0.4)', // Purple tint (Colors.primary is #8947ca)
        // width handled by animation
    }
});
