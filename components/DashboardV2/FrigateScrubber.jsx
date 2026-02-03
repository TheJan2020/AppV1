import React, { useMemo, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Dimensions } from 'react-native';

// A vertical ruler for selecting time
export default function FrigateScrubber({ summary, onTimeSelect, selectedTime }) {
    const scrollViewRef = useRef(null);

    // Process summary into a continuous timeline of hours for the last 24h (or based on summary range)
    // Summary is usually: [{ day: '2023-01-01', events: [...], hours: [ { hour: 10, events: [] } ] }]
    // Frigate API returns distinct days. We need to flattening it.

    // For simplicity, let's render the last 24 hours from "now".
    // Or better, render based on the summary data provided.

    const timeBlocks = useMemo(() => {
        // Mocking structure for now or parsing real Frigate summary
        // Frigate summary: array of { date, hours: [ { hour, events } ] }
        // We want to render a vertical list of hours.
        if (!summary || summary.length === 0) return [];

        const blocks = [];
        // Sort summary descending (newest first)
        const sortedSummary = [...summary].sort((a, b) => new Date(b.day) - new Date(a.day));

        sortedSummary.forEach(day => {
            // Hours are usually 0-23. Sort descending for timeline (23 at top, 0 at bottom)
            // or ascending? Frigate UI is usually vertical. 
            // In the screenshot, it looks like a continuous ruler.
            // Let's do descending (Newest at top).

            const hours = [...day.hours].sort((a, b) => b.hour - a.hour);
            hours.forEach(h => {
                blocks.push({
                    id: `${day.day}-${h.hour}`,
                    day: day.day,
                    hour: h.hour,
                    hasData: true // If it exists in summary, it has *some* data usually
                });
            });
        });
        return blocks;
    }, [summary]);

    return (
        <View style={styles.container}>
            <ScrollView
                ref={scrollViewRef}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.scrollContent}
            >
                {timeBlocks.map((block) => (
                    <TouchableOpacity
                        key={block.id}
                        style={styles.hourBlock}
                        onPress={() => {
                            // Construct timestamp for this hour
                            // Select e.g. the start of the hour
                            const dateStr = `${block.day}T${block.hour.toString().padStart(2, '0')}:00:00`;
                            const ts = new Date(dateStr).getTime() / 1000;
                            onTimeSelect(ts);
                        }}
                    >
                        <View style={styles.timeLabelContainer}>
                            <Text style={styles.timeLabel}>
                                {block.hour === 0 ? '12 AM' : block.hour === 12 ? '12 PM' : block.hour > 12 ? `${block.hour - 12} PM` : `${block.hour} AM`}
                            </Text>
                            <Text style={styles.dateLabel}>{block.day}</Text>
                        </View>

                        {/* Ruler Ticks */}
                        <View style={styles.rulerContainer}>
                            <View style={styles.tickMajor} />
                            <View style={styles.tickMinor} />
                            <View style={styles.tickMinor} />
                            <View style={styles.tickMinor} />
                            {block.hasData && <View style={styles.dataIndicator} />}
                        </View>
                    </TouchableOpacity>
                ))}
            </ScrollView>

            {/* Center Line Indicator (fixed overlay) */}
            <View style={styles.centerLine} pointerEvents="none" />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        width: 80,
        backgroundColor: 'rgba(0,0,0,0.3)',
        borderLeftWidth: 1,
        borderLeftColor: 'rgba(255,255,255,0.1)',
    },
    scrollContent: {
        paddingVertical: 100
    },
    hourBlock: {
        height: 60, // 60px per hour = 1px per minute
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'flex-end',
        paddingRight: 10,
        position: 'relative'
    },
    timeLabelContainer: {
        marginRight: 10,
        alignItems: 'flex-end'
    },
    timeLabel: {
        color: 'white',
        fontSize: 10,
        fontWeight: 'bold'
    },
    dateLabel: {
        color: 'rgba(255,255,255,0.5)',
        fontSize: 8,
    },
    rulerContainer: {
        width: 10,
        height: '100%',
        alignItems: 'center',
        borderRightWidth: 1,
        borderRightColor: 'rgba(255,255,255,0.2)'
    },
    tickMajor: {
        width: 10,
        height: 1,
        backgroundColor: 'rgba(255,255,255,0.5)',
        position: 'absolute',
        top: 0
    },
    tickMinor: { // Visual filler
        width: 4,
        height: 1,
        backgroundColor: 'rgba(255,255,255,0.2)',
        marginTop: 15
    },
    dataIndicator: {
        position: 'absolute',
        right: -2,
        top: 0,
        bottom: 0,
        width: 4,
        backgroundColor: '#f59e0b', // Amber for recordings
        borderRadius: 2
    },
    centerLine: {
        position: 'absolute',
        top: '50%',
        left: 0,
        right: 0,
        height: 2,
        backgroundColor: 'red',
        zIndex: 10
    }
});
