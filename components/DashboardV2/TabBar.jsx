import { View, TouchableOpacity, StyleSheet, Text, Animated } from 'react-native';
import { BlurView } from 'expo-blur';
import { memo, useEffect, useRef, useState } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { Lock } from 'lucide-react-native';
import FooterLogo from '../FooterLogo';
import { CF } from '../../utils/typography';
import {
    TAB_ICON_SIZE,
    ButlerIcon,
    CameraIcon,
    RoomsIcon,
    SettingsIcon,
} from './TabBarIcons';

const TAB_ICON_DEFAULT = '#FFFFFF';
const TAB_ICON_SELECTED = '#C9A8F0';

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

function HomeTabButton({ onPress }) {
    return (
        <TouchableOpacity
            style={styles.homeWrap}
            onPress={onPress}
            activeOpacity={1}
        >
            <LinearGradient
                colors={['#7B2FBE', '#3981B9', '#44C8CA']}
                start={{ x: 0.04, y: 0.04 }}
                end={{ x: 1, y: 1 }}
                style={styles.homePill}
            >
                <FooterLogo width={48} height={32} />
            </LinearGradient>
        </TouchableOpacity>
    );
}

function TabBar({ activeTab, onTabPress, butlerActive = false, allowedTabs = null }) {
    const [deniedLabel, setDeniedLabel] = useState('');
    const deniedTimer = useRef(null);
    const toastOpacity = useRef(new Animated.Value(0)).current;
    const toastY = useRef(new Animated.Value(8)).current;

    useEffect(() => () => {
        if (deniedTimer.current) clearTimeout(deniedTimer.current);
    }, []);

    const hideDenied = () => {
        Animated.parallel([
            Animated.timing(toastOpacity, { toValue: 0, duration: 160, useNativeDriver: true }),
            Animated.timing(toastY, { toValue: 8, duration: 160, useNativeDriver: true }),
        ]).start(({ finished }) => {
            if (finished) setDeniedLabel('');
        });
    };

    const showDenied = (tabId) => {
        const label = TAB_LABELS[tabId] || 'This screen';
        setDeniedLabel(label);
        toastOpacity.setValue(0);
        toastY.setValue(8);
        Animated.parallel([
            Animated.timing(toastOpacity, { toValue: 1, duration: 180, useNativeDriver: true }),
            Animated.timing(toastY, { toValue: 0, duration: 180, useNativeDriver: true }),
        ]).start();
        if (deniedTimer.current) clearTimeout(deniedTimer.current);
        deniedTimer.current = setTimeout(hideDenied, 2200);
    };

    const handlePress = (tabId) => {
        if (tabId !== 'home' && !tabIsAllowed(allowedTabs, tabId)) {
            showDenied(tabId);
            return;
        }
        if (deniedTimer.current) clearTimeout(deniedTimer.current);
        if (deniedLabel) hideDenied();
        onTabPress(tabId);
    };

    const tabs = [
        { id: 'cctv',     label: 'Cameras', IconComp: CameraIcon },
        { id: 'rooms',    label: 'Rooms',   IconComp: RoomsIcon },
        { id: 'home',     label: 'Home',    IconComp: null },
        { id: 'butler',   label: 'Butler',  IconComp: ButlerIcon },
        { id: 'settings', label: 'Settings', IconComp: SettingsIcon },
    ];

    return (
        <View style={[styles.container, { bottom: 25 }]} pointerEvents="box-none">
            {deniedLabel ? (
                <Animated.View
                    pointerEvents="none"
                    style={[
                        styles.deniedToast,
                        { opacity: toastOpacity, transform: [{ translateY: toastY }] },
                    ]}
                >
                    <View style={styles.deniedCard}>
                        <View style={styles.deniedIcon}>
                            <Lock size={14} color="#E8D7FF" strokeWidth={2.2} />
                        </View>
                        <View style={styles.deniedCopy}>
                            <Text style={styles.deniedTitle}>Permission denied</Text>
                            <Text style={styles.deniedSub}>{deniedLabel}</Text>
                        </View>
                    </View>
                </Animated.View>
            ) : null}

            <BlurView intensity={80} tint="dark" style={styles.blurContainer}>
                {tabs.map((tab) => {
                    const isHome = tab.id === 'home';
                    const isButler = tab.id === 'butler';
                    const isActive = isButler
                        ? butlerActive || activeTab === 'ai'
                        : activeTab === tab.id;
                    const color = isActive ? TAB_ICON_SELECTED : TAB_ICON_DEFAULT;

                    if (isHome) {
                        return <View key={tab.id} style={styles.homeSpace} />;
                    }

                    return (
                        <TouchableOpacity
                            key={tab.id}
                            style={styles.tab}
                            onPress={() => handlePress(tab.id)}
                            activeOpacity={0.7}
                            accessibilityLabel={tab.label}
                            accessibilityState={{ selected: isActive }}
                        >
                            <View style={styles.iconWrap}>
                                {isButler ? (
                                    <ButlerIcon color={color} size={TAB_ICON_SIZE} />
                                ) : (
                                    <tab.IconComp color={color} size={TAB_ICON_SIZE} />
                                )}
                            </View>
                        </TouchableOpacity>
                    );
                })}
            </BlurView>

            <HomeTabButton onPress={() => handlePress('home')} />
        </View>
    );
}

const CIRCLE = 74;
const BAR_H  = 62;
const TOAST_SPACE = 58;
const CONTAINER_H = CIRCLE + TOAST_SPACE;

const styles = StyleSheet.create({
    container: {
        position: 'absolute',
        left: 34,
        right: 34,
        height: CONTAINER_H,
        zIndex: 10000,
        elevation: 10000,
    },
    deniedToast: {
        position: 'absolute',
        left: 0,
        right: 0,
        top: 0,
        alignItems: 'center',
        zIndex: 3,
    },
    deniedCard: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingVertical: 10,
        paddingLeft: 10,
        paddingRight: 16,
        borderRadius: 22,
        backgroundColor: 'rgba(18, 16, 28, 0.96)',
        borderWidth: 1,
        borderColor: 'rgba(201, 168, 240, 0.28)',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.4,
        shadowRadius: 16,
    },
    deniedIcon: {
        width: 28,
        height: 28,
        borderRadius: 14,
        backgroundColor: 'rgba(123, 47, 190, 0.35)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    deniedCopy: {
        justifyContent: 'center',
    },
    deniedTitle: {
        color: '#FFFFFF',
        fontSize: 13,
        fontFamily: CF.semibold,
        letterSpacing: 0.1,
    },
    deniedSub: {
        color: 'rgba(255, 255, 255, 0.5)',
        fontSize: 11,
        fontFamily: CF.medium,
        marginTop: 1,
    },
    blurContainer: {
        position: 'absolute',
        top: TOAST_SPACE + (CIRCLE - BAR_H) / 2,
        left: 0,
        right: 0,
        height: BAR_H,
        borderRadius: BAR_H / 2,
        overflow: 'hidden',
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(20, 20, 35, 0.92)',
        paddingHorizontal: 16,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.08)',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.45,
        shadowRadius: 18,
        elevation: 10001,
        zIndex: 1,
    },
    tab: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
    },
    homeSpace: {
        flex: 1.6,
    },
    iconWrap: {
        alignItems: 'center',
    },
    homeWrap: {
        position: 'absolute',
        top: TOAST_SPACE,
        alignSelf: 'center',
        zIndex: 2,
        elevation: 10002,
    },
    homePill: {
        width: CIRCLE,
        height: CIRCLE,
        borderRadius: CIRCLE / 2,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#7B2FBE',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.7,
        shadowRadius: 16,
        elevation: 10002,
    },
});

export default memo(TabBar);
