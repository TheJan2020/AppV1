
import React from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Circle, Line, Path, Text as SvgText, G } from 'react-native-svg';

export default function AnalogClockPresence({ intervals = [], type = 'AM', size = 200 }) {
    const radius = size / 2;
    const center = size / 2;
    const isPM = type === 'PM';

    // Filter relevant intervals
    // AM: 00:00 - 11:59 (0 - 12 hours)
    // PM: 12:00 - 23:59 (12 - 24 hours)
    const validIntervals = intervals.filter(i => {
        const start = new Date(i.start);
        const end = new Date(i.end);
        const startH = start.getHours();
        const endH = end.getHours();

        // Simple overlap check
        if (isPM) return endH >= 12;
        return startH < 12;
    });

    // Helper to get angle from time (0-12 scale)
    const getAngle = (date) => {
        let h = date.getHours();
        const m = date.getMinutes();
        if (isPM) h -= 12;
        if (h < 0) h = 0; // clamp
        // 12h = 360 deg, 1h = 30 deg, 1m = 0.5 deg
        // Start from -90 deg (12 o'clock)
        return (h * 30) + (m * 0.5) - 90;
    };

    const createArc = (start, end) => {
        const startAngle = getAngle(new Date(start));
        const endAngle = getAngle(new Date(end));

        // Convert to radians
        const startRad = (startAngle * Math.PI) / 180;
        const endRad = (endAngle * Math.PI) / 180;

        // Points
        const x1 = center + (radius - 10) * Math.cos(startRad);
        const y1 = center + (radius - 10) * Math.sin(startRad);
        const x2 = center + (radius - 10) * Math.cos(endRad);
        const y2 = center + (radius - 10) * Math.sin(endRad);

        // SVG Path Arc Command
        const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";

        return `M ${center} ${center} L ${x1} ${y1} A ${radius - 10} ${radius - 10} 0 ${largeArcFlag} 1 ${x2} ${y2} Z`;
    };

    // Render 12 Hour Marks
    const renderMarks = () => {
        const marks = [];
        for (let i = 0; i < 12; i++) {
            const angle = (i * 30) - 90;
            const rad = (angle * Math.PI) / 180;
            const x1 = center + (radius - 5) * Math.cos(rad);
            const y1 = center + (radius - 5) * Math.sin(rad);
            const x2 = center + radius * Math.cos(rad);
            const y2 = center + radius * Math.sin(rad);
            marks.push(<Line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#666" strokeWidth={2} />);
        }
        return marks;
    };

    return (
        <View style={{ alignItems: 'center' }}>
            <Svg height={size} width={size}>
                {/* Clock Face Background */}
                <Circle cx={center} cy={center} r={radius} stroke="#333" strokeWidth="2" fill="rgba(0,0,0,0.3)" />

                {/* Intervals (Slices) */}
                {validIntervals.map((int, idx) => {
                    // Clamp start/end to current AM/PM period
                    let s = new Date(int.start);
                    let e = new Date(int.end);

                    if (!isPM) { // AM
                        if (s.getHours() >= 12) s.setHours(12, 0, 0, 0); // Should be filtered out but just in case
                        if (e.getHours() >= 12) e.setHours(11, 59, 59, 999);
                    } else { // PM
                        if (s.getHours() < 12) s.setHours(12, 0, 0, 0);
                    }

                    if (s >= e) return null;

                    return (
                        <Path
                            key={idx}
                            d={createArc(s, e)}
                            fill="rgba(137, 71, 202, 0.6)" // Theme purple
                            stroke="rgba(137, 71, 202, 1)"
                            strokeWidth={1}
                        />
                    );
                })}

                {/* Marks & Numbers */}
                {renderMarks()}

                {/* Center Dot */}
                <Circle cx={center} cy={center} r="3" fill="#fff" />
            </Svg>
            <ReactText style={styles.label}>{type}</ReactText>
        </View>
    );
}

import { Text as ReactText } from 'react-native';

const styles = StyleSheet.create({
    label: {
        color: 'white',
        marginTop: 5,
        fontWeight: 'bold',
        fontSize: 16
    }
});
