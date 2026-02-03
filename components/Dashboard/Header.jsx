import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { Colors } from '../../constants/Colors';
import { Hand, LogOut, Settings } from 'lucide-react-native';
import { useRouter } from 'expo-router';

export default function Header({ weather, power, lightsOn = 0, climateOn = 0, onLightsPress, onClimatePress, onSettingsPress }) {
    const router = useRouter();

    const handleLogout = () => {
        Alert.alert(
            'Logout',
            'Are you sure you want to log out?',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Logout',
                    style: 'destructive',
                    onPress: () => router.replace('/login')
                }
            ]
        );
    };

    // Placeholder for formatDate, as it's not provided in the instruction but used in the diff
    const formatDate = () => {
        const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        return new Date().toLocaleDateString(undefined, options);
    };

    const renderChip = (text, onPress, isInteractive = false) => {
        const Content = (
            <View style={[styles.chip, isInteractive && styles.interactiveChip]}>
                <Text style={[styles.chipText, isInteractive && { color: '#000' }]}>{text}</Text>
            </View>
        );

        if (onPress) {
            return <TouchableOpacity onPress={onPress}>{Content}</TouchableOpacity>;
        }
        return Content;
    };

    return (
        <View style={styles.header}>
            <View style={styles.topRow}>
                <View>
                    <Text style={styles.greeting}>Hello Zeyad</Text>
                    <Text style={styles.date}>{formatDate()}</Text>
                </View>
                <View style={styles.actions}>
                    <TouchableOpacity onPress={onSettingsPress} style={styles.settingBtn}>
                        <Settings size={28} color={Colors.primary} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={handleLogout} style={styles.iconBtn}>
                        <LogOut size={24} color={Colors.error} />
                    </TouchableOpacity>
                </View>
            </View>

            <View style={styles.linesContainer}>
                <View style={styles.line}>
                    <Text style={styles.statusText}>Outside it is </Text>
                    {renderChip(`${weather?.state || 'Cloudy'} ${weather?.temp || '12'}°`)}
                    <Text style={styles.statusText}>.</Text>
                </View>

                <View style={styles.line}>
                    <Text style={styles.statusText}>Power usage </Text>
                    {renderChip(`${power || 1850}W`)}
                    <Text style={styles.statusText}>.</Text>
                </View>

                <View style={styles.line}>
                    {renderChip(`${lightsOn} lights 💡`, onLightsPress, lightsOn > 0)}
                    <Text style={styles.statusText}> and </Text>
                    {renderChip(`${climateOn} ACs ❄️`, onClimatePress, climateOn > 0)}
                    <Text style={styles.statusText}> are on.</Text>
                </View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    header: {
        paddingHorizontal: 20,
        paddingTop: 10,
        marginBottom: 20,
    },
    topRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20,
    },
    actions: {
        flexDirection: 'row',
        alignItems: 'center',
        // gap: 15, // Replaced with margin for compatibility
    },
    settingBtn: {
        padding: 4,
        marginRight: 15, // Add spacing here
    },
    iconBtn: {
        padding: 4,
    },
    greetingRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    greeting: {
        fontSize: 22,
        color: Colors.text,
        fontWeight: '400',
    },
    date: {
        fontSize: 16, // Slightly larger for readability
        color: '#fff', // Explicitly white as requested
        opacity: 0.8,
    },
    name: {
        fontSize: 22,
        color: Colors.text,
        fontWeight: 'bold',
    },
    linesContainer: {
        gap: 6,
    },
    line: {
        flexDirection: 'row',
        alignItems: 'center',
        flexWrap: 'wrap',
    },
    statusText: {
        color: Colors.textDim,
        fontSize: 15,
    },
    chip: {
        backgroundColor: Colors.surface,
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 16,
        justifyContent: 'center',
        marginHorizontal: 2
    },
    interactiveChip: {
        backgroundColor: '#FFF', // Highlight clickable ones
    },
    chipText: {
        color: Colors.text,
        fontWeight: '600',
        fontSize: 14,
    },
});
