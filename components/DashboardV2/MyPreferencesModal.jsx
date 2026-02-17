import { View, Text, StyleSheet, Modal, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { BlurView } from 'expo-blur';
import { X, Sparkles, Brain, Info, CheckCircle, AlertCircle, Thermometer, Sun, Volume2 } from 'lucide-react-native';
import { Colors } from '../../constants/Colors';
import { useState, useEffect } from 'react';
import { AIService } from '../../services/ai';

export default function MyPreferencesModal({ visible, onClose, adminUrl }) {
    const [loading, setLoading] = useState(false);
    const [analyzing, setAnalyzing] = useState(false);
    const [data, setData] = useState([]); // [{ name: "Living Room", entities: [...] }]
    const [suggestions, setSuggestions] = useState(null);
    const [ignoredSet, setIgnoredSet] = useState(new Set());
    const [userEntity, setUserEntity] = useState(null);

    // Detailed View State
    const [detailModalVisible, setDetailModalVisible] = useState(false);
    const [selectedEntity, setSelectedEntity] = useState(null);

    // Helper: Get Domain
    const getDomain = (entityId) => entityId.split('.')[0];

    // Helper: Group by Domain
    const groupEntitiesByDomain = (entities) => {
        const groups = {};
        entities.forEach(e => {
            const domain = getDomain(e.entity_id);
            if (!groups[domain]) groups[domain] = [];
            groups[domain].push(e);
        });
        return groups;
    };

    useEffect(() => {
        if (visible) {
            loadStructure();
        }
    }, [visible]);

    const loadStructure = async () => {
        setLoading(true);
        try {
            // 1. Fetch Ignored List
            const monRes = await fetch(`${adminUrl}/api/monitor?t=${Date.now()}`);
            const monData = await monRes.json();
            const ignSet = new Set();
            if (monData.success) {
                monData.entities.forEach(e => {
                    if (e.ignored) ignSet.add(e.entity_id);
                    if (e.type === 'tracked' && e.entity_id.includes('room')) {
                        // Attempt to guess user tracking entity
                        // For now, hardcode or pick first room sensor
                        setUserEntity(e.entity_id);
                    }
                });
                // Fallback hardcode as per logs
                setUserEntity("sensor.zeyad_iphone_room");
            }
            setIgnoredSet(ignSet);

            // 2. Fetch Structure
            const structRes = await fetch(`${adminUrl}/api/structure?t=${Date.now()}`);
            const structData = await structRes.json();

            if (structData.success) {
                // Filter Structure
                const filteredRooms = structData.structure.map(room => ({
                    ...room,
                    entities: room.entities.filter(e => !ignSet.has(e.entity_id))
                })).filter(r => r.entities.length > 0);
                setData(filteredRooms);
            }

        } catch (e) {
            console.error("Load Error", e);
        } finally {
            setLoading(false);
        }
    };

    const handleAnalyze = async () => {
        setAnalyzing(true);
        try {
            const openaiKey = await AIService.getKey('openai');

            const payload = {
                rooms: data,
                user_tracking_entity: userEntity || "sensor.zeyad_iphone_room",
                openai_key: openaiKey
            };

            const res = await fetch(`${adminUrl}/api/preferences/analyze`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const resData = await res.json();
            if (resData.success) {
                setSuggestions(resData.suggestions);
            } else {
                alert("Analysis failed: " + resData.error);
            }
            if (resData.success) {
                setSuggestions(resData.suggestions);
            } else {
                alert(`Analysis failed: ${resData.error || 'Unknown error'}`);
            }
        } catch (e) {
            console.error(e);
            alert(`Analysis failed: ${e.message}`);
        } finally {
            setAnalyzing(false);
        }
    };

    // Helper to get suggestion for an entity
    const getSuggestion = (entityId) => {
        if (!suggestions || !suggestions.rooms) return null;
        for (const r of suggestions.rooms) {
            const found = r.entities.find(e => e.entity_id === entityId);
            if (found) return found;
        }
        return null;
    };

    // Helper: Render relevant attributes logic
    const renderAttributes = (entity) => {
        if (!entity.attributes) return null;
        const d = getDomain(entity.entity_id);
        const attrs = [];

        if (d === 'light') {
            if (entity.attributes.brightness) attrs.push(`Bri: ${Math.round(entity.attributes.brightness / 2.55)}%`);
            if (entity.attributes.color_temp) attrs.push(`Temp: ${entity.attributes.color_temp}K`);
        } else if (d === 'media_player') {
            if (entity.attributes.volume_level) attrs.push(`Vol: ${Math.round(entity.attributes.volume_level * 100)}%`);
            if (entity.attributes.source) attrs.push(`Src: ${entity.attributes.source}`);
        } else if (d === 'climate') {
            if (entity.attributes.temperature) attrs.push(`Target: ${entity.attributes.temperature}°`);
            if (entity.attributes.current_temperature) attrs.push(`Cur: ${entity.attributes.current_temperature}°`);
            if (entity.attributes.hvac_action) attrs.push(`Act: ${entity.attributes.hvac_action}`);
        } else if (d === 'fan') {
            if (entity.attributes.percentage) attrs.push(`Spd: ${entity.attributes.percentage}%`);
            if (entity.attributes.preset_mode) attrs.push(`Mode: ${entity.attributes.preset_mode}`);
        }

        if (attrs.length === 0) return null;

        return (
            <View style={styles.attributesRow}>
                <Text style={styles.currentStateLabel}>State: <Text style={styles.val}>{entity.state}</Text></Text>
                {attrs.map((a, i) => (
                    <Text key={i} style={styles.attr}>{a}</Text>
                ))}
            </View>
        );
    };

    return (
        <Modal
            animationType="slide"
            transparent={true}
            visible={visible}
            onRequestClose={onClose}
        >
            <View style={styles.overlay}>
                <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
                <View style={styles.contentContainer}>
                    <View style={styles.header}>
                        <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                            <X size={24} color={Colors.textDim} />
                        </TouchableOpacity>
                        <Text style={styles.title}>My Preferences</Text>
                        <View style={{ width: 40 }} />
                    </View>

                    <Text style={styles.subtitle}>
                        AI-powered analysis of your habits based on room history, season, and time.
                    </Text>

                    {loading ? (
                        <ActivityIndicator size="large" color={Colors.primary} style={{ marginTop: 50 }} />
                    ) : (
                        <>
                            <TouchableOpacity
                                style={styles.analyzeBtn}
                                onPress={handleAnalyze}
                                disabled={analyzing}
                            >
                                {analyzing ? (
                                    <ActivityIndicator color="#fff" />
                                ) : (
                                    <>
                                        <Sparkles size={20} color="#fff" />
                                        <Text style={styles.analyzeText}>
                                            {suggestions ? "Re-Analyze Preferences" : "Analyze Preferences"}
                                        </Text>
                                    </>
                                )}
                            </TouchableOpacity>

                            <ScrollView style={styles.list} contentContainerStyle={{ paddingBottom: 40 }}>
                                {suggestions && (
                                    <View style={styles.contextBox}>
                                        <Brain size={16} color={Colors.primary} />
                                        <Text style={styles.contextText}>
                                            Based on history when you were in the room.
                                            Manual overrides have higher weight.
                                        </Text>
                                    </View>
                                )}

                                {data.map(room => {
                                    const groups = groupEntitiesByDomain(room.entities);
                                    return (
                                        <View key={room.id} style={styles.roomContainer}>
                                            <Text style={styles.roomTitle}>{room.name}</Text>

                                            {Object.entries(groups).map(([domain, entities]) => (
                                                <View key={domain} style={styles.domainSection}>
                                                    <Text style={styles.domainTitle}>{domain.toUpperCase()}</Text>
                                                    {entities.map(entity => {
                                                        const sug = getSuggestion(entity.entity_id);
                                                        const isMatch = sug && sug.preferred_state === entity.state;
                                                        // Check if we have valid data ("Not enough data" Logic)
                                                        const hasData = sug && sug.reason;

                                                        return (
                                                            <TouchableOpacity
                                                                key={entity.entity_id}
                                                                style={styles.entityRow}
                                                                onPress={() => {
                                                                    if (sug) {
                                                                        setSelectedEntity({ ...entity, suggestion: sug });
                                                                        setDetailModalVisible(true);
                                                                    }
                                                                }}
                                                            >
                                                                <View style={{ flex: 1 }}>
                                                                    <View style={styles.rowHeader}>
                                                                        <Text style={styles.entityName}>{entity.name || entity.entity_id}</Text>
                                                                        {sug ? (
                                                                            <View style={[styles.badge, isMatch ? styles.badgeGreen : styles.badgeRed]}>
                                                                                <Text style={styles.badgeText}>{isMatch ? "MATCH" : "NO MATCH"}</Text>
                                                                            </View>
                                                                        ) : (
                                                                            suggestions && (
                                                                                <View style={[styles.badge, styles.badgeGrey]}>
                                                                                    <Text style={styles.badgeText}>NO DATA</Text>
                                                                                </View>
                                                                            )
                                                                        )}
                                                                    </View>
                                                                    <Text style={styles.entityId}>{entity.entity_id}</Text>

                                                                    {/* Attributes Row */}
                                                                    {renderAttributes(entity)}

                                                                    {sug && (
                                                                        <View style={styles.miniSug}>
                                                                            <Text style={styles.sugLabel}>Pref: {sug.preferred_state}</Text>
                                                                            {/* Show preferred attributes if any */}
                                                                            {sug.preferred_attributes && Object.entries(sug.preferred_attributes).map(([k, v]) => (
                                                                                <Text key={k} style={styles.prefAttr}>{k}: {v}</Text>
                                                                            ))}
                                                                        </View>
                                                                    )}
                                                                </View>
                                                                {sug && <Info size={18} color={Colors.textDim} style={{ marginLeft: 10 }} />}
                                                            </TouchableOpacity>
                                                        );
                                                    })}
                                                </View>
                                            ))}
                                        </View>
                                    );
                                })}
                            </ScrollView>
                        </>
                    )}
                </View>
            </View>

            {/* Detail Modal */}
            <Modal
                transparent={true}
                visible={detailModalVisible}
                animationType="fade"
                onRequestClose={() => setDetailModalVisible(false)}
            >
                <View style={styles.detailOverlay}>
                    <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
                    <View style={styles.detailBox}>
                        <TouchableOpacity style={styles.closeDetail} onPress={() => setDetailModalVisible(false)}>
                            <X size={24} color="#fff" />
                        </TouchableOpacity>

                        {selectedEntity && (
                            <>
                                <Text style={styles.detailTitle}>Why this preference?</Text>
                                <Text style={styles.detailSubtitle}>{selectedEntity.name}</Text>

                                <View style={styles.statRow}>
                                    <View style={styles.stat}>
                                        <Text style={styles.statVal}>{selectedEntity.suggestion.confidence_score || "?"}%</Text>
                                        <Text style={styles.statLabel}>Confidence</Text>
                                    </View>
                                    <View style={styles.stat}>
                                        <Text style={styles.statVal}>{selectedEntity.suggestion.user_actions_count || 0}</Text>
                                        <Text style={styles.statLabel}>User Actions</Text>
                                    </View>
                                    <View style={styles.stat}>
                                        <Text style={styles.statVal}>{selectedEntity.suggestion.history_count || 0}</Text>
                                        <Text style={styles.statLabel}>History Events</Text>
                                    </View>
                                </View>

                                <View style={styles.reasonBox}>
                                    <Brain size={20} color={Colors.primary} style={{ marginBottom: 10 }} />
                                    <Text style={styles.reasonText}>"{selectedEntity.suggestion.reason}"</Text>
                                </View>
                            </>
                        )}
                    </View>
                </View>
            </Modal>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'flex-end',
    },
    contentContainer: {
        height: '92%',
        backgroundColor: '#1a1b2e',
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        padding: 20,
        overflow: 'hidden'
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 10
    },
    title: {
        color: '#fff',
        fontSize: 22,
        fontWeight: 'bold'
    },
    subtitle: {
        color: Colors.textDim,
        fontSize: 14,
        marginBottom: 20,
        textAlign: 'center'
    },
    closeBtn: {
        padding: 5
    },
    analyzeBtn: {
        flexDirection: 'row',
        backgroundColor: Colors.primary,
        padding: 15,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        marginBottom: 20
    },
    analyzeText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: 'bold'
    },
    list: {
        flex: 1
    },
    roomContainer: {
        marginBottom: 20,
        backgroundColor: 'rgba(255,255,255,0.03)',
        borderRadius: 16,
        padding: 15,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.05)'
    },
    roomTitle: {
        color: '#fff',
        fontSize: 20,
        fontWeight: 'bold',
        marginBottom: 15,
        paddingBottom: 5,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.1)'
    },
    domainSection: {
        marginBottom: 15
    },
    domainTitle: {
        color: Colors.textDim,
        fontSize: 11,
        fontWeight: 'bold',
        marginBottom: 5,
        marginLeft: 5,
        letterSpacing: 1
    },
    entityRow: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.05)',
        padding: 12,
        borderRadius: 12,
        marginBottom: 8
    },
    rowHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center'
    },
    entityName: {
        color: Colors.text,
        fontSize: 15,
        fontWeight: '600'
    },
    entityId: {
        color: Colors.textDim,
        fontSize: 10,
        marginBottom: 4
    },
    badge: {
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 6
    },
    badgeGreen: {
        backgroundColor: 'rgba(76, 175, 80, 0.2)',
        borderWidth: 1,
        borderColor: 'rgba(76, 175, 80, 0.5)'
    },
    badgeRed: {
        backgroundColor: 'rgba(244, 67, 54, 0.2)',
        borderWidth: 1,
        borderColor: 'rgba(244, 67, 54, 0.5)'
    },
    badgeGrey: {
        backgroundColor: 'rgba(150, 150, 150, 0.2)',
        borderWidth: 1,
        borderColor: 'rgba(150, 150, 150, 0.5)'
    },
    badgeText: {
        fontSize: 10,
        fontWeight: 'bold',
        color: '#fff'
    },
    attributesRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 10,
        marginTop: 4
    },
    currentStateLabel: {
        color: Colors.textDim,
        fontSize: 12
    },
    val: {
        color: '#fff',
        fontWeight: 'bold'
    },
    attr: {
        color: Colors.textDim,
        fontSize: 12,
        backgroundColor: 'rgba(255,255,255,0.05)',
        paddingHorizontal: 4,
        borderRadius: 4
    },
    miniSug: {
        marginTop: 6,
        borderTopWidth: 1,
        borderTopColor: 'rgba(255,255,255,0.1)',
        paddingTop: 4
    },
    sugLabel: {
        color: Colors.primary,
        fontSize: 12,
        fontWeight: 'bold'
    },
    prefAttr: {
        color: Colors.textDim,
        fontSize: 11,
        fontStyle: 'italic'
    },
    // Detail Modal
    detailOverlay: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.8)'
    },
    detailBox: {
        width: '85%',
        backgroundColor: '#1E1E2E',
        borderRadius: 20,
        padding: 25,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: Colors.border
    },
    closeDetail: {
        position: 'absolute',
        top: 15,
        right: 15
    },
    detailTitle: {
        color: Colors.primary,
        fontSize: 18,
        fontWeight: 'bold',
        marginBottom: 5
    },
    detailSubtitle: {
        color: '#fff',
        fontSize: 16,
        marginBottom: 20
    },
    statRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        width: '100%',
        marginBottom: 20
    },
    stat: {
        alignItems: 'center',
        flex: 1
    },
    statVal: {
        color: '#fff',
        fontSize: 18,
        fontWeight: 'bold'
    },
    statLabel: {
        color: Colors.textDim,
        fontSize: 10
    },
    reasonBox: {
        backgroundColor: 'rgba(255,255,255,0.05)',
        padding: 15,
        borderRadius: 12,
        width: '100%',
        alignItems: 'center'
    },
    reasonText: {
        color: '#fff',
        fontSize: 14,
        textAlign: 'center',
        lineHeight: 20,
        fontStyle: 'italic'
    },
    contextBox: {
        flexDirection: 'row',
        gap: 8,
        marginBottom: 15,
        backgroundColor: 'rgba(255,255,255,0.05)',
        padding: 10,
        borderRadius: 8,
        alignItems: 'center'
    },
    contextText: {
        color: Colors.textDim,
        fontSize: 12,
        flex: 1
    }
});
