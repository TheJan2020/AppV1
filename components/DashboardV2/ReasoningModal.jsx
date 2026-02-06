import { View, Text, StyleSheet, Modal, TouchableOpacity, ScrollView } from 'react-native';
import { BlurView } from 'expo-blur';
import { X } from 'lucide-react-native';
import { Colors } from '../../constants/Colors';

export default function ReasoningModal({ visible, onClose, entityId, reasoning, confidence, lastUpdated }) {
    if (!reasoning) return null;

    const formatDate = (dateStr) => {
        const date = new Date(dateStr);
        return date.toLocaleString();
    };

    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            onRequestClose={onClose}
        >
            <BlurView intensity={20} style={styles.overlay}>
                <View style={styles.modalContainer}>
                    <View style={styles.modal}>
                        {/* Header */}
                        <View style={styles.header}>
                            <View style={styles.headerContent}>
                                <Text style={styles.headerTitle}>Preference Analysis</Text>
                                <Text style={styles.headerSubtitle}>{entityId}</Text>
                            </View>
                            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                                <X size={24} color={Colors.text} />
                            </TouchableOpacity>
                        </View>

                        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
                            {/* Confidence */}
                            <View style={styles.section}>
                                <Text style={styles.sectionTitle}>Confidence Score</Text>
                                <Text style={styles.confidenceValue}>
                                    {(confidence * 100).toFixed(1)}%
                                </Text>
                            </View>

                            {/* Formula */}
                            <View style={styles.section}>
                                <Text style={styles.sectionTitle}>Calculation Formula</Text>
                                <View style={styles.codeBlock}>
                                    <Text style={styles.codeText}>{reasoning.formula}</Text>
                                </View>
                            </View>

                            {/* Statistics */}
                            <View style={styles.section}>
                                <Text style={styles.sectionTitle}>Analysis Statistics</Text>
                                <View style={styles.statsGrid}>
                                    <View style={styles.statItem}>
                                        <Text style={styles.statLabel}>Total Samples</Text>
                                        <Text style={styles.statValue}>{reasoning.total_samples}</Text>
                                    </View>
                                    <View style={styles.statItem}>
                                        <Text style={styles.statLabel}>Manual Changes</Text>
                                        <Text style={styles.statValue}>{reasoning.manual_changes}</Text>
                                    </View>
                                    <View style={styles.statItem}>
                                        <Text style={styles.statLabel}>Passive Presence</Text>
                                        <Text style={styles.statValue}>{reasoning.passive_presence}</Text>
                                    </View>
                                    <View style={styles.statItem}>
                                        <Text style={styles.statLabel}>Dominant State</Text>
                                        <Text style={[styles.statValue, { color: Colors.primary }]}>
                                            {reasoning.dominant_state.toUpperCase()}
                                        </Text>
                                    </View>
                                </View>
                            </View>

                            {/* State Distribution */}
                            <View style={styles.section}>
                                <Text style={styles.sectionTitle}>State Distribution</Text>
                                {Object.entries(reasoning.state_distribution).map(([state, score]) => {
                                    const total = Object.values(reasoning.state_distribution).reduce((a, b) => a + b, 0);
                                    const percentage = Math.round((score / total) * 100);

                                    return (
                                        <View key={state} style={styles.distributionItem}>
                                            <View style={styles.distributionHeader}>
                                                <Text style={styles.distributionState}>{state.toUpperCase()}</Text>
                                                <Text style={styles.distributionPercentage}>{percentage}%</Text>
                                            </View>
                                            <View style={styles.distributionBarBackground}>
                                                <View style={[
                                                    styles.distributionBarFill,
                                                    {
                                                        width: `${percentage}%`,
                                                        backgroundColor: state === reasoning.dominant_state
                                                            ? Colors.primary
                                                            : Colors.textSecondary
                                                    }
                                                ]} />
                                            </View>
                                            <Text style={styles.distributionScore}>
                                                Weighted Score: {score}
                                            </Text>
                                        </View>
                                    );
                                })}
                            </View>

                            {/* Methodology */}
                            <View style={styles.section}>
                                <Text style={styles.sectionTitle}>Analysis Methodology</Text>
                                <Text style={styles.methodologyText}>
                                    • Manual changes by the user are weighted 10x higher than passive presence
                                    {'\n'}• Only records when user was present in the same room are considered
                                    {'\n'}• Confidence increases with sample size (20+ samples for full confidence)
                                    {'\n'}• Analysis groups data by season, day type, and hour
                                </Text>
                            </View>

                            {/* Last Updated */}
                            {lastUpdated && (
                                <View style={styles.section}>
                                    <Text style={styles.sectionTitle}>Last Analyzed</Text>
                                    <Text style={styles.lastUpdatedText}>{formatDate(lastUpdated)}</Text>
                                </View>
                            )}
                        </ScrollView>
                    </View>
                </View>
            </BlurView>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    modalContainer: {
        width: '90%',
        maxHeight: '80%',
    },
    modal: {
        backgroundColor: Colors.background,
        borderRadius: 20,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: Colors.border,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 20,
        borderBottomWidth: 1,
        borderBottomColor: Colors.border,
        backgroundColor: Colors.surface,
    },
    headerContent: {
        flex: 1,
        gap: 4,
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: Colors.text,
    },
    headerSubtitle: {
        fontSize: 12,
        color: Colors.textSecondary,
        fontFamily: 'monospace',
    },
    closeButton: {
        padding: 4,
    },
    content: {
        maxHeight: 500,
    },
    section: {
        padding: 20,
        borderBottomWidth: 1,
        borderBottomColor: Colors.border,
    },
    sectionTitle: {
        fontSize: 12,
        fontWeight: '600',
        color: Colors.textSecondary,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginBottom: 12,
    },
    confidenceValue: {
        fontSize: 32,
        fontWeight: '700',
        color: Colors.primary,
    },
    codeBlock: {
        backgroundColor: Colors.surface,
        padding: 12,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: Colors.border,
    },
    codeText: {
        fontSize: 12,
        fontFamily: 'monospace',
        color: Colors.text,
    },
    statsGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 12,
    },
    statItem: {
        flex: 1,
        minWidth: '45%',
        padding: 12,
        backgroundColor: Colors.surface,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: Colors.border,
    },
    statLabel: {
        fontSize: 11,
        color: Colors.textSecondary,
        marginBottom: 4,
    },
    statValue: {
        fontSize: 18,
        fontWeight: '700',
        color: Colors.text,
    },
    distributionItem: {
        marginBottom: 16,
    },
    distributionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 6,
    },
    distributionState: {
        fontSize: 14,
        fontWeight: '600',
        color: Colors.text,
    },
    distributionPercentage: {
        fontSize: 14,
        fontWeight: '600',
        color: Colors.primary,
    },
    distributionBarBackground: {
        height: 12,
        backgroundColor: Colors.border,
        borderRadius: 6,
        overflow: 'hidden',
        marginBottom: 4,
    },
    distributionBarFill: {
        height: '100%',
        borderRadius: 6,
    },
    distributionScore: {
        fontSize: 11,
        color: Colors.textSecondary,
        fontStyle: 'italic',
    },
    methodologyText: {
        fontSize: 13,
        color: Colors.text,
        lineHeight: 20,
    },
    lastUpdatedText: {
        fontSize: 13,
        color: Colors.text,
    },
});
