import { memo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { ChevronRight } from 'lucide-react-native';

/**
 * SecurityZoneStrip
 *
 * Shows a pill-shaped row:
 *   ●  ●  ●   Security · N zones armed   >
 *
 * Dots represent named zones; active zones are cyan/teal, inactive are dim.
 * Tapping opens the SecurityControlModal (via onPress('security')).
 */
function StatusBadges({ securityState, lightsOn, acOn, doorsOpen, power, onPress, zones = [] }) {

    // Build dot indicators.
    // Each zone: { name, armed: bool }
    // If no zones provided, fall back to deriving count from securityState.
    const resolvedZones = zones.length > 0 ? zones : buildFallbackZones(securityState);

    const armedCount = resolvedZones.filter(z => z.armed).length;

    const getStatusLabel = () => {
        if (!securityState || securityState === 'Unknown') return 'Security';
        if (securityState === 'disarmed') return 'Disarmed';
        if (securityState === 'triggered') return '🚨 Triggered';
        if (securityState === 'armed_away') return 'Armed Away';
        if (securityState === 'armed_home') return 'Armed Home';
        if (securityState === 'armed_night') return 'Armed Night';
        if (securityState === 'arming') return 'Arming…';
        return 'Security';
    };

    const isArmed = securityState && securityState !== 'disarmed' && securityState !== 'Unknown';

    const subLabel = armedCount > 0
        ? `${armedCount} zone${armedCount !== 1 ? 's' : ''} armed`
        : 'All zones disarmed';

    return (
        <TouchableOpacity
            style={styles.pill}
            onPress={() => onPress && onPress('security')}
            activeOpacity={0.75}
        >
            {/* Zone dots — show up to 5 */}
            <View style={styles.dotsRow}>
                {resolvedZones.slice(0, 5).map((zone, i) => (
                    <View
                        key={i}
                        style={[
                            styles.dot,
                            zone.armed ? styles.dotArmed : styles.dotDisarmed,
                        ]}
                    />
                ))}
            </View>

            {/* Label */}
            <Text style={styles.label}>
                <Text style={[styles.labelBold, isArmed && styles.labelArmed]}>
                    {getStatusLabel()}
                </Text>
                <Text style={styles.labelSep}>{' · '}</Text>
                <Text style={styles.labelSub}>{subLabel}</Text>
            </Text>

            {/* Chevron */}
            <ChevronRight size={16} color="rgba(237,237,245,0.35)" style={styles.chevron} />
        </TouchableOpacity>
    );
}

/**
 * When no explicit zone list is passed, synthesise a minimal set based
 * on the alarm_control_panel state so the dots still look reasonable.
 */
function buildFallbackZones(securityState) {
    const armed = securityState && securityState !== 'disarmed' && securityState !== 'Unknown';
    // Return 4 fake zones; if armed, mark first 3 as armed
    return [
        { name: 'Zone 1', armed: armed },
        { name: 'Zone 2', armed: armed },
        { name: 'Zone 3', armed: armed },
        { name: 'Zone 4', armed: false },
    ];
}

const styles = StyleSheet.create({
    pill: {
        flexDirection: 'row',
        alignItems: 'center',
        marginHorizontal: 0,
        marginBottom: 10,
        paddingVertical: 12,
        paddingHorizontal: 14,
        borderRadius: 22,
        backgroundColor: '#13132A',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
        gap: 10,
    },
    dotsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
    },
    dot: {
        width: 8,
        height: 8,
        borderRadius: 4,
    },
    dotArmed: {
        backgroundColor: '#26C6DA', // cyan-teal — matches screenshot
    },
    dotDisarmed: {
        backgroundColor: 'rgba(237,237,245,0.18)',
    },
    label: {
        flex: 1,
        fontSize: 13,
    },
    labelBold: {
        color: 'rgba(237,237,245,0.9)',
        fontWeight: '600',
    },
    labelArmed: {
        color: '#ededf5',
    },
    labelSep: {
        color: 'rgba(237,237,245,0.3)',
        fontWeight: '400',
    },
    labelSub: {
        color: 'rgba(237,237,245,0.5)',
        fontWeight: '400',
    },
    chevron: {
        marginLeft: 'auto',
    },
});

export default memo(StatusBadges);
