import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Lightbulb, Play, Sliders } from 'lucide-react-native';
import { Colors } from '../../constants/Colors';
import WidgetCard from './WidgetCard';
import * as Haptics from 'expo-haptics';

export default function QuickControlsWidget({
    entities,
    callService,
    span = 2,
    totalColumns = 4,
}) {
    // Get lights (max 6)
    const lights = entities
        .filter(e => e.entity_id.startsWith('light.') && e.state !== 'unavailable')
        .sort((a, b) => {
            // On lights first
            if (a.state === 'on' && b.state !== 'on') return -1;
            if (a.state !== 'on' && b.state === 'on') return 1;
            return 0;
        })
        .slice(0, 6);

    // Get scenes (max 4)
    const scenes = entities
        .filter(e => e.entity_id.startsWith('scene.'))
        .slice(0, 4);

    const handleToggleLight = (entity) => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        callService('light', 'toggle', { entity_id: entity.entity_id });
    };

    const handleActivateScene = (entity) => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        callService('scene', 'turn_on', { entity_id: entity.entity_id });
    };

    if (lights.length === 0 && scenes.length === 0) return null;

    return (
        <WidgetCard title="Quick Controls" icon={Sliders} span={span} totalColumns={totalColumns}>
            {/* Lights */}
            {lights.length > 0 && (
                <View style={styles.section}>
                    <View style={styles.lightGrid}>
                        {lights.map(light => {
                            const isOn = light.state === 'on';
                            const name = light.attributes?.friendly_name || light.entity_id.split('.')[1];
                            return (
                                <TouchableOpacity
                                    key={light.entity_id}
                                    style={[styles.lightBtn, isOn && styles.lightBtnOn]}
                                    onPress={() => handleToggleLight(light)}
                                    activeOpacity={0.7}
                                >
                                    <Lightbulb size={16} color={isOn ? '#FFD700' : Colors.textDim} />
                                    <Text style={[styles.lightName, isOn && styles.lightNameOn]} numberOfLines={1}>
                                        {name}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                </View>
            )}

            {/* Scenes */}
            {scenes.length > 0 && (
                <View style={[styles.section, lights.length > 0 && { marginTop: 10 }]}>
                    <View style={styles.sceneRow}>
                        {scenes.map(scene => {
                            const name = scene.attributes?.friendly_name || scene.entity_id.split('.')[1];
                            return (
                                <TouchableOpacity
                                    key={scene.entity_id}
                                    style={styles.sceneBtn}
                                    onPress={() => handleActivateScene(scene)}
                                    activeOpacity={0.7}
                                >
                                    <Play size={12} color="#8947ca" />
                                    <Text style={styles.sceneName} numberOfLines={1}>{name}</Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                </View>
            )}
        </WidgetCard>
    );
}

const styles = StyleSheet.create({
    section: {},
    lightGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    lightBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: 'rgba(255,255,255,0.06)',
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'transparent',
    },
    lightBtnOn: {
        backgroundColor: 'rgba(255,215,0,0.12)',
        borderColor: 'rgba(255,215,0,0.3)',
    },
    lightName: {
        color: Colors.textDim,
        fontSize: 12,
        fontWeight: '500',
        maxWidth: 100,
    },
    lightNameOn: {
        color: Colors.text,
        fontWeight: '600',
    },
    sceneRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    sceneBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: 'rgba(137,71,202,0.12)',
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'rgba(137,71,202,0.25)',
    },
    sceneName: {
        color: Colors.text,
        fontSize: 12,
        fontWeight: '500',
        maxWidth: 100,
    },
});
