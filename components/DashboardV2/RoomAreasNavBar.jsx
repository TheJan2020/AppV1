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
                style={styles.scroll}
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
        width: '100%',
        marginBottom: 14,
        backgroundColor: '#13132A',
        borderRadius: 20,
        overflow: 'hidden',
        paddingHorizontal: 5,
        paddingVertical: 4,
    },
    scroll: {
        flexGrow: 0,
        flexShrink: 0,
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 3,
        minWidth: '100%',
    },
    pill: {
        paddingHorizontal: 14,
        paddingVertical: 6,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: 'transparent',
    },
    pillActive: {
        borderColor: 'rgba(255,255,255,0.92)',
        backgroundColor: 'transparent',
    },
    label: {
        color: 'rgba(237,237,245,0.55)',
        fontSize: 13,
        fontFamily: CF.medium,
        letterSpacing: -0.2,
    },
    labelActive: {
        color: '#ededf5',
        fontFamily: CF.semibold,
    },
});

export default memo(RoomAreasNavBar);
