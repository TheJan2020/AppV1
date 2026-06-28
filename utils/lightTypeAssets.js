import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system/legacy';

/** Bundled light icons — names match admin dashboard Light Types. */
const LIGHT_TYPE_ASSETS = {
    'up lights': require('../assets/Up Lights.svg'),
    'spot light': require('../assets/Spot Light.svg'),
    'chandelier': require('../assets/Chandelier.svg'),
    'track light': require('../assets/Track Light.svg'),
    'coved led': require('../assets/Coved LED.svg'),
    'generic bulb': require('../assets/Generic Bulb.svg'),
};

const TYPE_NAME_ALIASES = {
    chandlier: 'chandelier',
    'cove led': 'coved led',
    flood: 'spot light',
    'flood light': 'spot light',
    grill: 'track light',
    'grill light': 'track light',
    ball: 'generic bulb',
    'ball light': 'generic bulb',
    cylinder: 'generic bulb',
    'cylinder light': 'generic bulb',
    bulb: 'generic bulb',
};

const PRE_TINT_COLORS = ['#ffffff', '#000000'];

const rawModuleCache = new Map();
const tintedXmlCache = new Map();
const inflightLoads = new Map();
const cacheListeners = new Set();

function notifyListeners() {
    cacheListeners.forEach((listener) => listener());
}

export function subscribeLightIconCache(listener) {
    cacheListeners.add(listener);
    return () => cacheListeners.delete(listener);
}

function normalizeTypeKey(name) {
    return String(name || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

function resolveAssetKey(typeName) {
    const key = normalizeTypeKey(typeName);
    const aliased = TYPE_NAME_ALIASES[key] || key;
    return LIGHT_TYPE_ASSETS[aliased] ? aliased : null;
}

export function hasLocalLightIcon(typeName) {
    return !!resolveAssetKey(typeName);
}

export const DEFAULT_LIGHT_TYPE_NAME = 'Generic Bulb';

/** Use the mapped type when bundled; otherwise fall back to Generic Bulb. */
export function resolveLightTypeName(typeName) {
    if (typeName && hasLocalLightIcon(typeName)) return typeName;
    return DEFAULT_LIGHT_TYPE_NAME;
}

/** Spot Light and Coved LED keep the larger render scale; others are slightly smaller. */
export function getLightIconRenderMultiplier(typeName) {
    const key = resolveAssetKey(typeName);
    if (key === 'spot light' || key === 'coved led') return 1.25;
    return 1.05;
}

function sanitizeSvg(svgText) {
    return String(svgText || '')
        .replace(/<\?xml[^?]*\?>/gi, '')
        .replace(/<!DOCTYPE[^>]*>/gi, '')
        .replace(/<!--[\s\S]*?-->/g, '')
        .trim();
}

export function tintSvgXml(svgText, color) {
    let svg = sanitizeSvg(svgText);
    if (!svg) return '';

    svg = svg.replace(/fill="(?!none)[^"]*"/gi, `fill="${color}"`);
    svg = svg.replace(/fill:'(?!none)[^']*'/gi, `fill:'${color}'`);
    svg = svg.replace(/fill:(?!none)[#a-zA-Z0-9]+/gi, `fill:${color}`);
    svg = svg.replace(/stroke="(?!none)[^"]*"/gi, `stroke="${color}"`);
    svg = svg.replace(/stroke:(?!none)[#a-zA-Z0-9]+/gi, `stroke:${color}`);

    if (!/<svg[^>]*fill=/i.test(svg)) {
        svg = svg.replace(/<svg/i, `<svg fill="${color}"`);
    }

    return svg;
}

async function loadAssetModule(module) {
    if (rawModuleCache.has(module)) return rawModuleCache.get(module);

    let pending = inflightLoads.get(module);
    if (!pending) {
        pending = (async () => {
            const asset = Asset.fromModule(module);
            await asset.downloadAsync();
            const uri = asset.localUri ?? asset.uri;
            const text = await FileSystem.readAsStringAsync(uri);
            rawModuleCache.set(module, text);
            inflightLoads.delete(module);
            PRE_TINT_COLORS.forEach((color) => {
                const tinted = tintSvgXml(text, color);
                if (tinted.includes('<svg')) {
                    tintedXmlCache.set(`${module}::${color}`, tinted);
                }
            });
            notifyListeners();
            return text;
        })().catch((err) => {
            inflightLoads.delete(module);
            throw err;
        });
        inflightLoads.set(module, pending);
    }
    return pending;
}

/** Load all bundled light SVGs once at app start. */
export function preloadLocalLightIcons() {
    const modules = [...new Set(Object.values(LIGHT_TYPE_ASSETS))];
    return Promise.all(modules.map(loadAssetModule));
}

export async function ensureLocalLightIconLoaded(typeName) {
    const key = resolveAssetKey(typeName);
    if (!key) return null;
    return loadAssetModule(LIGHT_TYPE_ASSETS[key]);
}

export function getLocalLightIconXml(typeName, color) {
    const key = resolveAssetKey(typeName);
    if (!key) return null;

    const module = LIGHT_TYPE_ASSETS[key];
    const tintKey = `${module}::${color}`;
    const cached = tintedXmlCache.get(tintKey);
    if (cached) return cached;

    const raw = rawModuleCache.get(module);
    if (!raw) return null;

    const tinted = tintSvgXml(raw, color);
    if (!tinted.includes('<svg')) return null;
    tintedXmlCache.set(tintKey, tinted);
    return tinted;
}
