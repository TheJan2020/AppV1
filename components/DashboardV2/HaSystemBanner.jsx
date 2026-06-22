import { Alert, Linking, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { AlertTriangle, ChevronRight, ServerOff, WifiOff } from 'lucide-react-native';
import { CF } from '../../utils/typography';

/**
 * Compact tappable status chip — tap for full details.
 * @param {{ variant: string, title: string, body: string, shortLabel?: string } | null} banner
 */
export default function HaSystemBanner({ banner }) {
    if (!banner) return null;

    const Icon =
        banner.variant === 'admin_down' ? ServerOff :
        banner.variant === 'degraded' ? AlertTriangle :
        WifiOff;

    const accent =
        banner.variant === 'degraded' ? '#FFA726' :
        banner.variant === 'admin_down' ? '#42A5F5' :
        '#EF5350';

    const label = banner.shortLabel || banner.title;

    const onPress = () => {
        const buttons = [{ text: 'OK' }];
        
        // Add "Contact Support" button for critical system issues
        if (banner.variant === 'ha_down' || banner.variant === 'admin_down' || banner.variant === 'degraded') {
            buttons.unshift({
                text: 'Contact Support',
                onPress: () => {
                    Linking.openURL('mailto:info@primewave.ai?subject=Primewave System Issue&body=Issue: ' + banner.title);
                }
            });
        }

        Alert.alert(banner.title, banner.body, buttons);
    };

    return (
        <TouchableOpacity
            style={[styles.chip, { borderColor: `${accent}44`, backgroundColor: `${accent}14` }]}
            onPress={onPress}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={`${label}. Tap for details.`}
        >
            <Icon size={15} color={accent} strokeWidth={2.2} />
            <Text style={[styles.label, { color: accent }]} numberOfLines={1}>{label}</Text>
            <ChevronRight size={14} color={`${accent}99`} />
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    chip: {
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        gap: 8,
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 20,
        borderWidth: 1,
        marginBottom: 14,
    },
    label: {
        fontSize: 13,
        fontFamily: CF.semibold,
        letterSpacing: -0.1,
    },
});
