/**
 * Room Areas–style pill filter for cover layers (Shutter / Chiffon / Blackout).
 */

import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { CF } from '../../utils/typography';

export default function CoverLayerFilter({ options = [], value, onChange }) {
    if (!options.length) return null;

    return (
        <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
        >
            <View style={styles.bar}>
                {options.map((opt) => {
                    const active = value === opt.id;
                    return (
                        <TouchableOpacity
                            key={opt.id}
                            style={[styles.pill, active && styles.pillActive]}
                            onPress={() => onChange?.(opt.id)}
                            activeOpacity={0.75}
                        >
                            <Text style={[styles.pillText, active && styles.pillTextActive]}>
                                {opt.label}
                            </Text>
                        </TouchableOpacity>
                    );
                })}
            </View>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    scrollContent: {
        paddingVertical: 2,
    },
    bar: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#0f0f1f',
        borderRadius: 999,
        padding: 4,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        gap: 2,
    },
    pill: {
        paddingHorizontal: 18,
        paddingVertical: 8,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: 'transparent',
    },
    pillActive: {
        borderColor: 'rgba(255,255,255,0.85)',
    },
    pillText: {
        color: 'rgba(255,255,255,0.5)',
        fontSize: 13,
        fontFamily: CF.medium,
    },
    pillTextActive: {
        color: '#fff',
    },
});
