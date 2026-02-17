import { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { Calendar } from 'lucide-react-native';
import { Colors } from '../../constants/Colors';
import WidgetCard from './WidgetCard';

const EVENT_COLORS = ['#8947ca', '#42A5F5', '#66BB6A', '#FFA726', '#EF5350', '#AB47BC'];

function getGregorianDateStr() {
    const now = new Date();
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    return `${days[now.getDay()]}, ${months[now.getMonth()]} ${now.getDate()}`;
}

function getDummyEvents() {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    const d = now.getDate();
    return [
        { summary: 'Team Standup', start: new Date(y, m, d, 9, 0).toISOString(), end: new Date(y, m, d, 9, 30).toISOString(), color: EVENT_COLORS[0] },
        { summary: 'Design Review', start: new Date(y, m, d, 11, 0).toISOString(), end: new Date(y, m, d, 12, 0).toISOString(), color: EVENT_COLORS[1] },
        { summary: 'Lunch Break', start: new Date(y, m, d, 12, 30).toISOString(), end: new Date(y, m, d, 13, 30).toISOString(), color: EVENT_COLORS[2] },
        { summary: 'Sprint Planning', start: new Date(y, m, d, 14, 0).toISOString(), end: new Date(y, m, d, 15, 0).toISOString(), color: EVENT_COLORS[3] },
        { summary: 'Gym Session', start: new Date(y, m, d, 18, 0).toISOString(), end: new Date(y, m, d, 19, 0).toISOString(), color: EVENT_COLORS[4] },
    ];
}

export default function CalendarWidget({ entities, sendMessage, span = 2, totalColumns = 4 }) {
    const [events, setEvents] = useState([]);
    const [loading, setLoading] = useState(true);
    const refreshTimer = useRef(null);

    const calendarEntities = entities.filter(e => e.entity_id.startsWith('calendar.'));

    const fetchEvents = async () => {
        if (calendarEntities.length === 0 || !sendMessage) {
            // No calendar entities — show dummy data
            setEvents(getDummyEvents());
            setLoading(false);
            return;
        }

        try {
            const now = new Date();
            const endOfDay = new Date(now);
            endOfDay.setHours(23, 59, 59, 999);

            const allEvents = [];

            for (let i = 0; i < calendarEntities.length; i++) {
                const cal = calendarEntities[i];
                try {
                    const result = await sendMessage({
                        type: 'calendar/events',
                        entity_id: cal.entity_id,
                        start: now.toISOString(),
                        end: endOfDay.toISOString(),
                    });

                    if (Array.isArray(result)) {
                        result.forEach(ev => {
                            allEvents.push({
                                ...ev,
                                calendarName: cal.attributes?.friendly_name || cal.entity_id,
                                color: EVENT_COLORS[i % EVENT_COLORS.length],
                            });
                        });
                    }
                } catch {
                    // Calendar entity may not support events
                }
            }

            // Sort by start time
            allEvents.sort((a, b) => new Date(a.start) - new Date(b.start));

            // If HA returned no events, show dummy data
            if (allEvents.length === 0) {
                setEvents(getDummyEvents());
            } else {
                setEvents(allEvents.slice(0, 5));
            }
        } catch (e) {
            console.log('[CalendarWidget] Error:', e);
            setEvents(getDummyEvents());
        }

        setLoading(false);
    };

    useEffect(() => {
        fetchEvents();
        refreshTimer.current = setInterval(fetchEvents, 5 * 60 * 1000);
        return () => {
            if (refreshTimer.current) clearInterval(refreshTimer.current);
        };
    }, [calendarEntities.length]);

    const todayStr = getGregorianDateStr();

    const formatTime = (dateStr) => {
        if (!dateStr) return '';
        if (dateStr.length === 10) return 'All Day';
        const d = new Date(dateStr);
        return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    };

    return (
        <WidgetCard
            title="Today's Agenda"
            icon={Calendar}
            span={span}
            totalColumns={totalColumns}
            headerRight={<Text style={styles.dateText}>{todayStr}</Text>}
        >
            {loading ? (
                <ActivityIndicator size="small" color={Colors.textDim} style={{ paddingVertical: 16 }} />
            ) : (
                <View style={styles.eventList}>
                    {events.map((ev, i) => (
                        <View key={i} style={styles.eventRow}>
                            <View style={[styles.dot, { backgroundColor: ev.color }]} />
                            <View style={styles.eventInfo}>
                                <Text style={styles.eventTitle} numberOfLines={1}>{ev.summary}</Text>
                                <Text style={styles.eventTime}>
                                    {formatTime(ev.start)}{ev.end ? ` - ${formatTime(ev.end)}` : ''}
                                </Text>
                            </View>
                        </View>
                    ))}
                </View>
            )}
        </WidgetCard>
    );
}

const styles = StyleSheet.create({
    dateText: {
        color: Colors.textDim,
        fontSize: 11,
    },
    eventList: {
        gap: 10,
    },
    eventRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    dot: {
        width: 8,
        height: 8,
        borderRadius: 4,
    },
    eventInfo: {
        flex: 1,
    },
    eventTitle: {
        color: Colors.text,
        fontSize: 13,
        fontWeight: '500',
    },
    eventTime: {
        color: Colors.textDim,
        fontSize: 11,
        marginTop: 1,
    },
});
