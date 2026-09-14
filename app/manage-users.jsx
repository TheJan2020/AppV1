import React, { useEffect, useState, useCallback } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, SafeAreaView, ScrollView,
    TextInput, ActivityIndicator, KeyboardAvoidingView, Platform, Modal,
} from 'react-native';
import { useRouter, useLocalSearchParams, Stack } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Users, KeyRound, UserPlus, X, Eye, EyeOff, ShieldCheck } from 'lucide-react-native';
import { StatusBar } from 'expo-status-bar';

import { Colors } from '../constants/Colors';
import { CF } from '../utils/typography';
import { authFetch } from '../utils/authFetch';

/**
 * Owner-only "Manage Users" screen.
 *
 * Lets the Home Assistant OWNER account:
 *  - Reset any user's password directly (no old password needed), via
 *    /api/auth/admin-reset-password (which uses HA_OWNER_TOKEN server-side).
 *  - Create brand-new Home Assistant users (with a username/password login),
 *    via /api/auth/create-user.
 *
 * Both endpoints re-verify server-side that the requester really is the HA
 * owner — this screen being visible is just a UI convenience, not the real
 * security boundary.
 */
export default function ManageUsersPage() {
    const router = useRouter();
    const { adminUrl: adminUrlParam, userName: userNameParam } = useLocalSearchParams();
    const adminUrl = Array.isArray(adminUrlParam) ? adminUrlParam[0] : adminUrlParam;
    const requesterUsername = Array.isArray(userNameParam) ? userNameParam[0] : userNameParam;

    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState('');

    // App Roles (same roles system as the AppBackendV1 "App Roles" page —
    // owner-only). `roles` = the defined roles (Admin/Family/Guest/Kids/...);
    // `roleAssignments` = which role each user currently has.
    const [roles, setRoles] = useState([]);
    const [roleAssignments, setRoleAssignments] = useState([]);
    const [roleModal, setRoleModal] = useState(null); // { user_id, name, username }
    const [assigningRole, setAssigningRole] = useState(false);
    const [roleError, setRoleError] = useState('');

    const [resetModal, setResetModal] = useState(null); // { user_id, name, username }
    const [resetPassword, setResetPassword] = useState('');
    const [resetConfirm, setResetConfirm] = useState('');
    const [showResetPassword, setShowResetPassword] = useState(false);
    const [resetting, setResetting] = useState(false);
    const [resetError, setResetError] = useState('');

    const [createOpen, setCreateOpen] = useState(false);
    const [newName, setNewName] = useState('');
    const [newUsername, setNewUsername] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [showNewPassword, setShowNewPassword] = useState(false);
    const [creating, setCreating] = useState(false);
    const [createError, setCreateError] = useState('');

    const base = adminUrl ? (adminUrl.endsWith('/') ? adminUrl : `${adminUrl}/`) : '';

    const loadUsers = useCallback(async () => {
        if (!base) {
            setLoadError('Could not find your home connection.');
            setLoading(false);
            return;
        }
        setLoading(true);
        setLoadError('');
        try {
            const res = await authFetch(`${base}api/users`);
            const data = await res.json().catch(() => []);
            const list = Array.isArray(data) ? data.filter((u) => u.user_id) : [];
            setUsers(list.sort((a, b) => String(a.name || a.username).localeCompare(String(b.name || b.username))));
        } catch {
            setLoadError('Could not load users. Check your connection.');
        } finally {
            setLoading(false);
        }
    }, [base]);

    useEffect(() => { loadUsers(); }, [loadUsers]);

    const loadRoles = useCallback(async () => {
        if (!base || !requesterUsername) return;
        try {
            const res = await authFetch(`${base}api/app-roles?username=${encodeURIComponent(requesterUsername)}`);
            const data = await res.json().catch(() => ({}));
            if (res.ok && Array.isArray(data.roles)) {
                setRoles(data.roles);
                setRoleAssignments(Array.isArray(data.users) ? data.users : []);
            }
        } catch {
            // silently ignore — role assignment is a secondary feature
        }
    }, [base, requesterUsername]);

    useEffect(() => { loadRoles(); }, [loadRoles]);

    const getRoleForUser = (user) => {
        const match = roleAssignments.find(
            (a) => a.userId === user.user_id || (a.username && a.username === user.username)
        );
        const roleId = match ? match.roleId : 'admin';
        const role = roles.find((r) => r.id === roleId);
        return role ? role.name : roleId;
    };

    const openRoleModal = (user) => {
        setRoleError('');
        setRoleModal(user);
    };

    const assignRole = async (roleId) => {
        if (!roleModal) return;
        setRoleError('');
        setAssigningRole(true);
        try {
            const updatedUsers = [
                ...roleAssignments.filter(
                    (a) => a.userId !== roleModal.user_id && a.username !== roleModal.username
                ),
                {
                    userId: roleModal.user_id,
                    username: roleModal.username,
                    displayName: roleModal.name || roleModal.username,
                    roleId,
                },
            ];
            const res = await authFetch(`${base}api/app-roles`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ roles, users: updatedUsers, requesterUsername }),
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok && !data.error) {
                setRoleAssignments(updatedUsers);
                setRoleModal(null);
            } else {
                setRoleError(data.error || 'Could not assign role.');
            }
        } catch {
            setRoleError('Network error. Try again.');
        } finally {
            setAssigningRole(false);
        }
    };

    const openReset = (user) => {
        setResetModal(user);
        setResetPassword('');
        setResetConfirm('');
        setResetError('');
        setShowResetPassword(false);
    };

    const handleReset = async () => {
        setResetError('');
        if (resetPassword.length < 8) {
            setResetError('Password must be at least 8 characters.');
            return;
        }
        if (resetPassword !== resetConfirm) {
            setResetError('Passwords do not match.');
            return;
        }
        setResetting(true);
        try {
            const res = await authFetch(`${base}api/auth/admin-reset-password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: resetModal.user_id,
                    newPassword: resetPassword,
                    requesterUsername,
                }),
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok && data.ok) {
                setResetModal(null);
            } else {
                setResetError(data.error || 'Could not reset password.');
            }
        } catch {
            setResetError('Network error. Try again.');
        } finally {
            setResetting(false);
        }
    };

    const handleCreate = async () => {
        setCreateError('');
        if (!newName.trim() || !newUsername.trim()) {
            setCreateError('Enter a name and username.');
            return;
        }
        if (newPassword.length < 8) {
            setCreateError('Password must be at least 8 characters.');
            return;
        }
        setCreating(true);
        try {
            const res = await authFetch(`${base}api/auth/create-user`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    requesterUsername,
                    name: newName.trim(),
                    username: newUsername.trim(),
                    password: newPassword,
                }),
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok && data.ok) {
                setCreateOpen(false);
                setNewName('');
                setNewUsername('');
                setNewPassword('');
                loadUsers();
            } else {
                setCreateError(data.error || 'Could not create user.');
            }
        } catch {
            setCreateError('Network error. Try again.');
        } finally {
            setCreating(false);
        }
    };

    return (
        <View style={styles.container}>
            <Stack.Screen options={{ headerShown: false }} />
            <LinearGradient colors={['#1a1b2e', '#16161e', '#000000']} style={StyleSheet.absoluteFill} />
            <StatusBar style="light" />
            <SafeAreaView style={{ flex: 1 }}>
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                        <Ionicons name="arrow-back" size={24} color="white" />
                    </TouchableOpacity>
                    <Text style={styles.title}>Manage Users</Text>
                    <TouchableOpacity onPress={() => { setCreateError(''); setCreateOpen(true); }} style={styles.backBtn}>
                        <UserPlus size={20} color="white" />
                    </TouchableOpacity>
                </View>

                <Text style={styles.ownerNote}>
                    As the Home Assistant owner, you can reset any user&apos;s password (no old password
                    needed) or create a brand-new user for the app.
                </Text>

                {loading ? (
                    <View style={styles.centerBox}>
                        <ActivityIndicator color={Colors.primary} />
                    </View>
                ) : loadError ? (
                    <View style={styles.centerBox}>
                        <Text style={styles.errorText}>{loadError}</Text>
                    </View>
                ) : (
                    <ScrollView contentContainerStyle={styles.list}>
                        {users.map((u) => (
                            <View key={u.user_id} style={styles.userRow}>
                                <View style={styles.userIconBadge}>
                                    <Users size={18} color={Colors.primary} />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.userName}>{u.name || u.username}</Text>
                                    <Text style={styles.userSub}>{u.username}</Text>
                                </View>
                                <TouchableOpacity style={styles.roleBtn} onPress={() => openRoleModal(u)}>
                                    <ShieldCheck size={16} color={Colors.primary} />
                                    <Text style={styles.roleBtnText}>{getRoleForUser(u)}</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={styles.resetBtn} onPress={() => openReset(u)}>
                                    <KeyRound size={16} color="#fff" />
                                    <Text style={styles.resetBtnText}>Reset</Text>
                                </TouchableOpacity>
                            </View>
                        ))}
                    </ScrollView>
                )}
            </SafeAreaView>

            {/* Assign role modal */}
            <Modal visible={!!roleModal} transparent animationType="fade" onRequestClose={() => setRoleModal(null)}>
                <View style={styles.modalBackdrop}>
                    <View style={styles.modalCard}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>
                                Assign Role{roleModal ? ` — ${roleModal.name || roleModal.username}` : ''}
                            </Text>
                            <TouchableOpacity onPress={() => setRoleModal(null)}>
                                <X size={20} color="rgba(237,237,245,0.6)" />
                            </TouchableOpacity>
                        </View>

                        {roleError ? (
                            <View style={styles.errorBox}><Text style={styles.errorBoxText}>{roleError}</Text></View>
                        ) : null}

                        {roles.length === 0 ? (
                            <Text style={styles.userSub}>No roles defined yet.</Text>
                        ) : (
                            roles.map((r) => {
                                const active = roleModal && getRoleForUser(roleModal) === r.name;
                                return (
                                    <TouchableOpacity
                                        key={r.id}
                                        style={[styles.roleOption, active && styles.roleOptionActive]}
                                        onPress={() => assignRole(r.id)}
                                        disabled={assigningRole}
                                    >
                                        <Text style={[styles.roleOptionText, active && styles.roleOptionTextActive]}>
                                            {r.name}
                                        </Text>
                                        {assigningRole && active ? <ActivityIndicator color={Colors.primary} size="small" /> : null}
                                    </TouchableOpacity>
                                );
                            })
                        )}
                    </View>
                </View>
            </Modal>

            {/* Reset password modal */}
            <Modal visible={!!resetModal} transparent animationType="fade" onRequestClose={() => setResetModal(null)}>
                <View style={styles.modalBackdrop}>
                    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ width: '100%' }}>
                        <View style={styles.modalCard}>
                            <View style={styles.modalHeader}>
                                <Text style={styles.modalTitle}>
                                    Reset Password{resetModal ? ` — ${resetModal.name || resetModal.username}` : ''}
                                </Text>
                                <TouchableOpacity onPress={() => setResetModal(null)}>
                                    <X size={20} color="rgba(237,237,245,0.6)" />
                                </TouchableOpacity>
                            </View>

                            {resetError ? (
                                <View style={styles.errorBox}><Text style={styles.errorBoxText}>{resetError}</Text></View>
                            ) : null}

                            <Text style={styles.label}>New Password</Text>
                            <View style={styles.inputRow}>
                                <TextInput
                                    style={styles.input}
                                    value={resetPassword}
                                    onChangeText={setResetPassword}
                                    placeholder="At least 8 characters"
                                    placeholderTextColor="rgba(237,237,245,0.3)"
                                    secureTextEntry={!showResetPassword}
                                    autoCapitalize="none"
                                    autoCorrect={false}
                                />
                                <TouchableOpacity onPress={() => setShowResetPassword((v) => !v)}>
                                    {showResetPassword
                                        ? <EyeOff size={18} color="rgba(237,237,245,0.4)" />
                                        : <Eye size={18} color="rgba(237,237,245,0.4)" />}
                                </TouchableOpacity>
                            </View>

                            <Text style={styles.label}>Confirm Password</Text>
                            <View style={styles.inputRow}>
                                <TextInput
                                    style={styles.input}
                                    value={resetConfirm}
                                    onChangeText={setResetConfirm}
                                    placeholder="Re-type new password"
                                    placeholderTextColor="rgba(237,237,245,0.3)"
                                    secureTextEntry={!showResetPassword}
                                    autoCapitalize="none"
                                    autoCorrect={false}
                                />
                            </View>

                            <TouchableOpacity
                                style={[styles.submitBtn, resetting && { opacity: 0.6 }]}
                                onPress={handleReset}
                                disabled={resetting}
                            >
                                {resetting
                                    ? <ActivityIndicator color="#fff" />
                                    : <Text style={styles.submitText}>Reset Password</Text>}
                            </TouchableOpacity>
                        </View>
                    </KeyboardAvoidingView>
                </View>
            </Modal>

            {/* Create user modal */}
            <Modal visible={createOpen} transparent animationType="fade" onRequestClose={() => setCreateOpen(false)}>
                <View style={styles.modalBackdrop}>
                    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ width: '100%' }}>
                        <View style={styles.modalCard}>
                            <View style={styles.modalHeader}>
                                <Text style={styles.modalTitle}>Create New User</Text>
                                <TouchableOpacity onPress={() => setCreateOpen(false)}>
                                    <X size={20} color="rgba(237,237,245,0.6)" />
                                </TouchableOpacity>
                            </View>

                            {createError ? (
                                <View style={styles.errorBox}><Text style={styles.errorBoxText}>{createError}</Text></View>
                            ) : null}

                            <Text style={styles.label}>Display Name</Text>
                            <View style={styles.inputRow}>
                                <TextInput
                                    style={styles.input}
                                    value={newName}
                                    onChangeText={setNewName}
                                    placeholder="e.g. Sarah"
                                    placeholderTextColor="rgba(237,237,245,0.3)"
                                    autoCorrect={false}
                                />
                            </View>

                            <Text style={styles.label}>Username</Text>
                            <View style={styles.inputRow}>
                                <TextInput
                                    style={styles.input}
                                    value={newUsername}
                                    onChangeText={setNewUsername}
                                    placeholder="e.g. sarah"
                                    placeholderTextColor="rgba(237,237,245,0.3)"
                                    autoCapitalize="none"
                                    autoCorrect={false}
                                />
                            </View>

                            <Text style={styles.label}>Password</Text>
                            <View style={styles.inputRow}>
                                <TextInput
                                    style={styles.input}
                                    value={newPassword}
                                    onChangeText={setNewPassword}
                                    placeholder="At least 8 characters"
                                    placeholderTextColor="rgba(237,237,245,0.3)"
                                    secureTextEntry={!showNewPassword}
                                    autoCapitalize="none"
                                    autoCorrect={false}
                                />
                                <TouchableOpacity onPress={() => setShowNewPassword((v) => !v)}>
                                    {showNewPassword
                                        ? <EyeOff size={18} color="rgba(237,237,245,0.4)" />
                                        : <Eye size={18} color="rgba(237,237,245,0.4)" />}
                                </TouchableOpacity>
                            </View>

                            <TouchableOpacity
                                style={[styles.submitBtn, creating && { opacity: 0.6 }]}
                                onPress={handleCreate}
                                disabled={creating}
                            >
                                {creating
                                    ? <ActivityIndicator color="#fff" />
                                    : <Text style={styles.submitText}>Create User</Text>}
                            </TouchableOpacity>
                        </View>
                    </KeyboardAvoidingView>
                </View>
            </Modal>
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
        paddingVertical: 12,
    },
    backBtn: {
        width: 40, height: 40, borderRadius: 20,
        alignItems: 'center', justifyContent: 'center',
        backgroundColor: 'rgba(255,255,255,0.06)',
    },
    title: {
        fontSize: 17,
        fontFamily: CF.semibold,
        color: '#fff',
    },
    ownerNote: {
        color: 'rgba(237,237,245,0.4)',
        fontSize: 12,
        fontFamily: CF.regular,
        textAlign: 'center',
        paddingHorizontal: 24,
        marginBottom: 12,
    },
    centerBox: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 24,
    },
    errorText: {
        color: '#f87171',
        fontSize: 13,
        fontFamily: CF.regular,
        textAlign: 'center',
    },
    list: {
        paddingHorizontal: 20,
        paddingBottom: 40,
    },
    userRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        backgroundColor: 'rgba(255,255,255,0.04)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
        borderRadius: 14,
        paddingHorizontal: 14,
        paddingVertical: 12,
        marginBottom: 10,
    },
    userIconBadge: {
        width: 36, height: 36, borderRadius: 18,
        backgroundColor: 'rgba(137,71,202,0.15)',
        alignItems: 'center', justifyContent: 'center',
    },
    userName: {
        color: '#ededf5',
        fontSize: 14,
        fontFamily: CF.semibold,
    },
    userSub: {
        color: 'rgba(237,237,245,0.4)',
        fontSize: 12,
        fontFamily: CF.regular,
    },
    roleBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: 'rgba(137,71,202,0.15)',
        borderWidth: 1,
        borderColor: 'rgba(137,71,202,0.3)',
        borderRadius: 10,
        paddingHorizontal: 10,
        paddingVertical: 8,
    },
    roleBtnText: {
        color: Colors.primary,
        fontSize: 12,
        fontFamily: CF.semibold,
        textTransform: 'capitalize',
    },
    roleOption: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: 'rgba(255,255,255,0.04)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
        borderRadius: 12,
        paddingHorizontal: 14,
        paddingVertical: 12,
        marginBottom: 8,
    },
    roleOptionActive: {
        borderColor: Colors.primary,
        backgroundColor: 'rgba(137,71,202,0.12)',
    },
    roleOptionText: {
        color: '#ededf5',
        fontSize: 14,
        fontFamily: CF.medium,
        textTransform: 'capitalize',
    },
    roleOptionTextActive: {
        color: Colors.primary,
        fontFamily: CF.semibold,
    },
    resetBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: Colors.primary,
        borderRadius: 10,
        paddingHorizontal: 12,
        paddingVertical: 8,
    },
    resetBtnText: {
        color: '#fff',
        fontSize: 12.5,
        fontFamily: CF.semibold,
    },
    modalBackdrop: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.6)',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 24,
    },
    modalCard: {
        width: '100%',
        backgroundColor: '#181820',
        borderRadius: 20,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
        padding: 20,
    },
    modalHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 16,
    },
    modalTitle: {
        color: '#fff',
        fontSize: 15,
        fontFamily: CF.semibold,
        flex: 1,
        paddingRight: 12,
    },
    errorBox: {
        backgroundColor: 'rgba(239,68,68,0.1)',
        borderWidth: 1,
        borderColor: 'rgba(239,68,68,0.25)',
        borderRadius: 12,
        paddingVertical: 10,
        paddingHorizontal: 14,
        marginBottom: 12,
    },
    errorBoxText: {
        color: '#f87171',
        fontSize: 12.5,
        fontFamily: CF.regular,
        textAlign: 'center',
    },
    label: {
        color: 'rgba(237,237,245,0.6)',
        fontSize: 12,
        fontFamily: CF.medium,
        marginBottom: 8,
        marginTop: 12,
    },
    inputRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        backgroundColor: 'rgba(255,255,255,0.04)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
        borderRadius: 14,
        paddingHorizontal: 14,
        paddingVertical: 12,
    },
    input: {
        flex: 1,
        color: '#ededf5',
        fontSize: 14,
        fontFamily: CF.regular,
    },
    submitBtn: {
        marginTop: 20,
        backgroundColor: Colors.primary,
        borderRadius: 14,
        paddingVertical: 14,
        alignItems: 'center',
        justifyContent: 'center',
    },
    submitText: {
        color: '#fff',
        fontSize: 15,
        fontFamily: CF.semibold,
    },
});
