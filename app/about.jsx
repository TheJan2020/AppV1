import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, ScrollView, Image } from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';

import { Colors } from '../constants/Colors';

export default function AboutPage() {
    const router = useRouter();

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
                    <Text style={styles.title}>About</Text>
                    <View style={{ width: 40 }} />
                </View>

                {/* Content */}
                <ScrollView contentContainerStyle={styles.content}>
                    <View style={styles.logoContainer}>
                        <Image
                            source={require('../assets/header-logo.png')}
                            style={styles.logo}
                            resizeMode="contain"
                        />
                        <Text style={styles.appName}>Primewave</Text>
                        <Text style={styles.appTagline}>Control your home, intelligently.</Text>
                    </View>

                    <View style={styles.infoCard}>
                        <Text style={styles.label}>Developed By</Text>
                        <Text style={styles.value}>Primewave Co.</Text>

                        <View style={styles.separator} />

                        <Text style={styles.label}>Version</Text>
                        <Text style={styles.value}>1.0.28</Text>
                    </View>

                    <Text style={styles.copyright}>
                        © 2026 Primewave Co. All rights reserved.
                    </Text>
                </ScrollView>
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
        paddingHorizontal: 20,
        paddingVertical: 15,
    },
    backBtn: {
        padding: 5,
        backgroundColor: 'rgba(255,255,255,0.1)',
        borderRadius: 20,
    },
    title: {
        color: 'white',
        fontSize: 20,
        fontWeight: 'bold',
    },
    content: {
        padding: 24,
        alignItems: 'center',
        paddingTop: 40,
    },
    logoContainer: {
        alignItems: 'center',
        marginBottom: 40,
    },
    logo: {
        width: 200,
        height: 80,
        marginBottom: 24,
    },
    appName: {
        color: Colors.text,
        fontSize: 24,
        fontWeight: 'bold',
        marginBottom: 8,
    },
    appTagline: {
        color: Colors.textDim,
        fontSize: 16,
    },
    infoCard: {
        backgroundColor: 'rgba(255,255,255,0.05)',
        padding: 24,
        borderRadius: 16,
        width: '100%',
        alignItems: 'center',
    },
    label: {
        color: Colors.textDim,
        marginBottom: 8,
        fontSize: 14,
    },
    value: {
        color: Colors.text,
        fontSize: 18,
        fontWeight: '600',
    },
    separator: {
        height: 1,
        width: '100%',
        backgroundColor: 'rgba(255,255,255,0.05)',
        marginVertical: 20,
    },
    copyright: {
        color: Colors.textDim,
        fontSize: 12,
        marginTop: 48,
        textAlign: 'center',
        opacity: 0.5,
    },
});
