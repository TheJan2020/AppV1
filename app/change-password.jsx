import React, { useState } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, SafeAreaView, ScrollView,
    TextInput, ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams, Stack } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Lock, Eye, EyeOff, ShieldCheck } from 'lucide-react-native';
import { StatusBar } from 'expo-status-bar';

import { Colors } from '../constants/Colors';
import { CF } from '../utils/typography';

/**
 * Self-service "Change Password" screen.
 *
 * Talks to the backend's /api/auth/change-password endpoint, which verifies
 * the current password by obtaining a real Home Assistant access token for
 * this user, then asks HA's own `homeassistant` auth provider to set the
 * new password. No passwords are stored anywhere outside Home Assistant.
 */
export default function ChangePasswordPage() {
    const router = useRouter();
    const { userName: userNameParam, adminUrl: adminUrlParam } = useLocalSearchParams();
    const userName = Array.isArray(userNameParam) ? userNameParam[0] : userNameParam;
    const adminUrl = Array.isArray(adminUrlParam) ? adminUrlParam[0] : adminUrlParam;

    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showCurrent, setShowCurrent] = useState(false);
    const [showNew, setShowNew] = useState(false);
    const [saving, setSaving] = useState(false);

    const handleSubmit = async () => {
        if (!currentPassword || !newPassword || !confirmPassword) {
            Alert.alert('Missing info', 'Fill in all three fields.');
            return;
        }
        if (newPassword.length < 8) {
            Alert.alert('Password too short', 'New password must be at least 8 characters.');
            return;
        }
        if (newPassword !== confirmPassword) {
            Alert.alert('Passwords do not match', 'Re-type the new password to confirm.');
            return;
        }
        if (!adminUrl) {
            Alert.alert('Not connected', 'Could not find your home connection. Try again from the dashboard.');
            return;
        }

        setSaving(true);
        try {
            const base = adminUrl.endsWith('/') ? adminUrl : `${adminUrl}/`;
            const res = await fetch(`${base}api/auth/change-password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: userName, currentPassword, newPassword }),
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok && data.ok) {
                setCurrentPassword('');
                setNewPassword('');
                setConfirmPassword('');
                Alert.alert('Password updated', 'Your Home Assistant password has been changed.', [
                    { text: 'OK', onPress: () => router.back() },
                ]);
            } else {
                Alert.alert('Could not change password', data.error || 'Please check your current password and try again.');
            }
        } catch (e) {
            Alert.alert('Network error', 'Could not reach the server. Try again.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <View style={styles.container}>
            <Stack.Screen options={{ headerShown: false }} />
            <LinearGradient colors={['#1a1b2e', '#16161e', '#000000']} style={StyleSheet.absoluteFill} />
            <StatusBar style="light" />
            <SafeAreaView style={{ flex: 1 }}>
                {/* Header */}
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                        <Ionicons name="arrow-back" size={24} color="white" />
                    </TouchableOpacity>
                    <Text style={styles.title}>Change Password</Text>
                    <View style={{ width: 40 }} />
                </View>

                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                    style={{ flex: 1 }}
                >
                    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
                        <View style={styles.iconBadge}>
                            <ShieldCheck size={28} color={Colors.primary} />
                        </View>
                        <Text style={styles.subtitle}>
                            This updates your real Home Assistant account password
                            {userName ? ` for “${userName}”` : ''}.
                        </Text>

                        {/* Current Password */}
                        <Text style={styles.label}>Current Password</Text>
                        <View style={styles.inputRow}>
                            <Lock size={18} color="rgba(237,237,245,0.4)" />
                            <TextInput
                                style={styles.input}
                                value={currentPassword}
                                onChangeText={setCurrentPassword}
                                placeholder="Enter current password"
                                placeholderTextColor="rgba(237,237,245,0.3)"
                                secureTextEntry={!showCurrent}
                                autoCapitalize="none"
                                autoCorrect={false}
                            />
                            <TouchableOpacity onPress={() => setShowCurrent(v => !v)}>
                                {showCurrent
                                    ? <EyeOff size={18} color="rgba(237,237,245,0.4)" />
                                    : <Eye size={18} color="rgba(237,237,245,0.4)" />}
                            </TouchableOpacity>
                        </View>

                        {/* New Password */}
                        <Text style={styles.label}>New Password</Text>
                        <View style={styles.inputRow}>
                            <Lock size={18} color="rgba(237,237,245,0.4)" />
                            <TextInput
                                style={styles.input}
                                value={newPassword}
                                onChangeText={setNewPassword}
                                placeholder="At least 8 characters"
                                placeholderTextColor="rgba(237,237,245,0.3)"
                                secureTextEntry={!showNew}
                                autoCapitalize="none"
                                autoCorrect={false}
                            />
                            <TouchableOpacity onPress={() => setShowNew(v => !v)}>
                                {showNew
                                    ? <EyeOff size={18} color="rgba(237,237,245,0.4)" />
                                    : <Eye size={18} color="rgba(237,237,245,0.4)" />}
                            </TouchableOpacity>
                        </View>

                        {/* Confirm Password */}
                        <Text style={styles.label}>Confirm New Password</Text>
                        <View style={styles.inputRow}>
                            <Lock size={18} color="rgba(237,237,245,0.4)" />
                            <TextInput
                                style={styles.input}
                                value={confirmPassword}
                                onChangeText={setConfirmPassword}
                                placeholder="Re-type new password"
                                placeholderTextColor="rgba(237,237,245,0.3)"
                                secureTextEntry={!showNew}
                                autoCapitalize="none"
                                autoCorrect={false}
                            />
                        </View>

                        <TouchableOpacity
                            style={[styles.submitBtn, saving && { opacity: 0.6 }]}
                            onPress={handleSubmit}
                            disabled={saving}
                            activeOpacity={0.8}
                        >
                            {saving
                                ? <ActivityIndicator color="#fff" />
                                : <Text style={styles.submitText}>Update Password</Text>}
                        </TouchableOpacity>

                        <Text style={styles.footNote}>
                            Forgot your current password? Ask your home admin to reset it for you
                            from the Admin Panel.
                        </Text>
                    </ScrollView>
                </KeyboardAvoidingView>
            </SafeAreaView>
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
    content: {
        paddingHorizontal: 24,
        paddingTop: 12,
        paddingBottom: 60,
    },
    iconBadge: {
        alignSelf: 'center',
        width: 56, height: 56, borderRadius: 28,
        backgroundColor: 'rgba(137,71,202,0.15)',
        alignItems: 'center', justifyContent: 'center',
        marginBottom: 12,
    },
    subtitle: {
        textAlign: 'center',
        color: 'rgba(237,237,245,0.5)',
        fontSize: 13,
        fontFamily: CF.regular,
        marginBottom: 28,
        paddingHorizontal: 12,
    },
    label: {
        color: 'rgba(237,237,245,0.6)',
        fontSize: 12,
        fontFamily: CF.medium,
        marginBottom: 8,
        marginTop: 16,
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
        marginTop: 28,
        backgroundColor: Colors.primary,
        borderRadius: 14,
        paddingVertical: 15,
        alignItems: 'center',
        justifyContent: 'center',
    },
    submitText: {
        color: '#fff',
        fontSize: 15,
        fontFamily: CF.semibold,
    },
    footNote: {
        textAlign: 'center',
        color: 'rgba(237,237,245,0.35)',
        fontSize: 11,
        fontFamily: CF.regular,
        marginTop: 20,
        paddingHorizontal: 8,
    },
});
