import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { Colors } from '../../constants/Colors';
import { DoorOpen, House, Power, Sparkles } from 'lucide-react-native';

const ACTIONS = [
    { id: 'leaving', label: 'Leaving Home', icon: DoorOpen },
    { id: 'arriving', label: 'Arriving Home', icon: House },
    { id: 'off', label: 'All Off', icon: Power },
    { id: 'cleaning', label: 'Cleaning Mode', icon: Sparkles },
];

export default function QuickActions() {
    return (
        <View style={styles.container}>
            {ACTIONS.map((action) => (
                <TouchableOpacity key={action.id} style={styles.button}>
                    <View style={styles.iconCircle}>
                        <action.icon size={22} color={Colors.text} />
                    </View>
                    <Text style={styles.label}>{action.label}</Text>
                </TouchableOpacity>
            ))}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        marginBottom: 30,
        gap: 12,
    },
    button: {
        width: '48%', // 2 cols
        backgroundColor: Colors.surface,
        borderRadius: 16,
        padding: 16,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    iconCircle: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: 'rgba(255,255,255,0.1)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    label: {
        color: Colors.text,
        fontSize: 14,
        fontWeight: '600',
        flex: 1,
    },
});
