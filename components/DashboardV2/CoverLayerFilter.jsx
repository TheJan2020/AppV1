/**
 * Room Areas–style pill filter for cover layers (Shutter / Chiffon / Blackout).
 */

import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { CF } from '../../utils/typography';

export default function CoverLayerFilter({ options = [], value, onChange }) {
    if (!options.length) return null;

    return (
        <View style={styles.wrap}>
            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                nestedScrollEnabled
                style={styles.scroll}
                contentContainerStyle={styles.row}
            >
                {options.map((opt) => {
                    const active = value === opt.id;
                    return (
                        <TouchableOpacity
                            key={opt.id}
                            style={[styles.pill, active && styles.pillActive]}
                            onPress={() => onChange?.(opt.id)}
                            activeOpacity={0.85}
                        >
                            <Text style={[styles.pillText, active && styles.pillTextActive]}>
                                {opt.label}
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
        alignSelf: 'center',
        marginBottom: 14,
        backgroundColor: 'rgba(255,255,255,0.05)',
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
        gap: 3,
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
    },
    pillText: {
        color: 'rgba(237,237,245,0.55)',
        fontSize: 13,
        fontFamily: CF.medium,
        letterSpacing: -0.2,
    },
    pillTextActive: {
        color: '#ededf5',
        fontFamily: CF.semibold,
    },
});
