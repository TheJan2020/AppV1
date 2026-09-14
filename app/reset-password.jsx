import React, { useState } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, SafeAreaView, ScrollView,
    TextInput, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams, Stack } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { KeyRound, CheckCircle2, Eye, EyeOff } from 'lucide-react-native';
import { StatusBar } from 'expo-status-bar';

import { Colors } from '../constants/Colors';
import { CF } from '../utils/typography';

/**
 * Step 2 of "Forgot password" — entirely IN-APP, no email link/deep-link
 * needed. The user types the 6-digit code they were emailed, plus their new
 * password, right here.
 */
export default function ResetPasswordPage() {
    const router = useRouter();
    const { adminUrl: adminUrlParam, identifier: identifierParam } = useLocalSearchParams();
    const adminUrl = Array.isArray(adminUrlParam) ? adminUrlParam[0] : adminUrlParam;
    const identifier = Array.isArray(identifierParam) ? identifierParam[0] : identifierParam;

    const base = adminUrl ? (adminUrl.endsWith('/') ? adminUrl : `${adminUrl}/`) : '';

    const [code, setCode] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [done, setDone] = useState(false);

    const handleSubmit = async () => {
        setError('');
        if (!base) {
            setError('Could not find your home connection. Go back and try again from the login screen.');
            return;
        }
        if (!/^\d{6}$/.test(code.trim())) {
            setError('Enter the 6-digit code from your email.');
            return;
        }
        if (newPassword.length < 8) {
            setError('New password must be at least 8 characters.');
            return;
        }
        if (newPassword !== confirmPassword) {
            setError('Passwords do not match.');
            return;
        }
        setSubmitting(true);
        try {
            const res = await fetch(`${base}api/auth/reset-password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ identifier, code: code.trim(), newPassword }),
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok && data.ok) {
                setDone(true);
            } else {
                setError(data.error || 'Could not reset password. The code may be incorrect or expired.');
            }
        } catch {
            setError('Could not reach the server. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <View style={styles.container}>
            <Stack.Screen options={{ headerShown: false }} />
            <LinearGradient colors={['#1a1b2e', '#16161e', '#000000']} style={StyleSheet.absoluteFill} />
            <StatusBar style="light" />
            <SafeAreaView style={{ flex: 1 }}>
                <View style={styles.header}>
                    <TouchableOpacity
                        onPress={() => (router.canGoBack() ? router.back() : router.replace('/login'))}
                        style={styles.backBtn}
                    >
                        <Ionicons name="arrow-back" size={24} color="white" />
                    </TouchableOpacity>
                    <Text style={styles.title}>Enter Reset Code</Text>
                    <View style={{ width: 40 }} />
                </View>

                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
                    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
                        <View style={styles.iconBadge}>
                            {done
                                ? <CheckCircle2 size={28} color="#22c55e" />
                                : <KeyRound size={28} color={Colors.primary} />}
                        </View>

                        {done ? (
                            <>
                                <Text style={styles.subtitle}>
                                    Your password has been reset. You can now sign in with your new password.
                                </Text>
                                <TouchableOpacity
                                    style={styles.submitBtn}
                                    onPress={() => router.replace('/login')}
                                    activeOpacity={0.8}
                                >
                                    <Text style={styles.submitText}>Back to Sign In</Text>
                                </TouchableOpacity>
                            </>
                        ) : (
                            <>
                                <Text style={styles.subtitle}>
                                    Enter the 6-digit code we emailed you, along with your new password.
                                    The code is valid for{' '}
                                    <Text style={{ color: '#ededf5', fontFamily: CF.semibold }}>5 minutes</Text>.
                                </Text>

                                {error ? (
                                    <View style={styles.errorBox}>
                                        <Text style={styles.errorText}>{error}</Text>
                                    </View>
                                ) : null}

                                <Text style={styles.label}>6-Digit Code</Text>
                                <View style={styles.inputRow}>
                                    <TextInput
                                        style={[styles.input, styles.codeInput]}
                                        value={code}
                                        onChangeText={(t) => setCode(t.replace(/[^0-9]/g, '').slice(0, 6))}
                                        placeholder="123456"
                                        placeholderTextColor="rgba(237,237,245,0.3)"
                                        keyboardType="number-pad"
                                        maxLength={6}
                                    />
                                </View>

                                <Text style={styles.label}>New Password</Text>
                                <View style={styles.inputRow}>
                                    <TextInput
                                        style={styles.input}
                                        value={newPassword}
                                        onChangeText={setNewPassword}
                                        placeholder="At least 8 characters"
                                        placeholderTextColor="rgba(237,237,245,0.3)"
                                        secureTextEntry={!showPassword}
                                        autoCapitalize="none"
                                        autoCorrect={false}
                                    />
                                    <TouchableOpacity onPress={() => setShowPassword((v) => !v)}>
                                        {showPassword
                                            ? <EyeOff size={18} color="rgba(237,237,245,0.4)" />
                                            : <Eye size={18} color="rgba(237,237,245,0.4)" />}
                                    </TouchableOpacity>
                                </View>

                                <Text style={styles.label}>Confirm New Password</Text>
                                <View style={styles.inputRow}>
                                    <TextInput
                                        style={styles.input}
                                        value={confirmPassword}
                                        onChangeText={setConfirmPassword}
                                        placeholder="Re-enter new password"
                                        placeholderTextColor="rgba(237,237,245,0.3)"
                                        secureTextEntry={!showPassword}
                                        autoCapitalize="none"
                                        autoCorrect={false}
                                        returnKeyType="go"
                                        onSubmitEditing={handleSubmit}
                                    />
                                </View>

                                <TouchableOpacity
                                    style={[styles.submitBtn, submitting && { opacity: 0.6 }]}
                                    onPress={handleSubmit}
                                    disabled={submitting}
                                    activeOpacity={0.8}
                                >
                                    {submitting
                                        ? <ActivityIndicator color="#fff" />
                                        : <Text style={styles.submitText}>Reset Password</Text>}
                                </TouchableOpacity>

                                <TouchableOpacity
                                    style={{ marginTop: 20 }}
                                    onPress={() => router.replace({ pathname: '/forgot-password', params: { adminUrl, username: identifier } })}
                                >
                                    <Text style={styles.resendText}>Didn&apos;t get a code? Send again</Text>
                                </TouchableOpacity>
                            </>
                        )}
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
    centerRow: {
        alignItems: 'center',
        gap: 10,
        marginTop: 20,
    },
    subtitle: {
        textAlign: 'center',
        color: 'rgba(237,237,245,0.5)',
        fontSize: 13,
        fontFamily: CF.regular,
        marginBottom: 12,
        paddingHorizontal: 12,
    },
    errorBox: {
        backgroundColor: 'rgba(239,68,68,0.1)',
        borderWidth: 1,
        borderColor: 'rgba(239,68,68,0.25)',
        borderRadius: 12,
        paddingVertical: 10,
        paddingHorizontal: 14,
        marginBottom: 8,
        marginTop: 8,
    },
    errorText: {
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
    codeInput: {
        fontSize: 22,
        letterSpacing: 8,
        fontFamily: CF.semibold,
        textAlign: 'center',
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
    resendText: {
        textAlign: 'center',
        color: Colors.primary,
        fontSize: 13,
        fontFamily: CF.medium,
    },
});
