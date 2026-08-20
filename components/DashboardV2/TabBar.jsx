import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { BlurView } from 'expo-blur';
import { memo } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import FooterLogo from '../FooterLogo';
import {
    TAB_ICON_SIZE,
    ButlerIcon,
    CameraIcon,
    RoomsIcon,
    SettingsIcon,
} from './TabBarIcons';

const TAB_ICON_DEFAULT = '#FFFFFF';
const TAB_ICON_SELECTED = '#C9A8F0';

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

function TabBar({ activeTab, onTabPress, butlerActive = false }) {
    const tabs = [
        { id: 'cctv',     label: 'Cameras', IconComp: CameraIcon },
        { id: 'rooms',    label: 'Rooms',   IconComp: RoomsIcon },
        { id: 'home',     label: 'Home',    IconComp: null },
        { id: 'butler',   label: 'Butler',  IconComp: ButlerIcon },
        { id: 'settings', label: 'Settings', IconComp: SettingsIcon },
    ];

    return (
        <View style={[styles.container, { bottom: 25 }]}>
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
                            onPress={() => onTabPress(tab.id)}
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

            <HomeTabButton onPress={() => onTabPress('home')} />
        </View>
    );
}

const CIRCLE = 74;
const BAR_H  = 62;
const CONTAINER_H = CIRCLE;

const styles = StyleSheet.create({
    container: {
        position: 'absolute',
        left: 34,
        right: 34,
        height: CONTAINER_H,
        // Must sit above scroll content / cards (RoomsList elevation 18, Settings tabs, etc.)
        // or Android steals footer taps.
        zIndex: 10000,
        elevation: 10000,
    },
    blurContainer: {
        position: 'absolute',
        top: (CIRCLE - BAR_H) / 2,
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
        top: 0,
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
