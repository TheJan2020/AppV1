import React, { useState } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, TextInput, ScrollView } from 'react-native';
import { BlurView } from 'expo-blur';
import { X, Check } from 'lucide-react-native';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';

const COLORS = [
    { id: 'black', value: '#000000', label: 'Black' },
    { id: 'white', value: '#FFFFFF', label: 'White' },
    { id: 'purple', value: '#8947ca', label: 'Purple' },
    { id: 'blue', value: '#3b82f6', label: 'Blue' },
    { id: 'red', value: '#ef4444', label: 'Red' },
    { id: 'green', value: '#22c55e', label: 'Green' },
    { id: 'orange', value: '#f97316', label: 'Orange' },
    { id: 'cyan', value: '#06b6d4', label: 'Cyan' },
    { id: 'teal', value: '#14b8a6', label: 'Teal' },
    { id: 'indigo', value: '#6366f1', label: 'Indigo' },
];



export default function OpacitySettingsModal({
    visible,
    onClose,
    currentOpacity,
    setOpacity,
    currentColor,
    setColor
}) {
    const [tempOpacity, setTempOpacity] = useState(currentOpacity || 0.4);
    const [tempColor, setTempColor] = useState(currentColor || '#000000');
    const [hexInput, setHexInput] = useState(currentColor || '#000000');


    // Sync when opening
    React.useEffect(() => {
        if (visible) {
            setTempOpacity(currentOpacity);
            setTempColor(currentColor);
            setHexInput(currentColor);
        }
    }, [visible]);

    const handleSave = () => {
        setOpacity(tempOpacity);
        setColor(tempColor);
        onClose();
    };

    const handleHexChange = (text) => {
        setHexInput(text);
        if (/^#[0-9A-F]{6}$/i.test(text)) {
            setTempColor(text);
        }
    };

    // Opacity Slider
    const sliderWidth = 250;
    const panOpacity = Gesture.Pan()
        .onUpdate((e) => {
            const newProgress = Math.min(Math.max(e.x / sliderWidth, 0), 1);
            runOnJS(setTempOpacity)(parseFloat(newProgress.toFixed(2)));
        });



    return (
        <Modal
            animationType="fade"
            transparent={true}
            visible={visible}
            onRequestClose={onClose}
        >
            <BlurView intensity={20} tint="dark" style={styles.blurContainer}>
                <View style={styles.modalContainer}>
                    <ScrollView contentContainerStyle={{ alignItems: 'center', paddingBottom: 20 }} showsVerticalScrollIndicator={false}>
                        <View style={styles.header}>
                            <Text style={styles.title}>Card Appearance</Text>
                            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                                <X size={20} color="#fff" />
                            </TouchableOpacity>
                        </View>

                        {/* Opacity Slider Section */}
                        <View style={styles.section}>
                            <View style={styles.sectionHeader}>
                                <Text style={styles.sectionTitle}>Opacity</Text>
                                <Text style={styles.valueText}>{Math.round(tempOpacity * 100)}%</Text>
                            </View>

                            <GestureDetector gesture={panOpacity}>
                                <View style={styles.sliderTrack}>
                                    <View style={[styles.sliderFill, { width: `${tempOpacity * 100}%` }]} />
                                    <View style={[styles.sliderKnob, { left: `${tempOpacity * 100}%` }]} />
                                </View>
                            </GestureDetector>
                            <Text style={styles.hint}>Drag to adjust transparency</Text>
                        </View>

                        {/* Color Picker Section */}
                        <View style={styles.section}>
                            <View style={styles.sectionHeader}>
                                <Text style={styles.sectionTitle}>Overlay Color</Text>
                                {/* Hex Input */}
                                <View style={styles.hexInputContainer}>
                                    <Text style={styles.hexLabel}>#</Text>
                                    <TextInput
                                        style={styles.hexInput}
                                        value={hexInput.replace('#', '')}
                                        onChangeText={(t) => handleHexChange(`#${t}`)}
                                        placeholder="RRGGBB"
                                        placeholderTextColor="#666"
                                        maxLength={6}
                                        autoCapitalize="characters"
                                    />
                                </View>
                            </View>

                            <View style={styles.colorsGrid}>
                                {COLORS.map((c) => (
                                    <TouchableOpacity
                                        key={c.id}
                                        style={[
                                            styles.colorSwatch,
                                            { backgroundColor: c.value },
                                            tempColor.toLowerCase() === c.value.toLowerCase() && styles.activeSwatch
                                        ]}
                                        onPress={() => {
                                            setTempColor(c.value);
                                            setHexInput(c.value);
                                        }}
                                    >
                                        {tempColor.toLowerCase() === c.value.toLowerCase() && <Check size={16} color={['white', 'yellow', 'cyan'].includes(c.id) ? '#000' : '#fff'} />}
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </View>

                        {/* Preview Box */}
                        <View style={styles.previewSection}>
                            <Text style={styles.previewTitle}>Preview</Text>
                            <View style={styles.previewCard}>
                                <View style={[styles.previewOverlay, { backgroundColor: tempColor, opacity: tempOpacity }]} />
                                <Text style={{ color: 'white', zIndex: 10, fontWeight: 'bold' }}>Room Name</Text>
                            </View>
                        </View>

                        <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
                            <Text style={styles.saveButtonText}>Apply Changes</Text>
                        </TouchableOpacity>
                    </ScrollView>

                </View>
            </BlurView>
        </Modal>
    );
}

const styles = StyleSheet.create({
    blurContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.5)'
    },
    modalContainer: {
        width: '85%',
        backgroundColor: '#1a1b2e',
        borderRadius: 20,
        padding: 20,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20,
    },
    title: {
        fontSize: 18,
        fontWeight: 'bold',
        color: 'white',
    },
    closeButton: {
        padding: 5,
        backgroundColor: 'rgba(255,255,255,0.1)',
        borderRadius: 12,
    },
    section: {
        marginBottom: 20,
    },
    sectionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 10,
    },
    sectionTitle: {
        color: '#ccc',
        fontSize: 14,
        fontWeight: '500',
    },
    valueText: {
        color: '#8947ca',
        fontWeight: 'bold',
    },
    // Custom Slider Styles
    sliderTrack: {
        height: 6,
        backgroundColor: 'rgba(255,255,255,0.1)',
        borderRadius: 3,
        position: 'relative',
        justifyContent: 'center',
    },
    sliderFill: {
        height: '100%',
        backgroundColor: '#8947ca',
        borderRadius: 3,
    },
    sliderKnob: {
        position: 'absolute',
        width: 16,
        height: 16,
        backgroundColor: 'white',
        borderRadius: 8,
        marginLeft: -10, // Center knob
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 3.84,
        elevation: 5,
    },
    hint: {
        color: 'rgba(255,255,255,0.4)',
        fontSize: 11,
        marginTop: 8,
        textAlign: 'center'
    },
    // Color Picker Styles
    colorsGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 12,
    },
    colorSwatch: {
        width: 36,
        height: 36,
        borderRadius: 18,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 2,
        borderColor: 'transparent',
    },
    activeSwatch: {
        borderColor: 'white',
        transform: [{ scale: 1.1 }]
    },
    // Hex Input
    hexInputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 8,
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    hexLabel: {
        color: '#8947ca',
        fontWeight: 'bold',
        marginRight: 4,
    },
    hexInput: {
        color: 'white',
        width: 60,
        fontSize: 14,
        fontWeight: 'bold',
        letterSpacing: 1,
    },
    // Preview Styles
    previewSection: {
        marginBottom: 20,
        alignItems: 'center'
    },
    previewTitle: {
        color: '#ccc',
        fontSize: 12,
        marginBottom: 8,
    },
    previewCard: {
        width: 120,
        height: 60,
        backgroundColor: '#333',
        borderRadius: 12,
        overflow: 'hidden',
        justifyContent: 'center',
        alignItems: 'center',
        position: 'relative'
    },
    previewOverlay: {
        ...StyleSheet.absoluteFillObject,
    },
    // Save Button
    saveButton: {
        backgroundColor: '#8947ca',
        paddingVertical: 12,
        borderRadius: 12,
        alignItems: 'center',
    },
    saveButtonText: {
        color: 'white',
        fontWeight: 'bold',
        fontSize: 16,
    }
});
