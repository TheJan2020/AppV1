import { StyleSheet } from 'react-native';
import { CF } from './typography';

const CLASH_FACES = new Set(Object.values(CF));

function faceForWeight(weight) {
    const w = String(weight ?? '').toLowerCase();
    if (w === '100' || w === '200' || w === 'ultralight' || w === 'extralight') return CF.extralight;
    if (w === '300' || w === 'light') return CF.light;
    if (w === '500' || w === 'medium') return CF.medium;
    if (w === '600' || w === 'semibold') return CF.semibold;
    if (
        w === '700' || w === '800' || w === '900'
        || w === 'bold' || w === 'heavy' || w === 'black'
    ) {
        return CF.bold;
    }
    return CF.regular;
}

/**
 * Ensure styles use Clash Display. Maps fontWeight → Clash face and strips
 * fontWeight so Android does not look for a non-existent weighted file.
 * Leaves explicit non-Clash families (e.g. monospace) untouched.
 */
export function resolveAppFontStyle(style) {
    if (style == null || style === false) return { fontFamily: CF.regular };

    const flat = StyleSheet.flatten(style) || {};
    const existing = flat.fontFamily;

    if (existing && !CLASH_FACES.has(existing)) {
        return style;
    }

    const fontFamily = existing && CLASH_FACES.has(existing)
        ? existing
        : faceForWeight(flat.fontWeight);

    const next = { ...flat, fontFamily };
    delete next.fontWeight;
    return next;
}
