import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Video, LayoutGrid, Home, Settings, Tablet, Lock } from 'lucide-react-native';
import { BlurView } from 'expo-blur';

import { memo, useEffect, useRef, useState } from 'react';
import { CF } from '../../utils/typography';
import { ButlerIcon, TAB_ICON_SIZE } from './TabBarIcons';

const TAB_LABELS = {
    cctv: 'Cameras',
    rooms: 'Rooms',
    butler: 'Butler',
    settings: 'Settings',
    tablet: 'Kids Tablet',
};

function tabIsAllowed(allowedTabs, tabId) {
    if (tabId === 'home' || tabId === 'settings') return true;
    if (!Array.isArray(allowedTabs)) return true;
    if (allowedTabs.length === 0) return tabId === 'home' || tabId === 'settings';
    return allowedTabs.includes(tabId);
}

function TabletSidebar({ activeTab, onTabPress, allowedTabs = null }) {
    const [deniedLabel, setDeniedLabel] = useState('');
    const deniedTimer = useRef(null);

    useEffect(() => () => {
        if (deniedTimer.current) clearTimeout(deniedTimer.current);
    }, []);

    const handlePress = (tabId) => {
        if (tabId !== 'home' && !tabIsAllowed(allowedTabs, tabId)) {
            setDeniedLabel(TAB_LABELS[tabId] || 'This screen');
            if (deniedTimer.current) clearTimeout(deniedTimer.current);
            deniedTimer.current = setTimeout(() => setDeniedLabel(''), 2200);
            return;
        }
        if (deniedTimer.current) clearTimeout(deniedTimer.current);
        setDeniedLabel('');
        onTabPress(tabId);
    };

    const tabs = [
        { id: 'home', label: 'Home', icon: Home },
        { id: 'rooms', label: 'Rooms', icon: LayoutGrid },
        { id: 'cctv', label: 'CCTV', icon: Video },
        { id: 'butler', label: 'Butler' },
        { id: 'tablet', label: 'Tablet', icon: Tablet },
        { id: 'settings', label: 'Settings', icon: Settings },
    ];

    return (
        <View style={styles.container}>
            <BlurView intensity={30} tint="dark" style={styles.blurContainer}>
                {tabs.map((tab) => {
                    const isActive = tab.id === 'butler'
                        ? activeTab === 'ai' || activeTab === 'butler'
                        : activeTab === tab.id;
                    const Icon = tab.icon;

                    return (
                        <TouchableOpacity
                            key={tab.id}
                            style={[styles.tab, isActive && styles.activeTab]}
                            onPress={() => handlePress(tab.id)}
                            activeOpacity={0.7}
                            accessibilityState={{ selected: isActive }}
                        >
                            {tab.id === 'butler' ? (
                                <ButlerIcon
                                    color={isActive ? '#fff' : 'rgba(255, 255, 255, 0.4)'}
                                    size={TAB_ICON_SIZE}
                                />
                            ) : (
                                <Icon
                                    size={24}
                                    color={isActive ? '#fff' : 'rgba(255, 255, 255, 0.4)'}
                                    strokeWidth={isActive ? 2 : 1.5}
                                />
                            )}
                            <Text style={[styles.label, isActive && styles.activeLabel]}>
                                {tab.label}
                            </Text>
                        </TouchableOpacity>
                    );
                })}
            </BlurView>

            {deniedLabel ? (
                <View style={styles.deniedToast} pointerEvents="none">
                    <View style={styles.deniedCard}>
                        <View style={styles.deniedIcon}>
                            <Lock size={14} color="#E8D7FF" strokeWidth={2.2} />
                        </View>
                        <View>
                            <Text style={styles.deniedTitle}>Permission denied</Text>
                            <Text style={styles.deniedSub}>{deniedLabel}</Text>
                        </View>
                    </View>
                </View>
            ) : null}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        width: 80,
        position: 'absolute',
        left: 0,
        top: 0,
        bottom: 0,
        overflow: 'visible',
        zIndex: 10000,
        elevation: 10000,
        borderRightWidth: 1,
        borderRightColor: 'rgba(255,255,255,0.05)',
    },
    blurContainer: {
        flex: 1,
        paddingTop: 60,
        paddingBottom: 30,
        alignItems: 'center',
        justifyContent: 'flex-start',
        gap: 8,
        backgroundColor: 'rgba(16, 16, 24, 0.85)',
    },
    tab: {
        width: 64,
        paddingVertical: 12,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 16,
        gap: 4,
    },
    activeTab: {
        backgroundColor: 'rgba(137, 71, 202, 0.25)',
    },
    label: {
        color: 'rgba(255,255,255,0.4)',
        fontSize: 10,
        fontFamily: CF.medium,
    },
    activeLabel: {
        color: '#fff',
        fontFamily: CF.semibold,
        fontSize: 10,
    },
    deniedToast: {
        position: 'absolute',
        left: 88,
        bottom: 36,
        zIndex: 4,
    },
    deniedCard: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingVertical: 10,
        paddingLeft: 10,
        paddingRight: 16,
        borderRadius: 18,
        backgroundColor: 'rgba(18, 16, 28, 0.96)',
        borderWidth: 1,
        borderColor: 'rgba(201, 168, 240, 0.28)',
    },
    deniedIcon: {
        width: 28,
        height: 28,
        borderRadius: 14,
        backgroundColor: 'rgba(123, 47, 190, 0.35)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    deniedTitle: {
        color: '#FFFFFF',
        fontSize: 13,
        fontFamily: CF.semibold,
    },
    deniedSub: {
        color: 'rgba(255, 255, 255, 0.5)',
        fontSize: 11,
        fontFamily: CF.medium,
        marginTop: 1,
    },
});

export default memo(TabletSidebar);
