import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Shield, Lightbulb, Fan, DoorOpen, Zap } from 'lucide-react-native';
import { Colors } from '../../constants/Colors';
import WidgetCard from './WidgetCard';

export default function StatusWidget({ securityState, lightsOn, acOn, doorsOpen, power, onBadgePress, span = 1, totalColumns = 4 }) {
    const badges = [
        { id: 'lights', icon: Lightbulb, label: `${lightsOn} Lights`, color: '#FFD700' },
        { id: 'ac', icon: Fan, label: `${acOn} AC`, color: '#4FC3F7' },
        { id: 'doors', icon: DoorOpen, label: doorsOpen > 0 ? `${doorsOpen} Open` : 'All Closed', color: doorsOpen > 0 ? '#FF5252' : '#81C784' },
        { id: 'security', icon: Shield, label: securityState || 'Disarmed', color: securityState === 'disarmed' ? Colors.primary : '#FF5252' },
    ];

    if (power) {
        badges.push({ id: 'power', icon: Zap, label: `${power} W`, color: '#FFB74D' });
    }

    const widthPercent = `${(span / totalColumns) * 100 - 1}%`;

    return (
        <View style={[styles.card, { width: widthPercent }]}>
            <Text style={styles.title}>Status</Text>
            <View style={styles.badgeGrid}>
                {badges.map(b => (
                    <TouchableOpacity
                        key={b.id}
                        style={styles.badge}
                        onPress={() => onBadgePress?.(b.id)}
                        activeOpacity={0.7}
                    >
                        <b.icon size={14} color={b.color} />
                        <Text style={styles.badgeLabel}>{b.label}</Text>
                    </TouchableOpacity>
                ))}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    card: {
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
        borderRadius: 20,
        padding: 16,
        marginBottom: 10,
    },
    title: {
        color: Colors.text,
        fontSize: 14,
        fontWeight: '600',
        marginBottom: 12,
    },
    badgeGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    badge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.06)',
        paddingVertical: 6,
        paddingHorizontal: 10,
        borderRadius: 20,
        gap: 6,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    badgeLabel: {
        color: '#fff',
        fontWeight: '600',
        fontSize: 12,
    },
});
