import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Modal } from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { ChevronLeft, ChevronDown, ChevronRight, Info, Zap, Check, X } from 'lucide-react-native';
import * as SecureStore from 'expo-secure-store';
import { Colors } from '../constants/Colors';

export default function AIPreferencesScreen() {
    const [loading, setLoading] = useState(true);
    const [groupedData, setGroupedData] = useState({});
    const [context, setContext] = useState({});
    const [expandedAreas, setExpandedAreas] = useState({});
    const [selectedEntity, setSelectedEntity] = useState(null);
    const [backendUrl, setBackendUrl] = useState('');
    const [selectedHour, setSelectedHour] = useState(new Date().getHours()); // Auto-select current hour // null = show all hours

    useEffect(() => {
        loadPreferences();
    }, [selectedHour]); // Reload when hour changes

    const loadPreferences = async () => {
        try {
            setLoading(true);
            const url = await SecureStore.getItemAsync('admin_url');
            setBackendUrl(url);

            const now = new Date();
            const season = getSeasonFromDate(now);
            const dayType = getDayType(now);

            // Build query with hour filter
            let query = `?season=${season}&dayType=${dayType}`;
            if (selectedHour !== null) {
                query += `&hour=${selectedHour}`;
            }

            const response = await fetch(`${url}/api/preferences/get-all${query}`);
            const data = await response.json();

            if (data.success) {
                console.log('[AI Preferences] API Response:', JSON.stringify(data, null, 2));

                // Sort entities within each area by domain (light, climate, media, etc.)
                const sortedGrouped = {};
                Object.keys(data.grouped).forEach(areaName => {
                    sortedGrouped[areaName] = data.grouped[areaName].sort((a, b) => {
                        const domainA = a.entity_id.split('.')[0];
                        const domainB = b.entity_id.split('.')[0];
                        return domainA.localeCompare(domainB);
                    });
                });

                setGroupedData(sortedGrouped);
                setContext(data.context);

                // Auto-expand first area
                const firstArea = Object.keys(sortedGrouped)[0];
                if (firstArea) {
                    setExpandedAreas({ [firstArea]: true });
                }

                // Debug: Log entities with manual actions
                Object.entries(sortedGrouped).forEach(([area, entities]) => {
                    entities.forEach(e => {
                        if (e.manual_count > 0) {
                            console.log(`[Manual Action Found] ${area}/${e.entity_id}: hour=${e.hour}, manual_count=${e.manual_count}`);
                        }
                    });
                });
            }
        } catch (error) {
            console.error('Failed to load preferences:', error);
        } finally {
            setLoading(false);
        }
    };

    const getSeasonFromDate = (date) => {
        const month = date.getMonth() + 1;
        if (month >= 3 && month <= 5) return 'spring';
        if (month >= 6 && month <= 8) return 'summer';
        if (month >= 9 && month <= 11) return 'fall';
        return 'winter';
    };

    const getDayType = (date) => {
        const day = date.getDay();
        return (day === 5 || day === 6) ? 'weekend' : 'weekday';
    };

    const toggleArea = (area) => {
        setExpandedAreas(prev => ({
            ...prev,
            [area]: !prev[area]
        }));
    };

    const getEntityIcon = (entityId) => {
        if (entityId.startsWith('light.')) return '💡';
        if (entityId.startsWith('switch.')) return '🔌';
        if (entityId.startsWith('climate.')) return '🌡️';
        if (entityId.startsWith('fan.')) return '🌀';
        if (entityId.startsWith('media_player.')) return '📺';
        if (entityId.startsWith('cover.')) return '🪟';
        return '⚙️';
    };

    const getConfidenceColor = (confidence) => {
        if (confidence >= 0.8) return '#51cf66';
        if (confidence >= 0.6) return '#ffd43b';
        return '#ff6b6b';
    };

    const formatEntityName = (name) => {
        return name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    };

    if (loading) {
        return (
            <LinearGradient colors={[Colors.background, Colors.backgroundDim]} style={styles.container}>
                <ActivityIndicator size="large" color={Colors.primary} style={{ marginTop: 100 }} />
                <Text style={styles.loadingText}>Loading preferences...</Text>
            </LinearGradient>
        );
    }

    const areaCount = Object.keys(groupedData).length;
    const totalEntities = Object.values(groupedData).reduce((sum, entities) => sum + entities.length, 0);
    const learnedCount = Object.values(groupedData).reduce((sum, entities) =>
        sum + entities.filter(e => e.has_preference).length, 0);

    return (
        <LinearGradient colors={[Colors.background, Colors.backgroundDim]} style={styles.container}>
            {/* Hour Timeline Selector */}
            <View style={styles.timelineContainer}>
                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.timelineContent}
                >
                    {/* Hour buttons 0-23 (removed All option) */}
                    {Array.from({ length: 24 }, (_, i) => i).map(hour => {
                        // Check if this hour has any entities with manual actions
                        const hasManualActions = Object.values(groupedData).some(entities =>
                            entities.some(e => e.has_preference && e.hour === hour && e.manual_count > 0)
                        );

                        // Debug logging
                        if (hasManualActions) {
                            console.log(`[Timeline] Hour ${hour} has manual actions`);
                        }

                        return (
                            <TouchableOpacity
                                key={hour}
                                style={[
                                    styles.hourButton,
                                    selectedHour === hour && styles.hourButtonSelected,
                                    hasManualActions && styles.hourButtonManual  // Apply last for precedence
                                ]}
                                onPress={() => setSelectedHour(hour)}
                            >
                                <Text style={[
                                    styles.hourText,
                                    selectedHour === hour && styles.hourTextSelected
                                ]}>
                                    {hour.toString().padStart(2, '0')}:00
                                </Text>
                            </TouchableOpacity>
                        );
                    })}
                </ScrollView>
            </View>

            {/* Stats */}
            <View style={styles.statsContainer}>
                <View style={styles.statCard}>
                    <Text style={styles.statValue}>{learnedCount}/{totalEntities}</Text>
                    <Text style={styles.statLabel}>Learned</Text>
                </View>
                <View style={styles.statCard}>
                    <Text style={styles.statValue}>{areaCount}</Text>
                    <Text style={styles.statLabel}>Areas</Text>
                </View>
                <View style={styles.statCard}>
                    <Text style={styles.statValue}>
                        {totalEntities > 0 ? Math.round((learnedCount / totalEntities) * 100) : 0}%
                    </Text>
                    <Text style={styles.statLabel}>Coverage</Text>
                </View>
            </View>

            {/* Area List */}
            <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
                {Object.entries(groupedData).map(([area, entities]) => {
                    // Filter entities by selectedHour (since API now returns all hours)
                    // const entities = allEntities.filter(e => e.hour === selectedHour);
                    // if (entities.length === 0) return null; // Skip areas with no entities for this hour

                    const isExpanded = expandedAreas[area];
                    const areaLearnedCount = entities.filter(e => e.has_preference).length;

                    return (
                        <View key={area} style={styles.areaContainer}>
                            <TouchableOpacity
                                style={styles.areaHeader}
                                onPress={() => toggleArea(area)}
                            >
                                <View style={styles.areaHeaderLeft}>
                                    {isExpanded ?
                                        <ChevronDown size={20} color={Colors.text} /> :
                                        <ChevronRight size={20} color={Colors.textDim} />
                                    }
                                    <Text style={styles.areaName}>{area}</Text>
                                    <View style={styles.areaBadge}>
                                        <Text style={styles.areaBadgeText}>
                                            {areaLearnedCount}/{entities.length}
                                        </Text>
                                    </View>
                                    <View style={[styles.areaBadge, { backgroundColor: '#4CAF5030', marginLeft: 6 }]}>
                                        <Text style={[styles.areaBadgeText, { color: '#4CAF50' }]}>
                                            {entities.filter(e => e.matches).length} ✓
                                        </Text>
                                    </View>
                                </View>
                            </TouchableOpacity>

                            {isExpanded && (
                                <View style={styles.entitiesContainer}>
                                    {entities.map((entity) => (
                                        <TouchableOpacity
                                            key={entity.entity_id}
                                            style={[
                                                styles.entityCard,
                                                !entity.has_preference && styles.entityCardUnlearned
                                            ]}
                                            onPress={() => entity.has_preference && setSelectedEntity(entity)}
                                        >
                                            <View style={styles.entityHeader}>
                                                <View style={styles.entityLeft}>
                                                    <Text style={styles.entityIcon}>
                                                        {getEntityIcon(entity.entity_id)}
                                                    </Text>
                                                    <View>
                                                        <Text style={styles.entityName}>
                                                            {formatEntityName(entity.friendly_name)}
                                                        </Text>
                                                        <Text style={styles.entityId}>{entity.entity_id}</Text>
                                                    </View>
                                                </View>
                                                {entity.has_preference && (
                                                    <>
                                                        <TouchableOpacity onPress={() => setSelectedEntity(entity)}>
                                                            <Info size={18} color={Colors.primary} />
                                                        </TouchableOpacity>
                                                        {entity.matches !== undefined && (
                                                            entity.matches ? (
                                                                <Check size={20} color="#4CAF50" style={{ marginLeft: 8 }} />
                                                            ) : (
                                                                <X size={20} color="#F44336" style={{ marginLeft: 8 }} />
                                                            )
                                                        )}
                                                    </>
                                                )}
                                            </View>

                                            <View style={styles.entityStates}>
                                                <View style={styles.stateItem}>
                                                    <Text style={styles.stateLabel}>Current</Text>
                                                    <Text style={styles.stateValue}>
                                                        {entity.current_state.toUpperCase()}
                                                    </Text>
                                                </View>
                                                <Text style={styles.stateArrow}>→</Text>
                                                <View style={styles.stateItem}>
                                                    <Text style={styles.stateLabel}>Preferred</Text>
                                                    <Text style={[
                                                        styles.stateValue,
                                                        entity.has_preference && styles.stateValueLearned
                                                    ]}>
                                                        {entity.has_preference ?
                                                            entity.preferred_state.toUpperCase() :
                                                            'NO DATA'
                                                        }
                                                    </Text>
                                                </View>
                                            </View>

                                            {entity.has_preference && (
                                                <View style={styles.confidenceContainer}>
                                                    <View style={styles.confidenceBar}>
                                                        <View
                                                            style={[
                                                                styles.confidenceFill,
                                                                {
                                                                    width: `${entity.confidence * 100}%`,
                                                                    backgroundColor: getConfidenceColor(entity.confidence)
                                                                }
                                                            ]}
                                                        />
                                                    </View>
                                                    <Text style={styles.confidenceText}>
                                                        {Math.round(entity.confidence * 100)}%
                                                    </Text>
                                                </View>
                                            )}
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            )}
                        </View>
                    );
                })}

                {Object.keys(groupedData).length === 0 && (
                    <View style={styles.emptyState}>
                        <Text style={styles.emptyText}>No entities found</Text>
                        <Text style={styles.emptySubtext}>
                            Make sure entities are marked with includePreference = 1
                        </Text>
                    </View>
                )}
            </ScrollView>

            {/* Reasoning Modal */}
            {selectedEntity && (
                <Modal
                    visible={!!selectedEntity}
                    transparent={false}
                    animationType="slide"
                    onRequestClose={() => setSelectedEntity(null)}
                >
                    <TouchableOpacity
                        style={styles.modalOverlay}
                        activeOpacity={1}
                        onPress={() => setSelectedEntity(null)}
                    >
                        <View style={styles.modalContent}>
                            <Text style={styles.modalTitle}>Why this preference?</Text>
                            <Text style={styles.modalEntity}>
                                {formatEntityName(selectedEntity.friendly_name)}
                            </Text>

                            <View style={styles.modalStats}>
                                <View style={styles.modalStat}>
                                    <Text style={styles.modalStatLabel}>Confidence</Text>
                                    <Text style={styles.modalStatValue}>
                                        {(selectedEntity.confidence * 100).toFixed(1)}%
                                    </Text>
                                </View>
                                <View style={styles.modalStat}>
                                    <Text style={styles.modalStatLabel}>Samples</Text>
                                    <Text style={styles.modalStatValue}>
                                        {selectedEntity.sample_count}
                                    </Text>
                                </View>
                            </View>

                            {selectedEntity.reasoning && (
                                <View style={styles.reasoningContainer}>
                                    <Text style={styles.reasoningText}>
                                        {JSON.stringify(JSON.parse(selectedEntity.reasoning), null, 2)}
                                    </Text>
                                </View>
                            )}

                            <TouchableOpacity
                                style={styles.modalClose}
                                onPress={() => setSelectedEntity(null)}
                            >
                                <Text style={styles.modalCloseText}>Close</Text>
                            </TouchableOpacity>
                        </View>
                    </TouchableOpacity>
                </Modal>
            )}
        </LinearGradient>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, paddingTop: 60 },
    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, marginBottom: 20 },
    backButton: { padding: 8 },
    headerTextContainer: { flex: 1, marginLeft: 12 },
    headerTitle: { fontSize: 20, fontWeight: '600', color: Colors.text },
    headerSubtitle: { fontSize: 12, color: Colors.textDim, marginTop: 2 },
    refreshButton: { padding: 8 },
    timelineContainer: {
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.1)',
    },
    timelineContent: {
        paddingHorizontal: 16,
        gap: 8,
    },
    hourButton: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    hourButtonSelected: {
        backgroundColor: Colors.primary,
        borderColor: Colors.primary,
    },
    hourButtonManual: {
        backgroundColor: '#FF6B00',  // Bright orange
        borderColor: '#FF6B00',
        borderWidth: 2,
    },
    hourText: {
        color: Colors.text,
        fontSize: 13,
        fontWeight: '500',
    },
    hourTextSelected: {
        color: '#fff',
        fontWeight: '600',
    },
    manualIndicator: {
        position: 'absolute',
        top: 4,
        right: 4,
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: '#FF9800',
    },
    statsContainer: { flexDirection: 'row', paddingHorizontal: 20, marginBottom: 20, gap: 12 },
    statCard: { flex: 1, backgroundColor: Colors.card, borderRadius: 12, padding: 16, alignItems: 'center' },
    statValue: { fontSize: 24, fontWeight: '700', color: Colors.primary },
    statLabel: { fontSize: 12, color: Colors.textDim, marginTop: 4 },
    scrollView: { flex: 1 },
    scrollContent: { paddingHorizontal: 20, paddingBottom: 40 },
    areaContainer: { marginBottom: 16 },
    areaHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12 },
    areaHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    areaName: { fontSize: 16, fontWeight: '600', color: Colors.text },
    areaBadge: { backgroundColor: Colors.primary + '30', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
    areaBadgeText: { fontSize: 11, color: Colors.primary, fontWeight: '600' },
    entitiesContainer: { gap: 12 },
    entityCard: { backgroundColor: Colors.card, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: Colors.cardBorder },
    entityCardUnlearned: { opacity: 0.6 },
    entityHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
    entityLeft: { flexDirection: 'row', gap: 12, flex: 1 },
    entityIcon: { fontSize: 24 },
    entityName: { fontSize: 14, fontWeight: '600', color: Colors.text },
    entityId: { fontSize: 11, color: Colors.textDim, marginTop: 2 },
    entityStates: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
    stateItem: { flex: 1 },
    stateLabel: { fontSize: 10, color: Colors.textDim, marginBottom: 4 },
    stateValue: { fontSize: 13, fontWeight: '600', color: Colors.text },
    stateValueLearned: { color: Colors.primary },
    stateArrow: { fontSize: 16, color: Colors.textDim, marginHorizontal: 8 },
    confidenceContainer: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    confidenceBar: { flex: 1, height: 6, backgroundColor: Colors.card + '80', borderRadius: 3, overflow: 'hidden' },
    confidenceFill: { height: '100%' },
    confidenceText: { fontSize: 11, fontWeight: '600', color: Colors.text, minWidth: 35, textAlign: 'right' },
    emptyState: { alignItems: 'center', marginTop: 60 },
    emptyText: { fontSize: 16, color: Colors.textDim },
    emptySubtext: { fontSize: 12, color: Colors.textDim, marginTop: 8 },
    loadingText: { color: Colors.textDim, fontSize: 14, textAlign: 'center', marginTop: 16 },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', paddingHorizontal: 20 },
    modalContent: { backgroundColor: Colors.card, borderRadius: 16, padding: 24 },
    modalTitle: { fontSize: 18, fontWeight: '600', color: Colors.text, marginBottom: 8 },
    modalEntity: { fontSize: 14, color: Colors.textDim, marginBottom: 16 },
    modalStats: { flexDirection: 'row', gap: 16, marginBottom: 16 },
    modalStat: { flex: 1, backgroundColor: Colors.background, borderRadius: 8, padding: 12 },
    modalStatLabel: { fontSize: 11, color: Colors.textDim, marginBottom: 4 },
    modalStatValue: { fontSize: 20, fontWeight: '600', color: Colors.primary },
    reasoningContainer: { backgroundColor: Colors.background, borderRadius: 8, padding: 12, marginBottom: 16 },
    reasoningText: { fontSize: 11, color: Colors.text, fontFamily: 'monospace' },
    modalClose: { backgroundColor: Colors.primary, borderRadius: 8, paddingVertical: 12, alignItems: 'center' },
    modalCloseText: { color: Colors.text, fontSize: 14, fontWeight: '600' },
});
