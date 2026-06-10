import React, { memo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { CF } from '../../utils/typography';

/**
 * Pill nav for sub-areas inside a parent room (e.g. Majlis → Main | Dressing Area | Wash Area).
 * @param {{ key: string, label: string }[]} tabs
 * @param {string} activeKey
 * @param {(key: string) => void} onSelect
 */
function RoomAreasNavBar({ tabs = [], activeKey, onSelect }) {
    if (!tabs.length) return null;

    return (
        <View style={styles.wrap}>
            <ScrollView
                horizontal
                showsHorizontalScrollIndicator
                nestedScrollEnabled
                contentContainerStyle={styles.row}
            >
                {tabs.map((tab) => {
                    const active = tab.key === activeKey;
                    return (
                        <TouchableOpacity
                            key={tab.key}
                            style={[styles.pill, active && styles.pillActive]}
                            onPress={() => onSelect(tab.key)}
                            activeOpacity={0.85}
                        >
                            <Text style={[styles.label, active && styles.labelActive]}>
                                {tab.label}
                            </Text>
                        </TouchableOpacity>
                    );
                })}
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    wrap: {
        marginBottom: 18,
        backgroundColor: '#13132A',
        borderRadius: 28,
        overflow: 'hidden',
        paddingHorizontal: 6,
        paddingVertical: 6,
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingVertical: 2,
    },
    pill: {
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 22,
        borderWidth: 1.5,
        borderColor: 'transparent',
    },
    pillActive: {
        borderColor: 'rgba(255,255,255,0.92)',
        backgroundColor: 'transparent',
    },
    label: {
        color: 'rgba(237,237,245,0.55)',
        fontSize: 14,
        fontFamily: CF.medium,
        letterSpacing: -0.2,
    },
    labelActive: {
        color: '#ededf5',
        fontFamily: CF.semibold,
    },
});

export default memo(RoomAreasNavBar);
