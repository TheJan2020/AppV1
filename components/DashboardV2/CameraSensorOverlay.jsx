/**
 * CameraSensorOverlay
 * Small sensor status pills rendered as an absolute overlay inside a camera frame.
 * Active sensors are colour-coded and pulse; inactive sensors are shown dimly.
 *
 * Usage:
 *   <View style={{ position: 'relative' }}>
 *     <CameraImage ... />
 *     <CameraSensorOverlay sensorIds={['binary_sensor.motion', ...]} entityMap={entityMap} />
 *   </View>
 */

import { View, Text, StyleSheet, Animated } from 'react-native';
import { useEffect, useRef, memo } from 'react';
import { Wind, Eye, AlertTriangle, Activity, Thermometer, Droplets, Zap } from 'lucide-react-native';

// ── Helpers ───────────────────────────────────────────────────────────────────

export const isSensorActive = (state) => {
    if (!state) return false;
    const s = String(state).toLowerCase();
    return s === 'on' || s === 'detected' || s === 'motion' || s === 'occupied' || s === 'active' || s === 'open';
};

export const buildEntityMap = (haEntities = []) => {
    const map = {};
    haEntities.forEach(e => { map[e.entity_id] = e; });
    return map;
};

export const resolveSensorIds = (cam, cameraSensors = {}) => {
    const camId = cam?.id || cam?.name || '';
    const keys = [camId, `camera.${camId}`, camId.replace(/^camera\./, '')];
    for (const k of keys) {
        if (cameraSensors[k]?.length) return cameraSensors[k];
    }
    return [];
};

const getSensorMeta = (entityId = '', name = '') => {
    const id = entityId.toLowerCase();
    const n  = name.toLowerCase();
    if (id.includes('motion')  || n.includes('motion'))    return { icon: Wind,          color: '#f97316', short: 'Motion'  };
    if (id.includes('occupan') || n.includes('occupan'))   return { icon: Eye,           color: '#a855f7', short: 'Occupied'};
    if (id.includes('smoke')   || n.includes('smoke'))     return { icon: AlertTriangle, color: '#ef4444', short: 'Smoke'   };
    if (id.includes('fire')    || n.includes('fire'))      return { icon: AlertTriangle, color: '#ef4444', short: 'Fire'    };
    if (id.includes('temp')    || n.includes('temp'))      return { icon: Thermometer,   color: '#38bdf8', short: 'Temp'    };
    if (id.includes('humid')   || n.includes('humid'))     return { icon: Droplets,      color: '#06b6d4', short: 'Humidity'};
    if (id.includes('door')    || n.includes('door'))      return { icon: Activity,      color: '#eab308', short: 'Door'   };
    if (id.includes('window')  || n.includes('window'))    return { icon: Activity,      color: '#eab308', short: 'Window' };
    if (id.includes('vibrat')  || n.includes('vibrat'))    return { icon: Zap,           color: '#f97316', short: 'Vibrate'};
    if (id.includes('tamper')  || n.includes('tamper'))    return { icon: AlertTriangle, color: '#ef4444', short: 'Tamper' };
    if (id.includes('power')   || n.includes('power'))     return { icon: Zap,           color: '#facc15', short: 'Power'  };
    return { icon: Activity, color: '#8947ca', short: 'Sensor' };
};

// ── Single pill ───────────────────────────────────────────────────────────────

const SensorPill = memo(({ entityId, entity }) => {
    const pulse  = useRef(new Animated.Value(1)).current;
    const active = isSensorActive(entity?.state);
    const fname  = entity?.attributes?.friendly_name || '';
    const meta   = getSensorMeta(entityId, fname);
    const Icon   = meta.icon;
    const color  = active ? meta.color : 'rgba(255,255,255,0.35)';

    // State text: for numeric sensors show value+unit, for binary show active label
    const unit   = entity?.attributes?.unit_of_measurement || '';
    const rawState = entity?.state ?? '?';
    const isNumeric = !isNaN(parseFloat(rawState));
    const stateLabel = isNumeric
        ? `${rawState}${unit ? unit : ''}`
        : (active ? meta.short : 'Clear');

    useEffect(() => {
        if (!active) { pulse.setValue(1); return; }
        const anim = Animated.loop(
            Animated.sequence([
                Animated.timing(pulse, { toValue: 0.25, duration: 700, useNativeDriver: true }),
                Animated.timing(pulse, { toValue: 1,    duration: 700, useNativeDriver: true }),
            ])
        );
        anim.start();
        return () => anim.stop();
    }, [active]);

    return (
        <View style={[
            pill.wrap,
            active
                ? { backgroundColor: 'rgba(0,0,0,0.62)' }
                : { backgroundColor: 'rgba(0,0,0,0.40)' },
        ]}>
            {active && <View style={[pill.dot, { backgroundColor: meta.color }]} />}
            <Text style={[pill.text, { color: active ? '#fff' : 'rgba(255,255,255,0.4)' }]} numberOfLines={1}>
                {stateLabel}
            </Text>
        </View>
    );
});

// ── Main overlay ──────────────────────────────────────────────────────────────

/**
 * @param {string[]}  sensorIds   - entity_id list assigned to this camera
 * @param {object}    entityMap   - { entity_id: entityObject } from HA live state
 * @param {'tl'|'tr'|'bl'|'br'} position - corner (default 'bl')
 * @param {number}    maxVisible  - cap pills shown (default 6)
 */
function CameraSensorOverlay({ sensorIds = [], entityMap = {}, position = 'bl', maxVisible = 6 }) {
    if (!sensorIds.length) return null;

    // Only show sensors that are currently active/triggered — hide Clear ones
    const activeSensorIds = sensorIds.filter(sId => isSensorActive(entityMap[sId]?.state));
    if (!activeSensorIds.length) return null;

    const visible = activeSensorIds.slice(0, maxVisible);

    const posStyle = {
        tl: { top: 6,    left:  6  },
        tr: { top: 6,    right: 6  },
        bl: { bottom: 6, left:  6  },
        br: { bottom: 6, right: 6  },
    }[position] || { bottom: 6, left: 6 };

    return (
        <View style={[overlay.container, posStyle]}>
            {visible.map(sId => (
                <SensorPill key={sId} entityId={sId} entity={entityMap[sId]} />
            ))}
            {activeSensorIds.length > maxVisible && (
                <View style={[pill.wrap, { backgroundColor: 'rgba(0,0,0,0.55)' }]}>
                    <Text style={[pill.text, { color: 'rgba(255,255,255,0.5)' }]}>
                        +{activeSensorIds.length - maxVisible}
                    </Text>
                </View>
            )}
        </View>
    );
}

const overlay = StyleSheet.create({
    container: {
        position: 'absolute',
        flexDirection: 'column',
        gap: 3,
        alignItems: 'flex-start',
        // prevent touch pass-through issues
        pointerEvents: 'none',
    },
});

const pill = StyleSheet.create({
    wrap: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 7,
        paddingVertical: 4,
        borderRadius: 20,
        borderWidth: 0,
    },
    dot: {
        width: 5,
        height: 5,
        borderRadius: 3,
        marginRight: 2,
    },
    text: {
        fontSize: 9,
        fontWeight: '700',
        letterSpacing: 0.3,
    },
});

export default memo(CameraSensorOverlay);
