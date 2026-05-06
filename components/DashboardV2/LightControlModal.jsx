/**
 * LightControlModal
 * ─────────────────
 * Smart per-light color/dim control sheet.
 *
 * CCT lights  → Brightness slider + CCT gradient slider + preset chips
 * RGB lights  → Brightness slider + Hue spectrum slider + color swatch grid
 * No tabs — only the relevant controls are rendered.
 */
import React, { useState, useEffect, useRef } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity,
    PanResponder, Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { X, Power } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

// ── CCT helpers ───────────────────────────────────────────────────────────
const CCT_MIN = 2700;
const CCT_MAX = 6500;
const kelvinToPct = (k) => ((k - CCT_MIN) / (CCT_MAX - CCT_MIN)) * 100;
const pctToKelvin = (p) => Math.round(CCT_MIN + (p / 100) * (CCT_MAX - CCT_MIN));
const cctColor = (k) => {
    if (k < 3000) return '#FF9F43';
    if (k < 4000) return '#FFE082';
    if (k < 5500) return '#FFF8E1';
    return '#D6F5FF';
};

// ── RGB helpers ───────────────────────────────────────────────────────────
function hueToRgb(h) {
    const s = 1, l = 0.5;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;
    let r = 0, g = 0, b = 0;
    if (h < 60)       { r = c; g = x; b = 0; }
    else if (h < 120) { r = x; g = c; b = 0; }
    else if (h < 180) { r = 0; g = c; b = x; }
    else if (h < 240) { r = 0; g = x; b = c; }
    else if (h < 300) { r = x; g = 0; b = c; }
    else              { r = c; g = 0; b = x; }
    return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}
function rgbToHue([r, g, b]) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    if (max === min) return 0;
    let h;
    if (max === r)      h = ((g - b) / (max - min)) % 6;
    else if (max === g) h = (b - r) / (max - min) + 2;
    else                h = (r - g) / (max - min) + 4;
    return ((h * 60) + 360) % 360;
}

// ── Gradient slider ───────────────────────────────────────────────────────
const THUMB_SZ = 30;
const TRACK_H  = 34;

function GradientSlider({ value, max = 100, gradientColors, thumbColor, onChange, onRelease }) {
    const trackW    = useRef(0);
    const latestPct = useRef(value);
    const thumbAnim = useRef(new Animated.Value(0)).current;

    function pctToX(pct, w) {
        return (Math.max(0, Math.min(max, pct)) / max) * Math.max(0, w - THUMB_SZ);
    }

    useEffect(() => {
        latestPct.current = value;
        if (trackW.current > 0) thumbAnim.setValue(pctToX(value, trackW.current));
    }, [value]);

    const pan = useRef(PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder:  () => true,
        onPanResponderGrant: (e) => {
            if (!trackW.current) return;
            const raw = Math.max(0, Math.min(max, (e.nativeEvent.locationX / trackW.current) * max));
            latestPct.current = raw;
            thumbAnim.setValue(pctToX(raw, trackW.current));
            onChange?.(raw);
        },
        onPanResponderMove: (e) => {
            if (!trackW.current) return;
            const raw = Math.max(0, Math.min(max, (e.nativeEvent.locationX / trackW.current) * max));
            latestPct.current = raw;
            thumbAnim.setValue(pctToX(raw, trackW.current));
            onChange?.(raw);
        },
        onPanResponderRelease:   () => onRelease?.(Math.round(latestPct.current)),
        onPanResponderTerminate: () => onRelease?.(Math.round(latestPct.current)),
    })).current;

    return (
        <View
            style={styles.sliderWrap}
            onLayout={(e) => {
                trackW.current = e.nativeEvent.layout.width;
                thumbAnim.setValue(pctToX(latestPct.current, trackW.current));
            }}
            {...pan.panHandlers}
        >
            <LinearGradient
                colors={gradientColors}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={styles.sliderTrack}
            />
            <Animated.View
                pointerEvents="none"
                style={[styles.sliderThumb, { backgroundColor: thumbColor, transform: [{ translateX: thumbAnim }] }]}
            />
        </View>
    );
}

// ── Presets ───────────────────────────────────────────────────────────────
const CCT_PRESETS = [
    { k: 2700, label: 'Warm',     bg: '#ffb74d' },
    { k: 3000, label: 'Soft',     bg: '#ffcc80' },
    { k: 4000, label: 'Neutral',  bg: '#fff9e6' },
    { k: 5500, label: 'Daylight', bg: '#f0f8ff' },
    { k: 6500, label: 'Cool',     bg: '#ddeeff' },
];
const RGB_PRESETS = [
    [255, 255, 255], [255,  80,  80], [255, 140,   0],
    [255, 220,   0], [ 80, 210,  80], [  0, 190, 255],
    [ 80,  80, 255], [200,   0, 255], [255,  80, 180],
    [  0, 255, 180],
];

// ── Main modal ────────────────────────────────────────────────────────────
export default function LightControlModal({ visible, onClose, light, colorCapability, onUpdate }) {
    const attrs = light?.stateObj?.attributes || {};
    const isOn  = light?.stateObj?.state === 'on';

    const initBright = isOn ? Math.round(((attrs.brightness ?? 200) / 255) * 100) : 50;
    const initCCT    = attrs.color_temp_kelvin ? kelvinToPct(attrs.color_temp_kelvin) : 30;
    const initHue    = attrs.rgb_color ? (rgbToHue(attrs.rgb_color) / 360) * 100 : 0;

    const [brightPct, setBrightPct] = useState(initBright);
    const [cctPct,    setCctPct]    = useState(initCCT);
    const [huePct,    setHuePct]    = useState(initHue);

    useEffect(() => {
        if (!light) return;
        const a  = light.stateObj?.attributes || {};
        const on = light.stateObj?.state === 'on';
        setBrightPct(on ? Math.round(((a.brightness ?? 200) / 255) * 100) : 50);
        setCctPct(a.color_temp_kelvin ? kelvinToPct(a.color_temp_kelvin) : 30);
        setHuePct(a.rgb_color ? (rgbToHue(a.rgb_color) / 360) * 100 : 0);
    }, [light?.entity_id]);

    if (!visible || !light) return null;

    // Auto-detect capability from HA attributes if not provided
    const resolvedCapability = (() => {
        if (colorCapability === 'cct' || colorCapability === 'rgb') return colorCapability;
        const attrs2 = light.stateObj?.attributes || {};
        const modes  = attrs2.supported_color_modes || [];
        const hasRGB = modes.some(m => ['rgb', 'rgbw', 'rgbww', 'hs', 'xy'].includes(m));
        const hasCCT = modes.some(m => m === 'color_temp');
        if (hasRGB) return 'rgb';
        if (hasCCT) return 'cct';
        if (attrs2.color_temp_kelvin) return 'cct';
        if (attrs2.rgb_color) return 'rgb';
        return colorCapability || 'dimmable';
    })();

    const isCCT       = resolvedCapability === 'cct';
    const isRGB       = resolvedCapability === 'rgb';
    const kelvin      = pctToKelvin(cctPct);
    const [hr, hg, hb] = hueToRgb((huePct / 100) * 360);
    const hueColorStr = `rgb(${hr},${hg},${hb})`;

    return (
        <View style={styles.overlay}>
            <TouchableOpacity style={styles.backdrop} onPress={onClose} activeOpacity={1} />

            <View style={styles.sheet}>
                {/* Header */}
                <View style={styles.header}>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.lightName} numberOfLines={1}>{light.displayName}</Text>
                        <Text style={styles.capLabel}>
                            {isCCT ? '🌡  Color Temperature' : '🎨  RGB Color'}
                        </Text>
                    </View>
                    <TouchableOpacity
                        style={[styles.powerBtn, isOn && styles.powerBtnOn]}
                        onPress={() => {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                            onUpdate(light.entity_id, { toggle: true });
                        }}
                    >
                        <Power size={18} color={isOn ? '#fff' : 'rgba(255,255,255,0.45)'} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                        <X size={20} color="#fff" />
                    </TouchableOpacity>
                </View>

                {/* Brightness */}
                <View style={styles.section}>
                    <View style={styles.rowBetween}>
                        <Text style={styles.sectionLabel}>☀  Brightness</Text>
                        <Text style={styles.valueHint}>{Math.round(brightPct)}%</Text>
                    </View>
                    <GradientSlider
                        value={brightPct}
                        max={100}
                        gradientColors={['#1c1c3a', '#4a4a8a', '#ffffff']}
                        thumbColor="#ffffff"
                        onChange={setBrightPct}
                        onRelease={(v) => {
                            Haptics.selectionAsync();
                            onUpdate(light.entity_id, { brightness: Math.round((v / 100) * 255) });
                        }}
                    />
                </View>

                {/* ── CCT only ── */}
                {isCCT && (
                    <>
                        <View style={styles.section}>
                            <View style={styles.rowBetween}>
                                <Text style={styles.sectionLabel}>🌡  Color Temperature</Text>
                                <Text style={styles.valueHint}>{kelvin}K</Text>
                            </View>
                            <GradientSlider
                                value={cctPct}
                                max={100}
                                gradientColors={['#FF9F43', '#FFE082', '#FFF8E1', '#D6F5FF', '#A8CFFF']}
                                thumbColor={cctColor(kelvin)}
                                onChange={setCctPct}
                                onRelease={(v) => {
                                    Haptics.selectionAsync();
                                    onUpdate(light.entity_id, { kelvin: pctToKelvin(v) });
                                }}
                            />
                        </View>
                        <View style={styles.presetRow}>
                            {CCT_PRESETS.map((p) => (
                                <TouchableOpacity
                                    key={p.k}
                                    style={[styles.cctChip, { backgroundColor: p.bg }]}
                                    onPress={() => {
                                        Haptics.selectionAsync();
                                        setCctPct(kelvinToPct(p.k));
                                        onUpdate(light.entity_id, { kelvin: p.k });
                                    }}
                                >
                                    <Text style={styles.cctChipText}>{p.label}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </>
                )}

                {/* ── RGB only ── */}
                {isRGB && (
                    <>
                        <View style={styles.section}>
                            <View style={styles.rowBetween}>
                                <Text style={styles.sectionLabel}>🎨  Color</Text>
                                <View style={[styles.colorPreview, { backgroundColor: hueColorStr }]} />
                            </View>
                            <GradientSlider
                                value={huePct}
                                max={100}
                                gradientColors={[
                                    '#FF0000', '#FF8000', '#FFFF00',
                                    '#00FF00', '#00FFFF', '#0000FF',
                                    '#8000FF', '#FF0080', '#FF0000',
                                ]}
                                thumbColor={hueColorStr}
                                onChange={setHuePct}
                                onRelease={(v) => {
                                    Haptics.selectionAsync();
                                    const [r, g, b] = hueToRgb((v / 100) * 360);
                                    onUpdate(light.entity_id, { rgb_color: [r, g, b] });
                                }}
                            />
                        </View>
                        <View style={styles.swatchGrid}>
                            {RGB_PRESETS.map((c, i) => (
                                <TouchableOpacity
                                    key={i}
                                    style={[styles.swatch, { backgroundColor: `rgb(${c[0]},${c[1]},${c[2]})` }]}
                                    onPress={() => {
                                        Haptics.selectionAsync();
                                        setHuePct((rgbToHue(c) / 360) * 100);
                                        onUpdate(light.entity_id, { rgb_color: c });
                                    }}
                                />
                            ))}
                        </View>
                    </>
                )}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    overlay: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 200,
    },
    backdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.75)',
    },
    sheet: {
        width: '90%',
        backgroundColor: '#12122a',
        borderRadius: 28,
        padding: 22,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 14 },
        shadowOpacity: 0.65,
        shadowRadius: 28,
        elevation: 14,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 22,
        gap: 10,
    },
    lightName: {
        fontSize: 18,
        fontWeight: '700',
        color: '#fff',
    },
    capLabel: {
        fontSize: 12,
        color: 'rgba(255,255,255,0.4)',
        marginTop: 2,
    },
    powerBtn: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: 'rgba(255,255,255,0.08)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    powerBtnOn: {
        backgroundColor: '#7B2FBE',
    },
    closeBtn: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: 'rgba(255,255,255,0.08)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    section: {
        marginBottom: 14,
    },
    rowBetween: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 10,
    },
    sectionLabel: {
        fontSize: 13,
        fontWeight: '600',
        color: 'rgba(255,255,255,0.55)',
        letterSpacing: 0.3,
    },
    valueHint: {
        fontSize: 13,
        color: 'rgba(255,255,255,0.4)',
        fontWeight: '500',
    },
    colorPreview: {
        width: 22,
        height: 22,
        borderRadius: 11,
        borderWidth: 2,
        borderColor: 'rgba(255,255,255,0.2)',
    },
    // Slider
    sliderWrap: {
        height: TRACK_H,
        justifyContent: 'center',
    },
    sliderTrack: {
        height: TRACK_H,
        borderRadius: TRACK_H / 2,
    },
    sliderThumb: {
        position: 'absolute',
        width: THUMB_SZ,
        height: THUMB_SZ,
        borderRadius: THUMB_SZ / 2,
        top: (TRACK_H - THUMB_SZ) / 2,
        borderWidth: 3,
        borderColor: '#fff',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.5,
        shadowRadius: 5,
        elevation: 5,
    },
    // CCT presets
    presetRow: {
        flexDirection: 'row',
        gap: 7,
        marginBottom: 4,
    },
    cctChip: {
        flex: 1,
        paddingVertical: 10,
        borderRadius: 12,
        alignItems: 'center',
    },
    cctChipText: {
        fontSize: 10,
        fontWeight: '700',
        color: '#222',
    },
    // RGB swatches
    swatchGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 10,
        justifyContent: 'center',
        marginTop: 4,
    },
    swatch: {
        width: 44,
        height: 44,
        borderRadius: 22,
        borderWidth: 2.5,
        borderColor: 'rgba(255,255,255,0.12)',
    },
});
