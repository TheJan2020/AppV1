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

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity,
    LayoutAnimation, Platform, UIManager, useWindowDimensions,
} from 'react-native';
import { LayoutGrid, ChevronDown, ChevronUp, ChevronLeft, ChevronRight } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import CoverCard, { AllLayersCoverCard } from './CoverCard';
import CoverLayerFilter from './CoverLayerFilter';
import { Heading, CF } from '../../utils/typography';
import { groupCoversByWindow, layersForWindow, defaultLayerTab, ALL_LAYERS_ID } from '../../utils/coverWindows';
import { toggleCoverWindow, toggleCoverEntities } from '../../utils/coverWindowControl';
import SmoothSlider, { SMOOTH_SLIDER_THUMB as THUMB, SMOOTH_SLIDER_TRACK as TRACK } from './SmoothSlider';
import RoomGroupIconButton from './RoomGroupIconButton';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

/** Matches LightsGroupCard — room content 20+20, group card 18+18 */
const COVERS_GROUP_HORIZONTAL_PAD = 18;
const COVERS_GRID_GAP = 10;

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

function PositionSlider({ value, onRelease, onDragStart, onDragEnd }) {
    return (
        <View pointerEvents="box-none">
            <SmoothSlider
                value={value}
                max={100}
                minVal={0}
                onRelease={onRelease}
                onDragStart={onDragStart}
                onDragEnd={onDragEnd}
                showFill
                showBubble
                fillColor="rgba(58,123,213,0.55)"
                trackBg={<View style={styles.sliderRail} />}
            />
            <View style={styles.sliderHints} pointerEvents="none">
                <View style={styles.sliderHintItem}>
                    <ChevronLeft size={14} color="rgba(255,255,255,0.35)" strokeWidth={2.5} />
                    <Text style={styles.sliderHintClose}>Close</Text>
                </View>
                <View style={styles.sliderHintItem}>
                    <Text style={styles.sliderHintOpen}>Open</Text>
                    <ChevronRight size={14} color="rgba(68,200,202,0.65)" strokeWidth={2.5} />
                </View>
            </View>
        </View>
    );
}

// ── Individual expanded cover card — uses the full CoverCard design ───────
function ExpandedCoverCard({ cover, allEntities, weather, onUpdate, onSliderDragStart, onSliderDragEnd }) {
    const sensorId = cover.linkedSensorId || cover.entity_id.replace('cover.', 'sensor.');
    const sensor   = allEntities?.find(e => e.entity_id === sensorId);
    return (
        <CoverCard
            cover={cover}
            sensor={sensor}
            weather={weather}
            onUpdate={onUpdate}
            onSliderDragStart={onSliderDragStart}
            onSliderDragEnd={onSliderDragEnd}
        />
    );
}

/** Keeps cover cards mounted — only toggles visibility for instant tab switches. */
function WindowTabPanel({ active, children }) {
    return (
        <View
            style={[styles.windowTabPanel, !active && styles.windowTabPanelHidden]}
            pointerEvents={active ? 'auto' : 'none'}
            collapsable={false}
        >
            {children}
        </View>
    );
}

// ── Window group — filter by layer, show matching cover cards ─────────────
function WindowCoverSection({
    window, covers, allEntities, weather, onUpdate, onSliderDragStart, onSliderDragEnd, gridColumns, coverCellWidth,
}) {
    const layers = useMemo(() => layersForWindow(covers), [covers]);
    const [activeLayer, setActiveLayer] = useState(() => defaultLayerTab(layersForWindow(covers)));
    const [toggling, setToggling] = useState(false);

    useEffect(() => {
        if (layers.length && !layers.some(l => l.id === activeLayer)) {
            setActiveLayer(defaultLayerTab(layers));
        }
    }, [layers, activeLayer]);

    const showAllTab = layers.some(l => l.id === ALL_LAYERS_ID);
    const windowIsOpen = covers.some(isActive);

    const handleWindowToggle = async () => {
        if (toggling) return;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        setToggling(true);
        try {
            await toggleCoverWindow(window.id);
        } catch (err) {
            console.warn('[WindowCoverSection] toggle failed:', err?.message ?? err);
            const service = windowIsOpen ? 'close_cover' : 'open_cover';
            covers.forEach(c => onUpdate?.(c.entity_id, 'cover', service, {}));
        } finally {
            setToggling(false);
        }
    };

    return (
        <View style={styles.windowSection}>
            <View style={styles.windowHeader}>
                <RoomGroupIconButton
                    active={windowIsOpen}
                    onPress={handleWindowToggle}
                    disabled={toggling}
                    size={40}
                    accessibilityLabel={`Toggle ${window.name}`}
                >
                    <LayoutGrid size={20} color="#fff" />
                </RoomGroupIconButton>
                <Text style={styles.windowTitle}>{window.name}</Text>
            </View>
            <CoverLayerFilter
                options={layers}
                value={activeLayer}
                onChange={setActiveLayer}
            />
            <View style={[styles.grid, styles.windowGrid, styles.windowTabStack]}>
                {showAllTab && (
                    <WindowTabPanel active={activeLayer === ALL_LAYERS_ID}>
                        <View style={[styles.cell, styles.cellWindow, styles.cellFullWidth]}>
                            <AllLayersCoverCard
                                covers={covers}
                                windowName={window.name}
                                weather={weather}
                                onUpdate={onUpdate}
                                onSliderDragStart={onSliderDragStart}
                                onSliderDragEnd={onSliderDragEnd}
                            />
                        </View>
                    </WindowTabPanel>
                )}
                {covers.map(c => (
                    <WindowTabPanel key={c.entity_id} active={activeLayer === c.coverLayer}>
                        <View style={[styles.cell, styles.cellWindow, styles.cellFullWidth]}>
                            <ExpandedCoverCard
                                cover={c}
                                allEntities={allEntities}
                                weather={weather}
                                onUpdate={onUpdate}
                                onSliderDragStart={onSliderDragStart}
                                onSliderDragEnd={onSliderDragEnd}
                            />
                        </View>
                    </WindowTabPanel>
                ))}
            </View>
        </View>
    );
}

// ── Main component ────────────────────────────────────────────────────────
export default function CoversGroupCard({
    covers = [], allEntities = [], onUpdate, onSliderDragStart, onSliderDragEnd,
    gridColumns = 2, variant = 'default', coverWindows = [], room = null, contentWidth,
}) {
    const isTabletSplit = variant === 'tabletSplit';
    const [expanded, setExpanded] = useState(isTabletSplit);
    const { width: windowWidth } = useWindowDimensions();

    const coverCellWidth = useMemo(() => {
        const cols = Math.max(1, gridColumns);
        const ww = windowWidth > 0 ? windowWidth : 375;
        const inner =
            contentWidth != null && contentWidth > 0
                ? contentWidth - COVERS_GROUP_HORIZONTAL_PAD * 2
                : ww - 40 - COVERS_GROUP_HORIZONTAL_PAD * 2;
        return Math.max(0, Math.floor((inner - COVERS_GRID_GAP * (cols - 1)) / cols));
    }, [windowWidth, contentWidth, gridColumns]);

    const weatherEntity = useMemo(
        () => allEntities?.find((e) => e.entity_id?.startsWith('weather.')),
        [allEntities],
    );

    // ── Master curtain detection ──────────────────────────────────────────
    const masterCover      = covers.find(isMasterCover);
    const individualCovers = covers.filter(c => !isMasterCover(c));
    const groupIsOpen      = masterCover
        ? isActive(masterCover)
        : individualCovers.some(isActive);
    const masterPos        = masterCover ? getPosition(masterCover) : 50;

    const openCount = individualCovers.filter(c => isActive(c)).length;
    const [groupToggling, setGroupToggling] = useState(false);

    const { windowGroups, ungrouped } = useMemo(
        () => groupCoversByWindow(individualCovers, coverWindows, room),
        [individualCovers, coverWindows, room],
    );
    const hasWindowGroups = windowGroups.length > 0;

    // ── Header icon → master curtain, or toggle all room covers via API ───
    const handleMasterToggle = async () => {
        if (groupToggling) return;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

        if (masterCover) {
            onUpdate?.(
                masterCover.entity_id, 'cover',
                groupIsOpen ? 'close_cover' : 'open_cover',
                {},
            );
            return;
        }

        if (!individualCovers.length) return;

        setGroupToggling(true);
        try {
            await toggleCoverEntities(individualCovers.map(c => c.entity_id));
        } catch (err) {
            console.warn('[CoversGroupCard] room toggle failed:', err?.message ?? err);
            const service = groupIsOpen ? 'close_cover' : 'open_cover';
            individualCovers.forEach(c => onUpdate?.(c.entity_id, 'cover', service, {}));
        } finally {
            setGroupToggling(false);
        }
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
        <View style={[styles.container, isTabletSplit && styles.containerTabletSplit]}>
            <View style={isTabletSplit ? styles.tabletSplitInner : undefined}>
            {/* Header */}
            <View style={[styles.header, isTabletSplit && styles.headerTabletSplit]}>
                <RoomGroupIconButton
                    active={groupIsOpen}
                    onPress={handleMasterToggle}
                    disabled={groupToggling || !(masterCover || individualCovers.length)}
                    accessibilityLabel="Toggle all covers"
                >
                    <LayoutGrid size={26} color="#fff" />
                </RoomGroupIconButton>
                <View style={styles.headerTextBlock}>
                    <Text style={styles.headerTitle}>Covers</Text>
                    <Text style={[styles.headerStatus, openCount > 0 && styles.headerStatusOn]}>
                        {openCount > 0 ? `${openCount} OPEN` : 'CLOSED'}
                    </Text>
                </View>
            </View>

            {/* Dots — show all covers including master */}
            <DotsRow covers={individualCovers} />

            {/* Master position slider — only when a master curtain exists */}
            {masterCover && (
                <View style={styles.sliderSection}>
                    <PositionSlider
                        value={masterPos}
                        onRelease={handlePositionRelease}
                        onDragStart={onSliderDragStart}
                        onDragEnd={onSliderDragEnd}
                    />
                </View>
            )}

            {/* Expanded grid — master curtain excluded */}
            {expanded && (
                <>
                    {hasWindowGroups && windowGroups.map(({ window, covers: winCovers }) => (
                        <WindowCoverSection
                            key={window.id}
                            window={window}
                            covers={winCovers}
                            allEntities={allEntities}
                            weather={weatherEntity}
                            onUpdate={onUpdate}
                            onSliderDragStart={onSliderDragStart}
                            onSliderDragEnd={onSliderDragEnd}
                            gridColumns={gridColumns}
                            coverCellWidth={coverCellWidth}
                        />
                    ))}

                    {(ungrouped.length > 0 || !hasWindowGroups) && (
                        <View style={[styles.grid, isTabletSplit && styles.gridTabletSplit]}>
                            {(hasWindowGroups ? ungrouped : individualCovers).map(c => (
                                <View
                                    key={c.entity_id}
                                    style={[
                                        styles.cell,
                                        gridColumns === 1
                                            ? styles.cellFullWidth
                                            : (coverCellWidth > 0 && { width: coverCellWidth }),
                                    ]}
                                >
                                    <ExpandedCoverCard
                                        cover={c}
                                        allEntities={allEntities}
                                        weather={weatherEntity}
                                        onUpdate={onUpdate}
                                        onSliderDragStart={onSliderDragStart}
                                        onSliderDragEnd={onSliderDragEnd}
                                    />
                                </View>
                            ))}
                        </View>
                    )}
                </>
            )}

            {isTabletSplit && !expanded && <View style={styles.tabletSplitSpacer} />}

            {/* Chevron */}
            <TouchableOpacity style={styles.chevron} onPress={toggle} activeOpacity={0.7}>
                {expanded
                    ? <ChevronUp   size={22} color="rgba(255,255,255,0.45)" />
                    : <ChevronDown size={22} color="rgba(255,255,255,0.45)" />}
            </TouchableOpacity>
            </View>
        </View>
    );
}

// ── Styles ────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
    container: {
        backgroundColor: '#13132A',
        borderRadius: 20,
        paddingHorizontal: COVERS_GROUP_HORIZONTAL_PAD,
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
    tabletSplitInner: {
        flex: 1,
        justifyContent: 'space-between',
    },
    tabletSplitSpacer: {
        flex: 1,
        minHeight: 8,
    },

    // Header
    header:     { flexDirection: 'row', alignItems: 'center', marginBottom: 18 },
    headerTabletSplit: {
        marginBottom: 12,
    },
    headerTitle: { ...Heading.md, color: '#fff' },
    headerTextBlock: {
        flex: 1,
        justifyContent: 'center',
    },
    headerStatus: {
        marginTop: 2,
        fontSize: 13,
        fontStyle: 'italic',
        fontFamily: CF.regular,
        color: 'rgba(255,255,255,0.45)',
    },
    headerStatusOn: {
        color: '#44C8CA',
    },

    // Dots
    dotsRow: {
        flexDirection: 'row', flexWrap: 'wrap',
        justifyContent: 'center', alignItems: 'center',
        marginBottom: 16,
    },

    sliderSection: {
        marginBottom: 8,
    },

    sliderRail: {
        position: 'absolute', left: 0, right: 0,
        height: TRACK, borderRadius: TRACK / 2,
        backgroundColor: 'rgba(255,255,255,0.12)',
        top: (THUMB + 18 - TRACK) / 2,
    },

    sliderHints: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: 8,
        paddingHorizontal: 0,
    },
    sliderHintItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    sliderHintClose: {
        color: 'rgba(255,255,255,0.35)',
        fontSize: 12,
        fontWeight: '500',
        fontFamily: CF.medium,
    },
    sliderHintOpen: {
        color: 'rgba(68,200,202,0.65)',
        fontSize: 12,
        fontWeight: '500',
        fontFamily: CF.medium,
    },

    chevron: { alignItems: 'center', paddingVertical: 6 },

    // Expanded grid — same horizontal edge as slider (no negative margin / cell inset)
    grid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 10,
        marginTop: 10,
        marginBottom: 8,
    },
    gridTabletSplit: {
        flex: 1,
        alignContent: 'flex-start',
    },
    cell: {
        marginBottom: 10,
    },
    cellFullWidth: {
        width: '100%',
    },
    cellWindow: {},
    windowSection: {
        marginTop: 8,
        marginBottom: 12,
        paddingBottom: 8,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.06)',
    },
    windowHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 10,
        gap: 12,
    },
    windowTitle: {
        color: 'rgba(255,255,255,0.85)',
        fontSize: 15,
        fontFamily: CF.semibold,
        flex: 1,
    },
    windowGrid: {
        marginTop: 12,
        marginHorizontal: 0,
    },
    windowTabStack: {
        position: 'relative',
        width: '100%',
        minHeight: 300,
    },
    windowTabPanel: {
        width: '100%',
    },
    windowTabPanelHidden: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        opacity: 0,
        zIndex: 0,
    },
    windowEmpty: {
        color: 'rgba(255,255,255,0.35)',
        fontSize: 12,
        fontFamily: CF.regular,
        paddingVertical: 16,
        textAlign: 'center',
        width: '100%',
    },
});
