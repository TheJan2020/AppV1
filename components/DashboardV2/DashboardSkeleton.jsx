/**
 * DashboardSkeleton + per-section skeleton exports
 *
 * DashboardSkeleton      — full-page shimmer (initial app load)
 * HeaderSkeleton         — Header greeting + weather row + locks pill
 * ScenesSkeleton         — Quick Scenes horizontal strip
 * HomeAccessSkeleton     — Lock / Garage half-width pills
 * RoomsSkeleton          — Rooms horizontal card strip
 * CamerasSkeleton        — Camera 2-column grid
 *
 * Each component is self-contained with its own anim loop so it can be
 * rendered independently as sections load.
 */
import { View, StyleSheet, Animated, Dimensions } from 'react-native';
import { useEffect, useRef, memo } from 'react';

const { width: SW } = Dimensions.get('window');
const CARD_W = (SW - 48) / 2;

// ── Base shimmer block ─────────────────────────────────────────────────────────
function Shimmer({ style, anim }) {
    const opacity = anim.interpolate({ inputRange: [0, 1], outputRange: [0.06, 0.18] });
    return <Animated.View style={[sk.shimmer, style, { opacity }]} />;
}

// ── Public component ──────────────────────────────────────────────────────────
function DashboardSkeleton() {
    const anim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        const loop = Animated.loop(
            Animated.sequence([
                Animated.timing(anim, { toValue: 1, duration: 900, useNativeDriver: true }),
                Animated.timing(anim, { toValue: 0, duration: 900, useNativeDriver: true }),
            ])
        );
        loop.start();
        return () => loop.stop();
    }, []);

    return (
        <View style={sk.root}>
            {/* ── Header ── */}
            <View style={sk.header}>
                <View style={sk.headerLeft}>
                    <Shimmer anim={anim} style={{ width: 120, height: 14, borderRadius: 7, marginBottom: 8 }} />
                    <Shimmer anim={anim} style={{ width: 80, height: 10, borderRadius: 5 }} />
                </View>
                <Shimmer anim={anim} style={{ width: 44, height: 44, borderRadius: 22 }} />
            </View>

            {/* ── Status badges row ── */}
            <View style={sk.row}>
                {[90, 76, 84, 70].map((w, i) => (
                    <Shimmer key={i} anim={anim} style={{ width: w, height: 34, borderRadius: 17 }} />
                ))}
            </View>

            {/* ── Section label ── */}
            <Shimmer anim={anim} style={{ width: 80, height: 12, borderRadius: 6, marginTop: 24, marginBottom: 14 }} />

            {/* ── Rooms horizontal strip ── */}
            <View style={sk.row}>
                {[0, 1, 2].map(i => (
                    <View key={i} style={sk.roomCard}>
                        <Shimmer anim={anim} style={{ ...StyleSheet.absoluteFillObject, borderRadius: 20 }} />
                        <Shimmer anim={anim} style={{ width: '60%', height: 11, borderRadius: 6, marginTop: 'auto', marginBottom: 6 }} />
                    </View>
                ))}
            </View>

            {/* ── Section label ── */}
            <Shimmer anim={anim} style={{ width: 70, height: 12, borderRadius: 6, marginTop: 28, marginBottom: 14 }} />

            {/* ── Camera grid (2×2) ── */}
            <View style={sk.camGrid}>
                {[0, 1, 2, 3].map(i => (
                    <Shimmer key={i} anim={anim} style={{ width: CARD_W, height: CARD_W * 0.75, borderRadius: 16 }} />
                ))}
            </View>
        </View>
    );
}

const sk = StyleSheet.create({
    root: {
        flex: 1,
        paddingHorizontal: 16,
        paddingTop: 100,
    },
    shimmer: {
        backgroundColor: '#fff',
        borderRadius: 8,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20,
    },
    headerLeft: { gap: 4 },
    row: {
        flexDirection: 'row',
        gap: 10,
        flexWrap: 'nowrap',
    },
    roomCard: {
        width: 120,
        height: 90,
        borderRadius: 20,
        overflow: 'hidden',
        justifyContent: 'flex-end',
        padding: 8,
    },
    camGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 12,
    },
});

export default memo(DashboardSkeleton);

// ─────────────────────────────────────────────────────────────────────────────
//  Shared hook — creates a looping shimmer animation
// ─────────────────────────────────────────────────────────────────────────────
function useShimmer() {
    const anim = useRef(new Animated.Value(0)).current;
    useEffect(() => {
        const loop = Animated.loop(
            Animated.sequence([
                Animated.timing(anim, { toValue: 1, duration: 900, useNativeDriver: true }),
                Animated.timing(anim, { toValue: 0, duration: 900, useNativeDriver: true }),
            ])
        );
        loop.start();
        return () => loop.stop();
    }, []);
    return anim;
}

// ─────────────────────────────────────────────────────────────────────────────
//  HeaderSkeleton — matches HeaderV2 greeting + weather row + StatusBadges pill
// ─────────────────────────────────────────────────────────────────────────────
export const HeaderSkeleton = memo(function HeaderSkeleton() {
    const anim = useShimmer();
    return (
        <View style={sec.headerRoot}>
            {/* Greeting row */}
            <View style={sec.spaceBetween}>
                <View style={{ gap: 6 }}>
                    <Shimmer anim={anim} style={{ width: 110, height: 13, borderRadius: 7 }} />
                    <Shimmer anim={anim} style={{ width: 80, height: 22, borderRadius: 8 }} />
                </View>
                {/* Bell */}
                <Shimmer anim={anim} style={{ width: 40, height: 40, borderRadius: 20 }} />
            </View>

            {/* Weather row */}
            <View style={[sec.row, { marginTop: 10, gap: 8 }]}>
                <Shimmer anim={anim} style={{ width: 13, height: 13, borderRadius: 6 }} />
                <Shimmer anim={anim} style={{ width: 120, height: 11, borderRadius: 6 }} />
                <Shimmer anim={anim} style={{ width: 6, height: 6, borderRadius: 3, opacity: 0.4 }} />
                <Shimmer anim={anim} style={{ width: 70, height: 11, borderRadius: 6 }} />
            </View>

            {/* StatusBadges — Locks pill */}
            <Shimmer
                anim={anim}
                style={{ height: 48, borderRadius: 16, marginTop: 18, width: '100%' }}
            />
        </View>
    );
});

// ─────────────────────────────────────────────────────────────────────────────
//  ScenesSkeleton — 4 pill cards in 2-column grid, matches QuickScenes exactly
//  (width:48.5%, height:62, borderRadius:48, icon circle + label inside)
// ─────────────────────────────────────────────────────────────────────────────
export const ScenesSkeleton = memo(function ScenesSkeleton() {
    const anim = useShimmer();
    return (
        <View style={sec.sectionRoot}>
            {/* Section label row */}
            <View style={sec.spaceBetween}>
                <Shimmer anim={anim} style={{ width: 60, height: 10, borderRadius: 5 }} />
                <Shimmer anim={anim} style={{ width: 36, height: 10, borderRadius: 5 }} />
            </View>

            {/* 2-column grid — 4 pill cards */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 }}>
                {[0, 1, 2, 3].map(i => (
                    <View
                        key={i}
                        style={{
                            width: '48.5%',
                            height: 62,
                            borderRadius: 48,
                            overflow: 'hidden',
                            flexDirection: 'row',
                            alignItems: 'center',
                            paddingHorizontal: 12,
                            gap: 10,
                        }}
                    >
                        {/* Background shimmer */}
                        <Shimmer anim={anim} style={StyleSheet.absoluteFillObject} />
                        {/* Icon circle */}
                        <Shimmer anim={anim} style={{ width: 32, height: 32, borderRadius: 16, opacity: 0.6 }} />
                        {/* Label line */}
                        <Shimmer anim={anim} style={{ flex: 1, height: 11, borderRadius: 6, opacity: 0.6 }} />
                    </View>
                ))}
            </View>
        </View>
    );
});

// ─────────────────────────────────────────────────────────────────────────────
//  HomeAccessSkeleton — 4 drag pills in 2-col grid, matches HomeAccess exactly
//  (height:54, borderRadius:16, knob circle + label inside each pill)
// ─────────────────────────────────────────────────────────────────────────────
export const HomeAccessSkeleton = memo(function HomeAccessSkeleton() {
    const anim = useShimmer();
    // HomeAccess uses paddingHorizontal:20 on parent, gap:12 between cols
    // pill width = (screenWidth - 40 padding - 12 gap) / 2
    const pillW = (SW - 40 - 12) / 2;
    return (
        <View style={sec.sectionRoot}>
            {/* Section label row */}
            <View style={sec.spaceBetween}>
                <Shimmer anim={anim} style={{ width: 100, height: 10, borderRadius: 5 }} />
                <Shimmer anim={anim} style={{ width: 36, height: 10, borderRadius: 5 }} />
            </View>

            {/* Row 1 */}
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 12 }}>
                {[0, 1].map(i => (
                    <View key={i} style={{ width: pillW, height: 54, borderRadius: 16, overflow: 'hidden', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4, gap: 8 }}>
                        <Shimmer anim={anim} style={StyleSheet.absoluteFillObject} />
                        {/* Knob circle */}
                        <Shimmer anim={anim} style={{ width: 46, height: 46, borderRadius: 13, opacity: 0.5 }} />
                        {/* Label */}
                        <Shimmer anim={anim} style={{ flex: 1, height: 11, borderRadius: 6, opacity: 0.5 }} />
                    </View>
                ))}
            </View>
            {/* Row 2 */}
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 12 }}>
                {[0, 1].map(i => (
                    <View key={i} style={{ width: pillW, height: 54, borderRadius: 16, overflow: 'hidden', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4, gap: 8 }}>
                        <Shimmer anim={anim} style={StyleSheet.absoluteFillObject} />
                        <Shimmer anim={anim} style={{ width: 46, height: 46, borderRadius: 13, opacity: 0.5 }} />
                        <Shimmer anim={anim} style={{ flex: 1, height: 11, borderRadius: 6, opacity: 0.5 }} />
                    </View>
                ))}
            </View>
        </View>
    );
});

// ─────────────────────────────────────────────────────────────────────────────
//  RoomsSkeleton — horizontal scroll strip, matches RoomsList card exactly
//  (width:145, height:150, borderRadius:16 — same as real card)
// ─────────────────────────────────────────────────────────────────────────────
export const RoomsSkeleton = memo(function RoomsSkeleton() {
    const anim = useShimmer();
    return (
        <View style={sec.sectionRoot}>
            {/* Section label + "All Rooms" */}
            <View style={sec.spaceBetween}>
                <Shimmer anim={anim} style={{ width: 55, height: 10, borderRadius: 5 }} />
                <Shimmer anim={anim} style={{ width: 60, height: 10, borderRadius: 5 }} />
            </View>

            {/* Horizontal strip — non-wrapping row of room cards */}
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 12, overflow: 'hidden' }}>
                {[0, 1, 2, 3].map(i => (
                    <View
                        key={i}
                        style={{
                            width: 145,
                            height: 150,
                            borderRadius: 16,
                            overflow: 'hidden',
                            justifyContent: 'flex-end',
                            padding: 10,
                        }}
                    >
                        {/* Full card shimmer background */}
                        <Shimmer anim={anim} style={{ ...StyleSheet.absoluteFillObject, borderRadius: 16 }} />
                        {/* Active badge top-left */}
                        <Shimmer anim={anim} style={{ position: 'absolute', top: 8, left: 8, width: 36, height: 20, borderRadius: 8 }} />
                        {/* Room name at bottom */}
                        <Shimmer anim={anim} style={{ width: '70%', height: 11, borderRadius: 6, opacity: 0.7 }} />
                    </View>
                ))}
            </View>
        </View>
    );
});

// ─────────────────────────────────────────────────────────────────────────────
//  CamerasSkeleton — 2 cards (single row), matches HomeCameraStrip card exactly
//  Same usable width as HomeCameraStrip: SW - 40 (parent ScrollView padding only).
//  Do not use sectionRoot horizontal padding here — it would double the inset,
//  shrink the row, and force the two cards to wrap.
// ─────────────────────────────────────────────────────────────────────────────
const CAM_COL_GAP = 10;
const CAM_W = (SW - 40 - CAM_COL_GAP) / 2;
export const CamerasSkeleton = memo(function CamerasSkeleton() {
    const anim = useShimmer();
    return (
        <View style={sec.camSectionRoot}>
            {/* Section label */}
            <View style={sec.spaceBetween}>
                <Shimmer anim={anim} style={{ width: 72, height: 10, borderRadius: 5 }} />
                <Shimmer anim={anim} style={{ width: 36, height: 10, borderRadius: 5 }} />
            </View>

            {/* 2 cards in one row (same aspect ratio as HomeCameraStrip) */}
            <View style={[sec.camGrid, sec.camStripRow, { marginTop: 12, gap: CAM_COL_GAP }]}>
                {[0, 1].map(i => (
                    <View key={i} style={{ width: CAM_W, position: 'relative' }}>
                        <Shimmer
                            anim={anim}
                            style={{ width: CAM_W, height: CAM_W * 0.75, borderRadius: 16 }}
                        />
                        {/* Live badge top-right */}
                        <Shimmer
                            anim={anim}
                            style={{
                                position: 'absolute', top: 8, right: 8,
                                width: 38, height: 18, borderRadius: 8,
                            }}
                        />
                        {/* Camera name bottom-left */}
                        <Shimmer
                            anim={anim}
                            style={{
                                position: 'absolute', bottom: 8, left: 10,
                                width: '55%', height: 11, borderRadius: 6,
                            }}
                        />
                    </View>
                ))}
            </View>
        </View>
    );
});

// ─────────────────────────────────────────────────────────────────────────────
//  Shared section styles
// ─────────────────────────────────────────────────────────────────────────────
const sec = StyleSheet.create({
    headerRoot: {
        paddingHorizontal: 20,
        paddingTop: 60,
        paddingBottom: 4,
    },
    sectionRoot: {
        paddingHorizontal: 20,
        paddingTop: 24,
        paddingBottom: 4,
    },
    /** Like sectionRoot but no horizontal padding — parent ScrollView already has 20+20 */
    camSectionRoot: {
        paddingTop: 24,
        paddingBottom: 4,
    },
    spaceBetween: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    camGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        rowGap: 10,
    },
    camStripRow: {
        flexWrap: 'nowrap',
        justifyContent: 'flex-start',
    },
});
