import { memo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { ChevronRight, Lightbulb, Snowflake } from 'lucide-react-native';

/**
 * StatusBadges
 *
 * Row layout:
 *   [ ● ● ●  Locks · All locked  > ]     [💡 35] [❄ 1]
 *
 * Locks pill is tappable. Lights / AC counts sit outside it on the right.
 */
function StatusBadges({
    lightsOn = 0,
    acOn = 0,
    onPress,
    locks = [],
    lockPassageConfigs = {},
    entities = [],
}) {
    const entityStateMap = {};
    entities.forEach(e => { entityStateMap[e.entity_id] = e; });

    const lockDots = locks.length > 0
        ? locks.slice(0, 6).map(l => {
            const sensorEntityId = lockPassageConfigs[l.entity_id]?.sensor_entity_id;
            const sensorEntity   = sensorEntityId ? entityStateMap[sensorEntityId] : null;
            const lockUnlocked   = l.state === 'unlocked' || l.state === 'open';
            const sensorOn       = sensorEntity?.state === 'on';
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
        <View style={styles.row}>
            <TouchableOpacity
                style={styles.pill}
                onPress={() => onPress && onPress('locks')}
                activeOpacity={0.75}
            >
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

                <Text style={styles.label} numberOfLines={1}>
                    <Text style={[styles.labelBold, hasUnlocked && styles.labelUnlocked]}>
                        Locks
                    </Text>
                    <Text style={styles.labelSep}>{' · '}</Text>
                    <Text style={styles.labelSub}>{subLabel}</Text>
                </Text>

                <ChevronRight size={16} color="rgba(237,237,245,0.35)" />
            </TouchableOpacity>

            <View style={styles.countsRow}>
                <TouchableOpacity
                    style={styles.countChip}
                    onPress={() => onPress?.('lights')}
                    activeOpacity={0.75}
                    accessibilityLabel="Lights"
                >
                    <Lightbulb
                        size={13}
                        color={lightsOn > 0 ? '#FFD54F' : 'rgba(237,237,245,0.35)'}
                        fill={lightsOn > 0 ? '#FFD54F' : 'transparent'}
                    />
                    <Text style={[styles.countText, lightsOn > 0 && styles.countTextActiveLights]}>
                        {lightsOn}
                    </Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={styles.countChip}
                    onPress={() => onPress?.('ac')}
                    activeOpacity={0.75}
                    accessibilityLabel="Air conditioning"
                >
                    <Snowflake
                        size={13}
                        color={acOn > 0 ? '#4FC3F7' : 'rgba(237,237,245,0.35)'}
                    />
                    <Text style={[styles.countText, acOn > 0 && styles.countTextActiveAc]}>
                        {acOn}
                    </Text>
                </TouchableOpacity>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 16,
        gap: 8,
    },
    pill: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        minWidth: 0,
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
        backgroundColor: '#26C6DA',
    },
    dotLocked: {
        backgroundColor: 'rgba(237,237,245,0.18)',
    },
    label: {
        flex: 1,
        fontSize: 13,
        minWidth: 0,
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
    countsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        flexShrink: 0,
    },
    countChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 10,
        paddingVertical: 10,
        borderRadius: 18,
        backgroundColor: '#13132A',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    countText: {
        fontSize: 12,
        fontWeight: '600',
        color: 'rgba(237,237,245,0.4)',
        minWidth: 10,
        textAlign: 'center',
    },
    countTextActiveLights: {
        color: '#FFD54F',
    },
    countTextActiveAc: {
        color: '#4FC3F7',
    },
});

export default memo(StatusBadges);
