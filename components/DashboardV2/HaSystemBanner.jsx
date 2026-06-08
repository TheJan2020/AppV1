import { View, Text, StyleSheet } from 'react-native';
import { AlertTriangle, WifiOff, ServerOff } from 'lucide-react-native';
import { CF } from '../../utils/typography';

/**
 * @param {{ variant: string, title: string, body: string } | null} banner
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

    return (
        <View style={[styles.wrap, { borderColor: `${accent}55` }]}>
            <View style={[styles.iconCircle, { backgroundColor: `${accent}22` }]}>
                <Icon size={18} color={accent} strokeWidth={2.2} />
            </View>
            <View style={styles.textCol}>
                <Text style={styles.title}>{banner.title}</Text>
                <Text style={styles.body}>{banner.body}</Text>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    wrap: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        backgroundColor: 'rgba(20, 20, 40, 0.95)',
        borderRadius: 14,
        borderWidth: 1,
        padding: 12,
        marginBottom: 12,
        gap: 10,
    },
    iconCircle: {
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 2,
    },
    textCol: {
        flex: 1,
    },
    title: {
        color: '#fff',
        fontSize: 14,
        fontFamily: CF.semibold,
        marginBottom: 4,
    },
    body: {
        color: 'rgba(255,255,255,0.62)',
        fontSize: 12,
        fontFamily: CF.regular,
        lineHeight: 17,
    },
});
