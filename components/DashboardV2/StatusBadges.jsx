import { memo, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { ChevronRight, Lightbulb, Snowflake, Lock, LockOpen } from 'lucide-react-native';
import { accessStatusDots, partitionDoorAccess } from '../../utils/haHouseDevices';

/**
 * StatusBadges
 *
 * Row layout:
 *   [ 🔓 ● ● ●  > ]     [💡 35] [❄ 1]
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
    doorSensors = [],
    doorOpeners = [],
}) {
    const lockDots = useMemo(() => {
        const doorAccess = partitionDoorAccess({
            locks,
            sensors: doorSensors,
            openers: doorOpeners,
            lockPassageConfigs,
            entities,
        });
        return accessStatusDots({ locks, openers: doorOpeners, doorAccess });
    }, [locks, doorSensors, doorOpeners, lockPassageConfigs, entities]);

    const hasUnlocked = lockDots.some((dot) => dot.tone !== 'closed');
    const LockIcon = hasUnlocked ? LockOpen : Lock;

    return (
        <View style={styles.row}>
            <TouchableOpacity
                style={styles.pill}
                onPress={() => onPress && onPress('locks')}
                activeOpacity={0.75}
                accessibilityLabel={hasUnlocked ? 'Locks, some unlocked' : 'Locks, all locked'}
            >
                <LockIcon
                    size={14}
                    color={hasUnlocked ? '#26C6DA' : 'rgba(237,237,245,0.45)'}
                    strokeWidth={2.2}
                />
                <View style={styles.dotsRow}>
                    {lockDots.map((dot) => (
                        <View
                            key={dot.key}
                            style={[
                                styles.dot,
                                dot.tone === 'open' && styles.dotOpen,
                                dot.tone === 'unlocked' && styles.dotUnlocked,
                                dot.tone === 'closed' && styles.dotLocked,
                            ]}
                        />
                    ))}
                </View>

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
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 5,
    },
    dot: {
        width: 8,
        height: 8,
        borderRadius: 4,
    },
    dotOpen: {
        backgroundColor: '#FFA000',
    },
    dotUnlocked: {
        backgroundColor: '#26C6DA',
    },
    dotLocked: {
        backgroundColor: 'rgba(237,237,245,0.18)',
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
