/**
 * ClimateGroupCard
 * ──────────────────────────────────────────────────────────────
 * Same grouped shell as Lights / Covers — tuned for 1–few AC units.
 *
 * Always visible: header (name + on/off), temperature, HVAC mode pills
 * Chevron (in ClimateCard): fan speed, presets, timer
 */

import React, { useState, useCallback, useMemo } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity,
    LayoutAnimation, Platform, UIManager,
} from 'react-native';
import { Wind } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import ClimateCard from './ClimateCard';
import { Heading, CF } from '../../utils/typography';
import RoomGroupIconButton from './RoomGroupIconButton';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

function isClimateOn(climate) {
    const state = climate.stateObj?.state || 'off';
    return state !== 'off' && state !== 'unavailable';
}

export default function ClimateGroupCard({
    climates = [],
    onUpdate,
    checkNeedsChange,
    variant = 'default',
}) {
    const isTabletSplit = variant === 'tabletSplit';
    const [detailsExpanded, setDetailsExpanded] = useState(false);

    const anyOn = useMemo(() => climates.some(isClimateOn), [climates]);
    const primary = climates[0];
    const primaryOn = primary ? isClimateOn(primary) : false;

    const handleMasterToggle = useCallback(() => {
        if (!climates.length) return;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        climates.forEach((c) => {
            if (anyOn) {
                onUpdate?.(c.entity_id, 'climate', 'set_hvac_mode', { hvac_mode: 'off' });
            } else {
                const attrs = c.stateObj?.attributes || {};
                const modes = attrs.hvac_modes || [];
                const last = attrs.last_on_operation;
                const mode =
                    last && modes.includes(last) && last !== 'off'
                        ? last
                        : modes.find((m) => m !== 'off') || 'cool';
                onUpdate?.(c.entity_id, 'climate', 'set_hvac_mode', { hvac_mode: mode });
            }
        });
    }, [climates, anyOn, onUpdate]);

    const toggleDetails = () => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setDetailsExpanded((v) => !v);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    };

    if (!climates.length) return null;

    const headerName = climates.length === 1
        ? (primary.displayName || 'Climate')
        : 'Climate';
    const headerStatus = climates.length === 1
        ? (primaryOn ? 'ON' : 'OFF')
        : `${climates.filter(isClimateOn).length} ON`;

    return (
        <View style={[styles.container, isTabletSplit && styles.containerTabletSplit]}>
            <View style={isTabletSplit ? styles.tabletSplitInner : undefined}>
                <View style={[styles.header, isTabletSplit && styles.headerTabletSplit]}>
                    <RoomGroupIconButton
                        active={anyOn}
                        onPress={handleMasterToggle}
                        accessibilityLabel="Toggle climate"
                    >
                        <Wind size={26} color="#fff" strokeWidth={2} />
                    </RoomGroupIconButton>
                    <View style={styles.headerTextBlock}>
                        <Text style={styles.headerTitle} numberOfLines={1}>
                            {headerName}
                        </Text>
                        <Text style={[
                            styles.headerStatus,
                            primaryOn && climates.length === 1 && styles.headerStatusOn,
                        ]}>
                            {headerStatus}
                        </Text>
                    </View>
                </View>

                {climates.map((climate, index) => (
                    <View
                        key={climate.entity_id}
                        style={[
                            styles.unitBlock,
                            index > 0 && styles.unitBlockSpaced,
                        ]}
                    >
                        {climates.length > 1 && (
                            <View style={styles.multiUnitHeader}>
                                <Text style={styles.unitName} numberOfLines={1}>
                                    {climate.displayName}
                                </Text>
                                <Text style={[
                                    styles.unitStatus,
                                    isClimateOn(climate) && styles.unitStatusOn,
                                ]}>
                                    {isClimateOn(climate) ? 'ON' : 'OFF'}
                                </Text>
                            </View>
                        )}
                        <ClimateCard
                            climate={climate}
                            embedded
                            detailsExpanded={detailsExpanded}
                            onToggleDetails={toggleDetails}
                            needsChange={checkNeedsChange?.(climate.entity_id)}
                            onUpdate={onUpdate}
                        />
                    </View>
                ))}

            </View>
        </View>
    );
}

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
    tabletSplitInner: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 16,
    },
    headerTabletSplit: {
        marginBottom: 12,
    },
    headerTextBlock: {
        flex: 1,
        justifyContent: 'center',
    },
    headerTitle: { ...Heading.md, color: '#fff' },
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
    unitBlock: {},
    unitBlockSpaced: {
        marginTop: 8,
        paddingTop: 16,
        borderTopWidth: 1,
        borderTopColor: 'rgba(255,255,255,0.06)',
    },
    multiUnitHeader: {
        flexDirection: 'row',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        marginBottom: 10,
        gap: 8,
    },
    unitName: {
        flex: 1,
        color: 'rgba(255,255,255,0.55)',
        fontSize: 12,
        fontFamily: CF.semibold,
        letterSpacing: 0.3,
    },
    unitStatus: {
        fontSize: 12,
        fontStyle: 'italic',
        fontFamily: CF.regular,
        color: 'rgba(255,255,255,0.4)',
    },
    unitStatusOn: {
        color: '#44C8CA',
    },
});
