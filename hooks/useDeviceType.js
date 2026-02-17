import { useWindowDimensions, Platform } from 'react-native';

const TABLET_MIN_WIDTH = 768;

export default function useDeviceType() {
    const { width, height } = useWindowDimensions();

    // Consider tablet if the shorter dimension is >= 768 (iPad minimum)
    const shortSide = Math.min(width, height);
    const isTablet = shortSide >= TABLET_MIN_WIDTH;

    const isLandscape = width > height;

    // Column count for grids
    let columns = 2; // phone default
    if (isTablet) {
        columns = isLandscape ? 4 : 3;
    }

    return {
        isTablet,
        isLandscape,
        screenWidth: width,
        screenHeight: height,
        columns
    };
}
