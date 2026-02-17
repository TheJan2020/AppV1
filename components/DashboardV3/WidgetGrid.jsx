import { View, StyleSheet } from 'react-native';

export default function WidgetGrid({ children }) {
    return (
        <View style={styles.grid}>
            {children}
        </View>
    );
}

const styles = StyleSheet.create({
    grid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
    },
});
