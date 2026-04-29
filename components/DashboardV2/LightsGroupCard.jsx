/**
 * LightsGroupCard  (v2 – fully rewritten)
 * ────────────────────────────────────────
 * Collapsed  → header + adaptive dots row + master-brightness slider + chevron
 * Expanded   → 2-column grid of ExpandedLightCard with capability borders
 *
 * Figma-exact border colours:
 *   CCT   → linear-gradient(90deg, #FFE95F 0%, #FFFFFF 49%, #7FB2FF 100%)
 *   RGB   → linear-gradient(90deg, #C400FF 0%, #00ADFF 52%, #00FFE6 100%)
 *   On    → solid #7B2FBE  (normal / dimmable)
 *   Off   → solid #606060
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity,
    PanResponder, LayoutAnimation, Platform, UIManager, Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Lightbulb, Power, ChevronDown, ChevronUp } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { SvgUri } from 'react-native-svg';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

// ── Border gradient definitions (Figma exact) ─────────────────────────────
const BORDER = {
    cct: { colors: ['#FFE95F', '#FFFFFF', '#7FB2FF'], start: { x: 0, y: 0.5 }, end: { x: 1, y: 0.5 } },
    rgb: { colors: ['#C400FF', '#00ADFF', '#00FFE6'], start: { x: 0, y: 0.5 }, end: { x: 1, y: 0.5 } },
    on:  { colors: ['#7B2FBE', '#7B2FBE'],           start: { x: 0, y: 0 },   end: { x: 1, y: 0 } },
    off: { colors: ['#606060', '#606060'],            start: { x: 0, y: 0 },   end: { x: 1, y: 0 } },
};

function pickBorder(isOn, capability) {
    if (!isOn)                return BORDER.off;
    if (capability === 'cct') return BORDER.cct;
    if (capability === 'rgb') return BORDER.rgb;
    return BORDER.on;
}

// Derive fill + icon-bg colour from live light state
function resolveActiveColor(light, capability) {
    const attrs = light.stateObj?.attributes || {};
    // RGB → use the actual reported rgb_color
    if (capability === 'rgb' && attrs.rgb_color)
        return `rgb(${attrs.rgb_color.join(',')})`;
    // CCT → map kelvin to a warm-cool amber/white tint
    if (capability === 'cct') {
        const k = attrs.color_temp_kelvin;
        if (!k)        return '#C8860A';   // default warm amber
        if (k < 2800)  return '#B8650A';   // deep warm
        if (k < 3500)  return '#C8860A';   // amber  (matches Figma golden fill)
        if (k < 4500)  return '#D4A44C';   // warm white
        if (k < 5500)  return '#E8D5A0';   // neutral
        return '#D6F5FF';                   // cool
    }
    // Dimmable / normal → purple
    return '#7B2FBE';
}

// ── Adaptive dots row ─────────────────────────────────────────────────────
function DotsRow({ lights }) {
    const n       = lights.length;
    const dotSize = n > 20 ? 7 : n > 14 ? 9 : 13;
    const gap     = n > 20 ? 3 : n > 14 ? 4 : 7;

    return (
        <View style={styles.dotsRow}>
            {lights.map((l) => {
                const on = l.stateObj.state === 'on';
                return (
                    <View
                        key={l.entity_id}
                        style={{
                            width:  dotSize,
                            height: dotSize,
                            borderRadius: dotSize / 2,
                            marginHorizontal: gap / 2,
                            marginVertical: 2,
                            backgroundColor: on ? '#44C8CA' : 'rgba(68,200,202,0.23)',
                        }}
                    />
                );
            })}
        </View>
    );
}

// ── Unified horizontal slider (brightness + spectrum) ─────────────────────
/**
 * Uses Animated.Value for thumb + fill so position updates run on the native
 * thread — zero React re-renders during drag = buttery smooth 60 fps.
 *
 * Props:
 *   value          number   current raw value (synced from HA when not dragging)
 *   max            number   max raw value (255 for brightness, 100 for spectrum)
 *   minVal         number   min clamp (default 0; use 1 for brightness)
 *   onChange       fn(v)    called live during drag — update local state only
 *   onRelease      fn(v)    called ONCE on finger-up — fire the HA API call
 *   trackBg        element  static track background (rail or LinearGradient)
 *   showFill       bool     render an animated fill bar (brightness only)
 *   thumbColor     string   thumb background colour
 *   thumbBorder    bool     white border on thumb (spectrum sliders)
 *   showBubble     bool     floating % tooltip above thumb while dragging
 */
function HSlider({
    value, max = 255, minVal = 0,
    onChange, onRelease,
    trackBg, showFill = false,
    thumbColor = '#3A7BD5', thumbBorder = false, showBubble = false,
}) {
    // Animated values — setValue() bypasses React render cycle entirely
    const thumbAnim = useRef(new Animated.Value(0)).current;
    const fillAnim  = useRef(new Animated.Value(0)).current;

    const trackWRef   = useRef(0);
    const [trackW, setTrackW] = useState(0);   // only drives initial layout-dependent render

    const latestRaw   = useRef(value);
    const startPageX  = useRef(0);
    const startRaw    = useRef(value);
    const isDragging  = useRef(false);
    const [dragging, setDragging]     = useState(false);
    const [bubblePct, setBubblePct]   = useState(Math.round((value / max) * 100));

    // Keep callbacks fresh inside the stable PanResponder closure
    const maxRef      = useRef(max);
    const minValRef   = useRef(minVal);
    const onChangeRef  = useRef(onChange);
    const onReleaseRef = useRef(onRelease);
    maxRef.current     = max;
    minValRef.current  = minVal;
    onChangeRef.current  = onChange;
    onReleaseRef.current = onRelease;

    // Update animated positions without a React re-render
    const applyRaw = useCallback((raw, w) => {
        if (w <= 0) return;
        const thumbX = Math.max(0, Math.min(w - THUMB, (raw / max) * w - THUMB / 2));
        const fillW  = Math.max(0, (raw / max) * w);
        thumbAnim.setValue(thumbX);
        fillAnim.setValue(fillW);
    }, [max]);  // max is stable in practice

    // Sync from HA when finger is not on screen
    useEffect(() => {
        if (!isDragging.current) {
            latestRaw.current = value;
            applyRaw(value, trackWRef.current);
            setBubblePct(Math.round((value / max) * 100));
        }
    }, [value]);

    // After first layout, position thumb for the initial value
    useEffect(() => {
        if (trackW > 0) applyRaw(latestRaw.current, trackW);
    }, [trackW]);

    const pan = useRef(PanResponder.create({
        onStartShouldSetPanResponder:        () => true,
        onStartShouldSetPanResponderCapture: () => true,
        onMoveShouldSetPanResponder:         () => true,
        onMoveShouldSetPanResponderCapture:  () => true,
        onPanResponderTerminateRequest:      () => false,   // never surrender mid-drag

        onPanResponderGrant: (e) => {
            isDragging.current = true;
            setDragging(true);
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            startPageX.current = e.nativeEvent.pageX;
            startRaw.current   = latestRaw.current;   // drag from current value, no tap-jump
        },

        onPanResponderMove: (e) => {
            const w   = trackWRef.current;
            if (!w) return;
            const dx  = e.nativeEvent.pageX - startPageX.current;
            const raw = Math.max(
                minValRef.current,
                Math.min(maxRef.current, startRaw.current + (dx / w) * maxRef.current),
            );
            latestRaw.current = raw;

            // Direct Animated.Value mutations — NO setState, NO re-render
            const thumbX = Math.max(0, Math.min(w - THUMB, (raw / maxRef.current) * w - THUMB / 2));
            thumbAnim.setValue(thumbX);
            fillAnim.setValue(Math.max(0, (raw / maxRef.current) * w));

            setBubblePct(Math.round((raw / maxRef.current) * 100));  // only bubble text re-renders
            onChangeRef.current?.(raw);
        },

        // Fire HA call exactly once, when finger lifts
        onPanResponderRelease: () => {
            isDragging.current = false;
            setDragging(false);
            onReleaseRef.current?.(Math.round(latestRaw.current));
        },

        // Safety net — if iOS arbitrator steals the gesture, still fire the call
        onPanResponderTerminate: () => {
            isDragging.current = false;
            setDragging(false);
            onReleaseRef.current?.(Math.round(latestRaw.current));
        },
    })).current;

    const thumbSz  = dragging ? THUMB + 4 : THUMB;
    const thumbTop = (THUMB + 18 - thumbSz) / 2;
    const bubbleLeft = trackW > 0
        ? Math.max(0, Math.min(trackW - 36, (bubblePct / 100) * trackW - 18))
        : 0;

    return (
        <View
            style={styles.sliderWrap}
            onLayout={e => {
                const w = e.nativeEvent.layout.width;
                trackWRef.current = w;
                setTrackW(w);
            }}
            {...pan.panHandlers}
        >
            {/* Static track background — gradient or dark rail */}
            {trackBg}

            {/* Animated fill bar — brightness only */}
            {showFill && (
                <Animated.View style={[styles.sliderFill, { width: fillAnim }]} />
            )}

            {/* % tooltip above thumb */}
            {dragging && showBubble && (
                <View style={[styles.sliderBubble, { left: bubbleLeft }]}>
                    <Text style={styles.sliderBubbleText}>{bubblePct}%</Text>
                </View>
            )}

            {/* Animated thumb — moves without re-rendering the parent */}
            <Animated.View style={[
                styles.sliderThumb,
                {
                    width:           thumbSz,
                    height:          thumbSz,
                    borderRadius:    thumbSz / 2,
                    top:             thumbTop,
                    left:            thumbAnim,
                    backgroundColor: thumbColor,
                    borderWidth:     thumbBorder ? 2.5 : 0,
                    borderColor:     thumbBorder ? 'rgba(255,255,255,0.9)' : 'transparent',
                },
                dragging && { shadowOpacity: 1, shadowRadius: 16 },
            ]} />
        </View>
    );
}

// ── Convenience wrappers ──────────────────────────────────────────────────
function BrightnessSlider({ value, onChange, onRelease }) {
    return (
        <HSlider
            value={value} max={255} minVal={1}
            onChange={onChange} onRelease={onRelease}
            trackBg={<View style={styles.sliderRail} />}
            showFill
            thumbColor="#3A7BD5"
            showBubble
        />
    );
}

function SpectrumSlider({ value, colors, thumbColor, label, onChange, onRelease }) {
    return (
        <View style={styles.spectrumRow}>
            <Text style={styles.spectrumLabel}>{label}</Text>
            <View style={{ flex: 1 }}>
                <HSlider
                    value={value} max={100} minVal={0}
                    onChange={onChange} onRelease={onRelease}
                    trackBg={
                        <LinearGradient
                            colors={colors}
                            start={{ x: 0, y: 0.5 }}
                            end={{ x: 1, y: 0.5 }}
                            style={styles.spectrumTrack}
                        />
                    }
                    thumbColor={thumbColor}
                    thumbBorder
                />
            </View>
        </View>
    );
}

// ── Helpers: kelvin ↔ pct (2700K–6500K) ──────────────────────────────────
const CCT_MIN = 2700;
const CCT_MAX = 6500;
function kelvinToPct(k)   { return ((k - CCT_MIN) / (CCT_MAX - CCT_MIN)) * 100; }
function pctToKelvin(pct) { return Math.round(CCT_MIN + (pct / 100) * (CCT_MAX - CCT_MIN)); }

// ── Helper: hue (0–360) → rgb ─────────────────────────────────────────────
function hueToRgb(h) {
    const s = 1, l = 0.5;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs((h / 60) % 2 - 1));
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

function ExpandedLightCard({ light, mapping, adminUrl, onToggle, onBrightnessChange, onLongPress, masterBrightness }) {
    const isOn      = light.stateObj.state === 'on';
    const mappedCap = mapping?.colorCapability || 'normal';
    const attrs     = light.stateObj?.attributes || {};

    const effectiveCapability = (() => {
        if (mappedCap !== 'normal') return mappedCap;
        const modes = attrs.supported_color_modes || [];
        const hasRGBMode = modes.some(m => ['rgb', 'rgbw', 'rgbww', 'hs', 'xy'].includes(m));
        const hasCCTMode = modes.some(m => m === 'color_temp');
        if (hasRGBMode && hasCCTMode) return 'rgb';
        if (hasRGBMode) return 'rgb';
        if (hasCCTMode) return 'cct';
        if (attrs.color_mode === 'color_temp' || attrs.color_temp_kelvin) return 'cct';
        if (attrs.brightness !== undefined) return 'dimmable';
        return 'normal';
    })();

    const hasBrightness = attrs.brightness !== undefined || ['dimmable', 'cct', 'rgb'].includes(mappedCap);
    const haBrightness  = attrs.brightness ?? 0;
    const haPct = isOn && hasBrightness ? Math.max(1, Math.round((haBrightness / 255) * 100)) : 0;
    const masterPct = (masterBrightness != null && isOn && hasBrightness)
        ? Math.max(1, Math.round((masterBrightness / 255) * 100)) : null;

    const border    = pickBorder(isOn, effectiveCapability);
    const fillColor = isOn ? resolveActiveColor(light, effectiveCapability) : 'transparent';
    const iconBg    = isOn ? fillColor : 'rgba(255,255,255,0.06)';
    const iconColor = isOn ? '#fff'    : 'rgba(255,255,255,0.28)';
    const iconUrl   = mapping?.lightType?.icon_path && adminUrl
        ? `${adminUrl}${mapping.lightType.icon_path}` : null;

    const [livePct, setLivePct]           = useState(haPct);
    const [isDraggingCard, setIsDragging] = useState(false);

    const isDragging       = useRef(false);
    const cardW            = useRef(0);
    const startPageX       = useRef(0);
    const startPageY       = useRef(0);
    const startBrightness  = useRef(haBrightness);
    const latestBrightness = useRef(haBrightness);
    const isTap            = useRef(true);  // cleared once movement > threshold

    // Refs so closures never go stale
    const isOnRef          = useRef(isOn);
    const hasBrightRef     = useRef(hasBrightness);
    const onBrightRef      = useRef(onBrightnessChange);
    const onToggleRef      = useRef(onToggle);
    const entityRef        = useRef(light.entity_id);
    const stateRef         = useRef(light.stateObj.state);
    isOnRef.current        = isOn;
    hasBrightRef.current   = hasBrightness;
    onBrightRef.current    = onBrightnessChange;
    onToggleRef.current    = onToggle;
    entityRef.current      = light.entity_id;
    stateRef.current       = light.stateObj.state;

    // Sync livePct from HA when not dragging
    useEffect(() => {
        if (!isDragging.current) {
            setLivePct(haPct);
            latestBrightness.current = haBrightness;
        }
    }, [haPct, haBrightness]);

    if (!isDragging.current) startBrightness.current = haBrightness;

    const displayPct = masterPct ?? livePct;

    const cardPan = useRef(PanResponder.create({
        // Claim ALL touches within this card — we resolve tap vs swipe ourselves
        onStartShouldSetPanResponder:        () => true,
        onStartShouldSetPanResponderCapture: () => true,
        onMoveShouldSetPanResponder:         () => true,

        onPanResponderGrant: (e) => {
            isDragging.current       = true;
            isTap.current            = true;   // assume tap until proven otherwise
            startPageX.current       = e.nativeEvent.pageX;
            startPageY.current       = e.nativeEvent.pageY;
            startBrightness.current  = latestBrightness.current;
        },

        onPanResponderMove: (e) => {
            const dx = e.nativeEvent.pageX - startPageX.current;
            const dy = e.nativeEvent.pageY - startPageY.current;

            // Only treat as brightness drag once the finger clearly moved horizontally
            if (Math.abs(dx) > 6 && Math.abs(dx) > Math.abs(dy)) {
                isTap.current = false;
                if (!hasBrightRef.current || !isOnRef.current) return;
                if (!cardW.current) return;
                const v = Math.max(1, Math.min(255,
                    startBrightness.current + (dx / cardW.current) * 255));
                latestBrightness.current = v;
                setLivePct(Math.round((v / 255) * 100));
                if (!isDraggingCard) setIsDragging(true);
            }
        },

        onPanResponderRelease: (e) => {
            isDragging.current = false;
            setIsDragging(false);
            if (isTap.current) {
                // Was a tap — trigger toggle
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onToggleRef.current?.(entityRef.current, stateRef.current);
            } else if (hasBrightRef.current && isOnRef.current) {
                // Was a brightness swipe — send single HA call
                onBrightRef.current?.(entityRef.current, Math.round(latestBrightness.current));
            }
        },

        onPanResponderTerminate: () => {
            isDragging.current = false;
            setIsDragging(false);
        },
    })).current;

    return (
        <LinearGradient colors={border.colors} start={border.start} end={border.end} style={styles.cardBorder}>
            <View
                style={[styles.cardInner, !isOn && styles.cardInnerOff]}
                onLayout={e => { cardW.current = e.nativeEvent.layout.width; }}
                {...cardPan.panHandlers}
            >
                {/* Brightness fill */}
                {isOn && hasBrightness && displayPct > 0 && (
                    <View style={[styles.cardFill, {
                        width: `${displayPct}%`,
                        backgroundColor: fillColor,
                        opacity: isDraggingCard ? 0.55 : 0.32,
                    }]} />
                )}

                {/* Live % badge while swiping */}
                {isDraggingCard && (
                    <View style={styles.dragBadge} pointerEvents="none">
                        <Text style={styles.dragBadgeText}>{livePct}%</Text>
                    </View>
                )}

                {/* Card content */}
                <View style={styles.cardTouch}>
                    <View style={[styles.cardIcon, { backgroundColor: iconBg }]}>
                        {iconUrl
                            ? <SvgUri width={22} height={22} uri={iconUrl} fill={iconColor} stroke={iconColor} />
                            : <Power size={22} color={iconColor} />}
                    </View>
                    <View style={styles.cardText}>
                        <Text style={styles.cardName} numberOfLines={1}>{light.displayName}</Text>
                        <Text style={[styles.cardLabel, isOn && styles.cardLabelOn]}>
                            {!isOn ? 'Off' : hasBrightness && displayPct > 0 ? `On ${displayPct}%` : 'On'}
                        </Text>
                    </View>
                </View>
            </View>
        </LinearGradient>
    );
}

// ── Main component ────────────────────────────────────────────────────────
export default function LightsGroupCard({
    lights = [], lightMappings = [], adminUrl, roomName = '',
    onToggle, onBrightnessChange, onColorTempChange, onRgbChange, onLongPress,
}) {
    // Show master controls if the room is named "Master Controller"
    // OR if any light entity in the room has "master_controller" in its entity_id
    const isMasterController =
        roomName.toLowerCase().includes('master controller') ||
        lights.some(l => l.entity_id.toLowerCase().includes('master_controller'));
    const [expanded, setExpanded] = useState(false);

    // ── Determine which master controls to show ───────────────────────────
    const effectiveCap = (l) => {
        const m     = lightMappings.find(m => m.entity_id === l.entity_id);
        const cap   = m?.colorCapability || 'normal';
        const attrs = l.stateObj?.attributes || {};

        // 1. Admin mapping takes priority (if explicitly set to non-normal)
        if (cap !== 'normal') return cap;

        // 2. Use supported_color_modes from HA (most reliable)
        const modes = attrs.supported_color_modes || [];
        const hasRGBMode = modes.some(m => ['rgb', 'rgbw', 'rgbww', 'hs', 'xy'].includes(m));
        const hasCCTMode = modes.some(m => ['color_temp'].includes(m));
        if (hasRGBMode && hasCCTMode) return 'rgb'; // prefer rgb if it supports both
        if (hasRGBMode) return 'rgb';
        if (hasCCTMode) return 'cct';

        // 3. Fall back to live attribute detection
        if (attrs.color_mode === 'color_temp' || attrs.color_temp_kelvin) return 'cct';
        if (attrs.brightness !== undefined) return 'dimmable';
        return 'normal';
    };
    const hasCCT = lights.some(l => effectiveCap(l) === 'cct');
    const hasRGB = lights.some(l => effectiveCap(l) === 'rgb');

    // ── Avg brightness ────────────────────────────────────────────────────
    const avgBrightness = () => {
        const on = lights.filter(l => l.stateObj.state === 'on');
        if (!on.length) return 128;
        return on.reduce((s, l) => s + (l.stateObj.attributes?.brightness ?? 200), 0) / on.length;
    };
    const [masterBrightness, setMasterBrightness] = useState(avgBrightness);
    // Only non-null while the master slider is being actively dragged
    const [activeMasterBrightness, setActiveMasterBrightness] = useState(null);

    // Block HA re-sync for 2s after user drags any slider (prevents slider snapping back)
    const brightnessBlocked = useRef(false);
    const brightnessBlockTimer = useRef(null);
    const cctBlocked = useRef(false);
    const cctBlockTimer = useRef(null);
    const rgbBlocked = useRef(false);
    const rgbBlockTimer = useRef(null);

    const blockSync = (blockedRef, timerRef, durationMs = 2000) => {
        blockedRef.current = true;
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => { blockedRef.current = false; }, durationMs);
    };

    useEffect(() => {
        if (!brightnessBlocked.current) setMasterBrightness(avgBrightness());
    }, [lights]);

    // ── Avg CCT (pct 0-100 along 2700–6500K) ─────────────────────────────
    const avgCCTPct = () => {
        const cctLights = lights.filter(l => effectiveCap(l) === 'cct' && l.stateObj?.attributes?.color_temp_kelvin);
        if (!cctLights.length) return 30; // default: warm-ish
        const avgK = cctLights.reduce((s, l) => s + l.stateObj.attributes.color_temp_kelvin, 0) / cctLights.length;
        return kelvinToPct(avgK);
    };
    const [masterCCTPct, setMasterCCTPct] = useState(avgCCTPct);
    useEffect(() => {
        if (!cctBlocked.current) setMasterCCTPct(avgCCTPct());
    }, [lights]);

    // ── Avg RGB hue (0-360) ───────────────────────────────────────────────
    const avgRGBHuePct = () => {
        const rgbLights = lights.filter(l => effectiveCap(l) === 'rgb' && l.stateObj?.attributes?.rgb_color);
        if (!rgbLights.length) return 70; // default purple-ish
        // Average hue from rgb_color
        const avgR = rgbLights.reduce((s, l) => s + l.stateObj.attributes.rgb_color[0], 0) / rgbLights.length;
        const avgG = rgbLights.reduce((s, l) => s + l.stateObj.attributes.rgb_color[1], 0) / rgbLights.length;
        const avgB = rgbLights.reduce((s, l) => s + l.stateObj.attributes.rgb_color[2], 0) / rgbLights.length;
        // rgb → hue
        const r = avgR / 255, g = avgG / 255, b = avgB / 255;
        const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
        let h = 0;
        if (d > 0) {
            if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
            else if (max === g) h = ((b - r) / d + 2) / 6;
            else h = ((r - g) / d + 4) / 6;
        }
        return h * 100; // pct 0-100
    };
    const [masterRGBPct, setMasterRGBPct] = useState(avgRGBHuePct);
    useEffect(() => {
        if (!rgbBlocked.current) setMasterRGBPct(avgRGBHuePct());
    }, [lights]);

    // ── Handlers ──────────────────────────────────────────────────────────
    const onLightsCount = lights.filter(l => l.stateObj.state === 'on').length;

    const handleBrightnessRelease = useCallback((rounded) => {
        blockSync(brightnessBlocked, brightnessBlockTimer);
        lights.forEach(l => {
            if (l.stateObj.state !== 'on') return;
            const cap = effectiveCap(l);
            if (['dimmable', 'cct', 'rgb'].includes(cap))
                onBrightnessChange?.(l.entity_id, rounded);
        });
    }, [lights, lightMappings, onBrightnessChange]);

    const handleCCTRelease = useCallback((pct) => {
        blockSync(cctBlocked, cctBlockTimer);
        const kelvin = pctToKelvin(pct);
        lights.forEach(l => {
            if (l.stateObj.state !== 'on') return;
            if (effectiveCap(l) === 'cct')
                onColorTempChange?.(l.entity_id, kelvin);
        });
    }, [lights, lightMappings, onColorTempChange]);

    const handleRGBRelease = useCallback((pct) => {
        blockSync(rgbBlocked, rgbBlockTimer);
        const hue = (pct / 100) * 360;
        const rgb = hueToRgb(hue);
        lights.forEach(l => {
            if (l.stateObj.state !== 'on') return;
            if (effectiveCap(l) === 'rgb')
                onRgbChange?.(l.entity_id, rgb);
        });
    }, [lights, lightMappings, onRgbChange]);

    const toggle = () => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setExpanded(v => !v);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    };

    // Current thumb colours for spectrum sliders
    const cctThumbColor = (() => {
        const k = pctToKelvin(masterCCTPct);
        if (k < 3000) return '#FF9F43';
        if (k < 4000) return '#FFE082';
        if (k < 5500) return '#FFF8E1';
        return '#D6F5FF';
    })();
    const rgbThumbColor = (() => {
        const [r, g, b] = hueToRgb((masterRGBPct / 100) * 360);
        return `rgb(${r},${g},${b})`;
    })();

    // ── Find master controller entity ─────────────────────────────────────
    const masterLight = lights.find(l =>
        l.entity_id.toLowerCase().includes('master_controller') ||
        l.displayName?.toLowerCase().includes('master controller')
    );
    const masterIsOn = masterLight?.stateObj?.state === 'on';

    const handleMasterToggle = () => {
        if (!masterLight) return;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        onToggle?.(masterLight.entity_id, masterLight.stateObj.state);
    };

    return (
        <View style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity
                    style={[styles.bulbCircle, masterIsOn && styles.bulbCircleOn]}
                    onPress={handleMasterToggle}
                    activeOpacity={0.75}
                >
                    <Lightbulb size={26} color="#fff" fill={masterIsOn ? '#fff' : 'none'} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Lights</Text>
                <View style={styles.onBadge}>
                    <Text style={styles.onBadgeText}>{onLightsCount} On</Text>
                </View>
            </View>

            {/* Dots */}
            <DotsRow lights={lights} />

            {/* Master brightness slider — only in Master Controller rooms */}
            {isMasterController && (
                <View style={styles.sliderSection}>
                    <Text style={styles.spectrumLabel}>☀</Text>
                    <View style={styles.sliderWrapOuter}>
                        <BrightnessSlider
                            value={masterBrightness}
                            onChange={(v) => { setMasterBrightness(v); setActiveMasterBrightness(v); }}
                            onRelease={(v) => { setActiveMasterBrightness(null); handleBrightnessRelease(v); }}
                        />
                    </View>
                </View>
            )}

            {/* Master CCT slider — only in Master Controller rooms with CCT lights */}
            {isMasterController && hasCCT && (
                <SpectrumSlider
                    label="CCT"
                    value={masterCCTPct}
                    colors={['#FF9F43', '#FFE082', '#FFF8E1', '#D6F5FF', '#A8CFFF']}
                    thumbColor={cctThumbColor}
                    onChange={setMasterCCTPct}
                    onRelease={handleCCTRelease}
                />
            )}

            {/* Master RGB slider — only in Master Controller rooms with RGB lights */}
            {isMasterController && hasRGB && (
                <SpectrumSlider
                    label="RGB"
                    value={masterRGBPct}
                    colors={[
                        '#FF0000', '#FF8000', '#FFFF00',
                        '#00FF00', '#00FFFF', '#0000FF',
                        '#8000FF', '#FF0080', '#FF0000',
                    ]}
                    thumbColor={rgbThumbColor}
                    onChange={setMasterRGBPct}
                    onRelease={handleRGBRelease}
                />
            )}

            {/* Chevron */}
            <TouchableOpacity style={styles.chevron} onPress={toggle} activeOpacity={0.7}>
                {expanded
                    ? <ChevronUp   size={22} color="rgba(255,255,255,0.45)" />
                    : <ChevronDown size={22} color="rgba(255,255,255,0.45)" />}
            </TouchableOpacity>

            {/* Expanded grid — master controller is excluded (controlled by sliders above) */}
            {expanded && (
                <View style={styles.grid}>
                    {lights
                        .filter(l => !l.entity_id.toLowerCase().includes('master_controller') &&
                                     !l.displayName?.toLowerCase().includes('master controller'))
                        .map(l => (
                        <View key={l.entity_id} style={styles.cell}>
                            <ExpandedLightCard
                                light={l}
                                mapping={lightMappings.find(m => m.entity_id === l.entity_id)}
                                adminUrl={adminUrl}
                                onToggle={onToggle}
                                onBrightnessChange={onBrightnessChange}
                                onLongPress={onLongPress}
                                masterBrightness={activeMasterBrightness}
                            />
                        </View>
                    ))}
                </View>
            )}
        </View>
    );
}

// ── Styles ────────────────────────────────────────────────────────────────
const THUMB = 28;
const TRACK = 7;

const styles = StyleSheet.create({
    container: {
        backgroundColor: '#13132A',
        borderRadius: 20,
        paddingHorizontal: 18,
        paddingTop: 18,
        paddingBottom: 8,
        marginBottom: 12,
    },

    // Header
    header:      { flexDirection: 'row', alignItems: 'center', marginBottom: 18 },
    bulbCircle: {
        width: 52, height: 52, borderRadius: 26,
        backgroundColor: '#3A1A6E',
        alignItems: 'center', justifyContent: 'center',
        marginRight: 14,
        shadowColor: '#8947ca', shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.5, shadowRadius: 8, elevation: 4,
    },
    bulbCircleOn: {
        backgroundColor: '#7B2ECA',
        shadowOpacity: 0.9, shadowRadius: 14, elevation: 8,
    },
    headerTitle: { flex: 1, color: '#fff', fontSize: 20, fontWeight: '600' },
    onBadge: {
        backgroundColor: 'rgba(255,255,255,0.12)',
        paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20,
    },
    onBadgeText: { color: '#fff', fontSize: 13, fontWeight: '600' },

    // Dots
    dotsRow: {
        flexDirection: 'row', flexWrap: 'wrap',
        justifyContent: 'center', alignItems: 'center',
        marginBottom: 16,
    },

    // ── Unified HSlider container ──
    // Tall enough for comfortable touch (44 + extra), centres rail+thumb vertically
    sliderWrap: {
        height: THUMB + 18,       // ~46 px touch target
        justifyContent: 'center',
        marginBottom: 6,
        overflow: 'visible',      // lets the grow-effect thumb + bubble render outside bounds
    },
    sliderRail: {
        position: 'absolute', left: 0, right: 0,
        height: TRACK, borderRadius: TRACK / 2,
        backgroundColor: 'rgba(255,255,255,0.12)',
        top: (THUMB + 18 - TRACK) / 2,
    },
    sliderFill: {
        position: 'absolute', left: 0,
        height: TRACK, borderRadius: TRACK / 2,
        backgroundColor: 'rgba(255,255,255,0.40)',
        top: (THUMB + 18 - TRACK) / 2,
        // width is set by Animated.Value — do NOT set it here
    },
    // Thumb — pixel-positioned via Animated.Value, no marginLeft trick
    sliderThumb: {
        position: 'absolute',
        // top is set inline per-render (accounts for thumb growing on drag)
        shadowColor: '#3A7BD5', shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.8, shadowRadius: 10, elevation: 8,
    },
    // Tooltip bubble — absolute, sits above the thumb
    sliderBubble: {
        position: 'absolute',
        bottom: THUMB + 18,   // just above the sliderWrap top
        minWidth: 36,
        backgroundColor: '#3A7BD5',
        borderRadius: 8,
        paddingHorizontal: 7, paddingVertical: 3,
        alignItems: 'center',
        zIndex: 30,
    },
    sliderBubbleText: { color: '#fff', fontSize: 11, fontWeight: '700' },

    // Slider section row (sun icon + slider)
    sliderSection: {
        flexDirection: 'row', alignItems: 'center',
        marginBottom: 8, gap: 10,
    },
    sliderWrapOuter: { flex: 1 },

    // Spectrum rows
    spectrumRow: {
        flexDirection: 'row', alignItems: 'center',
        marginBottom: 12, gap: 10,
    },
    spectrumLabel: {
        color: 'rgba(255,255,255,0.5)',
        fontSize: 11, fontWeight: '600',
        width: 28, textAlign: 'center',
    },
    // Spectrum track (the LinearGradient pill)
    spectrumTrack: {
        position: 'absolute', left: 0, right: 0,
        height: TRACK, borderRadius: TRACK / 2,
        top: (THUMB + 18 - TRACK) / 2,
    },

    chevron: { alignItems: 'center', paddingVertical: 6 },

    // Expanded grid
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 10, marginBottom: 8 },
    cell: { width: '48.5%' },

    // Card
    cardBorder:   { borderRadius: 36, padding: 1.5 },
    cardInner: {
        borderRadius: 34.5, backgroundColor: '#12122B',
        overflow: 'hidden', minHeight: 76,
        justifyContent: 'center', position: 'relative',
    },
    cardInnerOff: { backgroundColor: '#0D0D1C' },
    cardFill:     { position: 'absolute', left: 0, top: 0, bottom: 0 },
    cardTouch: {
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 14, paddingVertical: 14, gap: 12,
    },
    cardIcon: {
        width: 44, height: 44, borderRadius: 22,
        alignItems: 'center', justifyContent: 'center',
    },
    cardText:    { flex: 1 },
    cardName:    { color: '#fff', fontSize: 13, fontWeight: '600', marginBottom: 4 },
    cardLabel:   { color: 'rgba(255,255,255,0.40)', fontSize: 12, fontWeight: '500' },
    cardLabelOn: { color: '#44C8CA' },

    // Drag badge (top-right corner while swiping card)
    dragBadge: {
        position: 'absolute', top: 6, right: 10,
        backgroundColor: 'rgba(0,0,0,0.60)',
        borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2,
        zIndex: 10,
    },
    dragBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
});
