import { View, Text, StyleSheet, Modal, TouchableOpacity, ScrollView } from 'react-native';
import { BlurView } from 'expo-blur';
import { X, Check } from 'lucide-react-native';
import { Colors } from '../../constants/Colors';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import * as Haptics from 'expo-haptics';

export default function LightControlModal({ visible, onClose, light, onUpdate }) {
    if (!light) return null;

    const [activeTab, setActiveTab] = useState('temp'); // 'temp' | 'color'

    // Helper: Check capabilities
    const supportsColor = light.stateObj.attributes.supported_color_modes?.some(m => ['rgb', 'rgbw', 'rgbww', 'hs', 'xy'].includes(m));
    const supportsTemp = light.stateObj.attributes.supported_color_modes?.some(m => ['color_temp'].includes(m)) || supportsColor; // RGB often simulates temp

    const handleColorSelect = (rgb) => {
        Haptics.selectionAsync();
        onUpdate(light.entity_id, { rgb_color: rgb });
    };

    const handleTempSelect = (kelvin) => {
        Haptics.selectionAsync();
        onUpdate(light.entity_id, { kelvin: kelvin });
    };

    // Common presets
    const colors = [
        { r: 255, g: 255, b: 255 }, // White
        { r: 255, g: 0, b: 0 },     // Red
        { r: 0, g: 255, b: 0 },     // Green
        { r: 0, g: 0, b: 255 },     // Blue
        { r: 255, g: 255, b: 0 },   // Yellow
        { r: 0, g: 255, b: 255 },   // Cyan
        { r: 255, g: 0, b: 255 },   // Magenta
        { r: 255, g: 165, b: 0 },   // Orange
        { r: 128, g: 0, b: 128 },   // Purple
        { r: 255, g: 192, b: 203 }, // Pink
    ];

    const temps = [
        { k: 2700, label: 'Warm', color: '#ffb74d' },
        { k: 3000, label: 'Soft', color: '#ffcc80' },
        { k: 4000, label: 'Neutral', color: '#fff' },
        { k: 6000, label: 'Cool', color: '#e0f7fa' },
    ];

    return (
        <Modal
            animationType="fade"
            transparent={true}
            visible={visible}
            onRequestClose={onClose}
        >
            <TouchableOpacity style={styles.backdrop} onPress={onClose} activeOpacity={1}>
                <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />

                <TouchableOpacity activeOpacity={1} style={styles.modalContent}>
                    <View style={styles.header}>
                        <Text style={styles.title}>{light.displayName}</Text>
                        <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                            <X size={24} color="#fff" />
                        </TouchableOpacity>
                    </View>

                    {/* Tabs */}
                    <View style={styles.tabs}>
                        {supportsTemp && (
                            <TouchableOpacity
                                style={[styles.tab, activeTab === 'temp' && styles.activeTab]}
                                onPress={() => setActiveTab('temp')}
                            >
                                <Text style={[styles.tabText, activeTab === 'temp' && styles.activeTabText]}>Temperature</Text>
                            </TouchableOpacity>
                        )}
                        {supportsColor && (
                            <TouchableOpacity
                                style={[styles.tab, activeTab === 'color' && styles.activeTab]}
                                onPress={() => setActiveTab('color')}
                            >
                                <Text style={[styles.tabText, activeTab === 'color' && styles.activeTabText]}>Color</Text>
                            </TouchableOpacity>
                        )}
                    </View>

                    <View style={styles.body}>
                        {activeTab === 'temp' && (
                            <View style={styles.tempGrid}>
                                {temps.map((t) => (
                                    <TouchableOpacity
                                        key={t.k}
                                        style={[styles.tempOption, { backgroundColor: t.color }]}
                                        onPress={() => handleTempSelect(t.k)}
                                    >
                                        <Text style={styles.tempText}>{t.label}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        )}

                        {activeTab === 'color' && (
                            <View style={styles.colorGrid}>
                                {colors.map((c, i) => (
                                    <TouchableOpacity
                                        key={i}
                                        style={[styles.colorOption, { backgroundColor: `rgb(${c.r},${c.g},${c.b})` }]}
                                        onPress={() => handleColorSelect([c.r, c.g, c.b])}
                                    />
                                ))}
                            </View>
                        )}
                    </View>

                </TouchableOpacity>
            </TouchableOpacity>
        </Modal>
    );
}

const styles = StyleSheet.create({
    backdrop: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.5)',
    },
    modalContent: {
        width: '85%',
        backgroundColor: '#1a1a1a',
        borderRadius: 24,
        padding: 20,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.5,
        shadowRadius: 20,
        elevation: 10,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20,
    },
    title: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#fff',
        flex: 1,
    },
    tabs: {
        flexDirection: 'row',
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 12,
        padding: 4,
        marginBottom: 20,
    },
    tab: {
        flex: 1,
        paddingVertical: 10,
        alignItems: 'center',
        borderRadius: 10,
    },
    activeTab: {
        backgroundColor: 'rgba(255,255,255,0.1)',
    },
    tabText: {
        color: Colors.textDim,
        fontSize: 16,
        fontWeight: '600',
    },
    activeTabText: {
        color: '#fff',
    },
    body: {
        minHeight: 150,
        justifyContent: 'center',
    },
    colorGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 15,
        justifyContent: 'center',
    },
    colorOption: {
        width: 48,
        height: 48,
        borderRadius: 24,
        borderWidth: 2,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    tempGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 12,
    },
    tempOption: {
        flex: 1,
        minWidth: '45%',
        height: 60,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 10,
    },
    tempText: {
        color: '#000',
        fontWeight: 'bold',
        fontSize: 16,
    }
});
