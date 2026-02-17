import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { X, Check } from 'lucide-react-native';
import { Colors } from '../../constants/Colors';
import { useState, useEffect } from 'react';
import * as Haptics from 'expo-haptics';

export default function LightControlModal({ visible, onClose, light, colorCapability, onUpdate }) {
    const [activeTab, setActiveTab] = useState('temp'); // 'temp' | 'color'

    // Reset tab when a new light is selected
    useEffect(() => {
        if (light) setActiveTab('temp');
    }, [light?.entity_id]);

    if (!visible || !light) return null;

    // Determine capabilities from admin-assigned colorCapability
    const supportsColor = colorCapability === 'rgb';
    const supportsTemp = colorCapability === 'cct' || colorCapability === 'rgb';

    const handleColorSelect = (rgb) => {
        Haptics.selectionAsync();
        onUpdate(light.entity_id, { rgb_color: rgb });
    };

    const handleTempSelect = (kelvin) => {
        Haptics.selectionAsync();
        onUpdate(light.entity_id, { kelvin: kelvin });
    };

    const colors = [
        { r: 255, g: 255, b: 255 },
        { r: 255, g: 0, b: 0 },
        { r: 0, g: 255, b: 0 },
        { r: 0, g: 0, b: 255 },
        { r: 255, g: 255, b: 0 },
        { r: 0, g: 255, b: 255 },
        { r: 255, g: 0, b: 255 },
        { r: 255, g: 165, b: 0 },
        { r: 128, g: 0, b: 128 },
        { r: 255, g: 192, b: 203 },
    ];

    const temps = [
        { k: 2700, label: 'Warm', color: '#ffb74d' },
        { k: 3000, label: 'Soft', color: '#ffcc80' },
        { k: 4000, label: 'Neutral', color: '#fff' },
        { k: 6000, label: 'Cool', color: '#e0f7fa' },
    ];

    return (
        <View style={styles.overlay}>
            <TouchableOpacity style={styles.backdrop} onPress={onClose} activeOpacity={1} />

            <View style={styles.modalContent}>
                <View style={styles.header}>
                    <Text style={styles.title}>{light.displayName}</Text>
                    <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                        <X size={24} color="#fff" />
                    </TouchableOpacity>
                </View>

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
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    overlay: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 100,
    },
    backdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.7)',
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
