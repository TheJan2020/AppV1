import React, { useState } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, SafeAreaView, ScrollView,
    TextInput, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams, Stack } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Mail, KeyRound, CheckCircle2 } from 'lucide-react-native';
import { StatusBar } from 'expo-status-bar';

import { Colors } from '../constants/Colors';
import { CF } from '../utils/typography';

/**
 * Self-service "Forgot password" screen.
 *
 * Step 1 — the user enters their Home Assistant username (or recovery
 * email) and we ask the backend to email a 6-digit reset code (valid for
 * 5 minutes). Step 2 (entering the code + new password) happens entirely
 * in-app on the /reset-password screen — no email link/deep-link needed.
 */
export default function ForgotPasswordPage() {
    const router = useRouter();
    const { adminUrl: adminUrlParam, username: usernameParam } = useLocalSearchParams();
    const adminUrl = Array.isArray(adminUrlParam) ? adminUrlParam[0] : adminUrlParam;
    const initialUsername = Array.isArray(usernameParam) ? usernameParam[0] : usernameParam;

    const [identifier, setIdentifier] = useState(initialUsername || '');
    const [sending, setSending] = useState(false);
    const [sent, setSent] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async () => {
        setError('');
        if (!identifier.trim()) {
            setError('Enter your username or recovery email.');
            return;
        }
        if (!adminUrl) {
            setError('Could not find your home connection. Go back and try again from the login screen.');
            return;
        }

        setSending(true);
        try {
            const base = adminUrl.endsWith('/') ? adminUrl : `${adminUrl}/`;
            const res = await fetch(`${base}api/auth/forgot-password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ identifier: identifier.trim() }),
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok && data.ok) {
                setSent(true);
                router.push({
                    pathname: '/reset-password',
                    params: { adminUrl, identifier: identifier.trim() },
                });
            } else {
                setError(data.error || 'Could not send the reset code. Try again.');
            }
        } catch {
            setError('Could not reach the server. Check your connection and try again.');
        } finally {
            setSending(false);
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
                    <Text style={styles.title}>Forgot Password</Text>
                    <View style={{ width: 40 }} />
                </View>

                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                    style={{ flex: 1 }}
                >
                    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
                        <View style={styles.iconBadge}>
                            {sent
                                ? <CheckCircle2 size={28} color="#22c55e" />
                                : <KeyRound size={28} color={Colors.primary} />}
                        </View>

                        {sent ? (
                            <>
                                <Text style={styles.subtitle}>
                                    If that account has a recovery email on file, a 6-digit reset code has
                                    been sent to it. The code is valid for{' '}
                                    <Text style={{ color: '#ededf5', fontFamily: CF.semibold }}>5 minutes</Text>.
                                </Text>
                                <Text style={styles.footNote}>
                                    Check your email for the code, then enter it on the next screen along
                                    with your new password — everything happens right here in the app.
                                    Didn&apos;t get it? Check spam, or ask your home admin to confirm your
                                    recovery email is set.
                                </Text>
                                <TouchableOpacity
                                    style={styles.submitBtn}
                                    onPress={() => router.push({
                                        pathname: '/reset-password',
                                        params: { adminUrl, identifier: identifier.trim() },
                                    })}
                                    activeOpacity={0.8}
                                >
                                    <Text style={styles.submitText}>Enter Code</Text>
                                </TouchableOpacity>
                            </>
                        ) : (
                            <>
                                <Text style={styles.subtitle}>
                                    Enter your Home Assistant username or recovery email. We&apos;ll send a
                                    6-digit code that&apos;s valid for 5 minutes.
                                </Text>

                                {error ? (
                                    <View style={styles.errorBox}>
                                        <Text style={styles.errorText}>{error}</Text>
                                    </View>
                                ) : null}

                                <Text style={styles.label}>Username or Email</Text>
                                <View style={styles.inputRow}>
                                    <Mail size={18} color="rgba(237,237,245,0.4)" />
                                    <TextInput
                                        style={styles.input}
                                        value={identifier}
                                        onChangeText={setIdentifier}
                                        placeholder="e.g. john or john@example.com"
                                        placeholderTextColor="rgba(237,237,245,0.3)"
                                        autoCapitalize="none"
                                        autoCorrect={false}
                                        keyboardType="email-address"
                                        returnKeyType="send"
                                        onSubmitEditing={handleSubmit}
                                    />
                                </View>

                                <TouchableOpacity
                                    style={[styles.submitBtn, sending && { opacity: 0.6 }]}
                                    onPress={handleSubmit}
                                    disabled={sending}
                                    activeOpacity={0.8}
                                >
                                    {sending
                                        ? <ActivityIndicator color="#fff" />
                                        : <Text style={styles.submitText}>Send Reset Code</Text>}
                                </TouchableOpacity>

                                <Text style={styles.footNote}>
                                    No recovery email on file, or getting &quot;Unauthorized&quot;? Only the
                                    Home Assistant owner account can complete a password reset. If you are
                                    not the owner, please ask your Home Assistant owner to change the
                                    password for you.
                                </Text>
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
