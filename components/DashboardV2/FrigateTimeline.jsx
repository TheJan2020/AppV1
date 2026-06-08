import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, FlatList, ActivityIndicator } from 'react-native';
import { Play } from 'lucide-react-native';
import { dedupeEventsById } from '../../utils/frigateEvents';

export default function FrigateTimeline({ events, onEventPress, onLoadMore, hasMore, loadingMore, selectedEventId, listRef, adminUrl, authHeaders, listHeader }) {

    // Deduplicate, group by date, then build flat rows:
    // - a 'header' row (spans full width)
    // - 'pair' rows with up to 2 event cards
    const rows = useMemo(() => {
        const deduped = dedupeEventsById(events);

        const groups = {};
        deduped.forEach(event => {
            const date = new Date(event.start_time * 1000);
            const dayKey = date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
            if (!groups[dayKey]) groups[dayKey] = [];
            groups[dayKey].push(event);
        });

        const result = [];
        Object.keys(groups).forEach(day => {
            result.push({ type: 'header', key: `header_${day}`, title: day });
            const dayEvents = groups[day];
            for (let i = 0; i < dayEvents.length; i += 2) {
                result.push({
                    type: 'pair',
                    key: `pair_${dayEvents[i].id}`,
                    left: dayEvents[i],
                    right: dayEvents[i + 1] || null,
                });
            }
        });
        return result;
    }, [events]);

    const renderEventCard = (event) => {
        if (!event) return <View style={styles.cardPlaceholder} />;

        const date = new Date(event.start_time * 1000);
        const hours = date.getHours();
        const minutes = date.getMinutes().toString().padStart(2, '0');
        const amPm = hours >= 12 ? 'PM' : 'AM';
        const hours12 = hours % 12 || 12;
        const timeStr = `${hours12}:${minutes} ${amPm}`;
        const duration = event.end_time ? Math.round(event.end_time - event.start_time) : null;
        const isSelected = selectedEventId === event.id;

        return (
            <TouchableOpacity
                key={event.id}
                style={[styles.card, isSelected && styles.cardSelected]}
                onPress={() => onEventPress(event)}
                activeOpacity={0.75}
            >
                <View style={styles.thumbWrap}>
                    <Image
                        source={{
                            uri: `${adminUrl}/api/frigate/events/${event.id}/thumbnail`,
                            headers: authHeaders || {},
                        }}
                        style={styles.thumbnail}
                        resizeMode="cover"
                    />
                    {isSelected && (
                        <View style={styles.playOverlay}>
                            <Play size={28} color="white" fill="white" />
                        </View>
                    )}
                    {duration != null && (
                        <View style={styles.durationBadge}>
                            <Text style={styles.durationText}>{duration}s</Text>
                        </View>
                    )}
                </View>
                <View style={styles.cardInfo}>
                    <Text style={styles.timeText}>{timeStr}</Text>
                    <View style={[styles.labelBadge, isSelected && styles.labelBadgeSelected]}>
                        <Text style={styles.labelText}>{event.label}</Text>
                    </View>
                </View>
            </TouchableOpacity>
        );
    };

    const renderItem = ({ item }) => {
        if (item.type === 'header') {
            return (
                <View style={styles.sectionHeader}>
                    <Text style={styles.sectionHeaderText}>{item.title}</Text>
                </View>
            );
        }
        return (
            <View style={styles.row}>
                {renderEventCard(item.left)}
                {renderEventCard(item.right)}
            </View>
        );
    };

    return (
        <FlatList
            ref={listRef}
            data={rows}
            keyExtractor={(item) => item.key}
            renderItem={renderItem}
            ListHeaderComponent={listHeader || null}
            contentContainerStyle={styles.listContent}
            onEndReached={() => {
                if (hasMore && !loadingMore) onLoadMore();
            }}
            onEndReachedThreshold={0.4}
            ListFooterComponent={
                loadingMore ? (
                    <View style={styles.footerLoader}>
                        <ActivityIndicator color="#3b82f6" />
                        <Text style={styles.footerText}>Loading more…</Text>
                    </View>
                ) : hasMore ? (
                    <View style={{ height: 40 }} />
                ) : (
                    <View style={styles.footerEnd}>
                        <Text style={styles.footerEndText}>· end of events ·</Text>
                    </View>
                )
            }
            ListEmptyComponent={
                <View style={styles.emptyContainer}>
                    <Text style={styles.emptyText}>No events found</Text>
                </View>
            }
        />
    );
}

const styles = StyleSheet.create({
    listContent: {
        paddingHorizontal: 12,
        paddingBottom: 60,
    },
    row: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 10,
    },
    sectionHeader: {
        width: '100%',
        paddingVertical: 8,
        paddingHorizontal: 4,
        marginTop: 16,
        marginBottom: 6,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.1)',
    },
    sectionHeaderText: {
        color: 'rgba(255,255,255,0.7)',
        fontWeight: '700',
        fontSize: 13,
        textTransform: 'uppercase',
        letterSpacing: 0.8,
    },
    card: {
        flex: 1,
        maxWidth: '48.5%',
        backgroundColor: 'rgba(255,255,255,0.06)',
        borderRadius: 12,
        overflow: 'hidden',
        borderWidth: 1.5,
        borderColor: 'transparent',
    },
    cardSelected: {
        borderColor: '#3b82f6',
    },
    cardPlaceholder: {
        flex: 1,
        maxWidth: '48.5%',
    },
    thumbWrap: {
        width: '100%',
        aspectRatio: 16 / 9,
        backgroundColor: '#111',
    },
    thumbnail: {
        width: '100%',
        height: '100%',
    },
    playOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.45)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    durationBadge: {
        position: 'absolute',
        bottom: 5,
        right: 5,
        backgroundColor: 'rgba(0,0,0,0.65)',
        borderRadius: 4,
        paddingHorizontal: 5,
        paddingVertical: 2,
    },
    durationText: {
        color: 'white',
        fontSize: 10,
        fontWeight: '600',
    },
    cardInfo: {
        padding: 8,
        gap: 4,
    },
    timeText: {
        color: 'white',
        fontSize: 12,
        fontWeight: '700',
    },
    labelBadge: {
        alignSelf: 'flex-start',
        backgroundColor: 'rgba(255,255,255,0.12)',
        borderRadius: 4,
        paddingHorizontal: 6,
        paddingVertical: 2,
    },
    labelBadgeSelected: {
        backgroundColor: 'rgba(59,130,246,0.35)',
    },
    labelText: {
        color: 'rgba(255,255,255,0.85)',
        fontSize: 10,
        fontWeight: '600',
        textTransform: 'capitalize',
    },
    footerLoader: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: 20,
        gap: 8,
    },
    footerText: {
        color: 'rgba(255,255,255,0.5)',
        fontSize: 13,
    },
    footerEnd: {
        paddingVertical: 20,
        alignItems: 'center',
    },
    footerEndText: {
        color: 'rgba(255,255,255,0.25)',
        fontSize: 12,
    },
    emptyContainer: {
        padding: 40,
        alignItems: 'center',
    },
    emptyText: {
        color: 'rgba(255,255,255,0.4)',
        fontSize: 14,
    },
});
