import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export default function PlatformGlyph({ platform, size = 16, framed = true }) {
    const p = String(platform || '').toLowerCase();
    const isApple = p === 'ios' || p === 'iphone' || p === 'ipad' || p === 'macos';
    const isAndroid = p === 'android';

    const icon = isApple
        ? <Ionicons name="logo-apple" size={size} color="#F5F5F7" />
        : isAndroid
            ? <Ionicons name="logo-android" size={size} color="#3DDC84" />
            : <Ionicons name="phone-portrait-outline" size={size} color="rgba(255,255,255,0.45)" />;

    if (!framed) return icon;

    const wrap = size + 10;
    const backgroundColor = isApple
        ? 'rgba(255,255,255,0.08)'
        : isAndroid
            ? 'rgba(61,220,132,0.12)'
            : 'rgba(255,255,255,0.06)';

    return (
        <View style={{
            width: wrap,
            height: wrap,
            borderRadius: wrap / 2,
            backgroundColor,
            alignItems: 'center',
            justifyContent: 'center',
        }}>
            {icon}
        </View>
    );
}
