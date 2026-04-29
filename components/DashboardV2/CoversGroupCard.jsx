/**
 * CoversGroupCard
 * ──────────────────────────────────────────────────────────────
 * Collapsed  → header (icon [tappable → toggle master], title, "X Open" badge)
 *              + adaptive dots row
 *              + master-position slider  ← shown ONLY when a "Master Curtain" entity exists
 *              + chevron
 * Expanded   → 2-column grid of individual CoverCards (master excluded)
 *
 * Master curtain detection:
 *   entity_id  OR  displayName contains "master_curtain" or "master curtain" (case-insensitive)
 *
 * Slider:
 *   • Uses Animated.Value → native-thread updates, zero React re-renders during drag
 *   • On finger-up: onUpdate(masterEntity, 'cover', 'set_cover_position', { position })
 *   • HA handles propagation to all real curtains — the app never fans out
 *
 * Individual cards remain fully independent (toggle / position via their own CoverCard UI).
 *
 * Cover state:  'open' | 'opening' | 'closing' | 'closed'
 * Position:     attrs.current_position  0–100  (0 = closed, 100 = open)
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity,
    PanResponder, LayoutAnimation, Platform, UIManager, Animated,
} from 'react-native';
import { LayoutGrid, ChevronDown, ChevronUp } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import CoverCard from './CoverCard';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

// ── Helpers ───────────────────────────────────────────────────────────────
function getPosition(cover) {
    const attrs = cover.stateObj?.attributes || {};
    const state = cover.stateObj?.state || 'closed';
    if (attrs.current_position !== undefined) return attrs.current_position;
    return state === 'open' ? 100 : 0;
}

function isActive(cover) {
    const attrs = cover.stateObj?.attributes || {};
    const state = cover.stateObj?.state || 'closed';
    if (attrs.current_position !== undefined) return attrs.current_position > 5;
    return state === 'open' || state === 'opening';
}

/** Returns true if this entity is the master curtain controller */
function isMasterCover(cover) {
    const id   = (cover.entity_id   || '').toLowerCase();
    const name = (cover.displayName || '').toLowerCase();
    return id.includes('master_curtain') || id.includes('master curtain') ||
           name.includes('master curtain') || name.includes('master_curtain');
}

// ── Adaptive dots row ─────────────────────────────────────────────────────
function DotsRow({ covers }) {
    const n       = covers.length;
    const dotSize = n > 20 ? 7 : n > 14 ? 9 : 13;
    const gap     = n > 20 ? 3  : n > 14 ? 4  : 7;

    return (
        <View style={styles.dotsRow}>
            {covers.map((c) => {
                const active = isActive(c);
                return (
                    <View
                        key={c.entity_id}
                        style={{
                            width:            dotSize,
                            height:           dotSize,
                            borderRadius:     dotSize / 2,
                            marginHorizontal: gap / 2,
                            marginVertical:   2,
                            backgroundColor:  active ? '#44C8CA' : 'rgba(68,200,202,0.23)',
                        }}
                    />
                );
            })}
        </View>
    );
}

// ── Master position slider (0–100) — Animated, native-thread smooth ───────
function PositionSlider({ value, onRelease }) {
    const thumbAnim = useRef(new Animated.Value(0)).current;
    const fillAnim  = useRef(new Animated.Value(0)).current;

    const trackWRef  = useRef(0);
    const [trackW, setTrackW]       = useState(0);
    const [dragging, setDragging]   = useState(false);
    const [bubblePct, setBubblePct] = useState(Math.round(value));

    const latestRaw  = useRef(value);
    const startPageX = useRef(0);
    const startRaw   = useRef(value);
    const isDragging = useRef(false);

    const onReleaseRef = useRef(onRelease);
    onReleaseRef.current = onRelease;

    const applyRaw = useCallback((raw, w) => {
        if (w <= 0) return;
        thumbAnim.setValue(Math.max(0, Math.min(w - THUMB, (raw / 100) * w - THUMB / 2)));
        fillAnim.setValue(Math.max(0, (raw / 100) * w));
    }, []);

    useEffect(() => {
        if (!isDragging.current) {
            latestRaw.current = value;
            applyRaw(value, trackWRef.current);
            setBubblePct(Math.round(value));
        }
    }, [value]);

    useEffect(() => {
        if (trackW > 0) applyRaw(latestRaw.current, trackW);
    }, [trackW]);

    const pan = useRef(PanResponder.create({
        onStartShouldSetPanResponder:        () => true,
        onStartShouldSetPanResponderCapture: () => true,
        onMoveShouldSetPanResponder:         () => true,
        onMoveShouldSetPanResponderCapture:  () => true,
        onPanResponderTerminateRequest:      () => false,

        onPanResponderGrant: (e) => {
            isDragging.current = true;
            setDragging(true);
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            startPageX.current = e.nativeEvent.pageX;
            startRaw.current   = latestRaw.current;
        },

        onPanResponderMove: (e) => {
            const w = trackWRef.current;
            if (!w) return;
            const raw = Math.max(0, Math.min(100,
                startRaw.current + ((e.nativeEvent.pageX - startPageX.current) / w) * 100));
            latestRaw.current = raw;
            thumbAnim.setValue(Math.max(0, Math.min(w - THUMB, (raw / 100) * w - THUMB / 2)));
            fillAnim.setValue(Math.max(0, (raw / 100) * w));
            setBubblePct(Math.round(raw));
        },

        // Single HA call on release — master controller handles all curtains
        onPanResponderRelease: () => {
            isDragging.current = false;
            setDragging(false);
            onReleaseRef.current(Math.round(latestRaw.current));
        },

        onPanResponderTerminate: () => {
            isDragging.current = false;
            setDragging(false);
            onReleaseRef.current(Math.round(latestRaw.current));
        },
    })).current;

    const thumbSz    = dragging ? THUMB + 4 : THUMB;
    const thumbTop   = (THUMB + 18 - thumbSz) / 2;
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
            <View style={styles.sliderRail} />
            <Animated.View style={[styles.sliderFill, { width: fillAnim }]} />

            {dragging && (
                <View style={[styles.sliderBubble, { left: bubbleLeft }]}>
                    <Text style={styles.sliderBubbleText}>{bubblePct}%</Text>
                </View>
            )}

            <Animated.View style={[
                styles.sliderThumb,
                {
                    width:        thumbSz,
                    height:       thumbSz,
                    borderRadius: thumbSz / 2,
                    top:          thumbTop,
                    left:         thumbAnim,
                },
                dragging && { shadowOpacity: 1, shadowRadius: 16 },
            ]} />

            {/* Drag-direction hints */}
            <View style={styles.sliderHints} pointerEvents="none">
                <Text style={styles.sliderHintClose}>← Close</Text>
                <Text style={styles.sliderHintOpen}>Open →</Text>
            </View>
        </View>
    );
}

// ── Individual expanded cover card — uses the full CoverCard design ───────
function ExpandedCoverCard({ cover, allEntities, onUpdate }) {
    const sensorId = cover.linkedSensorId || cover.entity_id.replace('cover.', 'sensor.');
    const sensor   = allEntities?.find(e => e.entity_id === sensorId);
    return <CoverCard cover={cover} sensor={sensor} onUpdate={onUpdate} />;
}

// ── Main component ────────────────────────────────────────────────────────
export default function CoversGroupCard({ covers = [], allEntities = [], onUpdate }) {
    const [expanded, setExpanded] = useState(false);

    // ── Master curtain detection ──────────────────────────────────────────
    const masterCover      = covers.find(isMasterCover);
    const masterIsOpen     = masterCover ? isActive(masterCover) : false;
    const masterPos        = masterCover ? getPosition(masterCover) : 50;
    const individualCovers = covers.filter(c => !isMasterCover(c));

    const openCount = individualCovers.filter(c => isActive(c)).length;

    // ── Header icon → open / close master curtain ─────────────────────────
    const handleMasterToggle = () => {
        if (!masterCover) return;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        onUpdate?.(
            masterCover.entity_id, 'cover',
            masterIsOpen ? 'close_cover' : 'open_cover',
            {},
        );
    };

    // ── Slider release → one call to master, HA propagates to all curtains ─
    const handlePositionRelease = useCallback((rounded) => {
        if (!masterCover) return;
        onUpdate?.(masterCover.entity_id, 'cover', 'set_cover_position', { position: rounded });
    }, [masterCover, onUpdate]);

    const toggle = () => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setExpanded(v => !v);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    };

    return (
        <View style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity
                    style={[styles.iconCircle, masterIsOpen && styles.iconCircleOpen]}
                    onPress={handleMasterToggle}
                    activeOpacity={masterCover ? 0.75 : 1}
                >
                    <LayoutGrid size={26} color="#fff" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Covers</Text>
                <View style={styles.onBadge}>
                    <Text style={styles.onBadgeText}>{openCount} Open</Text>
                </View>
            </View>

            {/* Dots — show all covers including master */}
            <DotsRow covers={individualCovers} />

            {/* Master position slider — only when a master curtain exists */}
            {masterCover && (
                <View style={styles.sliderSection}>
                    <Text style={styles.sliderIcon}>≡</Text>
                    <View style={styles.sliderWrapOuter}>
                        <PositionSlider
                            value={masterPos}
                            onRelease={handlePositionRelease}
                        />
                    </View>
                </View>
            )}

            {/* Chevron */}
            <TouchableOpacity style={styles.chevron} onPress={toggle} activeOpacity={0.7}>
                {expanded
                    ? <ChevronUp   size={22} color="rgba(255,255,255,0.45)" />
                    : <ChevronDown size={22} color="rgba(255,255,255,0.45)" />}
            </TouchableOpacity>

            {/* Expanded grid — master curtain excluded */}
            {expanded && (
                <View style={styles.grid}>
                    {individualCovers.map(c => (
                        <View key={c.entity_id} style={styles.cell}>
                            <ExpandedCoverCard
                                cover={c}
                                allEntities={allEntities}
                                onUpdate={onUpdate}
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
    header:     { flexDirection: 'row', alignItems: 'center', marginBottom: 18 },
    iconCircle: {
        width: 52, height: 52, borderRadius: 26,
        backgroundColor: '#3A1A6E',
        alignItems: 'center', justifyContent: 'center',
        marginRight: 14,
        shadowColor: '#8947ca', shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.5, shadowRadius: 8, elevation: 4,
    },
    iconCircleOpen: {
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

    // Slider section row
    sliderSection: {
        flexDirection: 'row', alignItems: 'center',
        marginBottom: 8, gap: 10,
    },
    sliderIcon: {
        color: 'rgba(255,255,255,0.5)',
        fontSize: 18, fontWeight: '600',
        width: 28, textAlign: 'center',
    },
    sliderWrapOuter: { flex: 1 },

    // Slider container
    sliderWrap: {
        height: THUMB + 34,
        justifyContent: 'center',
        marginBottom: 6,
        overflow: 'visible',
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
        // width driven by Animated.Value
    },
    sliderThumb: {
        position: 'absolute',
        backgroundColor: '#3A7BD5',
        shadowColor: '#3A7BD5', shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.8, shadowRadius: 10, elevation: 8,
    },
    sliderBubble: {
        position: 'absolute',
        bottom: THUMB + 18,
        minWidth: 36,
        backgroundColor: '#3A7BD5',
        borderRadius: 8,
        paddingHorizontal: 7, paddingVertical: 3,
        alignItems: 'center',
        zIndex: 30,
    },
    sliderBubbleText: { color: '#fff', fontSize: 11, fontWeight: '700' },

    // Drag direction hints shown below the track
    sliderHints: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: THUMB + 4,
    },
    sliderHintClose: {
        color: 'rgba(255,255,255,0.30)',
        fontSize: 11,
        fontWeight: '500',
    },
    sliderHintOpen: {
        color: 'rgba(68,200,202,0.55)',
        fontSize: 11,
        fontWeight: '500',
    },

    chevron: { alignItems: 'center', paddingVertical: 6 },

    // Expanded grid
    grid: {
        flexDirection: 'row', flexWrap: 'wrap',
        marginHorizontal: -5, marginTop: 10, marginBottom: 8,
    },
    cell: { width: '50%', paddingHorizontal: 5, marginBottom: 10 },
});
