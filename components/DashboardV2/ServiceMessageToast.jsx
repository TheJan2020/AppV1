import { useEffect, useRef } from 'react';
import { Modal, View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Music2, X } from 'lucide-react-native';
import { CF } from '../../utils/typography';

const AUTO_DISMISS_MS = 6000;

/**
 * Bottom toast for Home Assistant service feedback (errors, hints).
 * @param {{ title: string, body: string } | null} message
 * @param {() => void} onDismiss
 */
export default function ServiceMessageToast({ message, onDismiss, Icon = Music2 }) {
    const insets = useSafeAreaInsets();
    const slide = useRef(new Animated.Value(80)).current;
    const opacity = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (!message) return undefined;

        slide.setValue(80);
        opacity.setValue(0);
        Animated.parallel([
            Animated.spring(slide, { toValue: 0, useNativeDriver: true, damping: 18, stiffness: 220 }),
            Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
        ]).start();

        const timer = setTimeout(onDismiss, AUTO_DISMISS_MS);
        return () => clearTimeout(timer);
    }, [message, onDismiss, slide, opacity]);

    if (!message) return null;

    return (
        <Modal visible transparent animationType="none" onRequestClose={onDismiss}>
            <View style={styles.backdrop} pointerEvents="box-none">
                <Animated.View
                    style={[
                        styles.wrap,
                        { paddingBottom: Math.max(insets.bottom, 16) + 8, opacity, transform: [{ translateY: slide }] },
                    ]}
                >
                    <TouchableOpacity
                        style={styles.card}
                        activeOpacity={0.92}
                        onPress={onDismiss}
                        accessibilityRole="alert"
                    >
                        <View style={styles.accent} />
                        <View style={styles.iconCircle}>
                            <Icon size={20} color="#c77dff" strokeWidth={2} />
                        </View>
                        <View style={styles.textCol}>
                            <Text style={styles.title}>{message.title}</Text>
                            <Text style={styles.body}>{message.body}</Text>
                        </View>
                        <TouchableOpacity
                            onPress={onDismiss}
                            hitSlop={12}
                            style={styles.closeBtn}
                            accessibilityLabel="Dismiss"
                        >
                            <X size={18} color="rgba(255,255,255,0.45)" />
                        </TouchableOpacity>
                    </TouchableOpacity>
                </Animated.View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    backdrop: {
        flex: 1,
        justifyContent: 'flex-end',
        backgroundColor: 'rgba(0,0,0,0.35)',
    },
    wrap: {
        paddingHorizontal: 16,
    },
    card: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        backgroundColor: '#12132a',
        borderRadius: 18,
        borderWidth: 1,
        borderColor: 'rgba(137, 71, 202, 0.35)',
        paddingVertical: 14,
        paddingRight: 12,
        paddingLeft: 0,
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.45,
        shadowRadius: 16,
        elevation: 12,
    },
    accent: {
        width: 4,
        alignSelf: 'stretch',
        backgroundColor: '#8947ca',
        borderTopLeftRadius: 18,
        borderBottomLeftRadius: 18,
        marginRight: 12,
    },
    iconCircle: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(137, 71, 202, 0.15)',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
        marginTop: 2,
    },
    textCol: {
        flex: 1,
        paddingRight: 8,
    },
    title: {
        color: '#fff',
        fontSize: 15,
        fontFamily: CF.semibold,
        marginBottom: 4,
    },
    body: {
        color: 'rgba(255,255,255,0.62)',
        fontSize: 13,
        fontFamily: CF.regular,
        lineHeight: 19,
    },
    closeBtn: {
        padding: 4,
        marginTop: 2,
    },
});
