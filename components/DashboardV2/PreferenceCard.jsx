import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useState } from 'react';
import { Colors } from '../../constants/Colors';
import { ChevronDown, ChevronUp } from 'lucide-react-native';
import ReasoningModal from './ReasoningModal';

export default function PreferenceCard({ preference, dayType }) {
    const [expanded, setExpanded] = useState(false);
    const [reasoningVisible, setReasoningVisible] = useState(false);

    const getStateColor = (state) => {
        if (state === 'on' || state === 'home' || state === 'open') return Colors.success;
        if (state === 'off' || state === 'away' || state === 'closed') return Colors.textSecondary;
        return Colors.warning;
    };

    const getStateIcon = (state) => {
        if (state === 'on') return '●';
        if (state === 'off') return '○';
        return '◐';
    };

    const confidencePercentage = Math.round(preference.confidence * 100);
    const confidenceColor =
        confidencePercentage >= 80 ? Colors.success :
            confidencePercentage >= 60 ? Colors.warning :
                Colors.error;

    return (
        <>
            <View style={styles.card}>
                <TouchableOpacity
                    style={styles.cardHeader}
                    onPress={() => setExpanded(!expanded)}
                >
                    <View style={styles.entityInfo}>
                        <Text style={styles.entityName}>
                            {preference.entity_id.split('.')[1].replace(/_/g, ' ')}
                        </Text>
                        <Text style={styles.entityId}>{preference.entity_id}</Text>
                    </View>
                    {expanded ? (
                        <ChevronUp size={20} color={Colors.textSecondary} />
                    ) : (
                        <ChevronDown size={20} color={Colors.textSecondary} />
                    )}
                </TouchableOpacity>

                {expanded && (
                    <View style={styles.cardContent}>
                        {/* Current State */}
                        <View style={styles.stateRow}>
                            <Text style={styles.stateLabel}>Current:</Text>
                            <View style={styles.stateValue}>
                                <Text style={[
                                    styles.stateIcon,
                                    { color: getStateColor(preference.current_state) }
                                ]}>
                                    {getStateIcon(preference.current_state)}
                                </Text>
                                <Text style={[
                                    styles.stateText,
                                    { color: getStateColor(preference.current_state) }
                                ]}>
                                    {preference.current_state.toUpperCase()}
                                </Text>
                            </View>
                        </View>

                        {/* Preferred State */}
                        <View style={styles.stateRow}>
                            <Text style={styles.stateLabel}>AI Preference ({dayType}):</Text>
                            <View style={styles.stateValue}>
                                <Text style={[
                                    styles.stateIcon,
                                    { color: getStateColor(preference.preferred_state) }
                                ]}>
                                    {getStateIcon(preference.preferred_state)}
                                </Text>
                                <Text style={[
                                    styles.stateText,
                                    { color: getStateColor(preference.preferred_state) }
                                ]}>
                                    {preference.preferred_state.toUpperCase()}
                                </Text>
                            </View>
                        </View>

                        {/* Confidence Bar */}
                        <View style={styles.confidenceContainer}>
                            <Text style={styles.confidenceLabel}>
                                Confidence: {confidencePercentage}%
                            </Text>
                            <View style={styles.confidenceBarBackground}>
                                <View style={[
                                    styles.confidenceBarFill,
                                    {
                                        width: `${confidencePercentage}%`,
                                        backgroundColor: confidenceColor
                                    }
                                ]} />
                            </View>
                        </View>

                        {/* Sample Count */}
                        <Text style={styles.sampleCount}>
                            Based on {preference.sample_count} observations
                        </Text>

                        {/* Why Button */}
                        <TouchableOpacity
                            style={styles.whyButton}
                            onPress={() => setReasoningVisible(true)}
                        >
                            <Text style={styles.whyButtonText}>Why this preference?</Text>
                        </TouchableOpacity>
                    </View>
                )}
            </View>

            <ReasoningModal
                visible={reasoningVisible}
                onClose={() => setReasoningVisible(false)}
                entityId={preference.entity_id}
                reasoning={preference.reasoning}
                confidence={preference.confidence}
                lastUpdated={preference.last_updated}
            />
        </>
    );
}

const styles = StyleSheet.create({
    card: {
        backgroundColor: Colors.surface,
        borderRadius: 12,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: Colors.border,
        overflow: 'hidden',
    },
    cardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 16,
    },
    entityInfo: {
        flex: 1,
        gap: 4,
    },
    entityName: {
        fontSize: 16,
        fontWeight: '600',
        color: Colors.text,
        textTransform: 'capitalize',
    },
    entityId: {
        fontSize: 12,
        color: Colors.textSecondary,
        fontFamily: 'monospace',
    },
    cardContent: {
        paddingHorizontal: 16,
        paddingBottom: 16,
        gap: 12,
        borderTopWidth: 1,
        borderTopColor: Colors.border,
        paddingTop: 12,
    },
    stateRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    stateLabel: {
        fontSize: 14,
        color: Colors.textSecondary,
        fontWeight: '500',
    },
    stateValue: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    stateIcon: {
        fontSize: 16,
        fontWeight: 'bold',
    },
    stateText: {
        fontSize: 14,
        fontWeight: '600',
    },
    confidenceContainer: {
        gap: 6,
    },
    confidenceLabel: {
        fontSize: 12,
        color: Colors.textSecondary,
        fontWeight: '500',
    },
    confidenceBarBackground: {
        height: 8,
        backgroundColor: Colors.border,
        borderRadius: 4,
        overflow: 'hidden',
    },
    confidenceBarFill: {
        height: '100%',
        borderRadius: 4,
    },
    sampleCount: {
        fontSize: 12,
        color: Colors.textSecondary,
        fontStyle: 'italic',
    },
    whyButton: {
        marginTop: 4,
        padding: 10,
        borderRadius: 8,
        backgroundColor: Colors.primary + '15',
        borderWidth: 1,
        borderColor: Colors.primary + '40',
        alignItems: 'center',
    },
    whyButtonText: {
        fontSize: 13,
        fontWeight: '600',
        color: Colors.primary,
    },
});
