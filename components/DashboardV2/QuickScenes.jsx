import {
    View, Text, StyleSheet, TouchableOpacity,
    Modal, FlatList, ActivityIndicator, Alert, TextInput,
    Animated, PanResponder,
} from 'react-native';
import { Edit2, Check, X, Search } from 'lucide-react-native';
import SceneCard from './SceneCard';
import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { authFetch } from '../../utils/authFetch';
import { CF } from '../../utils/typography';
import ModalBackdrop from '../ModalBackdrop';

export const MAX_QUICK_SCENES = 4;

// ── Icon picker ───────────────────────────────────────────────────────────────
function getSceneIcon(name = '') {
    const n = name.toLowerCase();
    if (n.includes('night') || n.includes('sleep')) return Moon;
    if (n.includes('morning') || n.includes('wake'))  return Sun;
    if (n.includes('leav') || n.includes('away') || n.includes('out')) return LogOut;
    if (n.includes('arriv') || n.includes('home') || n.includes('back')) return Home;
    return Zap;
}

// ── Edit Modal ────────────────────────────────────────────────────────────────
export function EditScenesModal({
    visible,
    onClose,
    adminUrl,
    onSave,
    scope = 'home',
    areaId = null,
    roomScripts = [],
    defaultShowPreferences = true,
    initialShowPreferences = true,
}) {
    const [allScenes, setAllScenes] = useState([]);
    const [selected, setSelected]   = useState(new Set());
    const [showPreferences, setShowPreferences] = useState(defaultShowPreferences);
    const [loading, setLoading]     = useState(false);
    const [saving, setSaving]       = useState(false);
    const [search, setSearch]       = useState('');

    // Drag-to-dismiss + slide-in
    const sheetAnim = useRef(new Animated.Value(700)).current;

    useEffect(() => {
        if (visible) {
            sheetAnim.setValue(700);
            Animated.timing(sheetAnim, { toValue: 0, duration: 300, useNativeDriver: true }).start();
        }
    }, [visible]);

    const panResponder = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onPanResponderMove: (_, gs) => {
                if (gs.dy > 0) sheetAnim.setValue(gs.dy);
            },
            onPanResponderRelease: (_, gs) => {
                if (gs.dy > 100 || gs.vy > 0.5) {
                    Animated.timing(sheetAnim, { toValue: 700, duration: 220, useNativeDriver: true }).start(() => {
                        sheetAnim.setValue(700);
                        onClose();
                    });
                } else {
                    Animated.spring(sheetAnim, { toValue: 0, useNativeDriver: true }).start();
                }
            },
        })
    ).current;

    // Track the server's current saved IDs so save() can diff without re-fetching
    const savedIdsRef = useRef(new Set());
    // Guard: prevent fetch firing more than once per open
    const isFetchingRef = useRef(false);

    // Fetch when modal becomes visible — only once per open
    useEffect(() => {
        if (!visible) {
            // Reset on close so next open is fresh
            isFetchingRef.current = false;
            return;
        }
        if (isFetchingRef.current) return;
        isFetchingRef.current = true;

        setSearch('');
        setAllScenes([]);
        setLoading(true);

        const base = adminUrl?.endsWith('/') ? adminUrl : `${adminUrl}/`;
        const isRoom = scope === 'room' && areaId;

        const loadHome = async () => {
            const [statesRes, savedRes] = await Promise.all([
                authFetch(`${base}api/states`),
                authFetch(`${base}api/quick-scenes`),
            ]);
            const statesData = await statesRes.json();
            const savedData = await savedRes.json();

            const scripts = Array.isArray(statesData)
                ? statesData.filter(e => e.entity_id.startsWith('script.'))
                : [];

            const normalised = scripts.map(e => ({
                entity_id: e.entity_id,
                friendly_name: e.attributes?.friendly_name || e.entity_id,
            }));
            normalised.sort((a, b) => a.friendly_name.localeCompare(b.friendly_name));

            const ids = Array.isArray(savedData) ? savedData.map(s => s.entity_id) : [];
            const savedSet = new Set(ids.slice(0, MAX_QUICK_SCENES));
            return { normalised, savedSet, prefsOn: false };
        };

        const loadRoom = async () => {
            const savedRes = await authFetch(
                `${base}api/room-scenes?area_id=${encodeURIComponent(areaId)}`
            );
            const savedData = await savedRes.json();

            const normalised = (Array.isArray(roomScripts) ? roomScripts : []).map((s) => ({
                entity_id: s.entity_id,
                friendly_name: s.displayName || s.name || s.entity_id,
            }));
            normalised.sort((a, b) => a.friendly_name.localeCompare(b.friendly_name));

            const prefsOn = initialShowPreferences;
            const maxScenes = MAX_QUICK_SCENES - (prefsOn ? 1 : 0);

            let savedSet;
            if (savedData?.configured) {
                const ids = Array.isArray(savedData.entity_ids) ? savedData.entity_ids : [];
                savedSet = new Set(ids.slice(0, maxScenes));
            } else {
                savedSet = new Set(normalised.slice(0, maxScenes).map((s) => s.entity_id));
            }
            return { normalised, savedSet, prefsOn };
        };

        (isRoom ? loadRoom() : loadHome())
            .then(({ normalised, savedSet, prefsOn }) => {
                setAllScenes(normalised);
                savedIdsRef.current = savedSet;
                setSelected(new Set(savedSet));
                if (isRoom) setShowPreferences(prefsOn);
            })
            .catch(e => {
                console.warn('[QuickScenes] fetchAll error:', e);
                Alert.alert('Error', 'Could not load scenes from server.');
            })
            .finally(() => setLoading(false));
    }, [visible, adminUrl, scope, areaId, roomScripts, initialShowPreferences]);   // eslint-disable-line react-hooks/exhaustive-deps

    const isRoomScope = scope === 'room' && areaId;
    const roomItemCount = selected.size + (isRoomScope && showPreferences ? 1 : 0);
    const maxSceneSlots = isRoomScope
        ? MAX_QUICK_SCENES - (showPreferences ? 1 : 0)
        : MAX_QUICK_SCENES;

    const togglePreferences = () => {
        setShowPreferences((prev) => {
            if (prev) return false;
            if (selected.size + 1 > MAX_QUICK_SCENES) {
                Alert.alert(
                    'Maximum items',
                    `You can select up to ${MAX_QUICK_SCENES} items (scenes + preferences). Remove a scene first.`,
                );
                return prev;
            }
            return true;
        });
    };

    const toggleItem = (id) => {
        setSelected(prev => {
            if (prev.has(id)) {
                const next = new Set(prev);
                next.delete(id);
                return next;
            }
            const cap = isRoomScope ? maxSceneSlots : MAX_QUICK_SCENES;
            if (prev.size >= cap) {
                Alert.alert(
                    isRoomScope ? 'Maximum items' : 'Maximum scenes',
                    isRoomScope
                        ? `You can select up to ${MAX_QUICK_SCENES} items total (${showPreferences ? 'preferences uses 1 slot' : 'including preferences if enabled'}).`
                        : `You can select up to ${MAX_QUICK_SCENES} scenes.`,
                );
                return prev;
            }
            const next = new Set(prev);
            next.add(id);
            return next;
        });
    };

    // Diff against cached savedIdsRef — no extra network round-trip
    const handleSave = async () => {
        setSaving(true);
        try {
            const base = adminUrl?.endsWith('/') ? adminUrl : `${adminUrl}/`;
            const sceneCap = isRoomScope
                ? MAX_QUICK_SCENES - (showPreferences ? 1 : 0)
                : MAX_QUICK_SCENES;
            const selectedIds = Array.from(selected).slice(0, sceneCap);

            if (scope === 'room' && areaId) {
                await authFetch(`${base}api/room-scenes`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        area_id: areaId,
                        entity_ids: selectedIds,
                    }),
                });
                onSave(selectedIds, { show_preferences: showPreferences });
            } else {
                const savedIds = savedIdsRef.current;
                const toAdd = selectedIds.filter(id => !savedIds.has(id));
                const toRemove = [...savedIds].filter(id => !selected.has(id));

                await Promise.all([
                    ...toAdd.map(id => authFetch(`${base}api/quick-scenes`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ entity_id: id, action: 'add' }),
                    })),
                    ...toRemove.map(id => authFetch(`${base}api/quick-scenes`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ entity_id: id, action: 'remove' }),
                    })),
                ]);
            }

            if (scope !== 'room') {
                onSave(selectedIds);
            }
            onClose();
        } catch (e) {
            console.warn('[QuickScenes] save error:', e);
            Alert.alert('Error', 'Could not save scenes. Please try again.');
        } finally {
            setSaving(false);
        }
    };

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return allScenes;
        return allScenes.filter(s =>
            s.friendly_name.toLowerCase().includes(q) ||
            s.entity_id.toLowerCase().includes(q)
        );
    }, [allScenes, search]);

    return (
        <Modal
            visible={visible}
            animationType="none"
            transparent
            onRequestClose={onClose}
        >
            <View style={modal.overlay}>
                <ModalBackdrop onPress={onClose} />
                <Animated.View style={[modal.sheet, { transform: [{ translateY: sheetAnim }] }]}>
                    {/* Handle — drag down to dismiss */}
                    <View style={modal.handleTouchArea} {...panResponder.panHandlers}>
                        <View style={modal.handle} />
                    </View>

                    {/* Header */}
                    <View style={modal.header}>
                        <Text style={modal.title}>
                            {scope === 'room' ? 'Edit Room Scenes' : 'Edit Scenes'}
                        </Text>
                        <TouchableOpacity onPress={onClose} style={modal.closeBtn}>
                            <X size={18} color="#ededf5" />
                        </TouchableOpacity>
                    </View>
                    <Text style={modal.subtitle}>
                        {isRoomScope
                            ? `${allScenes.length} in room · ${roomItemCount}/${MAX_QUICK_SCENES} selected`
                            : `${allScenes.length} available · ${selected.size}/${MAX_QUICK_SCENES} selected`}
                    </Text>

                    {/* Search */}
                    <View style={modal.searchRow}>
                        <Search size={14} color="#4a4957" style={{ marginRight: 8 }} />
                        <TextInput
                            style={modal.searchInput}
                            placeholder="Search scenes…"
                            placeholderTextColor="#4a4957"
                            value={search}
                            onChangeText={setSearch}
                            autoCorrect={false}
                            autoCapitalize="none"
                        />
                        {search.length > 0 && (
                            <TouchableOpacity onPress={() => setSearch('')}>
                                <X size={14} color="#4a4957" />
                            </TouchableOpacity>
                        )}
                    </View>

                    {/* List */}
                    {loading ? (
                        <ActivityIndicator color="#8947ca" style={{ marginTop: 32 }} />
                    ) : (
                        <FlatList
                            data={filtered}
                            keyExtractor={item => item.entity_id}
                            contentContainerStyle={{ paddingBottom: 16 }}
                            keyboardShouldPersistTaps="handled"
                            ListHeaderComponent={
                                scope === 'room' ? (
                                    <TouchableOpacity
                                        style={[
                                            modal.row,
                                            showPreferences && modal.rowSelected,
                                        ]}
                                        onPress={togglePreferences}
                                        activeOpacity={0.7}
                                    >
                                        <Text style={modal.rowLabel} numberOfLines={1}>
                                            Apply your preferences
                                        </Text>
                                        <View
                                            style={[
                                                modal.checkCircle,
                                                showPreferences && modal.checkCircleOn,
                                            ]}
                                        >
                                            {showPreferences && (
                                                <Check size={12} color="#fff" strokeWidth={3} />
                                            )}
                                        </View>
                                    </TouchableOpacity>
                                ) : null
                            }
                            renderItem={({ item }) => {
                                const isSelected = selected.has(item.entity_id);
                                return (
                                    <TouchableOpacity
                                        style={[modal.row, isSelected && modal.rowSelected]}
                                        onPress={() => toggleItem(item.entity_id)}
                                        activeOpacity={0.7}
                                    >
                                        <Text style={modal.rowLabel} numberOfLines={1}>
                                            {item.friendly_name}
                                        </Text>
                                        <View style={[modal.checkCircle, isSelected && modal.checkCircleOn]}>
                                            {isSelected && <Check size={12} color="#fff" strokeWidth={3} />}
                                        </View>
                                    </TouchableOpacity>
                                );
                            }}
                            ListEmptyComponent={
                                <Text style={modal.empty}>
                                    {search ? 'No matches found' : 'No scenes found'}
                                </Text>
                            }
                        />
                    )}

                    {/* Save */}
                    <TouchableOpacity
                        style={[modal.saveBtn, saving && { opacity: 0.6 }]}
                        onPress={handleSave}
                        disabled={saving}
                    >
                        {saving
                            ? <ActivityIndicator color="#fff" size="small" />
                            : <Text style={modal.saveBtnText}>
                                Save  ({isRoomScope ? roomItemCount : selected.size} selected)
                            </Text>
                        }
                    </TouchableOpacity>
                </Animated.View>
            </View>
        </Modal>
    );
}

const SCENE_COL_GAP = 10;

// ── Main component ────────────────────────────────────────────────────────────
export default function QuickScenes({ scenes = [], onScenePress, adminUrl, onScenesUpdated, columns = 2 }) {
    const [editVisible, setEditVisible] = useState(false);
    const [gridWidth, setGridWidth] = useState(0);
    const sceneCellW =
        gridWidth > 0
            ? Math.floor((gridWidth - SCENE_COL_GAP * (columns - 1)) / columns)
            : null;

    return (
        <View style={styles.container}>
            {/* Header row */}
            <View style={styles.header}>
                <Text style={styles.title}>SCENES</Text>
                <TouchableOpacity
                    style={styles.editBtn}
                    onPress={() => setEditVisible(true)}
                    activeOpacity={0.7}
                >
                    <Edit2 size={12} color="#9199BA" />
                    <Text style={styles.editText}>Edit</Text>
                </TouchableOpacity>
            </View>

            {/* 2-column grid */}
            {scenes.length === 0 ? (
                <View style={styles.emptyContainer}>
                    <Text style={styles.emptyText}>No scenes — tap Edit to add some</Text>
                </View>
            ) : (
                <View
                    style={styles.grid}
                    onLayout={(e) => {
                        const w = e.nativeEvent.layout.width;
                        if (w > 0 && w !== gridWidth) setGridWidth(w);
                    }}
                >
                    {scenes.slice(0, MAX_QUICK_SCENES).map((scene) => (
                        <View
                            key={scene.id}
                            style={[
                                { paddingBottom: 6 },
                                sceneCellW != null && { width: sceneCellW },
                                columns >= 4 && styles.tabletCell,
                            ]}
                        >
                            <SceneCard id={scene.id} label={scene.label} onPress={onScenePress} />
                        </View>
                    ))}
                </View>
            )}

            <EditScenesModal
                visible={editVisible}
                onClose={() => setEditVisible(false)}
                adminUrl={adminUrl}
                onSave={(ids) => onScenesUpdated && onScenesUpdated(ids)}
            />
        </View>
    );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
    container: {
        marginBottom: 20,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 12,
        marginHorizontal: 2,
    },
    title: {
        color: '#9199BA',
        fontSize: 12,
        fontFamily: CF.semibold,
        letterSpacing: 1.4,
    },
    editBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    editText: {
        color: '#9199BA',
        fontSize: 12,
        fontFamily: CF.semibold,
        letterSpacing: 1.4,
    },
    grid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: SCENE_COL_GAP,
    },
    // Tablet: exactly 4 per row — flex prevents rounding overflow past container width
    tabletCell: {
        flexGrow: 0,
        flexShrink: 0,
    },
    emptyContainer: {
        padding: 20,
        alignItems: 'center',
        backgroundColor: '#12132a',
        borderRadius: 14,
        borderWidth: 1,
        borderColor: '#212136',
    },
    emptyText: {
        color: 'rgba(237,237,245,0.35)',
        fontSize: 13,
        fontStyle: 'italic',
    },
});

const modal = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.6)',
        justifyContent: 'flex-end',
    },
    sheet: {
        backgroundColor: '#12132a',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        borderWidth: 1,
        borderColor: '#212136',
        paddingHorizontal: 20,
        paddingTop: 0,
        paddingBottom: 36,
        maxHeight: '80%',
    },
    handle: {
        width: 36,
        height: 4,
        borderRadius: 2,
        backgroundColor: 'rgba(255,255,255,0.15)',
        alignSelf: 'center',
    },
    handleTouchArea: {
        alignSelf: 'stretch',
        alignItems: 'center',
        paddingVertical: 10,
        marginTop: 4,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 4,
    },
    title: {
        color: '#ededf5',
        fontSize: 18,
        fontFamily: CF.bold,
    },
    closeBtn: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: 'rgba(237,237,245,0.1)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    subtitle: {
        color: '#4a4957',
        fontSize: 13,
        marginBottom: 12,
    },
    searchRow: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#1a1b2e',
        borderRadius: 10,
        borderWidth: 1,
        borderColor: '#212136',
        paddingHorizontal: 12,
        paddingVertical: 8,
        marginBottom: 12,
    },
    searchInput: {
        flex: 1,
        color: '#ededf5',
        fontSize: 14,
        padding: 0,
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.03)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
        borderRadius: 14,
        paddingHorizontal: 16,
        paddingVertical: 14,
        marginBottom: 8,
    },
    rowSelected: {
        backgroundColor: 'rgba(137,71,202,0.08)',
        borderColor: 'rgba(137,71,202,0.35)',
    },
    rowLabel: {
        flex: 1,
        color: '#ededf5',
        fontSize: 14,
        fontFamily: CF.medium,
        letterSpacing: 0.1,
    },
    checkCircle: {
        width: 24,
        height: 24,
        borderRadius: 12,
        borderWidth: 1.5,
        borderColor: 'rgba(255,255,255,0.2)',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'transparent',
    },
    checkCircleOn: {
        backgroundColor: '#8947ca',
        borderColor: '#8947ca',
    },
    empty: {
        color: 'rgba(237,237,245,0.35)',
        textAlign: 'center',
        marginTop: 32,
        fontSize: 14,
    },
    saveBtn: {
        marginTop: 12,
        backgroundColor: '#8947ca',
        borderRadius: 14,
        paddingVertical: 14,
        alignItems: 'center',
    },
    saveBtnText: {
        color: '#fff',
        fontSize: 15,
        fontFamily: CF.bold,
    },
});

