import { useMemo, useState, useEffect } from 'react';
import { View, Image, StyleSheet } from 'react-native';
import { getCoverWindowBackgroundSource } from '../../utils/coverWeatherBackground';

/**
 * Weather/time sky visible through cover window openings.
 */
export default function CoverWindowSky({ weather, style }) {
    const [tick, setTick] = useState(0);

    useEffect(() => {
        const id = setInterval(() => setTick((t) => t + 1), 60_000);
        return () => clearInterval(id);
    }, []);

    const source = useMemo(
        () => getCoverWindowBackgroundSource(weather),
        [weather?.state, weather?.attributes?.sunrise, weather?.attributes?.sunset, tick],
    );

    return (
        <View style={[styles.skyWrap, style]} pointerEvents="none">
            <Image
                source={source}
                style={styles.sky}
                resizeMode="contain"
                accessibilityIgnoresInvertColors
            />
        </View>
    );
}

const SKY_SIZE = 136;

const styles = StyleSheet.create({
    skyWrap: {
        ...StyleSheet.absoluteFillObject,
        alignItems: 'center',
        justifyContent: 'center',
    },
    sky: {
        width: SKY_SIZE,
        height: SKY_SIZE,
        borderRadius: SKY_SIZE / 2,
    },
});
