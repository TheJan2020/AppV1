import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '../../constants/Colors';

export default function WidgetCard({ title, icon: Icon, span = 1, totalColumns = 4, children, headerRight, noPadding }) {
    const widthPercent = `${(span / totalColumns) * 100 - 1}%`;

    return (
        <View style={[styles.card, { width: widthPercent }]}>
            {(title || headerRight) && (
                <View style={styles.header}>
                    <View style={styles.headerLeft}>
                        {Icon && <Icon size={16} color={Colors.textDim} />}
                        {title && <Text style={styles.title}>{title}</Text>}
                    </View>
                    {headerRight}
                </View>
            )}
            <View style={noPadding ? undefined : styles.body}>
                {children}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    card: {
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
        borderRadius: 20,
        padding: 16,
        marginBottom: 10,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 12,
    },
    headerLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    title: {
        color: Colors.text,
        fontSize: 14,
        fontWeight: '600',
    },
    body: {},
});
