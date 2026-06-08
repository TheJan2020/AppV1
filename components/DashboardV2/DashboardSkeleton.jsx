/**
 * DashboardSkeleton + per-section skeleton exports
 *
 * Section skeletons use onLayout-measured widths so tablet grids match real components.
 */
import { View, StyleSheet, Animated, useWindowDimensions } from 'react-native';
import { useEffect, useRef, useState, useCallback, memo } from 'react';

const CONTENT_H_PAD = 40;
const DEFAULT_GAP = 10;

// ── Base shimmer block ─────────────────────────────────────────────────────────
function Shimmer({ style, anim }) {
    const opacity = anim.interpolate({ inputRange: [0, 1], outputRange: [0.06, 0.18] });
    return <Animated.View style={[sk.shimmer, style, { opacity }]} />;
}

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
    }, [anim]);
    return anim;
}

/** Measure parent width and compute fixed pixel cell width (matches QuickScenes / RoomsList). */
function useMeasuredGrid(columns, gap = DEFAULT_GAP) {
    const [gridWidth, setGridWidth] = useState(0);
    const onLayout = useCallback((e) => {
        const w = e.nativeEvent.layout.width;
        if (w > 0) setGridWidth(w);
    }, []);
    const cellWidth =
        gridWidth > 0
            ? Math.floor((gridWidth - gap * (columns - 1)) / columns)
            : null;
    return { onLayout, cellWidth, gridWidth };
}

function isTabletWidth(width, height) {
    return Math.min(width, height) >= 768;
}

// ── Full-page skeleton (initial load) ─────────────────────────────────────────
function DashboardSkeleton() {
    const anim = useShimmer();
    const { width, height } = useWindowDimensions();
    const tablet = isTabletWidth(width, height);
    const roomCount = tablet ? 6 : 3;
    const sceneCols = tablet ? 4 : 2;
    const { onLayout: onSceneGrid, cellWidth: sceneCellW } = useMeasuredGrid(sceneCols, DEFAULT_GAP);
    const { onLayout: onRoomGrid, cellWidth: roomCellW } = useMeasuredGrid(tablet ? 6 : 3, 12);
    const { onLayout: onCamGrid, cellWidth: camCellW } = useMeasuredGrid(2, DEFAULT_GAP);

    const fallbackSceneW = (width - CONTENT_H_PAD - DEFAULT_GAP * (sceneCols - 1)) / sceneCols;
    const fallbackRoomW = tablet
        ? (width - CONTENT_H_PAD - 12 * 5) / 6
        : 120;
    const fallbackCamW = (width - CONTENT_H_PAD - DEFAULT_GAP) / 2;

    return (
        <View style={sk.root}>
            <View style={sk.header}>
                <View style={sk.headerLeft}>
                    <Shimmer anim={anim} style={{ width: 120, height: 14, borderRadius: 7, marginBottom: 8 }} />
                    <Shimmer anim={anim} style={{ width: 80, height: 10, borderRadius: 5 }} />
                </View>
                <Shimmer anim={anim} style={{ width: 44, height: 44, borderRadius: 22 }} />
            </View>

            <View style={sk.row}>
                {[90, 76, 84, 70].map((w, i) => (
                    <Shimmer key={i} anim={anim} style={{ width: w, height: 34, borderRadius: 17 }} />
                ))}
            </View>

            <Shimmer anim={anim} style={{ width: 60, height: 10, borderRadius: 5, marginTop: 24, marginBottom: 12 }} />
            <View style={[sk.gridRow, { gap: DEFAULT_GAP }]} onLayout={onSceneGrid}>
                {Array.from({ length: tablet ? 4 : 4 }).map((_, i) => (
                    <Shimmer
                        key={`scene-${i}`}
                        anim={anim}
                        style={{
                            width: sceneCellW ?? fallbackSceneW,
                            height: 62,
                            borderRadius: 48,
                        }}
                    />
                ))}
            </View>

            <Shimmer anim={anim} style={{ width: 55, height: 10, borderRadius: 5, marginTop: 24, marginBottom: 12 }} />
            <View style={[sk.gridRow, { gap: 12 }]} onLayout={onRoomGrid}>
                {Array.from({ length: roomCount }).map((_, i) => (
                    <Shimmer
                        key={`room-${i}`}
                        anim={anim}
                        style={{
                            width: roomCellW ?? fallbackRoomW,
                            height: tablet ? 140 : 90,
                            borderRadius: 16,
                        }}
                    />
                ))}
            </View>
            {tablet && (
                <Shimmer
                    anim={anim}
                    style={{
                        alignSelf: 'center',
                        marginTop: 12,
                        width: 160,
                        height: 38,
                        borderRadius: 12,
                    }}
                />
            )}

            <Shimmer anim={anim} style={{ width: 72, height: 10, borderRadius: 5, marginTop: 24, marginBottom: 12 }} />
            <View style={[sk.gridRow, { gap: DEFAULT_GAP }]} onLayout={onCamGrid}>
                {[0, 1].map((i) => (
                    <Shimmer
                        key={`cam-${i}`}
                        anim={anim}
                        style={{
                            width: camCellW ?? fallbackCamW,
                            height: (camCellW ?? fallbackCamW) * 0.75,
                            borderRadius: 16,
                        }}
                    />
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
    gridRow: {
        flexDirection: 'row',
        flexWrap: 'nowrap',
        alignItems: 'flex-start',
    },
});

export default memo(DashboardSkeleton);

// ─────────────────────────────────────────────────────────────────────────────
export const HeaderSkeleton = memo(function HeaderSkeleton() {
    const anim = useShimmer();
    return (
        <View style={sec.headerRoot}>
            <View style={sec.spaceBetween}>
                <View style={{ gap: 6 }}>
                    <Shimmer anim={anim} style={{ width: 110, height: 13, borderRadius: 7 }} />
                    <Shimmer anim={anim} style={{ width: 80, height: 22, borderRadius: 8 }} />
                </View>
                <Shimmer anim={anim} style={{ width: 40, height: 40, borderRadius: 20 }} />
            </View>

            <View style={[sec.row, { marginTop: 10, gap: 8 }]}>
                <Shimmer anim={anim} style={{ width: 13, height: 13, borderRadius: 6 }} />
                <Shimmer anim={anim} style={{ width: 120, height: 11, borderRadius: 6 }} />
                <Shimmer anim={anim} style={{ width: 6, height: 6, borderRadius: 3, opacity: 0.4 }} />
                <Shimmer anim={anim} style={{ width: 70, height: 11, borderRadius: 6 }} />
            </View>

            <Shimmer anim={anim} style={{ height: 48, borderRadius: 16, marginTop: 18, width: '100%' }} />
        </View>
    );
});

// ─────────────────────────────────────────────────────────────────────────────
export const ScenesSkeleton = memo(function ScenesSkeleton({ columns = 2 }) {
    const anim = useShimmer();
    const { width } = useWindowDimensions();
    const isTabletRow = columns >= 4;
    const pillCount = isTabletRow ? 4 : 4;
    const { onLayout, cellWidth } = useMeasuredGrid(columns, DEFAULT_GAP);
    const fallbackW = (width - CONTENT_H_PAD - DEFAULT_GAP * (columns - 1)) / columns;
    const pillW = cellWidth ?? fallbackW;

    const pillStyle = {
        width: pillW,
        height: 62,
        borderRadius: 48,
        overflow: 'hidden',
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        gap: 10,
        flexShrink: 0,
    };

    return (
        <View style={sec.sectionRoot}>
            <View style={sec.spaceBetween}>
                <Shimmer anim={anim} style={{ width: 60, height: 10, borderRadius: 5 }} />
                <Shimmer anim={anim} style={{ width: 36, height: 10, borderRadius: 5 }} />
            </View>

            <View
                style={[sec.gridRow, { marginTop: 12, gap: DEFAULT_GAP, flexWrap: isTabletRow ? 'nowrap' : 'wrap' }]}
                onLayout={onLayout}
            >
                {Array.from({ length: pillCount }).map((_, i) => (
                    <View key={i} style={pillStyle}>
                        <Shimmer anim={anim} style={StyleSheet.absoluteFillObject} />
                        <Shimmer anim={anim} style={{ width: 32, height: 32, borderRadius: 16, opacity: 0.6 }} />
                        <Shimmer anim={anim} style={{ flex: 1, height: 11, borderRadius: 6, opacity: 0.6 }} />
                    </View>
                ))}
            </View>
        </View>
    );
});

// ─────────────────────────────────────────────────────────────────────────────
export const HomeAccessSkeleton = memo(function HomeAccessSkeleton({ columns = 2 }) {
    const anim = useShimmer();
    const { width } = useWindowDimensions();
    const isTabletRow = columns >= 4;
    const pillCount = 4;
    const gap = 12;
    const { onLayout, cellWidth } = useMeasuredGrid(columns, gap);
    const fallbackW = (width - CONTENT_H_PAD - gap * (columns - 1)) / columns;
    const pillW = cellWidth ?? fallbackW;

    return (
        <View style={sec.sectionRoot}>
            <View style={sec.spaceBetween}>
                <Shimmer anim={anim} style={{ width: 100, height: 10, borderRadius: 5 }} />
                <Shimmer anim={anim} style={{ width: 36, height: 10, borderRadius: 5 }} />
            </View>

            <View
                style={[sec.gridRow, { marginTop: 12, gap, flexWrap: isTabletRow ? 'nowrap' : 'wrap' }]}
                onLayout={onLayout}
            >
                {Array.from({ length: pillCount }).map((_, i) => (
                    <View
                        key={i}
                        style={{
                            width: pillW,
                            height: 54,
                            borderRadius: 16,
                            overflow: 'hidden',
                            flexDirection: 'row',
                            alignItems: 'center',
                            paddingHorizontal: 4,
                            gap: 8,
                            flexShrink: 0,
                        }}
                    >
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
export const RoomsSkeleton = memo(function RoomsSkeleton({ columns = 2, layout = 'horizontal' }) {
    const anim = useShimmer();
    const { width } = useWindowDimensions();
    const isTabletHome = layout === 'tablet-home';
    const isGridLayout = layout === 'grid' || isTabletHome;
    const gap = 12;
    const previewCount = isTabletHome ? 6 : 4;
    const cardHeight = isTabletHome || columns >= 6 ? 140 : isGridLayout ? 180 : 150;
    const horizontalCardW = 145;

    const { onLayout, cellWidth } = useMeasuredGrid(isGridLayout ? columns : 1, gap);
    const fallbackGridW =
        isGridLayout
            ? Math.floor((width - CONTENT_H_PAD - gap * (columns - 1)) / columns)
            : horizontalCardW;
    const cardW = isGridLayout ? (cellWidth ?? fallbackGridW) : horizontalCardW;

    const cardShell = {
        width: cardW,
        height: cardHeight,
        borderRadius: 16,
        overflow: 'hidden',
        justifyContent: 'flex-end',
        padding: 10,
        flexShrink: 0,
    };

    return (
        <View style={sec.sectionRoot}>
            <View style={sec.spaceBetween}>
                <Shimmer anim={anim} style={{ width: 55, height: 10, borderRadius: 5 }} />
                {!isTabletHome && (
                    <Shimmer anim={anim} style={{ width: 60, height: 10, borderRadius: 5 }} />
                )}
            </View>

            <View
                style={[
                    sec.gridRow,
                    {
                        marginTop: 12,
                        gap,
                        flexWrap: isTabletHome ? 'nowrap' : (isGridLayout ? 'wrap' : 'nowrap'),
                    },
                ]}
                onLayout={isGridLayout ? onLayout : undefined}
            >
                {Array.from({ length: previewCount }).map((_, i) => (
                    <View key={i} style={cardShell}>
                        <Shimmer anim={anim} style={{ ...StyleSheet.absoluteFillObject, borderRadius: 16 }} />
                        <Shimmer
                            anim={anim}
                            style={{ position: 'absolute', top: 8, left: 8, width: 36, height: 20, borderRadius: 8 }}
                        />
                        <Shimmer anim={anim} style={{ width: '70%', height: 11, borderRadius: 6, opacity: 0.7 }} />
                    </View>
                ))}
            </View>

            {isTabletHome && (
                <View style={sec.viewAllBtnShell}>
                    <Shimmer anim={anim} style={sec.viewAllBtnShimmer} />
                </View>
            )}
        </View>
    );
});

// ─────────────────────────────────────────────────────────────────────────────
export const CamerasSkeleton = memo(function CamerasSkeleton({ columns = 2 }) {
    const anim = useShimmer();
    const { width } = useWindowDimensions();
    const { onLayout, cellWidth } = useMeasuredGrid(columns, DEFAULT_GAP);
    const fallbackW = (width - CONTENT_H_PAD - DEFAULT_GAP * (columns - 1)) / columns;
    const camW = cellWidth ?? fallbackW;
    const camH = camW * 0.75;

    return (
        <View style={sec.sectionRoot}>
            <View style={sec.spaceBetween}>
                <Shimmer anim={anim} style={{ width: 72, height: 10, borderRadius: 5 }} />
                <Shimmer anim={anim} style={{ width: 36, height: 10, borderRadius: 5 }} />
            </View>

            <View
                style={[sec.gridRow, { marginTop: 12, gap: DEFAULT_GAP }]}
                onLayout={onLayout}
            >
                {[0, 1].map((i) => (
                    <View key={i} style={{ width: camW, height: camH, flexShrink: 0 }}>
                        <Shimmer anim={anim} style={{ width: camW, height: camH, borderRadius: 16 }} />
                        <Shimmer
                            anim={anim}
                            style={{
                                position: 'absolute',
                                top: 8,
                                right: 8,
                                width: 38,
                                height: 18,
                                borderRadius: 8,
                            }}
                        />
                        <Shimmer
                            anim={anim}
                            style={{
                                position: 'absolute',
                                bottom: 8,
                                left: 10,
                                width: camW * 0.55,
                                height: 11,
                                borderRadius: 6,
                            }}
                        />
                    </View>
                ))}
            </View>
        </View>
    );
});

const sec = StyleSheet.create({
    headerRoot: {
        paddingTop: 60,
        paddingBottom: 4,
    },
    sectionRoot: {
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
    gridRow: {
        flexDirection: 'row',
        flexWrap: 'nowrap',
        alignItems: 'flex-start',
    },
    viewAllBtnShell: {
        alignSelf: 'center',
        marginTop: 4,
        marginBottom: 8,
        borderRadius: 12,
        overflow: 'hidden',
    },
    viewAllBtnShimmer: {
        width: 180,
        height: 40,
        borderRadius: 12,
    },
});
