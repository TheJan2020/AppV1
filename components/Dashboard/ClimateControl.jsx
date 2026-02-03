import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors } from '../../constants/Colors';
import { Thermometer, Fan, Power, snowflake, Flame, Wind } from 'lucide-react-native';
// Note: lucide-react-native exports might differ slightly in casing or availability. 
// Using basic icons: Power (Off), Snowflake (Cool), Flame (Heat), Fan (Fan_only/Speed)

// Map HA modes to Icons/Labels
const MODES = [
    { id: 'off', label: 'Off', icon: Power, color: Colors.textDim },
    { id: 'cool', label: 'Cool', icon: Wind, color: '#42A5F5' }, // Using Wind/Snowflake
    { id: 'heat', label: 'Heat', icon: Flame, color: '#EF5350' },
    { id: 'fan_only', label: 'Fan', icon: Fan, color: Colors.text },
];

export default function ClimateControl({ entity, onSethvac, onSetTemp, onSetFan }) {
    const { state, attributes } = entity;
    const { current_temperature, temperature, fan_mode, fan_modes, hvac_modes, min_temp = 16, max_temp = 30 } = attributes;

    // Render Mode Selector
    const renderModes = () => (
        <View style={styles.row}>
            {MODES.map((mode) => {
                if (hvac_modes && !hvac_modes.includes(mode.id)) return null;
                const isActive = state === mode.id;
                const Icon = mode.icon;
                return (
                    <TouchableOpacity
                        key={mode.id}
                        style={[styles.modeBtn, isActive && { backgroundColor: mode.color + '30', borderColor: mode.color }]}
                        onPress={() => onSethvac(entity, mode.id)}
                    >
                        <Icon size={20} color={isActive ? mode.color : Colors.textDim} />
                        <Text style={[styles.modeText, isActive && { color: mode.color }]}>{mode.label}</Text>
                    </TouchableOpacity>
                );
            })}
        </View>
    );

    // Render Temp Control
    const renderTempControl = () => (
        <View style={styles.tempControl}>
            <TouchableOpacity
                style={styles.tempBtn}
                onPress={() => onSetTemp(entity, (temperature || 24) - 0.5)}
            >
                <Text style={styles.tempBtnText}>-</Text>
            </TouchableOpacity>

            <View style={styles.tempDisplay}>
                <Text style={styles.targetTemp}>{temperature || '--'}</Text>
                <Text style={styles.unit}>°C</Text>
                {current_temperature && (
                    <Text style={styles.currentTemp}>Inside: {current_temperature}°</Text>
                )}
            </View>

            <TouchableOpacity
                style={styles.tempBtn}
                onPress={() => onSetTemp(entity, (temperature || 24) + 0.5)}
            >
                <Text style={styles.tempBtnText}>+</Text>
            </TouchableOpacity>
        </View>
    );

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.name}>{attributes.friendly_name}</Text>
                <Text style={styles.state}>{state.toUpperCase()}</Text>
            </View>

            {renderTempControl()}
            {renderModes()}

            {/* Fan Speed if available */}
            {fan_modes && (
                <View style={styles.fanRow}>
                    <Fan size={16} color={Colors.textDim} />
                    <Text style={styles.fanLabel}>Fan Speed: {fan_mode}</Text>
                    {/* Simplified fan toggle for UI cleanliness, or a cycle button */}
                    <TouchableOpacity onPress={() => {/* Cycle logic could go here */ }}>
                        <Text style={styles.fanAction}>Change</Text>
                    </TouchableOpacity>
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 16,
        padding: 16,
        marginBottom: 16,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 16,
    },
    name: {
        color: Colors.text,
        fontWeight: 'bold',
        fontSize: 16,
    },
    state: {
        color: Colors.textDim,
        fontSize: 12,
        fontWeight: '600',
    },
    tempControl: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20,
        backgroundColor: Colors.background,
        borderRadius: 12,
        padding: 8,
    },
    tempBtn: {
        width: 44,
        height: 44,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: Colors.surface,
        borderRadius: 22,
    },
    tempBtnText: {
        color: Colors.text,
        fontSize: 24,
        fontWeight: '300',
    },
    tempDisplay: {
        alignItems: 'center',
    },
    targetTemp: {
        color: Colors.text,
        fontSize: 32,
        fontWeight: 'bold',
    },
    unit: {
        color: Colors.textDim,
        fontSize: 14,
        position: 'absolute',
        right: -10,
        top: 4,
    },
    currentTemp: {
        color: Colors.textDim,
        fontSize: 12,
        marginTop: 4,
    },
    row: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        marginBottom: 12,
    },
    modeBtn: {
        alignItems: 'center',
        padding: 8,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'transparent',
        width: 60,
    },
    modeText: {
        fontSize: 10,
        marginTop: 4,
        color: Colors.textDim,
        fontWeight: '600',
    },
    fanRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 8,
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: 'rgba(255,255,255,0.1)',
    },
    fanLabel: {
        color: Colors.textDim,
        fontSize: 12,
        marginLeft: 8,
        flex: 1,
    },
    fanAction: {
        color: Colors.primary,
        fontSize: 12,
        fontWeight: 'bold',
    },
});
