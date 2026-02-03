import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, SectionList, ActivityIndicator } from 'react-native';
import { BlurView } from 'expo-blur';
import { Play } from 'lucide-react-native';

const BACKEND_URL = (process.env.EXPO_PUBLIC_ADMIN_URL?.replace('/api/config', '') || 'https://mobilev1.primewave1.click').replace(/\/$/, '');

export default function FrigateTimeline({ events, onEventPress, onLoadMore, hasMore, loadingMore, selectedEventId, listRef }) {

    // Group events by Date and Hour
    const sections = useMemo(() => {
        const grouped = {};

        events.forEach(event => {
            const date = new Date(event.start_time * 1000);
            // Force Gregorian/English date
            const dayKey = date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });

            if (!grouped[dayKey]) {
                grouped[dayKey] = [];
            }
            grouped[dayKey].push(event);
        });

        return Object.keys(grouped).map(key => ({
            title: key,
            data: grouped[key]
        }));
    }, [events]);

    const renderItem = ({ item, index, section }) => {
        const date = new Date(item.start_time * 1000);
        // Manual time formatting to ensure correct separation
        const hours = date.getHours();
        const minutes = date.getMinutes();
        const amPm = hours >= 12 ? 'PM' : 'AM';
        const hours12 = hours % 12 || 12;
        const minutesStr = minutes.toString().padStart(2, '0');
        const timeOnly = `${hours12}:${minutesStr}`;

        const isSelected = selectedEventId === item.id;
        const duration = item.end_time ? Math.round(item.end_time - item.start_time) : null;

        return (
            <View style={styles.timelineItem}>
                {/* Left Time Column */}
                <View style={styles.timeColumn}>
                    <View style={styles.timeGroup}>
                        <Text style={styles.timeText}>{timeOnly}</Text>
                        <Text style={styles.amPmText}>{amPm}</Text>
                    </View>
                    {duration && <Text style={styles.durationText}>{duration}s</Text>}
                </View>

                {/* Timeline Line & Dot */}
                <View style={styles.lineColumn}>
                    <View style={styles.lineTop} />
                    <View style={[styles.dot, isSelected && styles.activeDot]} />
                    <View style={styles.lineBottom} />
                </View>

                {/* Event Card */}
                <TouchableOpacity
                    style={[styles.cardContainer, isSelected && styles.activeCard]}
                    onPress={() => onEventPress(item)}
                    activeOpacity={0.7}
                >
                    <Image
                        source={{ uri: `${BACKEND_URL}/api/frigate/events/${item.id}/thumbnail` }}
                        style={styles.thumbnail}
                        resizeMode="cover"
                    />
                    <View style={styles.cardOverlay}>
                        <View style={styles.labelBadge}>
                            <Text style={styles.labelText}>{item.label}</Text>
                        </View>
                        {isSelected && (
                            <View style={styles.playIconOverlay}>
                                <Play size={20} color="white" fill="white" />
                            </View>
                        )}
                    </View>
                </TouchableOpacity>
            </View>
        );
    };

    const renderSectionHeader = ({ section: { title } }) => (
        <View style={styles.sectionHeader}>
            <BlurView intensity={20} tint="dark" style={styles.sectionHeaderBlur}>
                <Text style={styles.sectionHeaderText}>{title}</Text>
            </BlurView>
        </View>
    );

    return (
        <SectionList
            ref={listRef}
            sections={sections}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            renderSectionHeader={renderSectionHeader}
            contentContainerStyle={styles.listContent}
            stickySectionHeadersEnabled={true}
            onEndReached={() => {
                if (hasMore && !loadingMore) onLoadMore();
            }}
            onEndReachedThreshold={0.5}
            ListFooterComponent={
                loadingMore ? (
                    <View style={styles.footerLoader}>
                        <ActivityIndicator color="#fff" />
                    </View>
                ) : (
                    <View style={{ height: 100 }} /> // Spacer
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
        paddingBottom: 40
    },
    sectionHeader: {
        marginBottom: 10,
        marginTop: 20,
        marginHorizontal: 20,
        borderRadius: 8,
        overflow: 'hidden',
    },
    sectionHeaderBlur: {
        paddingVertical: 6,
        paddingHorizontal: 12,
        backgroundColor: 'rgba(255,255,255,0.1)'
    },
    sectionHeaderText: {
        color: 'rgba(255,255,255,0.8)',
        fontWeight: 'bold',
        fontSize: 14,
        textTransform: 'uppercase',
        letterSpacing: 1
    },
    timelineItem: {
        flexDirection: 'row',
        paddingHorizontal: 20,
        height: 100, // Fixed height for consistency
    },
    timeColumn: {
        width: 60,
        alignItems: 'flex-end',
        paddingRight: 10,
        justifyContent: 'center',
    },
    timeGroup: {
        alignItems: 'flex-start', // Align children (Time, AM/PM) to left
    },
    timeText: {
        color: 'white',
        fontSize: 14,
        fontWeight: 'bold',
        marginBottom: 2,
    },
    amPmText: {
        color: 'rgba(255,255,255,0.6)',
        fontSize: 10,
        textTransform: 'uppercase',
        marginTop: 0,
        fontWeight: '600',
    },
    durationText: {
        color: 'rgba(255,255,255,0.5)',
        fontSize: 10,
        marginTop: 2
    },
    lineColumn: {
        width: 20,
        alignItems: 'center',
    },
    lineTop: {
        flex: 1,
        width: 2,
        backgroundColor: 'rgba(255,255,255,0.1)',
    },
    lineBottom: {
        flex: 1,
        width: 2,
        backgroundColor: 'rgba(255,255,255,0.1)',
    },
    dot: {
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: 'rgba(255,255,255,0.3)',
        marginVertical: -1 // Overlap line slightly
    },
    activeDot: {
        backgroundColor: '#3b82f6',
        width: 14,
        height: 14,
        borderRadius: 7
    },
    cardContainer: {
        // flex: 1, // Removed to prevent full expansion
        width: 160, // Fixed narrower width
        marginLeft: 10,
        marginBottom: 10,
        borderRadius: 12,
        overflow: 'hidden',
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)'
    },
    activeCard: {
        borderColor: '#3b82f6',
        borderWidth: 1.5
    },
    thumbnail: {
        width: '100%',
        height: '100%',
        backgroundColor: '#111'
    },
    cardOverlay: {
        ...StyleSheet.absoluteFillObject,
        padding: 8,
        justifyContent: 'space-between'
    },
    labelBadge: {
        backgroundColor: 'rgba(0,0,0,0.6)',
        alignSelf: 'flex-start',
        paddingHorizontal: 8,
        paddingVertical: 4, // Increased padding
        borderRadius: 4
    },
    labelText: {
        color: 'white',
        fontSize: 7, // Drastically smaller
        fontWeight: 'bold',
        textTransform: 'capitalize'
    },
    playIconOverlay: {
        alignSelf: 'center',
        padding: 10
    },
    footerLoader: {
        paddingVertical: 20,
        alignItems: 'center'
    },
    emptyContainer: {
        padding: 40,
        alignItems: 'center'
    },
    emptyText: {
        color: 'rgba(255,255,255,0.4)'
    }
});
