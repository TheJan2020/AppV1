/**
 * Pick cover window sky background from time + Home Assistant weather entity.
 */

const COVER_SKY_ASSETS = {
    sunny_day: require('../assets/sunny_day.png'),
    cloudy_day: require('../assets/cloudy_day.png'),
    rainy_day: require('../assets/rainy_day.png'),
    clear_night: require('../assets/clear_night.png'),
    cloudy_night: require('../assets/cloudy_night.png'),
    rainy_night: require('../assets/rainy_night.png'),
};

/** @typedef {'sunny' | 'cloudy' | 'rainy'} CoverSkyCondition */

/**
 * @param {string} [state] HA weather.state
 * @returns {CoverSkyCondition}
 */
export function classifyCoverSkyCondition(state) {
    const s = String(state || '').toLowerCase();
    if (
        s.includes('rain')
        || s.includes('drizzle')
        || s.includes('pour')
        || s.includes('shower')
    ) {
        return 'rainy';
    }
    if (
        s.includes('lightning')
        || s.includes('thunder')
        || s.includes('storm')
    ) {
        return 'rainy';
    }
    if (
        s.includes('cloud')
        || s.includes('overcast')
        || s.includes('partly')
        || s.includes('fog')
        || s.includes('mist')
        || s.includes('haze')
        || s.includes('snow')
        || s.includes('hail')
        || s.includes('wind')
    ) {
        return 'cloudy';
    }
    return 'sunny';
}

/**
 * @param {object} [weather] HA weather entity
 * @param {Date} [now]
 */
export function isCoverSkyNight(weather, now = new Date()) {
    const state = String(weather?.state || '').toLowerCase();
    if (state.includes('night') || state.endsWith('-night')) {
        return true;
    }

    const attrs = weather?.attributes || {};
    const sunrise = parseHaTime(attrs.sunrise, now);
    const sunset = parseHaTime(attrs.sunset, now);
    if (sunrise != null && sunset != null) {
        const t = now.getTime();
        return t < sunrise || t >= sunset;
    }

    const hour = now.getHours();
    return hour < 6 || hour >= 20;
}

function parseHaTime(value, refDate) {
    if (value == null || value === '') return null;
    if (typeof value === 'number') {
        const ms = value < 1e12 ? value * 1000 : value;
        return Number.isNaN(ms) ? null : ms;
    }
    const s = String(value);
    if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(s)) {
        const parts = s.split(':').map(Number);
        const d = new Date(refDate);
        d.setHours(parts[0], parts[1], parts[2] || 0, 0, 0);
        return d.getTime();
    }
    const parsed = Date.parse(s);
    return Number.isNaN(parsed) ? null : parsed;
}

/**
 * @param {object} [weather]
 * @param {Date} [now]
 * @returns {number} require() image source
 */
export function getCoverWindowBackgroundSource(weather, now = new Date()) {
    const condition = classifyCoverSkyCondition(weather?.state);
    const night = isCoverSkyNight(weather, now);

    if (night) {
        if (condition === 'rainy') return COVER_SKY_ASSETS.rainy_night;
        if (condition === 'cloudy') return COVER_SKY_ASSETS.cloudy_night;
        return COVER_SKY_ASSETS.clear_night;
    }
    if (condition === 'rainy') return COVER_SKY_ASSETS.rainy_day;
    if (condition === 'cloudy') return COVER_SKY_ASSETS.cloudy_day;
    return COVER_SKY_ASSETS.sunny_day;
}
