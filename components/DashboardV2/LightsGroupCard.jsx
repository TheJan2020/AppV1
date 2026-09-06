/**
 * LightsGroupCard  (v2 – fully rewritten)
 * ────────────────────────────────────────
 * Collapsed  → header + dots + brightness slider (if supported) + chevron
 * Expanded   → adaptive lighting (if configured) + CCT/RGB sliders + light grid
 *
 * Figma-exact border colours:
 *   CCT   → linear-gradient(90deg, #FFE95F 0%, #FFFFFF 49%, #7FB2FF 100%)
 *   RGB   → linear-gradient(90deg, #C400FF 0%, #00ADFF 52%, #00FFE6 100%)
 *   On    → solid #7B2FBE  (normal / dimmable)
 *   Off   → solid #606060
 */

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, Image,
    PanResponder, LayoutAnimation, Platform, UIManager, Animated,
    useWindowDimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ChevronDown, ChevronUp, Bookmark, BookmarkCheck, Zap } from 'lucide-react-native';
import { SvgXml } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import * as SecureStore from 'expo-secure-store';
import { getAdminUrl } from '../../utils/storage';
import { Heading, RoomDeviceStatus } from '../../utils/typography';
import LightControlModal from './LightControlModal';
import SmoothSlider, { SMOOTH_SLIDER_THUMB as THUMB, SMOOTH_SLIDER_TRACK as TRACK } from './SmoothSlider';
import RoomGroupIconButton, { ROOM_GROUP_ICON_GLYPH_SIZE } from './RoomGroupIconButton';
import {
    countActiveCountableLights,
    filterCountableLights,
    getLightEffectiveCapability,
    isMasterControllerLight,
    lightSupportsBrightness,
    lightSupportsCCT,
    lightSupportsRGB,
} from '../../utils/lightCapabilities';
import { readColorTempKelvin } from '../../utils/lightServicePayload';
import { getLightMapping, getLightTypes } from '../../utils/lightMappingsClient';
import LightTypeIcon from './LightTypeIcon';

function entityStateOn(allEntities, entityId) {
    if (!entityId || !Array.isArray(allEntities)) return false;
    return allEntities.find((e) => e.entity_id === entityId)?.state === 'on';
}

/** Lights header bulb — slightly bolder than source SVG (was 1.31). */
const LIGHTS_MASTER_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 27.5 27.5" fill="none">
  <path
    stroke="#fff"
    stroke-linecap="round"
    stroke-linejoin="round"
    stroke-width="1.9"
    d="M10.35,21.02h6.8M13.75.65v1.45M23.01,4.49l-1.03,1.03M26.84,13.75h-1.45M2.11,13.75H.65M5.52,5.52l-1.03-1.03M8.6,18.89c-1.02-1.02-1.71-2.31-1.99-3.72-.28-1.41-.14-2.87.41-4.2.55-1.33,1.48-2.47,2.68-3.26,1.2-.8,2.6-1.23,4.04-1.23s2.85.43,4.04,1.23c1.2.8,2.13,1.94,2.68,3.26.55,1.33.69,2.79.41,4.2-.28,1.41-.97,2.71-1.99,3.72l-.8.8c-.46.46-.82,1-1.06,1.59-.25.6-.37,1.23-.37,1.88v.77c0,.77-.31,1.51-.85,2.06-.55.55-1.29.85-2.06.85s-1.51-.31-2.06-.85c-.55-.55-.85-1.29-.85-2.06v-.77c0-1.3-.52-2.55-1.44-3.47l-.8-.8Z"
  />
</svg>
`.trim();
/** Adaptive lighting sun rays — matches assets/adaptive_lighting_new.svg */
const ADAPTIVE_LIGHTING_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20.2 20.2">
  <circle fill="#44c8ca" cx="10.1" cy="10.19" r="4"/>
  <rect fill="#44c8ca" x="15.8" y="9.18" width="4.39" height="2.02" rx="1.01" ry="1.01"/>
  <rect fill="#44c8ca" x="0" y="9.09" width="4.39" height="2.02" rx="1.01" ry="1.01"/>
  <rect fill="#44c8ca" x="7.85" y="16.99" width="4.39" height="2.02" rx="1.01" ry="1.01" transform="translate(28.05 7.95) rotate(90)"/>
  <rect fill="#44c8ca" x="7.95" y="1.18" width="4.39" height="2.02" rx="1.01" ry="1.01" transform="translate(12.34 -7.95) rotate(90)"/>
  <rect fill="#44c8ca" x="13.57" y="3.53" width="4.39" height="2.02" rx="1.01" ry="1.01" transform="translate(1.41 12.48) rotate(-45)"/>
  <rect fill="#44c8ca" x="2.33" y="14.64" width="4.39" height="2.02" rx="1.01" ry="1.01" transform="translate(-9.74 7.78) rotate(-45)"/>
  <rect fill="#44c8ca" x="13.46" y="14.71" width="4.39" height="2.02" rx="1.01" ry="1.01" transform="translate(15.7 -6.46) rotate(45)"/>
  <rect fill="#44c8ca" x="2.35" y="3.47" width="4.39" height="2.02" rx="1.01" ry="1.01" transform="translate(4.5 -1.9) rotate(45)"/>
</svg>
`.trim();
/** Expanded light row — icon circle + glyph sizes */
const LIGHT_CARD_ICON_BOX = 44;
const LIGHT_CARD_ICON_SIZE = 30;

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

/** Match RoomDetailView display names — DB `room_name` may use slug or Title Case */
function labelizeRoomSlug(name = '') {
    if (!name) return '';
    const t = name.trim();
    if (t.includes(' ')) return t;
    return t.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Try every variant when loading `/api/light-scenes` (avoids missing rows after renames / param drift) */
function collectRoomNameLookupKeys(roomName) {
    if (!roomName) return [];
    const raw = roomName.trim();
    const keys = [];
    const add = (k) => {
        const x = (k || '').trim();
        if (x && !keys.includes(x)) keys.push(x);
    };
    add(raw);
    add(labelizeRoomSlug(raw));
    add(raw.toLowerCase().replace(/\s+/g, '_'));
    return keys;
}

/** True if rgb arrays match within small tolerance (HA rounding). */
function rgbNearEqual(a, b) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== 3 || b.length !== 3) return false;
    return a.every((v, i) => Math.abs(v - b[i]) <= 3);
}

/**
 * True when live states match the bookmarked scene (no Restore needed).
 * Bookmark only stores lights that were ON; all other controllable lights should be OFF.
 */
function liveMatchesSavedScene(savedScene, lights, isMasterController, getCap) {
    if (!Array.isArray(savedScene) || !savedScene.length) return true;

    const controllable = lights.filter(l =>
        isMasterController ? true : !isMasterControllerLight(l)
    );
    const savedById = new Map(savedScene.map(e => [e.entity_id, e]));

    for (const entry of savedScene) {
        if (!controllable.some(l => l.entity_id === entry.entity_id)) return false;
    }

    for (const l of controllable) {
        const saved = savedById.get(l.entity_id);
        const state = l.stateObj?.state || 'off';
        const isOn = state === 'on';

        if (!saved) {
            if (isOn) return false;
            continue;
        }
        if (!isOn) return false;

        const attrs = l.stateObj?.attributes || {};
        const cap = getCap(l);

        if (saved.brightness != null) {
            const cur = attrs.brightness;
            if (cur == null) return false;
            if (Math.abs(cur - saved.brightness) > 5) return false;
        }
        if (saved.color_temp_kelvin != null && (cap === 'cct' || cap === 'rgb')) {
            const cur = attrs.color_temp_kelvin;
            if (cur == null) return false;
            if (Math.abs(cur - saved.color_temp_kelvin) > 80) return false;
        }
        if (saved.rgb_color && cap === 'rgb') {
            const cur = attrs.rgb_color;
            if (!rgbNearEqual(saved.rgb_color, cur)) return false;
        }
    }

    return true;
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

// ── Convenience wrappers ──────────────────────────────────────────────────
function BrightnessSlider({ value, onChange, onRelease, onDragStart, onDragEnd, disabled = false }) {
    return (
        <SmoothSlider
            value={value} max={255} minVal={1}
            onChange={onChange} onRelease={onRelease} onDragStart={onDragStart} onDragEnd={onDragEnd}
            trackBg={<View style={styles.sliderRail} />}
            showFill
            thumbColor="#3A7BD5"
            showBubble
            showPctLabel
            disabled={disabled}
        />
    );
}

function SpectrumSlider({ value, colors, thumbColor, onChange, onRelease, onDragStart, onDragEnd, compact = false }) {
    return (
        <View style={[styles.spectrumBlock, compact && styles.spectrumBlockTabletSplit]}>
            <SmoothSlider
                value={value} max={100} minVal={0}
                onChange={onChange} onRelease={onRelease} onDragStart={onDragStart} onDragEnd={onDragEnd}
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
    );
}

function AdaptiveLightingPill({ active, onPress }) {
    const label = active
        ? 'Tap to turn off adaptive lighting'
        : 'Tap to turn on adaptive lighting';

    return (
        <TouchableOpacity
            style={[
                styles.sunReflectivePill,
                active && styles.sunReflectivePillActive,
            ]}
            onPress={onPress}
            activeOpacity={0.75}
        >
            <SvgXml xml={ADAPTIVE_LIGHTING_SVG} width={22} height={22} />
            <Text
                style={[styles.sunReflectiveText, active && styles.sunReflectiveTextActive]}
                numberOfLines={2}
            >
                {label}
            </Text>
        </TouchableOpacity>
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

const RGB_COLOR_MODES = new Set(['rgb', 'rgbw', 'rgbww', 'hs', 'xy']);
const CCT_COLOR_MODES = new Set(['color_temp', 'white']);

function huePctFromAttrs(attrs = {}) {
    const rgb = attrs.rgb_color;
    if (Array.isArray(rgb) && rgb.length >= 3) {
        const [rv, gv, bv] = [rgb[0] / 255, rgb[1] / 255, rgb[2] / 255];
        const max = Math.max(rv, gv, bv);
        const min = Math.min(rv, gv, bv);
        const d = max - min;
        let h = 0;
        if (d > 0) {
            if (max === rv) h = ((gv - bv) / d + (gv < bv ? 6 : 0)) / 6;
            else if (max === gv) h = ((bv - rv) / d + 2) / 6;
            else h = ((rv - gv) / d + 4) / 6;
        }
        return h * 100;
    }
    const hs = attrs.hs_color;
    if (Array.isArray(hs) && typeof hs[0] === 'number') {
        return (((hs[0] % 360) + 360) % 360) / 360 * 100;
    }
    return null;
}

function cctPctFromAttrs(attrs = {}) {
    const k = readColorTempKelvin(attrs);
    return k != null ? kelvinToPct(k) : null;
}

function ExpandedLightCard({
    light, mapping, adminUrl, onToggle, onBrightnessChange, onLongPress, onColorTap, masterBrightness,
    onSliderDragStart, onSliderDragEnd,
}) {
    const isOn      = light.stateObj.state === 'on';
    const attrs     = light.stateObj?.attributes || {};

    const effectiveCapability = getLightEffectiveCapability(light, mapping);

    const supportsBrightness = lightSupportsBrightness(attrs, mapping);
    const hasBrightness = supportsBrightness && isOn;
    const haBrightness  = attrs.brightness ?? (isOn && supportsBrightness ? 255 : 0);
    const haPct = isOn && hasBrightness ? Math.max(1, Math.round((haBrightness / 255) * 100)) : 0;
    const masterPct = (masterBrightness != null && isOn && hasBrightness)
        ? Math.max(1, Math.round((masterBrightness / 255) * 100)) : null;

    const border    = pickBorder(isOn, effectiveCapability);
    const fillColor = isOn ? resolveActiveColor(light, effectiveCapability) : 'transparent';
    const iconBg    = isOn ? fillColor : 'rgba(255,255,255,0.06)';
    const iconColor = isOn ? '#000000' : '#ffffff';
    const typeName  = mapping?.lightType?.name;

    const [livePct, setLivePct]           = useState(haPct);
    const [isDraggingCard, setIsDragging] = useState(false);

    const isDragging       = useRef(false);
    const scrollLocked     = useRef(false);
    const cardW            = useRef(0);
    const startPageX       = useRef(0);
    const startPageY       = useRef(0);
    const startBrightness  = useRef(haBrightness);
    const latestBrightness = useRef(haBrightness);
    const isTap            = useRef(true);  // cleared once movement > threshold
    const longPressTimer   = useRef(null);  // fires color modal after 500ms hold
    const longPressTriggered = useRef(false); // prevent release from toggling after long press

    // Refs so closures never go stale
    const isOnRef          = useRef(isOn);
    const hasBrightRef     = useRef(hasBrightness);
    const onBrightRef      = useRef(onBrightnessChange);
    const onToggleRef      = useRef(onToggle);
    const onColorTapRef    = useRef(onColorTap);
    const onSliderDragStartRef = useRef(onSliderDragStart);
    const onSliderDragEndRef   = useRef(onSliderDragEnd);
    const entityRef        = useRef(light.entity_id);
    const stateRef         = useRef(light.stateObj.state);
    isOnRef.current        = isOn;
    hasBrightRef.current   = hasBrightness;
    onBrightRef.current    = onBrightnessChange;
    onToggleRef.current    = onToggle;
    onColorTapRef.current  = onColorTap;
    onSliderDragStartRef.current = onSliderDragStart;
    onSliderDragEndRef.current   = onSliderDragEnd;
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
            isDragging.current         = true;
            isTap.current              = true;
            longPressTriggered.current = false;
            startPageX.current         = e.nativeEvent.pageX;
            startPageY.current         = e.nativeEvent.pageY;
            startBrightness.current    = latestBrightness.current;

            // Start long-press timer — fires color modal after 500ms if finger hasn't moved
            if (longPressTimer.current) clearTimeout(longPressTimer.current);
            longPressTimer.current = setTimeout(() => {
                if (isTap.current) {
                    // Still holding without movement → open color modal
                    longPressTriggered.current = true;
                    isDragging.current = false;
                    setIsDragging(false);
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    const cap = effectiveCapability;
                    if ((cap === 'cct' || cap === 'rgb') && onColorTapRef.current) {
                        onColorTapRef.current(light, cap);
                    }
                }
            }, 500);
        },

        onPanResponderMove: (e) => {
            const dx = e.nativeEvent.pageX - startPageX.current;
            const dy = e.nativeEvent.pageY - startPageY.current;

            // Only treat as brightness drag once the finger clearly moved horizontally
            if (Math.abs(dx) > 6 && Math.abs(dx) > Math.abs(dy)) {
                isTap.current = false;
                if (!scrollLocked.current) {
                    scrollLocked.current = true;
                    onSliderDragStartRef.current?.();
                }
                // Cancel long-press since we're dragging
                if (longPressTimer.current) {
                    clearTimeout(longPressTimer.current);
                    longPressTimer.current = null;
                }
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
            if (scrollLocked.current) {
                scrollLocked.current = false;
                onSliderDragEndRef.current?.();
            }
            if (longPressTimer.current) {
                clearTimeout(longPressTimer.current);
                longPressTimer.current = null;
            }
            if (longPressTriggered.current) {
                // Long press already fired — do nothing on release
                return;
            }
            if (isTap.current) {
                // Quick tap → always toggle
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onToggleRef.current?.(entityRef.current, stateRef.current);
            } else if (hasBrightRef.current && isOnRef.current) {
                // Brightness drag ended — send single HA call
                onBrightRef.current?.(entityRef.current, Math.round(latestBrightness.current));
            }
        },

        onPanResponderTerminate: () => {
            isDragging.current = false;
            setIsDragging(false);
            if (scrollLocked.current) {
                scrollLocked.current = false;
                onSliderDragEndRef.current?.();
            }
            if (longPressTimer.current) {
                clearTimeout(longPressTimer.current);
                longPressTimer.current = null;
            }
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
                        <LightTypeIcon
                            typeName={typeName}
                            size={LIGHT_CARD_ICON_SIZE}
                            color={iconColor}
                        />
                    </View>
                    <View style={styles.cardText}>
                        <Text style={styles.cardName} numberOfLines={1}>{light.displayName}</Text>
                        <Text style={[styles.cardLabel, isOn && styles.cardLabelOn]}>
                            {!isOn ? 'OFF' : hasBrightness && displayPct > 0 ? `ON ${displayPct}%` : 'ON'}
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
    allEntities = [],
    adaptiveLighting = null,
    onAdaptiveToggle,
    onAdaptiveManualColor,
    onToggle, onBrightnessChange, onColorTempChange, onRgbChange, onLongPress, onTurnOn,
    onSliderDragStart, onSliderDragEnd,
    contentWidth,
    gridColumns = 2,
    variant = 'default',
}) {
    const isTabletSplit = variant === 'tabletSplit';
    // Show master controls if the room is named "Master Controller"
    // OR if any light entity in the room has "master_controller" in its entity_id
    const isMasterController =
        roomName.toLowerCase().includes('master controller') ||
        lights.some(l => l.entity_id.toLowerCase().includes('master_controller'));

    const [lightTypes, setLightTypes] = useState(() => getLightTypes());

    useEffect(() => {
        const cached = getLightTypes();
        if (cached.length) setLightTypes(cached);
    }, [lightMappings]);

    // ── effectiveCap must be declared first — used by all callbacks below ─
    const effectiveCap = useCallback((l) => {
        const m = getLightMapping(l.entity_id, lightMappings, lightTypes, l.displayName);
        return getLightEffectiveCapability(l, m);
    }, [lightMappings, lightTypes]);

    const mappingFor = useCallback(
        (l) => getLightMapping(l.entity_id, lightMappings, lightTypes, l.displayName),
        [lightMappings, lightTypes],
    );

    const supportsBrightnessFor = useCallback(
        (l) => lightSupportsBrightness(l.stateObj?.attributes || {}, mappingFor(l)),
        [mappingFor],
    );

    const [expanded, setExpanded] = useState(false);
    const [colorModalLight, setColorModalLight] = useState(null); // { light, colorCapability }

    const adaptiveMainId = adaptiveLighting?.main?.entity_id;
    const hasAdaptive = !!adaptiveMainId;

    /** When adaptive is on, manual CCT/RGB sliders are hidden. */
    const adaptiveLinked = useMemo(() => {
        if (!adaptiveMainId) return false;
        return entityStateOn(allEntities, adaptiveMainId);
    }, [allEntities, adaptiveMainId]);

    const { width: windowWidth } = useWindowDimensions();
    /** RoomDetailView `content` uses padding 20+20; this card uses paddingHorizontal 18+18 */
    const lightCellWidth = useMemo(() => {
        const colGap = 10;
        const cols = Math.max(1, gridColumns);
        const ww = windowWidth > 0 ? windowWidth : 375;
        const inner =
            contentWidth != null && contentWidth > 0
                ? contentWidth - 36
                : ww - 40 - 36;
        return Math.max(0, Math.floor((inner - colGap * (cols - 1)) / cols));
    }, [windowWidth, contentWidth, gridColumns]);

    // ── Light Scene (Save / Restore) ──────────────────────────────────────
    const sceneKey = `light_scene_${roomName.toLowerCase().replace(/\s+/g, '_')}`;
    const [savedScene, setSavedScene] = useState(null); // array of { entity_id, brightness, rgb_color, color_temp_kelvin }
    const [saveFeedback, setSaveFeedback] = useState(false); // brief "Saved!" flash

    // Load saved scene — local first (instant), then API with every room-name variant the DB might use
    useEffect(() => {
        let cancelled = false;
        setSavedScene(null);

        const applyScene = (arr) => {
            if (cancelled || !Array.isArray(arr) || !arr.length) return false;
            setSavedScene(arr);
            return true;
        };

        (async () => {
            try {
                const raw = await SecureStore.getItemAsync(sceneKey);
                if (!cancelled && raw) {
                    const parsed = JSON.parse(raw);
                    if (Array.isArray(parsed) && parsed.length) applyScene(parsed);
                }
            } catch (_) {}

            try {
                const adminUrl = await getAdminUrl();
                if (!adminUrl || cancelled) return;

                for (const key of collectRoomNameLookupKeys(roomName)) {
                    if (cancelled) return;
                    const res = await fetch(
                        `${adminUrl}/api/light-scenes?room=${encodeURIComponent(key)}`
                    );
                    if (!res.ok) continue;
                    const json = await res.json();
                    if (cancelled) return;
                    if (json.success && json.scene?.lights?.length) {
                        setSavedScene(json.scene.lights);
                        try {
                            await SecureStore.setItemAsync(sceneKey, JSON.stringify(json.scene.lights));
                        } catch (_) {}
                        return;
                    }
                }
            } catch (_) {}
        })();

        return () => { cancelled = true; };
    }, [sceneKey, roomName]);

    // Snapshot current ON lights and persist to backend + SecureStore
    const handleSaveScene = useCallback(async () => {
        const scene = lights
            .filter(l => isMasterController
                ? true  // master controller room: include the master entity itself
                : !isMasterControllerLight(l)
            )
            .filter(l => l.stateObj.state === 'on')
            .map(l => {
                const attrs = l.stateObj?.attributes || {};
                const cap = effectiveCap(l);
                const entry = { entity_id: l.entity_id };
                // brightness — for dimmable, cct, rgb lights
                if (attrs.brightness != null) entry.brightness = attrs.brightness;
                // rgb_color — only for rgb capable lights
                if (cap === 'rgb' && Array.isArray(attrs.rgb_color)) entry.rgb_color = attrs.rgb_color;
                // color_temp_kelvin — only for cct capable lights
                if ((cap === 'cct' || cap === 'rgb') && attrs.color_temp_kelvin != null)
                    entry.color_temp_kelvin = attrs.color_temp_kelvin;
                // on/off only lights: no extra fields, that's fine
                return entry;
            });

        // Never overwrite a saved scene with an empty capture — that hid Restore until re-saved
        if (!scene.length) {
            return;
        }

        const canonicalRoom = roomName.trim().toLowerCase().replace(/\s+/g, '_') || roomName.trim();

        // Always save locally first (instant, works offline)
        await SecureStore.setItemAsync(sceneKey, JSON.stringify(scene));
        setSavedScene(scene);
        setSaveFeedback(true);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setTimeout(() => setSaveFeedback(false), 2000);

        // Then persist to backend (fire-and-forget, don't block UI)
        try {
            const adminUrl = await getAdminUrl();
            if (adminUrl) {
                await fetch(`${adminUrl}/api/light-scenes`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ room_name: canonicalRoom, lights: scene }),
                });
            }
        } catch (err) {
            console.warn('[LightsGroupCard] Could not save scene to backend:', err);
        }
    }, [lights, sceneKey, roomName, effectiveCap, isMasterController]);

    // ── Auto-snapshot: captures state before group-off so we can restore it ──
    // This is separate from the manually saved scene (Bookmark button).
    // It is updated every time the user hits the master toggle to turn everything off.
    const autoSnapshot = useRef(null); // array of { entity_id, brightness, rgb_color, color_temp_kelvin }

    // Restore saved scene: turn on each light with its saved settings
    const handleRestoreScene = useCallback(() => {
        if (!savedScene?.length) return;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        savedScene.forEach(entry => {
            const { entity_id, brightness, rgb_color, color_temp_kelvin } = entry;

            // In regular rooms skip the master controller entity — it controls all lights at once
            if (!isMasterController && isMasterControllerLight({ entity_id })) return;

            const params = {};
            if (brightness != null)        params.brightness = brightness;
            if (rgb_color)                 params.rgb_color = rgb_color;
            if (color_temp_kelvin != null) params.color_temp_kelvin = color_temp_kelvin;

            if (onTurnOn) {
                // Preferred: single call that turns on + sets all params at once
                onTurnOn(entity_id, params);
            } else {
                // Fallback: turn on first, then set attributes after short delay
                const currentLight = lights.find(l => l.entity_id === entity_id);
                if (currentLight?.stateObj?.state !== 'on') {
                    onToggle?.(entity_id);
                }
                if (brightness != null)        setTimeout(() => onBrightnessChange?.(entity_id, brightness), 400);
                if (color_temp_kelvin != null)  setTimeout(() => onColorTempChange?.(entity_id, color_temp_kelvin), 400);
                if (rgb_color)                  setTimeout(() => onRgbChange?.(entity_id, rgb_color), 400);
            }
        });
    }, [savedScene, onTurnOn, onToggle, onBrightnessChange, onColorTempChange, onRgbChange, lights]);

    // ── Derived capability flags ──────────────────────────────────────────
    const controllableLights = useMemo(
        () => lights.filter((l) => !isMasterControllerLight(l)),
        [lights],
    );

    const masterControllerEntity = useMemo(() => {
        const fromRoom = lights.find((l) => isMasterControllerLight(l));
        if (fromRoom) return fromRoom;

        const roomSlug = roomName.trim().toLowerCase().replace(/\s+/g, '_');
        const fromAll = (allEntities || []).find((e) => {
            if (!e?.entity_id?.startsWith('light.')) return false;
            const id = e.entity_id.toLowerCase();
            const name = String(e.attributes?.friendly_name || '').toLowerCase();
            if (!id.includes('master_controller') && !name.includes('master controller')) return false;
            if (!roomSlug) return true;
            return id.includes(roomSlug) || name.includes(roomSlug.replace(/_/g, ' '));
        });
        if (!fromAll) return null;
        return {
            entity_id: fromAll.entity_id,
            displayName: fromAll.attributes?.friendly_name || fromAll.entity_id,
            stateObj: fromAll,
        };
    }, [lights, allEntities, roomName]);

    const hasCCT = controllableLights.some((l) => lightSupportsCCT(l, mappingFor(l)));
    const hasRGB = controllableLights.some((l) => lightSupportsRGB(l, mappingFor(l)));

    /** Show brightness slider when any room light supports brightness (on or off). */
    const hasDimmableLights = controllableLights.some((l) => supportsBrightnessFor(l));

    /** Restore only when bookmark exists and live room state has drifted from it */
    const showRestoreButton = useMemo(
        () => !!(savedScene?.length && !liveMatchesSavedScene(savedScene, lights, isMasterController, effectiveCap)),
        [savedScene, lights, isMasterController, effectiveCap],
    );

    // Group CCT/RGB sliders only when a master controller exists — otherwise use per-light controls.
    const masterMapping = masterControllerEntity ? mappingFor(masterControllerEntity) : null;
    const showCCTSlider = !!masterControllerEntity
        && (lightSupportsCCT(masterControllerEntity, masterMapping) || hasCCT);
    const showRGBSlider = !!masterControllerEntity
        && (lightSupportsRGB(masterControllerEntity, masterMapping) || hasRGB);

    // ── Last-known brightness per light ──────────────────────────────────
    // Updated whenever a light is ON and has brightness.
    // This means: even after a light turns off, we remember its last value.
    // So proportional scaling always uses the most recent real brightness,
    // not a stale value from when the component mounted.
    const lastKnownBrightness = useRef({}); // { entity_id: number (0-255) }

    useEffect(() => {
        lights.forEach(l => {
            const b = l.stateObj?.attributes?.brightness;
            if (l.stateObj?.state === 'on' && b != null) {
                lastKnownBrightness.current[l.entity_id] = b;
            }
        });
    }, [lights]);

    // ── Avg brightness ────────────────────────────────────────────────────
    // Only averages ON lights that have a brightness attribute (dimmable/cct/rgb).
    // Excludes master_controller entities — they report their own brightness which
    // would skew the average (they're the controller, not a real light).
    // Non-dimmable on/off lights are excluded so they don't skew the bar.
    const avgBrightness = () => {
        const dimmableOn = controllableLights.filter(
            (l) => l.stateObj.state === 'on' && supportsBrightnessFor(l),
        );
        if (!dimmableOn.length) return 0;
        return dimmableOn.reduce(
            (s, l) => s + (l.stateObj.attributes?.brightness ?? 255),
            0,
        ) / dimmableOn.length;
    };
    const [masterBrightness, setMasterBrightness] = useState(avgBrightness);
    // Only non-null while the master slider is being actively dragged
    const [activeMasterBrightness, setActiveMasterBrightness] = useState(null);

    // Block HA re-sync briefly after the user drags a master slider so a
    // stale websocket echo cannot snap the thumb back.
    const brightnessBlocked = useRef(false);
    const brightnessBlockTimer = useRef(null);
    const cctBlocked = useRef(false);
    const cctBlockTimer = useRef(null);
    const rgbBlocked = useRef(false);
    const rgbBlockTimer = useRef(null);
    const pendingCctPct = useRef(null);
    const pendingRgbPct = useRef(null);
    const cctPendingTimer = useRef(null);
    const rgbPendingTimer = useRef(null);

    const blockSync = (blockedRef, timerRef, durationMs = 2000) => {
        blockedRef.current = true;
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => { blockedRef.current = false; }, durationMs);
    };

    const holdPendingPct = (pendingRef, timerRef, pct) => {
        pendingRef.current = pct;
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => { pendingRef.current = null; }, 6000);
    };

    useEffect(() => {
        if (!brightnessBlocked.current) setMasterBrightness(avgBrightness());
    }, [lights]);

    // CCT / RGB slider values follow the actual room lights — not the master
    // controller entity. HA groups/helpers often propagate color to members
    // without updating their own color_temp / rgb_color, which made the
    // slider ignore HA changes and snap back after a drag.
    const lastCctPct = useRef(30);
    const lastRgbPct = useRef(70);

    const cctPctFromRoom = useCallback(() => {
        const onLights = controllableLights.filter((l) => l.stateObj?.state === 'on');
        const pcts = onLights
            .map((l) => {
                const attrs = l.stateObj?.attributes || {};
                const mode = attrs.color_mode;
                if (mode && RGB_COLOR_MODES.has(mode)) return null;
                return cctPctFromAttrs(attrs);
            })
            .filter((p) => p != null);
        if (pcts.length) {
            const avg = pcts.reduce((s, p) => s + p, 0) / pcts.length;
            lastCctPct.current = avg;
            return avg;
        }
        return lastCctPct.current;
    }, [controllableLights]);

    const rgbPctFromRoom = useCallback(() => {
        const onLights = controllableLights.filter((l) => l.stateObj?.state === 'on');
        const pcts = onLights
            .map((l) => {
                const attrs = l.stateObj?.attributes || {};
                const mode = attrs.color_mode;
                if (mode && CCT_COLOR_MODES.has(mode)) return null;
                return huePctFromAttrs(attrs);
            })
            .filter((p) => p != null);
        if (pcts.length) {
            lastRgbPct.current = pcts[0];
            return pcts[0];
        }
        return lastRgbPct.current;
    }, [controllableLights]);

    const [masterCCTPct, setMasterCCTPct] = useState(() => cctPctFromRoom());
    useEffect(() => {
        if (cctBlocked.current) return;
        const live = cctPctFromRoom();
        if (pendingCctPct.current != null && Math.abs(live - pendingCctPct.current) > 8) {
            return;
        }
        pendingCctPct.current = null;
        setMasterCCTPct(live);
    }, [lights, cctPctFromRoom]);

    const [masterRGBPct, setMasterRGBPct] = useState(() => rgbPctFromRoom());
    useEffect(() => {
        if (rgbBlocked.current) return;
        const live = rgbPctFromRoom();
        if (pendingRgbPct.current != null) {
            const d = Math.abs(live - pendingRgbPct.current);
            if (Math.min(d, 100 - d) > 8) return;
        }
        pendingRgbPct.current = null;
        setMasterRGBPct(live);
    }, [lights, rgbPctFromRoom]);

    // ── Handlers ──────────────────────────────────────────────────────────
    // Same rule as room card badge / home header: skip Master Controller only;
    // named groups count as 1; individuals (incl. master members) count each.
    const onLightsCount = countActiveCountableLights(lights);
    const gridLights = useMemo(() => filterCountableLights(lights), [lights]);

    const handleBrightnessRelease = useCallback((rounded) => {
        blockSync(brightnessBlocked, brightnessBlockTimer);

        // Only operate on dimmable ON lights (exclude master controllers)
        const dimmableLights = lights.filter(l =>
            l.stateObj.state === 'on' &&
            supportsBrightnessFor(l) &&
            !isMasterControllerLight(l)
        );

        if (!dimmableLights.length) return;

        // Use lastKnownBrightness so we always have the most recent real value.
        const getBrightness = (l) =>
            lastKnownBrightness.current[l.entity_id] ??
            l.stateObj?.attributes?.brightness ??
            255;

        // Calculate current average brightness (0-255)
        const currentAvg = dimmableLights.reduce((s, l) => s + getBrightness(l), 0) / dimmableLights.length;

        // Hard limits: snap all to max or min directly
        if (rounded >= 255) {
            dimmableLights.forEach(l => onBrightnessChange?.(l.entity_id, 255));
            return;
        }
        if (rounded <= 1) {
            dimmableLights.forEach(l => onBrightnessChange?.(l.entity_id, 1));
            return;
        }

        // ── Equal-delta with overflow redistribution ─────────────────────
        // 1. Apply the same delta to every light so relative differences
        //    are preserved (moving slider up/down feels uniform).
        // 2. Any light that would go above 255 or below 1 is capped, and
        //    its overflow/underflow is spread equally across the remaining
        //    uncapped lights — repeated until nothing overflows.
        //    This guarantees the new average equals `rounded` without
        //    ever sending one light to an extreme while others don't move.

        const perLight = (rounded - currentAvg); // same delta for everyone

        const work = dimmableLights.map(l => ({
            entity_id: l.entity_id,
            newVal: getBrightness(l) + perLight,
            capped: false,
        }));

        // Iteratively redistribute any overflow / underflow
        for (let iter = 0; iter < 20; iter++) {
            let overflow = 0;
            work.forEach(item => {
                if (item.capped) return;
                if (item.newVal > 255) {
                    overflow += item.newVal - 255;
                    item.newVal = 255;
                    item.capped = true;
                } else if (item.newVal < 1) {
                    overflow += item.newVal - 1;   // negative value
                    item.newVal = 1;
                    item.capped = true;
                }
            });
            if (Math.abs(overflow) < 0.5) break;
            const free = work.filter(w => !w.capped);
            if (!free.length) break;
            const extra = overflow / free.length;
            free.forEach(item => { item.newVal += extra; });
        }

        work.forEach(item => onBrightnessChange?.(item.entity_id, Math.round(item.newVal)));
    }, [lights, lightMappings, onBrightnessChange]);

    const resolveCctTargets = useCallback(() => {
        const mc = masterControllerEntity || lights.find((l) => isMasterControllerLight(l));
        if (mc && lightSupportsCCT(mc, mappingFor(mc))) {
            return [mc.entity_id];
        }
        if (mc) {
            const members = controllableLights
                .filter((l) => l.stateObj?.state === 'on' && (effectiveCap(l) === 'cct' || effectiveCap(l) === 'rgb'))
                .map((l) => l.entity_id);
            if (members.length) return members;
            return [mc.entity_id];
        }
        return controllableLights
            .filter((l) => l.stateObj?.state === 'on' && (effectiveCap(l) === 'cct' || effectiveCap(l) === 'rgb'))
            .map((l) => l.entity_id);
    }, [masterControllerEntity, lights, controllableLights, effectiveCap, mappingFor]);

    const resolveRgbTargets = useCallback(() => {
        const mc = masterControllerEntity || lights.find((l) => isMasterControllerLight(l));
        if (mc && lightSupportsRGB(mc, mappingFor(mc))) {
            return [mc.entity_id];
        }
        if (mc) {
            const members = controllableLights
                .filter((l) => l.stateObj?.state === 'on' && effectiveCap(l) === 'rgb')
                .map((l) => l.entity_id);
            if (members.length) return members;
            return [mc.entity_id];
        }
        return controllableLights
            .filter((l) => l.stateObj?.state === 'on' && effectiveCap(l) === 'rgb')
            .map((l) => l.entity_id);
    }, [masterControllerEntity, lights, controllableLights, effectiveCap, mappingFor]);

    const handleCCTRelease = useCallback((pct) => {
        if (adaptiveLinked) {
            onAdaptiveManualColor?.();
        }
        pendingCctPct.current = pct;
        setMasterCCTPct(pct);
        lastCctPct.current = pct;
        holdPendingPct(pendingCctPct, cctPendingTimer, pct);
        blockSync(cctBlocked, cctBlockTimer, 3000);
        const kelvin = pctToKelvin(pct);
        resolveCctTargets().forEach((entityId) => onColorTempChange?.(entityId, kelvin));
    }, [onColorTempChange, adaptiveLinked, onAdaptiveManualColor, resolveCctTargets]);

    const handleRGBRelease = useCallback((pct) => {
        if (adaptiveLinked) {
            onAdaptiveManualColor?.();
        }
        pendingRgbPct.current = pct;
        setMasterRGBPct(pct);
        lastRgbPct.current = pct;
        holdPendingPct(pendingRgbPct, rgbPendingTimer, pct);
        blockSync(rgbBlocked, rgbBlockTimer, 3000);
        const hue = (pct / 100) * 360;
        const rgb = hueToRgb(hue);
        resolveRgbTargets().forEach((entityId) => onRgbChange?.(entityId, rgb));
    }, [onRgbChange, adaptiveLinked, onAdaptiveManualColor, resolveRgbTargets]);

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

    const handleAdaptivePress = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onAdaptiveToggle?.();
    };

    const cctSpectrumSlider = (compact = false) => {
        if (adaptiveLinked) return null;
        return (
            <SpectrumSlider
                value={masterCCTPct}
                colors={['#FF9F43', '#FFE082', '#FFF8E1', '#D6F5FF', '#A8CFFF']}
                thumbColor={cctThumbColor}
                onChange={setMasterCCTPct}
                onDragStart={() => {
                    blockSync(cctBlocked, cctBlockTimer);
                    onSliderDragStart?.();
                }}
                onDragEnd={onSliderDragEnd}
                onRelease={handleCCTRelease}
                compact={compact}
            />
        );
    };

    // ── Find master controller entity ─────────────────────────────────────
    const masterLight = lights.find((l) => isMasterControllerLight(l));
    const masterIsOn = countActiveCountableLights(lights) > 0;

    const handleMasterToggle = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

        // ── Master controller logic (temporarily disabled) ────────────────
        // if (masterLight) {
        //     onToggle?.(masterLight.entity_id);
        //     return;
        // }
        // ─────────────────────────────────────────────────────────────────

        // Operate on room lights except the Master Controller entity
        const controllableLights = lights.filter((l) => !isMasterControllerLight(l));
        const anyOn = controllableLights.some(l => l.stateObj?.state === 'on');

        if (anyOn) {
            // ── Snapshot all ON lights before turning them off ────────────
            autoSnapshot.current = controllableLights
                .filter(l => l.stateObj?.state === 'on')
                .map(l => {
                    const attrs = l.stateObj?.attributes || {};
                    const cap = effectiveCap(l);
                    const entry = { entity_id: l.entity_id };
                    if (attrs.brightness != null) entry.brightness = attrs.brightness;
                    if (cap === 'rgb' && Array.isArray(attrs.rgb_color)) entry.rgb_color = attrs.rgb_color;
                    if ((cap === 'cct' || cap === 'rgb') && attrs.color_temp_kelvin != null)
                        entry.color_temp_kelvin = attrs.color_temp_kelvin;
                    return entry;
                });

            // Turn OFF all lights that are currently on
            controllableLights
                .filter(l => l.stateObj?.state === 'on')
                .forEach(l => onToggle?.(l.entity_id));
        } else {
            // All off → priority: 1) manually saved scene  2) auto-snapshot  3) just turn all on
            const sceneToRestore = savedScene?.length ? savedScene : autoSnapshot.current;
            if (sceneToRestore?.length) {
                sceneToRestore.forEach(entry => {
                    const { entity_id, brightness, rgb_color, color_temp_kelvin } = entry;
                    if (isMasterControllerLight({ entity_id })) return;
                    const params = {};
                    if (brightness != null)        params.brightness = brightness;
                    if (rgb_color)                 params.rgb_color = rgb_color;
                    if (color_temp_kelvin != null)  params.color_temp_kelvin = color_temp_kelvin;
                    if (onTurnOn) {
                        onTurnOn(entity_id, params);
                    } else {
                        const currentLight = lights.find(l => l.entity_id === entity_id);
                        if (currentLight?.stateObj?.state !== 'on') onToggle?.(entity_id);
                        if (brightness != null)        setTimeout(() => onBrightnessChange?.(entity_id, brightness), 400);
                        if (color_temp_kelvin != null)  setTimeout(() => onColorTempChange?.(entity_id, color_temp_kelvin), 400);
                        if (rgb_color)                  setTimeout(() => onRgbChange?.(entity_id, rgb_color), 400);
                    }
                });
            } else {
                controllableLights.forEach(l => onToggle?.(l.entity_id));
            }
        }
    };

    return (
        <View style={[styles.container, isTabletSplit && styles.containerTabletSplit]}>
            <View style={isTabletSplit ? styles.tabletSplitInner : null}>
            {/* Header */}
            <View style={[styles.header, isTabletSplit && styles.headerTabletSplit]}>
                <RoomGroupIconButton
                    active={masterIsOn}
                    onPress={handleMasterToggle}
                    accessibilityLabel="Toggle all lights"
                >
                    <SvgXml
                        xml={LIGHTS_MASTER_SVG}
                        width={ROOM_GROUP_ICON_GLYPH_SIZE}
                        height={ROOM_GROUP_ICON_GLYPH_SIZE}
                    />
                </RoomGroupIconButton>
                <View style={styles.headerTextBlock}>
                    <Text style={styles.headerTitle}>Lights</Text>
                    <Text style={[styles.headerStatus, onLightsCount > 0 && styles.headerStatusOn]}>
                        {onLightsCount > 0 ? `${onLightsCount} ON` : 'OFF'}
                    </Text>
                </View>

                <View style={styles.sceneButtons}>
                    {/* Restore — bookmark exists and current lights differ from that snapshot */}
                    {showRestoreButton && (
                        <TouchableOpacity
                            style={styles.restoreBtn}
                            onPress={handleRestoreScene}
                            activeOpacity={0.75}
                            accessibilityLabel="Restore"
                        >
                            <Zap size={18} color="#44C8CA" />
                        </TouchableOpacity>
                    )}
                    {/* Save scene button */}
                    <TouchableOpacity
                        style={[styles.saveSceneBtn, saveFeedback && styles.saveSceneBtnActive]}
                        onPress={handleSaveScene}
                        activeOpacity={0.7}
                    >
                        {saveFeedback
                            ? <BookmarkCheck size={18} color="#8947ca" />
                            : <Bookmark size={18} color={savedScene?.length ? '#8947ca' : 'rgba(255,255,255,0.35)'} />
                        }
                    </TouchableOpacity>
                </View>
            </View>

            {/* Dots — same units as grid / badge count */}
            <DotsRow lights={gridLights} />

            {/* Collapsed — brightness only */}
            {hasDimmableLights && (
                <View style={[styles.spectrumBlock, isTabletSplit && styles.spectrumBlockTabletSplit]}>
                    <BrightnessSlider
                        value={masterBrightness}
                        onChange={setMasterBrightness}
                        onDragStart={() => {
                            blockSync(brightnessBlocked, brightnessBlockTimer);
                            onSliderDragStart?.();
                        }}
                        onDragEnd={onSliderDragEnd}
                        onRelease={(v) => {
                            setMasterBrightness(v);
                            setActiveMasterBrightness(null);
                            handleBrightnessRelease(v);
                        }}
                    />
                </View>
            )}

            {/* Chevron */}
            <TouchableOpacity style={styles.chevron} onPress={toggle} activeOpacity={0.7}>
                {expanded
                    ? <ChevronUp   size={22} color="rgba(255,255,255,0.45)" />
                    : <ChevronDown size={22} color="rgba(255,255,255,0.45)" />}
            </TouchableOpacity>

            {/* Expanded — adaptive + CCT/RGB + per-light grid */}
            {expanded && (
                <>
            {hasAdaptive && (
                <View style={[styles.spectrumBlock, isTabletSplit && styles.spectrumBlockTabletSplit]}>
                    <AdaptiveLightingPill active={adaptiveLinked} onPress={handleAdaptivePress} />
                </View>
            )}

            {showCCTSlider && cctSpectrumSlider(isTabletSplit)}

            {showRGBSlider && !adaptiveLinked && (
                <SpectrumSlider
                    value={masterRGBPct}
                    colors={[
                        '#FF0000', '#FF8000', '#FFFF00',
                        '#00FF00', '#00FFFF', '#0000FF',
                        '#8000FF', '#FF0080', '#FF0000',
                    ]}
                    thumbColor={rgbThumbColor}
                    onChange={setMasterRGBPct}
                    onDragStart={() => {
                        blockSync(rgbBlocked, rgbBlockTimer);
                        onSliderDragStart?.();
                    }}
                    onDragEnd={onSliderDragEnd}
                    onRelease={handleRGBRelease}
                    compact={isTabletSplit}
                />
            )}

                <View style={styles.grid}>
                    {gridLights.map(l => (
                        <View key={l.entity_id} style={[styles.cell, lightCellWidth > 0 && { width: lightCellWidth }]}>
                            <ExpandedLightCard
                                light={l}
                                mapping={mappingFor(l)}
                                adminUrl={adminUrl}
                                onToggle={onToggle}
                                onBrightnessChange={onBrightnessChange}
                                onLongPress={onLongPress}
                                onColorTap={(tappedLight, detectedCapability) => {
                                    const m = mappingFor(tappedLight);
                                    const cap = detectedCapability || m?.colorCapability || null;
                                    setColorModalLight({ light: tappedLight, colorCapability: cap });
                                }}
                                masterBrightness={activeMasterBrightness}
                                onSliderDragStart={onSliderDragStart}
                                onSliderDragEnd={onSliderDragEnd}
                            />
                        </View>
                    ))}
                </View>
                </>
            )}

            {/* Per-light color control modal */}
            {colorModalLight && (
                <LightControlModal
                    visible={!!colorModalLight}
                    onClose={() => setColorModalLight(null)}
                    light={colorModalLight.light}
                    colorCapability={colorModalLight.colorCapability}
                    onUpdate={(entityId, payload) => {
                        if (payload.toggle) {
                            onToggle?.(entityId, colorModalLight.light.stateObj.state);
                            return;
                        }
                        if (payload.brightness !== undefined) {
                            onBrightnessChange?.(entityId, payload.brightness);
                        } else if (payload.kelvin !== undefined) {
                            onColorTempChange?.(entityId, payload.kelvin);
                        } else if (payload.rgb_color !== undefined) {
                            onRgbChange?.(entityId, payload.rgb_color);
                        }
                    }}
                />
            )}
            </View>
        </View>
    );
}

// ── Styles ────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
    container: {
        backgroundColor: '#13132A',
        borderRadius: 20,
        paddingHorizontal: 18,
        paddingTop: 18,
        paddingBottom: 8,
        marginBottom: 12,
    },
    containerTabletSplit: {
        backgroundColor: 'transparent',
        borderRadius: 0,
        paddingHorizontal: 0,
        paddingTop: 0,
        paddingBottom: 0,
        marginBottom: 0,
        flex: 1,
    },

    // Header
    header:      { flexDirection: 'row', alignItems: 'center', marginBottom: 18 },
    headerTabletSplit: {
        marginBottom: 12,
    },
    tabletSplitInner: {
        flex: 1,
        justifyContent: 'space-between',
    },
    headerTitle: { ...Heading.md, color: '#fff' },
    headerTextBlock: {
        flex: 1,
        justifyContent: 'center',
    },
    headerStatus: {
        ...RoomDeviceStatus,
        marginTop: 2,
        fontSize: 13,
        color: 'rgba(255,255,255,0.45)',
    },
    headerStatusOn: {
        color: '#44C8CA',
    },
    sceneButtons: {
        flexDirection: 'row', alignItems: 'center', gap: 8, marginLeft: 8,
    },
    saveSceneBtn: {
        width: 36, height: 36, borderRadius: 18,
        backgroundColor: 'rgba(255,255,255,0.07)',
        alignItems: 'center', justifyContent: 'center',
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
    },
    saveSceneBtnActive: {
        backgroundColor: 'rgba(137,71,202,0.2)',
        borderColor: '#8947ca',
    },
    restoreBtn: {
        width: 36, height: 36, borderRadius: 18,
        backgroundColor: 'rgba(68,200,202,0.12)',
        borderWidth: 1, borderColor: 'rgba(68,200,202,0.3)',
        alignItems: 'center', justifyContent: 'center',
    },

    // Dots
    dotsRow: {
        flexDirection: 'row', flexWrap: 'wrap',
        justifyContent: 'center', alignItems: 'center',
        marginBottom: 16,
    },

    sliderRail: {
        position: 'absolute', left: 0, right: 0,
        height: TRACK, borderRadius: TRACK / 2,
        backgroundColor: 'rgba(255,255,255,0.12)',
        top: (THUMB + 18 - TRACK) / 2,
    },

    // Slider section row (sun icon + slider)
    sliderSection: {
        flexDirection: 'row', alignItems: 'center',
        marginBottom: 8, gap: 10,
    },
    sliderWrapOuter: { flex: 1 },

    // Spectrum / slider blocks — icon sits above the track
    spectrumBlock: {
        flexDirection: 'column',
        marginBottom: 12,
    },
    spectrumBlockTabletSplit: {
        marginBottom: 6,
    },
    sunReflectivePill: {
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'stretch',
        backgroundColor: '#09091A',
        borderRadius: 999,
        paddingVertical: 10,
        paddingHorizontal: 14,
        gap: 10,
        marginBottom: 4,
    },
    sunReflectivePillActive: {
        borderWidth: 1.5,
        borderColor: 'rgba(255,255,255,0.35)',
        backgroundColor: 'rgba(255,255,255,0.06)',
    },
    sunReflectiveIcon: {
        width: 22,
        height: 22,
        resizeMode: 'contain',
    },
    sunReflectiveText: {
        color: '#9199BA',
        fontSize: 14,
        fontWeight: '500',
    },
    sunReflectiveTextActive: {
        color: '#ededf5',
    },
    spectrumIcon: {
        marginBottom: 4, marginLeft: 2,
    },
    sunIconBg: {
        width: 26, height: 26, borderRadius: 13,
        alignItems: 'center', justifyContent: 'center',
        marginBottom: 4,
    },
    sunIconBgDisabled: {
        width: 26, height: 26, borderRadius: 13,
        alignItems: 'center', justifyContent: 'center',
        marginBottom: 4,
        backgroundColor: 'rgba(255,255,255,0.05)',
    },
    // CCT / RGB icon — tap toggles sun-linked vs manual spectrum
    spectrumIconPlain: {
        alignSelf: 'flex-start',
        marginBottom: 4, paddingHorizontal: 2,
    },
    /** Perfect circle: equal width/height, overflow clip + matching gradient corner radius */
    spectrumRoundDisc: {
        overflow: 'hidden',
        borderWidth: 1.5,
        borderColor: 'rgba(255,255,255,0.28)',
    },
    spectrumIconBtn: {
        alignSelf: 'flex-start',
        width: 26, height: 26, borderRadius: 13,
        alignItems: 'center', justifyContent: 'center',
        marginBottom: 4,
        backgroundColor: 'rgba(255,255,255,0.07)',
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
    },
    spectrumIconBtnLinked: {
        backgroundColor: 'rgba(255,255,255,0.10)',
        borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.35)',
    },
    spectrumIconBtnActive: {
        backgroundColor: 'rgba(68,200,202,0.18)',
        borderWidth: 1.5, borderColor: '#44C8CA',
    },
    brightnessIconRow: {
        flexDirection: 'row', alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 4,
    },
    spectrumRow: {
        flexDirection: 'row', alignItems: 'center',
        marginBottom: 12, gap: 10,
    },
    spectrumLabel: {
        color: 'rgba(255,255,255,0.5)',
        fontSize: 11, fontWeight: '600',
        width: 28, textAlign: 'center',
    },
    spectrumIconWrap: {
        width: 28, alignItems: 'center', justifyContent: 'center',
    },
    brightnessAvgLabel: {
        color: 'rgba(255,255,255,0.6)',
        fontSize: 12, fontWeight: '700',
        minWidth: 36, textAlign: 'right',
    },
    // Spectrum track (the LinearGradient pill)
    spectrumTrack: {
        position: 'absolute', left: 0, right: 0,
        height: TRACK, borderRadius: TRACK / 2,
        top: (THUMB + 18 - TRACK) / 2,
    },

    chevron: { alignItems: 'center', paddingVertical: 6 },

    // Expanded grid — cell width set in JS so two columns fit on narrow phones (see lightCellWidth)
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 10, marginBottom: 8, justifyContent: 'flex-start' },
    cell: { flexGrow: 0, flexShrink: 0 },

    // Card
    cardBorder:   { borderRadius: 32, padding: 1.5 },
    cardInner: {
        borderRadius: 30.5, backgroundColor: '#12122B',
        overflow: 'hidden', minHeight: 64,
        justifyContent: 'center', position: 'relative',
    },
    cardInnerOff: { backgroundColor: '#0D0D1C' },
    cardFill:     { position: 'absolute', left: 0, top: 0, bottom: 0 },
    cardTouch: {
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 12, paddingVertical: 10, gap: 10,
    },
    cardIcon: {
        width: LIGHT_CARD_ICON_BOX,
        height: LIGHT_CARD_ICON_BOX,
        borderRadius: LIGHT_CARD_ICON_BOX / 2,
        alignItems: 'center',
        justifyContent: 'center',
    },
    cardText:    { flex: 1 },
    cardName:    { color: '#fff', fontSize: 12, fontWeight: '600', marginBottom: 2 },
    cardLabel:   { ...RoomDeviceStatus, color: 'rgba(255,255,255,0.40)', fontSize: 12 },
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
