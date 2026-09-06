import { memo, useState, useEffect, useRef, useMemo } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, Dimensions, Image,
    Modal, FlatList, ActivityIndicator, Alert, TextInput, Animated, PanResponder,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { LinearGradient } from 'expo-linear-gradient';
import { Edit2, Check, X, Search } from 'lucide-react-native';
import { CF } from '../../utils/typography';
import { formatCameraName } from '../../utils/formatDisplayName';
import { authFetch } from '../../utils/authFetch';
import { cameraKey, cameraUsesHaFeed, cameraKeysMatch, camerasFromBackendPayload } from '../../services/appRole';
import * as SecureStore from 'expo-secure-store';
import ModalBackdrop from '../ModalBackdrop';
import CameraSensorOverlay, { buildEntityMap, resolveSensorIds } from './CameraSensorOverlay';

const COL_GAP = 10;
const H_PAD = 40;
const SCREEN_W = Dimensions.get('window').width;
const DEFAULT_CARD_W = (SCREEN_W - H_PAD - COL_GAP) / 2;

// Injected BEFORE content loads — guarantees CSS is in place before the img/video renders
const STRIP_PRE_JS = `
  (function() {
    var style = document.createElement('style');
    style.textContent =
      '* { margin: 0 !important; padding: 0 !important; box-sizing: border-box !important; }' +
      'html, body { width: 100vw !important; height: 100vh !important; overflow: hidden !important; background: black !important; }' +
      'img, video { position: fixed !important; top: 50% !important; left: 50% !important; ' +
      'transform: translate(-50%,-50%) !important; min-width: 100vw !important; min-height: 100vh !important; ' +
      'width: auto !important; height: auto !important; object-fit: cover !important; display: block !important; }';
    (document.head || document.documentElement).appendChild(style);
  })();
  true;
`;

// Post-load pass — re-applies inline styles in case the page overrides our CSS
const STRIP_PAGE_JS = `
  (function() {
    function apply() {
      var cover = [
        'position:fixed','top:50%','left:50%',
        'transform:translate(-50%,-50%)',
        'min-width:100vw','min-height:100vh',
        'width:auto','height:auto',
        'object-fit:cover','display:block',
      ].join(';');
      document.querySelectorAll('img,video').forEach(function(el) {
        el.style.cssText = cover;
      });
      var b = document.body;
      if (b) { b.style.margin='0'; b.style.padding='0'; b.style.overflow='hidden'; b.style.background='black'; b.style.width='100vw'; b.style.height='100vh'; }
    }
    apply();
    setTimeout(apply, 300);
    setTimeout(apply, 1000);
    setTimeout(apply, 3000);
  })();
  true;
`;

const SNAPSHOT_MS = 2000;

function withTick(url, tick) {
    if (!url) return '';
    return `${url}${url.includes('?') ? '&' : '?'}t=${tick}`;
}

// Camera card — Frigate live WebView, HA snapshot images (JPEG cannot load in WebView)
const CameraCard = ({ cam, frigateService, onPress, sensorIds = [], entityMap = {}, cardWidth }) => {
    const [streamError, setStreamError] = useState(false);
    const [tick, setTick] = useState(0);
    const [useFrigateFallback, setUseFrigateFallback] = useState(false);
    const lastGoodRef = useRef(null);
    const isHACamera = cameraUsesHaFeed(cam) && !useFrigateFallback;
    const frigateName = String(cam?.name || cam?.id || '').replace(/^camera\./, '');
    const streamUrl = isHACamera
        ? frigateService?.getHASnapshotUrl(cam.entity_id || cam.id)
        : frigateService?.getStreamUrl(frigateName);
    const snapshotUri = withTick(streamUrl, tick);
    const headers = frigateService?.headers || {};

    useEffect(() => {
        if (!isHACamera) return undefined;
        const id = setInterval(() => setTick((n) => n + 1), SNAPSHOT_MS);
        return () => clearInterval(id);
    }, [isHACamera]);

    useEffect(() => {
        setStreamError(false);
        setUseFrigateFallback(false);
        lastGoodRef.current = null;
    }, [cam?.id, cam?.entity_id, cam?.name]);

    return (
        <TouchableOpacity
            style={[styles.card, cardWidth != null && { width: cardWidth }]}
            onPress={() => onPress && onPress(cam)}
            activeOpacity={0.85}
        >
            {streamUrl && !streamError ? (
                isHACamera ? (
                    <>
                        {lastGoodRef.current ? (
                            <Image
                                source={{ uri: lastGoodRef.current, headers }}
                                style={StyleSheet.absoluteFill}
                                resizeMode="cover"
                            />
                        ) : null}
                        <Image
                            source={{ uri: snapshotUri, headers }}
                            style={StyleSheet.absoluteFill}
                            resizeMode="cover"
                            fadeDuration={0}
                            onLoad={() => {
                                lastGoodRef.current = snapshotUri;
                                setStreamError(false);
                            }}
                            onError={() => {
                                if (!lastGoodRef.current) setUseFrigateFallback(true);
                            }}
                        />
                    </>
                ) : (
                    <WebView
                        source={{ uri: streamUrl, headers }}
                        style={StyleSheet.absoluteFill}
                        backgroundColor="black"
                        scrollEnabled={false}
                        allowsInlineMediaPlayback={true}
                        mediaPlaybackRequiresUserAction={false}
                        originWhitelist={['*']}
                        scalesPageToFit={false}
                        javaScriptEnabled={true}
                        injectedJavaScriptBeforeContentLoaded={STRIP_PRE_JS}
                        injectedJavaScript={STRIP_PAGE_JS}
                        onError={() => setStreamError(true)}
                        onHttpError={(e) => { if (e.nativeEvent.statusCode >= 400) setStreamError(true); }}
                        onLoadStart={() => setStreamError(false)}
                    />
                )
            ) : (
                <View style={styles.placeholder}>
                    {streamError ? (
                        <>
                            <Text style={styles.placeholderIcon}>📵</Text>
                            <Text style={styles.placeholderErrorText}>Stream unavailable</Text>
                        </>
                    ) : (
                        <Text style={styles.placeholderIcon}>📷</Text>
                    )}
                </View>
            )}

            <LinearGradient
                colors={['transparent', 'rgba(0,0,0,0.4)', 'rgba(0,0,0,0.92)']}
                style={styles.gradient}
            />

            <View style={styles.textContainer}>
                <Text style={styles.cameraName} numberOfLines={1}>
                    {formatCameraName(cam.name || cam.id)}
                </Text>
            </View>
            <CameraSensorOverlay sensorIds={sensorIds} entityMap={entityMap} position="tl" />
        </TouchableOpacity>
    );
};

function cameraPickId(cam) {
    return String(cam?.entity_id || cam?.id || cam?.name || '').trim();
}

function toPickerCameras(list) {
    return (Array.isArray(list) ? list : []).map((c) => ({
        entity_id: cameraPickId(c),
        name: c.name || c.id || c.entity_id,
        friendly_name: c.friendly_name || c.name || c.id || c.entity_id,
    })).filter((c) => c.entity_id);
}

function normalizeSelectedIds(rawList, cameras) {
    const raw = Array.isArray(rawList) ? rawList : [];
    const matched = new Set();
    for (const item of raw) {
        if (item == null || String(item).trim() === '') continue;
        const key = cameraKey(item);
        if (!key) continue;
        const cam = cameras.find((c) => (
            cameraKey(c.entity_id) === key
            || cameraKey(c.name) === key
            || cameraKey(c.friendly_name) === key
        ));
        if (cam) matched.add(cameraPickId(cam));
        else matched.add(String(item).trim());
    }
    return matched;
}

// ── Edit Cameras Modal ────────────────────────────────────────────────────────
function EditCamerasModal({
    visible,
    onClose,
    adminUrl,
    onSave,
    initialSelected = [],
    availableCameras = null,
    persistToServer = true,
    userId = '',
    username = '',
}) {
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
        setSelected(new Set());
        setLoading(true);

        const applyList = (cams) => {
            const sorted = [...cams].sort((a, b) =>
                String(a.friendly_name || '').localeCompare(String(b.friendly_name || ''))
            );
            setAllCameras(sorted);
            const savedSet = normalizeSelectedIds(initialSelected, sorted);
            savedIdsRef.current = savedSet;
            setSelected(new Set(savedSet));
            setLoading(false);
        };

        if (Array.isArray(availableCameras) && availableCameras.length) {
            applyList(toPickerCameras(availableCameras));
            return;
        }

        const base = adminUrl?.endsWith('/') ? adminUrl : `${adminUrl}/`;
        const qs = new URLSearchParams({
            userId: String(userId || ''),
            username: String(username || ''),
        });
        authFetch(`${base}api/cameras?${qs}`)
            .then(async (res) => {
                if (!res.ok) throw new Error(`cameras ${res.status}`);
                const data = await res.json();
                const cams = camerasFromBackendPayload(data).map((c) => ({
                    entity_id:     c.entity_id || c.name || c.id,
                    name:          c.name,
                    friendly_name: c.friendly_name || c.name || c.entity_id,
                    feed:          c.feed,
                }));
                const fromConfig = Array.isArray(initialSelected) ? initialSelected : null;
                const fromApi = Array.isArray(data.home_cameras) ? data.home_cameras
                    : (Array.isArray(data.selected_cameras) ? data.selected_cameras : []);
                cams.sort((a, b) => String(a.friendly_name).localeCompare(String(b.friendly_name)));
                setAllCameras(cams);
                const savedSet = normalizeSelectedIds(fromConfig ?? fromApi, cams);
                savedIdsRef.current = savedSet;
                setSelected(new Set(savedSet));
            })
            .catch(e => {
                console.warn('[HomeCameraStrip] fetch cameras skipped:', e?.message || e);
            })
            .finally(() => setLoading(false));
    }, [visible, adminUrl, availableCameras, userId, username]);

    const toggleItem = (id) => {
        setSelected(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };

    const handleSave = async () => {
        setSaving(true);
        const ids = Array.from(selected);
        try {
            if (persistToServer && adminUrl) {
                const base = adminUrl?.endsWith('/') ? adminUrl : `${adminUrl}/`;
                const camRes = await authFetch(`${base}api/cameras`, {
                    method:  'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body:    JSON.stringify({
                        home_cameras: ids,
                        userId: String(userId || ''),
                        username: String(username || ''),
                    }),
                });
                if (!camRes.ok) {
                    throw new Error(`save failed (${camRes.status})`);
                }
            }
            savedIdsRef.current = new Set(selected);
            onSave(ids);
            onClose();
        } catch (e) {
            console.warn('[HomeCameraStrip] save cameras error:', e);
            savedIdsRef.current = new Set(selected);
            onSave(ids);
            onClose();
            Alert.alert('Saved on this device', 'Could not sync cameras to the server. They will still show on Home.');
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
                <ModalBackdrop onPress={onClose} />
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
                        {`${allCameras.length} cameras you can access · ${selected.size} on Home`}
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
                                            {formatCameraName(item.friendly_name || item.entity_id)}
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

function HomeCameraStrip({
    frigateCameras = [],
    selectedCameraNames = null,
    frigateService,
    onCameraPress,
    onAllCamerasPress,
    adminUrl,
    onCamerasUpdated,
    cameraSensors = {},
    haEntities = [],
    columns = 2,
    canEdit = undefined,
    availableCameras = null,
    persistToServer = true,
    selectionStorageKey = null,
    userId = '',
    username = '',
}) {
    const [editVisible, setEditVisible] = useState(false);
    const [gridWidth, setGridWidth] = useState(0);
    const [localSelected, setLocalSelected] = useState(null);
    const [localReady, setLocalReady] = useState(!selectionStorageKey);
    const cardWidth =
        gridWidth > 0
            ? Math.floor((gridWidth - COL_GAP * (columns - 1)) / columns)
            : DEFAULT_CARD_W;

    const pickerCameras = availableCameras || frigateCameras;
    const showEdit = canEdit ?? (!!adminUrl || !!selectionStorageKey);

    useEffect(() => {
        if (!selectionStorageKey) {
            setLocalSelected(null);
            setLocalReady(true);
            return;
        }
        let cancelled = false;
        setLocalReady(false);
        SecureStore.getItemAsync(selectionStorageKey)
            .then((raw) => {
                if (cancelled) return;
                try {
                    const parsed = raw ? JSON.parse(raw) : null;
                    setLocalSelected(Array.isArray(parsed) ? parsed : null);
                } catch {
                    setLocalSelected(null);
                }
                setLocalReady(true);
            })
            .catch(() => {
                if (!cancelled) {
                    setLocalSelected(null);
                    setLocalReady(true);
                }
            });
        return () => { cancelled = true; };
    }, [selectionStorageKey]);

    const effectiveSelected = Array.isArray(selectedCameraNames)
        ? selectedCameraNames
        : ((selectionStorageKey && localReady && localSelected) ? localSelected : []);

    // Fast entity lookup map built from live HA entities (sensors only)
    const entityMap = useMemo(() => {
        const sensorEntities = haEntities.filter(e =>
            e.entity_id.startsWith('sensor.') || e.entity_id.startsWith('binary_sensor.')
        );
        const map = buildEntityMap(sensorEntities);
        return map;
    }, [haEntities]);

    const cameras = useMemo(() => {
        const selected = Array.isArray(effectiveSelected) ? effectiveSelected : [];
        const pool = Array.isArray(pickerCameras) && pickerCameras.length
            ? pickerCameras
            : (frigateCameras || []);
        if (!selected.length) return [];
        return pool.filter((c) => {
            const keys = [c.name, c.id, c.entity_id, c.friendly_name].filter(Boolean);
            return selected.some((item) => keys.some((k) => cameraKeysMatch(k, item)));
        });
    }, [frigateCameras, pickerCameras, effectiveSelected]);
    const hasAnyCameras = (frigateCameras.length > 0 || pickerCameras?.length > 0) || showEdit;

    if (!hasAnyCameras && cameras.length === 0 && !editVisible) return null;

    return (
        <View style={styles.container}>
            <View style={styles.headerRow}>
                <Text style={styles.title}>CAMERAS</Text>
                <View style={styles.headerActions}>
                    {showEdit ? (
                        <TouchableOpacity onPress={() => setEditVisible(true)} style={styles.editBtn} activeOpacity={0.7}>
                            <Edit2 size={12} color="#9199BA" />
                            <Text style={styles.editText}>Edit</Text>
                        </TouchableOpacity>
                    ) : null}
                </View>
            </View>
            {cameras.length > 0 ? (
                <View
                    style={styles.grid}
                    onLayout={(e) => {
                        const w = e.nativeEvent.layout.width;
                        if (w > 0 && w !== gridWidth) setGridWidth(w);
                    }}
                >
                    {cameras.map(cam => {
                        const sensorIds = resolveSensorIds(cam, cameraSensors);
                        return (
                            <View key={cam.id || cam.name} style={[styles.gridCell, { width: cardWidth }]}>
                                <CameraCard
                                    cam={cam}
                                    frigateService={frigateService}
                                    onPress={onCameraPress}
                                    sensorIds={sensorIds}
                                    entityMap={entityMap}
                                    cardWidth={cardWidth}
                                />
                            </View>
                        );
                    })}
                </View>
            ) : (
                <View style={styles.emptyBox}>
                    <Text style={styles.emptyTitle}>No cameras selected</Text>
                    <Text style={styles.emptyHint}>
                        For selecting a camera please press the Edit button.
                    </Text>
                </View>
            )}
            <EditCamerasModal
                visible={editVisible}
                onClose={() => setEditVisible(false)}
                adminUrl={adminUrl}
                initialSelected={effectiveSelected}
                availableCameras={availableCameras}
                persistToServer={persistToServer}
                userId={userId}
                username={username}
                onSave={async (ids) => {
                    if (selectionStorageKey) {
                        try {
                            await SecureStore.setItemAsync(selectionStorageKey, JSON.stringify(ids));
                        } catch (e) {
                            console.warn('[HomeCameraStrip] local save failed:', e?.message || e);
                        }
                        setLocalSelected(ids);
                    }
                    onCamerasUpdated && onCamerasUpdated(ids);
                }}
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
    emptyBox: {
        borderRadius: 16,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
        backgroundColor: 'rgba(255,255,255,0.04)',
        paddingVertical: 22,
        paddingHorizontal: 16,
        alignItems: 'center',
    },
    emptyTitle: {
        color: '#ededf5',
        fontSize: 14,
        fontFamily: CF.semibold,
        marginBottom: 6,
        textAlign: 'center',
    },
    emptyHint: {
        color: 'rgba(237,237,245,0.45)',
        fontSize: 13,
        fontFamily: CF.regular,
        textAlign: 'center',
        lineHeight: 18,
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
        gap: COL_GAP,
    },
    gridCell: {
        flexGrow: 0,
        flexShrink: 0,
    },
    card: {
        width: DEFAULT_CARD_W,
        aspectRatio: 4 / 3,
        borderRadius: 16,
        overflow: 'hidden',
        backgroundColor: '#1e1f35',
        position: 'relative',
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
    placeholderErrorText: {
        color: 'rgba(255,255,255,0.35)',
        fontSize: 11,
        fontFamily: CF.regular,
        marginTop: 6,
        textAlign: 'center',
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
