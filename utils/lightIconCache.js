export {
    ensureLocalLightIconLoaded as ensureLightIconLoaded,
    getLocalLightIconXml as getTintedLightIconXml,
    hasLocalLightIcon as hasLightIconCached,
    preloadLocalLightIcons,
    preloadLocalLightIcons as preloadLightTypeIcons,
    subscribeLightIconCache,
    tintSvgXml,
} from './lightTypeAssets';

/** Icons are bundled locally — remote URLs are no longer used. */
export function buildLightIconUrl() {
    return null;
}
