import { View, Text, TouchableOpacity, StyleSheet, Dimensions, Image } from 'react-native';
import { BlurView } from 'expo-blur';
import { memo } from 'react';
import Svg, { Path, G, Rect, Defs, ClipPath } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// ── PNG icons ────────────────────────────────────────────────────────────────

function CameraIcon({ color }) {
    return (
        <Image
            source={require('../../assets/new_camera.png')}
            style={[styles.pngIcon, { opacity: 1 }]}
            tintColor="#FFFFFF"
            resizeMode="contain"
        />
    );
}

function RoomsIcon({ color }) {
    return (
        <Image
            source={require('../../assets/new_room.png')}
            style={[styles.pngIcon, { opacity: 1 }]}
            tintColor="#FFFFFF"
            resizeMode="contain"
        />
    );
}

function AIIcon({ color }) {
    return (
        <Image
            source={require('../../assets/ai.png')}
            style={[styles.pngIcon, { opacity: 1 }]}
            tintColor="#FFFFFF"
            resizeMode="contain"
        />
    );
}

function SettingsIcon({ color }) {
    return (
        <Svg width="22" height="22" viewBox="0 0 22 22" fill="none" opacity={1}>
            <G clipPath="url(#settings-clip)">
                <Path d="M11 13.75C12.5188 13.75 13.75 12.5188 13.75 11C13.75 9.48122 12.5188 8.25 11 8.25C9.48122 8.25 8.25 9.48122 8.25 11C8.25 12.5188 9.48122 13.75 11 13.75Z"
                    stroke="#FFFFFF" strokeWidth="1.55833" />
                <Path d="M17.7834 13.7503C17.6614 14.0268 17.625 14.3335 17.6789 14.6309C17.7328 14.9282 17.8746 15.2026 18.0859 15.4187L18.1409 15.4737C18.4849 15.8177 18.6782 16.2842 18.6782 16.7707C18.6782 17.2572 18.4849 17.7238 18.1409 18.0678C17.7969 18.4118 17.3303 18.6051 16.8438 18.6051C16.3573 18.6051 15.8908 18.4118 15.5467 18.0678L15.4917 18.0128C15.2757 17.8015 15.0013 17.6597 14.704 17.6058C14.4066 17.5519 14.0999 17.5883 13.8234 17.7103C13.5523 17.8265 13.3211 18.0195 13.1582 18.2654C12.9953 18.5113 12.9079 18.7995 12.9067 19.0945V19.2503C12.9067 19.7366 12.7136 20.2029 12.3698 20.5467C12.026 20.8905 11.5596 21.0837 11.0734 21.0837C10.5872 21.0837 10.1209 20.8905 9.77705 20.5467C9.43324 20.2029 9.24008 19.7366 9.24008 19.2503V19.1678C9.23298 18.8644 9.13477 18.5702 8.95822 18.3233C8.78166 18.0764 8.53492 17.8884 8.25008 17.7837C7.9736 17.6616 7.6669 17.6252 7.36954 17.6792C7.07218 17.7331 6.79779 17.8748 6.58175 18.0862L6.52675 18.1412C6.18274 18.4852 5.71617 18.6784 5.22967 18.6784C4.74316 18.6784 4.27659 18.4852 3.93258 18.1412C3.58857 17.7972 3.39531 17.3306 3.39531 16.8441C3.39531 16.3576 3.58857 15.891 3.93258 15.547L3.98758 15.492C4.21428 15.2701 4.36547 14.9825 4.41976 14.67C4.47405 14.3574 4.42868 14.0357 4.29008 13.7503C4.17388 13.4792 3.98094 13.248 3.73501 13.0851C3.48908 12.9222 3.20089 12.8348 2.90591 12.8337H2.75008C2.26385 12.8337 1.79754 12.6405 1.45372 12.2967C1.1099 11.9529 0.916748 11.4866 0.916748 11.0003C0.916748 10.5141 1.1099 10.0478 1.45372 9.70396C1.79754 9.36015 2.26385 9.16699 2.75008 9.16699H2.83258C3.12755 9.16582 3.41574 9.07841 3.66168 8.91554C3.90761 8.75268 4.10055 8.52145 4.21675 8.25033C4.33877 7.97384 4.37517 7.66715 4.32125 7.36979C4.26734 7.07242 4.12557 6.79803 3.91425 6.58199L3.85925 6.52699C3.51524 6.18298 3.32198 5.71641 3.32198 5.22991C3.32198 4.74341 3.51524 4.27683 3.85925 3.93283C4.20326 3.58882 4.66983 3.39556 5.15633 3.39556C5.64283 3.39556 6.10941 3.58882 6.45342 3.93283L6.50842 3.98783C6.73033 4.21453 7.0179 4.36572 7.33046 4.42C7.64301 4.47429 7.96472 4.42892 8.25008 4.29033C8.5212 4.17413 8.75243 3.98118 8.9153 3.73525C9.07817 3.48932 9.16557 3.20113 9.16675 2.90616V2.75033C9.16675 2.2641 9.3599 1.79778 9.70372 1.45396C10.0475 1.11015 10.5139 0.916992 11.0001 0.916992C11.4863 0.916992 11.9526 1.11015 12.2964 1.45396C12.6403 1.79778 12.8334 2.2641 12.8334 2.75033V2.83283C12.8346 3.1278 12.922 3.41599 13.0849 3.66192C13.2477 3.90785 13.479 4.10079 13.7501 4.21699C14.0266 4.33901 14.3333 4.37541 14.6306 4.3215C14.928 4.26758 15.2024 4.12582 15.4184 3.91449L15.4734 3.85949C15.8174 3.51548 16.284 3.32222 16.7705 3.32222C17.0114 3.32222 17.2499 3.36967 17.4725 3.46185C17.695 3.55404 17.8972 3.68916 18.0676 3.85949C18.2379 4.02983 18.373 4.23205 18.4652 4.4546C18.5574 4.67715 18.6049 4.91569 18.6049 5.15658C18.6049 5.39747 18.5574 5.636 18.4652 5.85855C18.373 6.08111 18.2379 6.28332 18.0676 6.45366L18.0126 6.50866C17.7978 6.73898 17.6603 7.03059 17.6192 7.34281C17.5782 7.65503 17.6355 7.97229 17.7834 8.25033C17.8996 8.52145 18.0926 8.75268 18.3385 8.91554C18.5844 9.07841 18.8726 9.16582 19.1676 9.16699H19.2501C19.7363 9.16699 20.2026 9.36015 20.5464 9.70396C20.8903 10.0478 21.0834 10.5141 21.0834 11.0003C21.0834 11.4866 20.8903 11.9529 20.5464 12.2967C20.2026 12.6405 19.7363 12.8337 19.2501 12.8337H19.1676C18.8726 12.8348 18.5844 12.9222 18.3385 13.0851C18.0926 13.248 17.8996 13.4792 17.7834 13.7503Z"
                    stroke="#FFFFFF" strokeWidth="1.55833" />
            </G>
            <Defs>
                <ClipPath id="settings-clip">
                    <Rect width="22" height="22" fill="white" />
                </ClipPath>
            </Defs>
        </Svg>
    );
}

// ── Tab bar ───────────────────────────────────────────────────────────────────

function TabBar({ activeTab, onTabPress }) {
    const insets = useSafeAreaInsets();
    // screen height vs window height gives us exactly how much the
    // navigator has consumed at the bottom (home indicator area).
    // Adding insets.bottom on top would double-count, so we use only
    // the raw difference to push the bar to the very bottom edge.
    const screenH = Dimensions.get('screen').height;
    const windowH = Dimensions.get('window').height;
    const bottomOffset = screenH - windowH; // e.g. 0 on Android, ~34 on iPhone

    const tabs = [
        { id: 'cctv',     label: 'Cameras',  IconComp: CameraIcon },
        { id: 'rooms',    label: 'Rooms',    IconComp: RoomsIcon },
        { id: 'home',     label: 'Home',     IconComp: null },   // uses lucide Home
        { id: 'ai',       label: 'AI',       IconComp: AIIcon },
        { id: 'settings', label: 'Settings', IconComp: SettingsIcon },
    ];

    return (
        <View style={[styles.container, { bottom: 25 }]}>
            {/* Bar itself — clips to rounded rect */}
            <BlurView intensity={30} tint="dark" style={styles.blurContainer}>
                {tabs.map((tab) => {
                    const isActive = activeTab === tab.id;
                    const color = isActive ? '#FFFFFF' : '#FFFFFF';

                    if (tab.id === 'home') {
                        // empty spacer so other tabs spread around it
                        return <View key={tab.id} style={styles.homeSpace} />;
                    }

                    return (
                        <TouchableOpacity
                            key={tab.id}
                            style={styles.tab}
                            onPress={() => onTabPress(tab.id)}
                            activeOpacity={0.7}
                        >
                            <View style={styles.iconWrap}>
                                <tab.IconComp color={color} />
                            </View>
                        </TouchableOpacity>
                    );
                })}
            </BlurView>

            {/* Home circle — lives OUTSIDE the bar so it's not clipped */}
            <TouchableOpacity
                style={styles.homeWrap}
                onPress={() => onTabPress('home')}
                activeOpacity={0.85}
            >
                <LinearGradient
                    colors={['#7B2FBE', '#3981B9', '#44C8CA']}
                    start={{ x: 0.04, y: 0.04 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.homePill}
                >
                    <Image
                        source={require('../../assets/footer_logo.png')}
                        style={styles.footerLogo}
                        resizeMode="contain"
                    />
                </LinearGradient>
            </TouchableOpacity>
        </View>
    );
}

const CIRCLE = 74;
const BAR_H  = 62;
// Container must fully contain the circle so it doesn't clip below
// Circle center must align with bar center:
//   circle center from container top  = CIRCLE / 2
//   bar center from container top     = (CONTAINER_H - BAR_H) + BAR_H / 2
//   → CONTAINER_H - BAR_H = CIRCLE / 2 - BAR_H / 2 = (CIRCLE - BAR_H) / 2
//   → CONTAINER_H = BAR_H + (CIRCLE - BAR_H) / 2
// But circle bottom = CIRCLE = 88, so CONTAINER_H must be ≥ 88
const CONTAINER_H = CIRCLE; // 88 — circle fills exactly, bar floats centered inside

const styles = StyleSheet.create({
    container: {
        position: 'absolute',
        left: 34,
        right: 34,
        height: CONTAINER_H,
    },
    blurContainer: {
        position: 'absolute',
        // center bar vertically: top = (CONTAINER_H - BAR_H) / 2 = (88 - 74.01) / 2 ≈ 7
        top: (CIRCLE - BAR_H) / 2,
        left: 0,
        right: 0,
        height: BAR_H,
        borderRadius: BAR_H / 2,
        overflow: 'hidden',
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#222242',
        paddingHorizontal: 16,
        borderWidth: 1,
        borderColor: '#181828',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.45,
        shadowRadius: 18,
        elevation: 12,
    },
    tab: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
    },
    // circle is wider than an icon — give it proportionally more space
    homeSpace: {
        flex: 1.6,
    },
    iconWrap: {
        alignItems: 'center',
    },
    // absolutely centered: top:0 puts circle top at container top → circle center = CIRCLE/2 = 44
    // bar center from container top = (CONTAINER_H - BAR_H) + BAR_H/2 = 8 + 36 = 44 ✓
    homeWrap: {
        position: 'absolute',
        top: 0,
        alignSelf: 'center',
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
        elevation: 12,
    },
    footerLogo: {
        width: 48,
        height: 32,
    },
    pngIcon: {
        width: 24,
        height: 24,
    },
});

export default memo(TabBar);
