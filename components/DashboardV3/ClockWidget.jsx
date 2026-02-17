import { useState, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '../../constants/Colors';

function getGreeting() {
    const h = new Date().getHours();
    if (h < 12) return 'Good Morning';
    if (h < 17) return 'Good Afternoon';
    return 'Good Evening';
}

export default function ClockWidget({ span = 1, totalColumns = 4 }) {
    const [now, setNow] = useState(new Date());

    useEffect(() => {
        const timer = setInterval(() => setNow(new Date()), 30000);
        return () => clearInterval(timer);
    }, []);

    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const dateStr = now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
    const widthPercent = `${(span / totalColumns) * 100 - 1}%`;

    return (
        <View style={[styles.card, { width: widthPercent }]}>
            <Text style={styles.greeting}>{getGreeting()}</Text>
            <Text style={styles.time}>{timeStr}</Text>
            <Text style={styles.date}>{dateStr}</Text>
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
        justifyContent: 'center',
    },
    greeting: {
        color: Colors.textDim,
        fontSize: 13,
        fontWeight: '500',
        marginBottom: 4,
    },
    time: {
        color: Colors.text,
        fontSize: 36,
        fontWeight: '700',
        letterSpacing: -1,
    },
    date: {
        color: Colors.textDim,
        fontSize: 13,
        marginTop: 2,
    },
});
