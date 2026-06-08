import { TouchableOpacity, View, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

/** Figma room group header icon — linear-gradient(90deg, #602FBE 0%, #7B2FBE 100%) */
export const ROOM_GROUP_ICON_GRADIENT = ['#602FBE', '#7B2FBE'];

export const ROOM_GROUP_ICON_GRADIENT_PROPS = {
    colors: ROOM_GROUP_ICON_GRADIENT,
    start: { x: 0, y: 0.5 },
    end: { x: 1, y: 0.5 },
};

/**
 * Circular master icon for room sections (Lights, Covers, Climate, Media, …).
 */
export default function RoomGroupIconButton({
    children,
    active = false,
    onPress,
    disabled,
    size = 52,
    style,
    accessibilityLabel,
}) {
    const radius = size / 2;
    const shellStyle = [
        styles.wrap,
        {
            width: size,
            height: size,
            borderRadius: radius,
            marginRight: size >= 52 ? 14 : 0,
        },
        active && styles.wrapActive,
        style,
    ];
    const inner = (
        <LinearGradient
            {...ROOM_GROUP_ICON_GRADIENT_PROPS}
            style={[styles.gradient, { borderRadius: radius }]}
        >
            {children}
        </LinearGradient>
    );

    if (!onPress) {
        return <View style={shellStyle}>{inner}</View>;
    }

    return (
        <TouchableOpacity
            onPress={onPress}
            disabled={disabled}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel}
            style={shellStyle}
        >
            {inner}
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    wrap: {
        borderWidth: 1.5,
        borderColor: 'rgba(137, 71, 202, 0.55)',
        shadowColor: '#8947ca',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.32,
        shadowRadius: 5,
        elevation: 2,
        overflow: 'hidden',
    },
    wrapActive: {
        borderColor: 'rgba(255, 255, 255, 0.45)',
        shadowOpacity: 0.6,
        shadowRadius: 9,
        elevation: 4,
    },
    gradient: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
});
