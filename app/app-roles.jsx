import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, ScrollView,
    TextInput, ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import {
    Plus, Trash2, ShieldCheck, Video, DoorOpen, Users as UsersIcon,
    LayoutGrid, ChevronDown, ChevronUp, Crown, UserCog, Baby, KeyRound,
} from 'lucide-react-native';
import { StatusBar } from 'expo-status-bar';

import { Colors } from '../constants/Colors';
import { CF } from '../utils/typography';
import { authFetch } from '../utils/authFetch';

/**
 * Owner-only "App Roles" screen — the mobile equivalent of the AppBackendV1
 * "App Roles" admin page. Lets the Home Assistant OWNER account:
 *  - Create/delete roles (Admin is protected and can't be edited/deleted).
 *  - Choose which screens a role can open (Home, Cameras, Rooms, Butler,
 *    Settings, Kids Tablet).
 *  - Limit a role to a subset of cameras (or allow all).
 *  - Limit a role to a subset of rooms (or allow all).
 *
 * All of this is saved through the same /api/app-roles endpoint used by the
 * admin dashboard, which itself re-checks that the requester really is the
 * HA owner — this screen being reachable is just a UI convenience.
 */
function cameraKey(value) {
    return String(value || '')
        .toLowerCase()
        .replace(/^camera\./, '')
        .replace(/-/g, '_')
        .replace(/\s+/g, '_')
        .trim();
}

function roleHasCamera(roleCameras, entityId) {
    const want = cameraKey(entityId);
    return (roleCameras || []).some((id) => cameraKey(id) === want);
}

/** Small visual identity per role so the list isn't a wall of identical cards. */
function roleIconFor(id) {
    const key = String(id || '').toLowerCase();
    if (key === 'admin') return { Icon: Crown, tint: '#facc15' };
    if (key.includes('kid') || key.includes('child')) return { Icon: Baby, tint: '#f472b6' };
    if (key.includes('guest')) return { Icon: KeyRound, tint: '#38bdf8' };
    if (key.includes('family')) return { Icon: UsersIcon, tint: '#34d399' };
    return { Icon: UserCog, tint: Colors.primary };
}

const SCREEN_ICONS = {
    home: LayoutGrid,
    cctv: Video,
    rooms: DoorOpen,
};

export default function AppRolesPage() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { adminUrl: adminUrlParam, userName: userNameParam } = useLocalSearchParams();
    const adminUrl = Array.isArray(adminUrlParam) ? adminUrlParam[0] : adminUrlParam;
    const requesterUsername = Array.isArray(userNameParam) ? userNameParam[0] : userNameParam;
    const base = adminUrl ? (adminUrl.endsWith('/') ? adminUrl : `${adminUrl}/`) : '';

    const [roles, setRoles] = useState([]);
    const [allScreens, setAllScreens] = useState([]);
    const [cameras, setCameras] = useState([]);
    const [areas, setAreas] = useState([]);
    const [users, setUsers] = useState([]);
    const [newRoleName, setNewRoleName] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [loadError, setLoadError] = useState('');
    const [forbidden, setForbidden] = useState(false);
    /** Which role cards are expanded — new/first role open by default, rest collapsed for a cleaner list. */
    const [expandedIds, setExpandedIds] = useState(() => new Set());
    const [dirty, setDirty] = useState(false);


    const load = useCallback(async () => {
        if (!base) {
            setLoadError('Could not find your home connection.');
            setLoading(false);
            return;
        }
        setLoading(true);
        setLoadError('');
        setForbidden(false);
        try {
            const rolesRes = await authFetch(
                `${base}api/app-roles?username=${encodeURIComponent(requesterUsername || '')}`,
            );
            if (rolesRes.status === 403) {
                setForbidden(true);
                setLoading(false);
                return;
            }
            const rolesData = await rolesRes.json().catch(() => ({}));
            if (rolesRes.ok) {
                const nextRoles = Array.isArray(rolesData.roles) ? rolesData.roles : [];
                setRoles(nextRoles);
                setUsers(Array.isArray(rolesData.users) ? rolesData.users : []);
                setAllScreens(Array.isArray(rolesData.allScreens) ? rolesData.allScreens : []);
                setExpandedIds(new Set(nextRoles.length ? [nextRoles[0].id] : []));
            }

            const [configRes, areasRes, camerasRes] = await Promise.all([
                authFetch(`${base}api/config`),
                authFetch(`${base}api/areas`),
                authFetch(`${base}api/cameras`),
            ]);
            const config = configRes.ok ? await configRes.json().catch(() => ({})) : {};
            const liveAreas = areasRes.ok ? await areasRes.json().catch(() => []) : [];
            const liveAreaIds = new Set(
                Array.isArray(liveAreas) ? liveAreas.map((a) => a?.area_id).filter(Boolean) : [],
            );
            const selectedAreas = (Array.isArray(config.selected_areas) ? config.selected_areas : [])
                .filter((a) => a?.area_id && liveAreaIds.has(a.area_id));
            const parentIds = new Set(
                selectedAreas.filter((a) => a?.area_id && !a.parent_area_id).map((a) => a.area_id),
            );
            setAreas(
                selectedAreas
                    .map((a) => {
                        const parent = a.parent_area_id
                            ? selectedAreas.find((p) => p.area_id === a.parent_area_id)
                            : null;
                        const isSub = !!(a.parent_area_id && parentIds.has(a.parent_area_id));
                        return {
                            area_id: a.area_id,
                            name: a.name || a.area_id,
                            isSub,
                            parentName: parent?.name || a.parent_area_id || '',
                        };
                    })
                    .sort((a, b) => {
                        if (a.isSub !== b.isSub) return a.isSub ? 1 : -1;
                        return String(a.name).localeCompare(String(b.name));
                    }),
            );

            if (camerasRes.ok) {
                const data = await camerasRes.json().catch(() => ({}));
                const house = Array.isArray(data.cameras) && data.cameras.length
                    ? data.cameras
                    : (Array.isArray(data.selected_cameras)
                        ? data.selected_cameras.map((id) => ({ entity_id: id, name: id }))
                        : []);
                setCameras(
                    house
                        .map((cam) => {
                            const id = cam?.entity_id || cam?.name || cam;
                            if (!id) return null;
                            return { entity_id: id, name: cam.name || String(id).replace(/_/g, ' ') };
                        })
                        .filter(Boolean)
                        .sort((a, b) => String(a.name).localeCompare(String(b.name))),
                );
            }
        } catch {
            setLoadError('Could not load roles. Check your connection.');
        } finally {
            setLoading(false);
        }
    }, [base, requesterUsername]);

    useEffect(() => { load(); }, [load]);

    const usedRoleIds = useMemo(() => new Set(roles.map((r) => r.id)), [roles]);

    /** How many assigned users currently sit on each role — shown as a small badge. */
    const userCountByRoleId = useMemo(() => {
        const counts = {};
        users.forEach((u) => {
            const rid = u.roleId || 'admin';
            counts[rid] = (counts[rid] || 0) + 1;
        });
        return counts;
    }, [users]);

    const toggleExpanded = (roleId) => {
        setExpandedIds((prev) => {
            const next = new Set(prev);
            if (next.has(roleId)) next.delete(roleId); else next.add(roleId);
            return next;
        });
    };

    const toggleScreen = (roleId, screenId) => {
        if (roleId === 'admin') return;
        setDirty(true);
        setRoles((prev) => prev.map((role) => {
            if (role.id !== roleId) return role;
            const has = role.screens.includes(screenId);
            return {
                ...role,
                screens: has ? role.screens.filter((id) => id !== screenId) : [...role.screens, screenId],
            };
        }));
    };

    const patchRole = (roleId, patch) => {
        if (roleId === 'admin') return;
        setDirty(true);
        setRoles((prev) => prev.map((role) => (role.id === roleId ? { ...role, ...patch } : role)));
    };

    const toggleCamera = (roleId, entityId) => {
        setDirty(true);
        setRoles((prev) => prev.map((role) => {
            if (role.id !== roleId || role.allCameras !== false) return role;
            const has = roleHasCamera(role.cameras, entityId);
            return {
                ...role,
                cameras: has
                    ? (role.cameras || []).filter((id) => cameraKey(id) !== cameraKey(entityId))
                    : [...(role.cameras || []), entityId],
            };
        }));
    };

    const toggleRoom = (roleId, areaId) => {
        setDirty(true);
        setRoles((prev) => prev.map((role) => {
            if (role.id !== roleId || role.allRooms !== false) return role;
            const has = (role.rooms || []).includes(areaId);
            return {
                ...role,
                rooms: has ? role.rooms.filter((id) => id !== areaId) : [...(role.rooms || []), areaId],
            };
        }));
    };

    const addRole = () => {
        const name = newRoleName.trim();
        if (!name) return;
        let id = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 32)
            || `role_${Date.now().toString(36)}`;
        if (usedRoleIds.has(id)) id = `${id}_${Date.now().toString(36).slice(-4)}`;
        setDirty(true);
        setRoles((prev) => [...prev, {
            id, name, screens: ['home'], allCameras: true, cameras: [], allRooms: true, rooms: [],
        }]);
        setExpandedIds((prev) => new Set(prev).add(id));
        setNewRoleName('');
    };

    const deleteRole = (roleId) => {
        if (roleId === 'admin') return;
        Alert.alert(
            'Delete role?',
            'Users on it will fall back to Admin until you reassign them.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: () => {
                        setDirty(true);
                        setRoles((prev) => prev.filter((r) => r.id !== roleId));
                        setUsers((prev) => prev.map((u) => (u.roleId === roleId ? { ...u, roleId: 'admin' } : u)));
                    },
                },
            ],
        );
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const res = await authFetch(`${base}api/app-roles`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ roles, users, requesterUsername }),
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok && !data.error) {
                setDirty(false);
                Alert.alert('Saved', 'App users get these screens, cameras, and rooms on next login.');
            } else {
                Alert.alert('Save failed', data.error || 'Could not save roles.');
            }
        } catch {
            Alert.alert('Save failed', 'Network error. Try again.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <View style={styles.container}>
            <Stack.Screen options={{ headerShown: false }} />
            <LinearGradient colors={['#1a1b2e', '#16161e', '#000000']} style={StyleSheet.absoluteFill} />
            <StatusBar style="light" />
            <View style={{ flex: 1, paddingTop: insets.top }}>
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                        <Ionicons name="arrow-back" size={22} color="white" />
                    </TouchableOpacity>
                    <View style={styles.headerTitleWrap}>
                        <Text style={styles.title}>App Roles</Text>
                        <Text style={styles.subtitle}>Screens · cameras · rooms per role</Text>
                    </View>
                    <TouchableOpacity
                        onPress={handleSave}
                        disabled={saving || loading || forbidden}
                        style={[
                            styles.saveBtn,
                            (saving || loading || forbidden) && { opacity: 0.5 },
                            dirty && !saving && styles.saveBtnDirty,
                        ]}
                    >
                        {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveBtnText}>Save</Text>}
                    </TouchableOpacity>
                </View>

                {loading ? (
                    <View style={styles.centerBox}>
                        <ActivityIndicator color={Colors.primary} />
                        <Text style={styles.loadingText}>Loading roles…</Text>
                    </View>
                ) : forbidden ? (
                    <View style={styles.centerBox}>
                        <View style={styles.forbiddenBadge}>
                            <ShieldCheck size={30} color="#facc15" />
                        </View>
                        <Text style={styles.forbiddenTitle}>Owners only</Text>
                        <Text style={styles.ownerNote}>
                            App Roles can only be viewed or changed by the Home Assistant owner account.
                            Ask your owner to manage roles here, or sign in as the owner instead.
                        </Text>
                    </View>
                ) : loadError ? (
                    <View style={styles.centerBox}>
                        <Text style={styles.errorText}>{loadError}</Text>
                        <TouchableOpacity style={styles.retryBtn} onPress={load}>
                            <Text style={styles.retryBtnText}>Try again</Text>
                        </TouchableOpacity>
                    </View>
                ) : (
                    <ScrollView
                        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 40 }]}
                        keyboardShouldPersistTaps="handled"
                        showsVerticalScrollIndicator={false}
                    >
                        <Text style={styles.ownerNote}>
                            Create roles, pick which screens they can open, then limit cameras and rooms.
                            Tap a role to expand it.
                        </Text>

                        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                            <View style={styles.addRow}>
                                <TextInput
                                    style={styles.addInput}
                                    value={newRoleName}
                                    onChangeText={setNewRoleName}
                                    placeholder="New role name, e.g. Security guard"
                                    placeholderTextColor="rgba(237,237,245,0.3)"
                                    returnKeyType="done"
                                    onSubmitEditing={addRole}
                                />
                                <TouchableOpacity
                                    style={[styles.addBtn, !newRoleName.trim() && { opacity: 0.4 }]}
                                    onPress={addRole}
                                    disabled={!newRoleName.trim()}
                                >
                                    <Plus size={19} color="#fff" />
                                </TouchableOpacity>
                            </View>
                        </KeyboardAvoidingView>

                        {roles.map((role) => {
                            const locked = role.id === 'admin';
                            const expanded = expandedIds.has(role.id);
                            const { Icon: RoleIcon, tint } = roleIconFor(role.id);
                            const userCount = userCountByRoleId[role.id] || 0;
                            const camCount = role.allCameras !== false
                                ? cameras.length
                                : (role.cameras || []).length;
                            const roomCount = role.allRooms !== false
                                ? areas.length
                                : (role.rooms || []).length;

                            return (
                                <View key={role.id} style={styles.roleCard}>
                                    <TouchableOpacity
                                        activeOpacity={0.75}
                                        onPress={() => toggleExpanded(role.id)}
                                        style={styles.roleHeaderRow}
                                    >
                                        <View style={[styles.roleIconBadge, { backgroundColor: `${tint}22`, borderColor: `${tint}55` }]}>
                                            <RoleIcon size={18} color={tint} />
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            {locked || !expanded ? (
                                                <Text style={styles.roleName} numberOfLines={1}>{role.name}</Text>
                                            ) : (
                                                <TextInput
                                                    style={styles.roleNameInput}
                                                    value={role.name}
                                                    onChangeText={(v) => patchRole(role.id, { name: v })}
                                                    onPressIn={(e) => e.stopPropagation?.()}
                                                />
                                            )}
                                            <Text style={styles.roleMeta} numberOfLines={1}>
                                                {userCount} {userCount === 1 ? 'user' : 'users'} · {role.screens.length} screens
                                                · {camCount} cams · {roomCount} rooms
                                            </Text>
                                        </View>
                                        {!locked && (
                                            <TouchableOpacity onPress={() => deleteRole(role.id)} style={styles.deleteBtn} hitSlop={8}>
                                                <Trash2 size={15} color="#f87171" />
                                            </TouchableOpacity>
                                        )}
                                        {expanded
                                            ? <ChevronUp size={18} color="rgba(237,237,245,0.4)" />
                                            : <ChevronDown size={18} color="rgba(237,237,245,0.4)" />}
                                    </TouchableOpacity>

                                    {expanded && (
                                        <View style={styles.roleBody}>
                                            <View style={styles.divider} />

                                            <Text style={styles.sectionLabel}>Screens</Text>
                                            <View style={styles.chipWrap}>
                                                {allScreens.map((screen) => {
                                                    const on = role.screens.includes(screen.id);
                                                    const ScreenIcon = SCREEN_ICONS[screen.id];
                                                    return (
                                                        <TouchableOpacity
                                                            key={screen.id}
                                                            style={[styles.chip, on && styles.chipOn]}
                                                            onPress={() => toggleScreen(role.id, screen.id)}
                                                            disabled={locked}
                                                        >
                                                            {ScreenIcon && (
                                                                <ScreenIcon size={12} color={on ? '#fff' : 'rgba(237,237,245,0.4)'} style={{ marginRight: 5 }} />
                                                            )}
                                                            <Text style={[styles.chipText, on && styles.chipTextOn]}>{screen.label}</Text>
                                                        </TouchableOpacity>
                                                    );
                                                })}
                                            </View>

                                            <View style={styles.sectionHeaderRow}>
                                                <Text style={styles.sectionLabel}>Cameras</Text>
                                                <TouchableOpacity
                                                    style={styles.toggleRow}
                                                    onPress={() => patchRole(role.id, { allCameras: !(role.allCameras !== false) })}
                                                    disabled={locked}
                                                >
                                                    <View style={[styles.checkbox, role.allCameras !== false && styles.checkboxOn]}>
                                                        {role.allCameras !== false && <Ionicons name="checkmark" size={12} color="#fff" />}
                                                    </View>
                                                    <Text style={styles.toggleLabel}>All cameras</Text>
                                                </TouchableOpacity>
                                            </View>
                                            {role.allCameras !== false ? (
                                                <Text style={styles.helperText}>
                                                    Sees every camera on the Cameras page{cameras.length ? ` (${cameras.length})` : ''}.
                                                </Text>
                                            ) : cameras.length === 0 ? (
                                                <Text style={styles.helperText}>No cameras yet.</Text>
                                            ) : (
                                                <View style={styles.chipWrap}>
                                                    {cameras.map((cam) => {
                                                        const on = roleHasCamera(role.cameras, cam.entity_id);
                                                        return (
                                                            <TouchableOpacity
                                                                key={cam.entity_id}
                                                                style={[styles.chip, on && styles.chipOnGreen]}
                                                                onPress={() => toggleCamera(role.id, cam.entity_id)}
                                                            >
                                                                <Text style={[styles.chipText, on && styles.chipTextOn]}>{cam.name}</Text>
                                                            </TouchableOpacity>
                                                        );
                                                    })}
                                                </View>
                                            )}

                                            <View style={styles.sectionHeaderRow}>
                                                <Text style={styles.sectionLabel}>Rooms</Text>
                                                <TouchableOpacity
                                                    style={styles.toggleRow}
                                                    onPress={() => patchRole(role.id, { allRooms: !(role.allRooms !== false) })}
                                                    disabled={locked}
                                                >
                                                    <View style={[styles.checkbox, role.allRooms !== false && styles.checkboxOn]}>
                                                        {role.allRooms !== false && <Ionicons name="checkmark" size={12} color="#fff" />}
                                                    </View>
                                                    <Text style={styles.toggleLabel}>All rooms</Text>
                                                </TouchableOpacity>
                                            </View>
                                            {role.allRooms !== false ? (
                                                <Text style={styles.helperText}>Can open every room selected on Floors &amp; Rooms.</Text>
                                            ) : areas.length === 0 ? (
                                                <Text style={styles.helperText}>No rooms found.</Text>
                                            ) : (
                                                <View style={styles.chipWrap}>
                                                    {areas.map((area) => {
                                                        const on = (role.rooms || []).includes(area.area_id);
                                                        return (
                                                            <TouchableOpacity
                                                                key={area.area_id}
                                                                style={[styles.chip, on && styles.chipOnBlue]}
                                                                onPress={() => toggleRoom(role.id, area.area_id)}
                                                            >
                                                                <Text style={[styles.chipText, on && styles.chipTextOn]}>{area.name}</Text>
                                                            </TouchableOpacity>
                                                        );
                                                    })}
                                                </View>
                                            )}
                                        </View>
                                    )}
                                </View>
                            );
                        })}
                    </ScrollView>
                )}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 14,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.06)',
    },
    backBtn: {
        width: 40, height: 40, borderRadius: 20,
        alignItems: 'center', justifyContent: 'center',
        backgroundColor: 'rgba(255,255,255,0.06)',
    },
    headerTitleWrap: { flex: 1, alignItems: 'center' },
    title: { fontSize: 17, fontFamily: CF.semibold, color: '#fff' },
    subtitle: {
        fontSize: 11,
        fontFamily: CF.regular,
        color: 'rgba(237,237,245,0.4)',
        marginTop: 2,
    },
    saveBtn: {
        backgroundColor: 'rgba(255,255,255,0.08)',
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 9,
        minWidth: 64,
        alignItems: 'center',
    },
    saveBtnDirty: {
        backgroundColor: Colors.primary,
    },
    saveBtnText: { color: '#fff', fontSize: 13, fontFamily: CF.semibold },
    centerBox: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, gap: 12 },
    loadingText: { color: 'rgba(237,237,245,0.4)', fontSize: 12.5, fontFamily: CF.regular },
    errorText: { color: '#f87171', fontSize: 13, fontFamily: CF.regular, textAlign: 'center' },
    retryBtn: {
        marginTop: 4,
        backgroundColor: 'rgba(255,255,255,0.08)',
        borderRadius: 12,
        paddingHorizontal: 18,
        paddingVertical: 10,
    },
    retryBtnText: { color: '#fff', fontSize: 13, fontFamily: CF.semibold },
    forbiddenBadge: {
        width: 60, height: 60, borderRadius: 30,
        backgroundColor: 'rgba(250,204,21,0.12)',
        borderWidth: 1, borderColor: 'rgba(250,204,21,0.3)',
        alignItems: 'center', justifyContent: 'center',
        marginBottom: 2,
    },
    forbiddenTitle: { color: '#fff', fontSize: 16, fontFamily: CF.semibold },
    ownerNote: {
        color: 'rgba(237,237,245,0.45)',
        fontSize: 12.5,
        fontFamily: CF.regular,
        textAlign: 'center',
        paddingHorizontal: 8,
        marginBottom: 14,
        lineHeight: 18,
    },
    list: { paddingHorizontal: 16, paddingTop: 18 },
    addRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
    addInput: {
        flex: 1,
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        borderRadius: 14,
        paddingHorizontal: 14,
        paddingVertical: 12,
        color: '#ededf5',
        fontSize: 14,
        fontFamily: CF.regular,
    },
    addBtn: {
        width: 46,
        borderRadius: 14,
        backgroundColor: Colors.primary,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: Colors.primary,
        shadowOpacity: 0.4,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 3 },
        elevation: 4,
    },
    roleCard: {
        backgroundColor: 'rgba(255,255,255,0.035)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.09)',
        borderRadius: 20,
        marginBottom: 12,
        overflow: 'hidden',
    },
    roleHeaderRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        padding: 14,
    },
    roleIconBadge: {
        width: 38, height: 38, borderRadius: 12,
        borderWidth: 1,
        alignItems: 'center', justifyContent: 'center',
    },
    roleName: { color: '#fff', fontSize: 15, fontFamily: CF.semibold },
    roleMeta: {
        color: 'rgba(237,237,245,0.4)',
        fontSize: 11.5,
        fontFamily: CF.regular,
        marginTop: 2,
        textTransform: 'capitalize',
    },
    roleNameInput: {
        color: '#fff',
        fontSize: 15,
        fontFamily: CF.semibold,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.15)',
        paddingBottom: 3,
    },
    deleteBtn: {
        width: 30, height: 30, borderRadius: 15,
        alignItems: 'center', justifyContent: 'center',
        backgroundColor: 'rgba(239,68,68,0.12)',
    },
    roleBody: {
        paddingHorizontal: 14,
        paddingBottom: 16,
        gap: 10,
    },
    divider: {
        height: 1,
        backgroundColor: 'rgba(255,255,255,0.07)',
        marginBottom: 4,
    },
    sectionLabel: {
        color: 'rgba(237,237,245,0.4)',
        fontSize: 11,
        fontFamily: CF.semibold,
        textTransform: 'uppercase',
        letterSpacing: 0.6,
    },
    sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 },
    toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    checkbox: {
        width: 16, height: 16, borderRadius: 4,
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)',
        alignItems: 'center', justifyContent: 'center',
    },
    checkboxOn: { backgroundColor: Colors.primary, borderColor: Colors.primary },
    toggleLabel: { color: 'rgba(237,237,245,0.6)', fontSize: 12, fontFamily: CF.medium },
    helperText: { color: 'rgba(237,237,245,0.35)', fontSize: 11.5, fontFamily: CF.regular },
    chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: {
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: 999,
        paddingHorizontal: 12,
        paddingVertical: 7,
        backgroundColor: 'rgba(255,255,255,0.04)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    chipOn: {
        backgroundColor: 'rgba(137,71,202,0.28)',
        borderColor: 'rgba(137,71,202,0.5)',
    },
    chipOnGreen: {
        backgroundColor: 'rgba(16,185,129,0.22)',
        borderColor: 'rgba(16,185,129,0.45)',
    },
    chipOnBlue: {
        backgroundColor: 'rgba(56,189,248,0.22)',
        borderColor: 'rgba(56,189,248,0.45)',
    },
    chipText: { color: 'rgba(237,237,245,0.5)', fontSize: 12, fontFamily: CF.medium },
    chipTextOn: { color: '#fff' },
});

