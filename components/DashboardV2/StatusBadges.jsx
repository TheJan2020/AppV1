import { memo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { ChevronRight } from 'lucide-react-native';

/**
 * StatusBadges
 *
 * Shows a pill-shaped row:
 *   ●  ●  ●   Locks · N unlocked   >
 *
 * Dots represent individual lock entities from Home Assistant.
 * A dot is lit (orange) when the lock is unlocked, dim when locked.
 * Tapping navigates to the Home Access section (via onPress('locks')).
 */
function StatusBadges({ securityState, lightsOn, acOn, doorsOpen, power, onPress, zones = [], locks = [], lockPassageConfigs = {}, entities = [] }) {

    // Build a fast entity state lookup for sensors
    const entityStateMap = {};
    entities.forEach(e => { entityStateMap[e.entity_id] = e; });

    // Build dot indicators. Dot is lit if the lock is unlocked OR its linked sensor is on.
    // Both conditions are checked — either one triggers the alert dot.
    const lockDots = locks.length > 0
        ? locks.slice(0, 6).map(l => {
            const sensorEntityId = lockPassageConfigs[l.entity_id]?.sensor_entity_id;
            const sensorEntity   = sensorEntityId ? entityStateMap[sensorEntityId] : null;
            const lockUnlocked   = l.state === 'unlocked' || l.state === 'open';
            const sensorOn       = sensorEntity?.state === 'on';
            // Lit if lock is unlocked OR sensor is triggered (either condition)
            const lit = lockUnlocked || sensorOn;
            return { name: l.attributes?.friendly_name || l.entity_id, unlocked: lit };
          })
        : [
            { name: 'Lock 1', unlocked: false },
            { name: 'Lock 2', unlocked: false },
            { name: 'Lock 3', unlocked: false },
            { name: 'Lock 4', unlocked: false },
          ];

    const unlockedCount = lockDots.filter(l => l.unlocked).length;
    const hasUnlocked = unlockedCount > 0;

    const subLabel = hasUnlocked
        ? `${unlockedCount} unlocked`
        : 'All locked';

    return (
        <TouchableOpacity
            style={styles.pill}
            onPress={() => onPress && onPress('locks')}
            activeOpacity={0.75}
        >
            {/* Lock dots — show up to 6 */}
            <View style={styles.dotsRow}>
                {lockDots.map((lock, i) => (
                    <View
                        key={i}
                        style={[
                            styles.dot,
                            lock.unlocked ? styles.dotUnlocked : styles.dotLocked,
                        ]}
                    />
                ))}
            </View>

            {/* Label */}
            <Text style={styles.label}>
                <Text style={[styles.labelBold, hasUnlocked && styles.labelUnlocked]}>
                    Locks
                </Text>
                <Text style={styles.labelSep}>{' · '}</Text>
                <Text style={styles.labelSub}>{subLabel}</Text>
            </Text>

            {/* Chevron */}
            <ChevronRight size={16} color="rgba(237,237,245,0.35)" style={styles.chevron} />
        </TouchableOpacity>
    );
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
    dotUnlocked: {
        backgroundColor: '#26C6DA', // cyan-teal — unlocked
    },
    dotLocked: {
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
    labelUnlocked: {
        color: '#26C6DA',
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
