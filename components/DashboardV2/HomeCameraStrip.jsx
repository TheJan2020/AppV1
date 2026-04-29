import { memo, useState, useEffect, useRef, useMemo } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, Dimensions, Image,
    Modal, FlatList, ActivityIndicator, Alert, TextInput, Animated, PanResponder,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Edit2, Check, X, Search } from 'lucide-react-native';
import { CF } from '../../utils/typography';
import { authFetch } from '../../utils/authFetch';

// 2 columns, parent has paddingHorizontal:20 on each side → usable width = screen - 40
const SCREEN_W = Dimensions.get('window').width;
const COL_GAP = 10;
const H_PAD = 40;
const CARD_W = (SCREEN_W - H_PAD - COL_GAP) / 2;
const CARD_H = 174;

// Camera card — snapshot image, auto-refreshes every 5 s
const CameraCard = ({ cam, frigateService, onPress, cardHeight = 174 }) => {
    const [tick, setTick] = useState(Date.now());

    // Refresh snapshot every 5 seconds
    useEffect(() => {
        const id = setInterval(() => setTick(Date.now()), 5000);
        return () => clearInterval(id);
    }, []);

    const isHACamera = !!(cam.entity_id);
    const baseUrl = isHACamera
        ? frigateService?.getHASnapshotUrl(cam.entity_id || cam.id)
        : frigateService?.getSnapshotUrl(cam.name || cam.id);

    // Append cache-buster so Image re-fetches each interval
    const snapshotUrl = baseUrl ? `${baseUrl}?t=${tick}` : null;
    const headers = frigateService?.headers || {};

    return (
        <TouchableOpacity
            style={[styles.card, { height: cardHeight }]}
            onPress={() => onPress && onPress(cam)}
            activeOpacity={0.85}
        >
            {snapshotUrl ? (
                <Image
                    source={{ uri: snapshotUrl, headers }}
                    style={StyleSheet.absoluteFill}
                    resizeMode="cover"
                />
            ) : (
                <View style={styles.placeholder}>
                    <Text style={styles.placeholderIcon}>📷</Text>
                </View>
            )}

            {/* Same gradient as room card */}
            <LinearGradient
                colors={['transparent', 'rgba(0,0,0,0.4)', 'rgba(0,0,0,0.92)']}
                style={styles.gradient}
            />

            {/* Camera name at bottom — same as room card */}
            <View style={styles.textContainer}>
                <Text style={styles.cameraName} numberOfLines={1}>
                    {cam.name || cam.id}
                </Text>
            </View>

            {/* Live dot top-right */}
            <View style={styles.liveBadge}>
                <View style={styles.liveDot} />
                <Text style={styles.liveText}>LIVE</Text>
            </View>
        </TouchableOpacity>
    );
};

// ── Edit Cameras Modal ────────────────────────────────────────────────────────
function EditCamerasModal({ visible, onClose, adminUrl, onSave }) {
    const [allCameras, setAllCameras] = useState([]);
    const [selected, setSelected]     = useState(new Set());
    const [loading, setLoading]       = useState(false);
    const [saving, setSaving]         = useState(false);
    const [search, setSearch]         = useState('');

    const savedIdsRef    = useRef(new Set());
    const isFetchingRef  = useRef(false);

    // Slide-in animation
    const sheetAnim = useRef(new Animated.Value(700)).current;
    useEffect(() => {
        if (visible) {
            sheetAnim.setValue(700);
            Animated.timing(sheetAnim, { toValue: 0, duration: 300, useNativeDriver: true }).start();
        }
    }, [visible]);

    // Drag to dismiss
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

    useEffect(() => {
        if (!visible) { isFetchingRef.current = false; return; }
        if (isFetchingRef.current) return;
        isFetchingRef.current = true;

        setSearch('');
        setAllCameras([]);
        setLoading(true);

        const base = adminUrl?.endsWith('/') ? adminUrl : `${adminUrl}/`;
        authFetch(`${base}api/cameras`)
            .then(async (res) => {
                const data = await res.json();
                const cams = (data.cameras || []).map(c => ({
                    entity_id:     c.entity_id || c.name || c,
                    friendly_name: c.attributes?.friendly_name || c.entity_id || c.name || c,
                }));
                cams.sort((a, b) => a.friendly_name.localeCompare(b.friendly_name));
                setAllCameras(cams);

                const savedSet = new Set(data.selected_cameras || []);
                savedIdsRef.current = savedSet;
                setSelected(new Set(savedSet));
            })
            .catch(e => {
                console.warn('[HomeCameraStrip] fetch cameras error:', e);
                Alert.alert('Error', 'Could not load cameras from server.');
            })
            .finally(() => setLoading(false));
    }, [visible, adminUrl]);

    const toggleItem = (id) => {
        setSelected(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const base = adminUrl?.endsWith('/') ? adminUrl : `${adminUrl}/`;
            // Fetch current config, patch selected_cameras, save back
            const cfgRes = await authFetch(`${base}api/config`);
            const cfg    = await cfgRes.json();
            const res    = await authFetch(`${base}api/config`, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ ...cfg, selected_cameras: Array.from(selected) }),
            });
            if (!res.ok) throw new Error('save failed');
            savedIdsRef.current = new Set(selected);
            onSave(Array.from(selected));
            onClose();
        } catch (e) {
            console.warn('[HomeCameraStrip] save cameras error:', e);
            Alert.alert('Error', 'Could not save cameras. Please try again.');
        } finally {
            setSaving(false);
        }
    };

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return allCameras;
        return allCameras.filter(c =>
            c.friendly_name.toLowerCase().includes(q) ||
            c.entity_id.toLowerCase().includes(q)
        );
    }, [allCameras, search]);

    return (
        <Modal visible={visible} animationType="none" transparent onRequestClose={onClose}>
            <View style={modal.overlay}>
                <Animated.View style={[modal.sheet, { transform: [{ translateY: sheetAnim }] }]}>
                    {/* Drag handle */}
                    <View style={modal.handleTouchArea} {...panResponder.panHandlers}>
                        <View style={modal.handle} />
                    </View>

                    {/* Header */}
                    <View style={modal.header}>
                        <Text style={modal.title}>Edit Cameras</Text>
                        <TouchableOpacity onPress={onClose} style={modal.closeBtn}>
                            <X size={18} color="#ededf5" />
                        </TouchableOpacity>
                    </View>
                    <Text style={modal.subtitle}>
                        {allCameras.length} available · {selected.size} selected
                    </Text>

                    {/* Search */}
                    <View style={modal.searchRow}>
                        <Search size={14} color="#4a4957" style={{ marginRight: 8 }} />
                        <TextInput
                            style={modal.searchInput}
                            placeholder="Search cameras…"
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
                                    {search ? 'No matches found' : 'No cameras found'}
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
                            : <Text style={modal.saveBtnText}>Save  ({selected.size} selected)</Text>
                        }
                    </TouchableOpacity>
                </Animated.View>
            </View>
        </Modal>
    );
}

function HomeCameraStrip({ frigateCameras = [], selectedCameraNames = [], frigateService, onCameraPress, onAllCamerasPress, adminUrl, onCamerasUpdated, cardHeight = 174 }) {
    const [editVisible, setEditVisible] = useState(false);

    // selectedCameraNames may be HA entity IDs like "camera.doorstep"
    // frigateCameras have name like "doorstep" (without prefix)
    // Normalise both sides: strip "camera." prefix before comparing
    const normalise = s => (s || '').toLowerCase().replace(/^camera\./, '');
    const selectedNormalised = selectedCameraNames.map(normalise);
    const cameras = frigateCameras.filter(c => selectedNormalised.includes(normalise(c.name || c.id)));

    if (cameras.length === 0 && !editVisible) return null;

    return (
        <View style={styles.container}>
            <View style={styles.headerRow}>
                <Text style={styles.title}>CAMERAS</Text>
                <View style={styles.headerActions}>
                    {adminUrl ? (
                        <TouchableOpacity onPress={() => setEditVisible(true)} style={styles.editBtn} activeOpacity={0.7}>
                            <Edit2 size={12} color="#9199BA" />
                            <Text style={styles.editText}>Edit</Text>
                        </TouchableOpacity>
                    ) : null}
                </View>
            </View>
            {cameras.length > 0 && (
                <View style={styles.grid}>
                    {cameras.map(cam => (
                        <CameraCard
                            key={cam.id || cam.name}
                            cam={cam}
                            frigateService={frigateService}
                            onPress={onCameraPress}
                            cardHeight={cardHeight}
                        />
                    ))}
                </View>
            )}
            <EditCamerasModal
                visible={editVisible}
                onClose={() => setEditVisible(false)}
                adminUrl={adminUrl}
                onSave={(ids) => onCamerasUpdated && onCamerasUpdated(ids)}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        marginBottom: 20,
    },
    headerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 10,
        marginHorizontal: 2,
    },
    title: {
        color: '#9199BA',
        fontSize: 12,
        fontFamily: CF.semibold,
        letterSpacing: 1.4,
    },
    headerActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
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
    allBtn: {
        paddingVertical: 2,
        paddingHorizontal: 4,
    },
    allBtnText: {
        color: '#9199BA',
        fontSize: 12,
        fontFamily: CF.semibold,
        letterSpacing: 0.3,
    },
    scrollContent: {
        gap: 12,
        paddingRight: 20,
    },
    grid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        rowGap: COL_GAP,
    },
    card: {
        width: CARD_W,
        height: CARD_H,
        borderRadius: 16,
        overflow: 'hidden',
        backgroundColor: '#1e1f35',
        position: 'relative',
        shadowColor: '#8947ca',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.4,
        shadowRadius: 8,
        elevation: 5,
    },
    placeholder: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: '#1a1a2e',
        justifyContent: 'center',
        alignItems: 'center',
    },
    placeholderIcon: {
        fontSize: 36,
        opacity: 0.4,
    },
    gradient: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        height: '70%',
    },
    textContainer: {
        position: 'absolute',
        bottom: 8,
        left: 10,
        right: 8,
    },
    cameraName: {
        color: 'white',
        fontSize: 14,
        fontFamily: CF.semibold,
        textShadowColor: 'rgba(0,0,0,0.75)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 3,
    },
    liveBadge: {
        position: 'absolute',
        top: 8,
        right: 8,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: 'rgba(0,0,0,0.6)',
        paddingHorizontal: 6,
        paddingVertical: 3,
        borderRadius: 8,
    },
    liveDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: '#4ade80',
    },
    liveText: {
        color: 'white',
        fontSize: 10,
        fontFamily: CF.semibold,
        letterSpacing: 0.5,
    },
});

const modal = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.65)',
        justifyContent: 'flex-end',
    },
    sheet: {
        backgroundColor: '#0f1028',
        borderTopLeftRadius: 28,
        borderTopRightRadius: 28,
        borderTopWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
        paddingHorizontal: 20,
        paddingBottom: 32,
        maxHeight: '85%',
    },
    handleTouchArea: {
        alignItems: 'center',
        paddingVertical: 12,
    },
    handle: {
        width: 36,
        height: 4,
        borderRadius: 2,
        backgroundColor: 'rgba(255,255,255,0.15)',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 4,
    },
    title: {
        color: '#ededf5',
        fontSize: 17,
        fontFamily: CF.semibold,
    },
    closeBtn: {
        padding: 4,
    },
    subtitle: {
        color: 'rgba(255,255,255,0.35)',
        fontSize: 13,
        marginBottom: 14,
    },
    searchRow: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.06)',
        borderRadius: 12,
        paddingHorizontal: 12,
        paddingVertical: 8,
        marginBottom: 12,
    },
    searchInput: {
        flex: 1,
        color: '#ededf5',
        fontSize: 14,
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 13,
        paddingHorizontal: 4,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.05)',
    },
    rowSelected: {
        backgroundColor: 'rgba(137,71,202,0.08)',
        borderRadius: 10,
        paddingHorizontal: 8,
    },
    rowLabel: {
        flex: 1,
        color: '#ededf5',
        fontSize: 14,
        marginRight: 12,
    },
    checkCircle: {
        width: 22,
        height: 22,
        borderRadius: 11,
        borderWidth: 2,
        borderColor: 'rgba(255,255,255,0.2)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    checkCircleOn: {
        borderColor: '#8947ca',
        backgroundColor: '#8947ca',
    },
    empty: {
        color: 'rgba(255,255,255,0.3)',
        fontSize: 14,
        textAlign: 'center',
        marginTop: 32,
    },
    saveBtn: {
        marginTop: 16,
        backgroundColor: '#8947ca',
        borderRadius: 14,
        paddingVertical: 14,
        alignItems: 'center',
    },
    saveBtnText: {
        color: '#fff',
        fontSize: 15,
        fontFamily: CF.semibold,
    },
});

export default memo(HomeCameraStrip);
