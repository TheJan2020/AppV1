import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Zap, Moon, Sun, LogOut, Home } from 'lucide-react-native';
import { CF } from '../../utils/typography';
import React from 'react';

function getSceneIcon(name = '') {
    const n = (name || '').toLowerCase();
    if (n.includes('night') || n.includes('sleep')) return Moon;
    if (n.includes('morning') || n.includes('wake'))  return Sun;
    if (n.includes('leav') || n.includes('away') || n.includes('out')) return LogOut;
    if (n.includes('arriv') || n.includes('home') || n.includes('back')) return Home;
    return Zap;
}

export default function SceneCard({ id, label, onPress, style }) {
    const Icon = getSceneIcon(label || '');

    return (
        <TouchableOpacity
            key={id}
            style={[styles.card, style]}
            onPress={() => onPress && onPress(id)}
            activeOpacity={0.75}
        >
            <View style={styles.iconContainer}>
                <Icon size={26} color="#8947ca" />
            </View>
            <Text style={styles.label} numberOfLines={1}>{label}</Text>
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    card: {
        width: '100%',
        height: 62,
        backgroundColor: '#12132a',
        borderRadius: 48,
        borderWidth: 1,
        borderColor: '#212136',
        paddingHorizontal: 12,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    iconContainer: {
        width: 36,
        height: 36,
        borderRadius: 0,
        backgroundColor: 'transparent',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
    },
    label: {
        flex: 1,
        color: '#ededf5',
        fontSize: 13,
        fontFamily: CF.medium,
        letterSpacing: 0.1,
    },
});
