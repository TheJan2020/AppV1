/**
 * Cover card fabric colors — Figma: shutter = blue slats, chiffon name = green transparent, else purple.
 */

/** Figma pleat / bar width (px) — each vertical rib width */
export const PLEAT_BAR_WIDTH = 24;

/** Figma frame border — 2px, linear-gradient(180deg, #E5E5E5 → #7F7F7F) */
export const COVER_BORDER_WIDTH = 2;
export const COVER_BORDER_GRADIENT = ['#E5E5E5', '#7F7F7F'];

const DEFAULT_EVEN = ['#9f5ff5', '#5b21b6', '#7c3aed'];
const DEFAULT_ODD = ['#6d28d9', '#a855f7', '#6d28d9'];

/** Shutter slats — cyan/blue from design */
const SHUTTER_EVEN = ['#6EC4F0', '#3A9AD4', '#5BB8E8'];
const SHUTTER_ODD = ['#2E8BC9', '#7ECBF5', '#2E8BC9'];
const SHUTTER_PLEAT = ['#3588BE', '#4298CE', '#3588BE'];

/** Chiffon — seafoam green pleats (consistent at every position) */
const CHIFFON_EVEN = ['rgba(72, 168, 152, 0.78)', 'rgba(52, 138, 124, 0.85)', 'rgba(72, 168, 152, 0.78)'];
const CHIFFON_ODD = ['rgba(52, 138, 124, 0.68)', 'rgba(95, 195, 178, 0.75)', 'rgba(52, 138, 124, 0.68)'];
const CHIFFON_PLEAT = ['#3D8F82', '#52A898', '#3D8F82'];

/** Blackout — soft purple pleats */
const BLACKOUT_EVEN = ['#8B5CF6', '#5B21B6', '#7C3AED'];
const BLACKOUT_ODD = ['#6D28D9', '#A855F7', '#6D28D9'];
const BLACKOUT_PLEAT = ['#6450A0', '#7560B0', '#6450A0'];

const DEFAULT_PLEAT = ['#4C1D95', '#A855F7', '#6D28D9'];

const PLEAT_BAR_PROPS = {
    pleatBarWidth: PLEAT_BAR_WIDTH,
};

export function isChiffonCover(cover) {
    if (cover?.coverLayer === 'chiffon') return true;
    const haystack = [
        cover?.displayName,
        cover?.stateObj?.attributes?.friendly_name,
        cover?.entity_id,
    ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
    return haystack.includes('chiffon');
}

export function getCoverVisualStyle(cover) {
    const layer = String(cover?.coverLayer || '').toLowerCase();

    if (layer === 'chiffon' || isChiffonCover(cover)) {
        return {
            variant: 'chiffon',
            foldStyle: 'pleats',
            stripeEven: CHIFFON_EVEN,
            stripeOdd: CHIFFON_ODD,
            pleatBarColors: CHIFFON_PLEAT,
            ...PLEAT_BAR_PROPS,
            panelOpacity: 0.62,
            dividerColor: 'rgba(120, 200, 185, 0.45)',
            frameBorder: 'rgba(160, 220, 210, 0.72)',
            showWindowGrid: true,
            useSimpleView: true,
        };
    }

    const coverType = String(cover?.coverType || '').toLowerCase();
    if (layer === 'shutter' || coverType === 'shutter') {
        return {
            variant: 'shutter',
            foldStyle: 'slats',
            stripeEven: SHUTTER_EVEN,
            stripeOdd: SHUTTER_ODD,
            pleatBarColors: SHUTTER_PLEAT,
            ...PLEAT_BAR_PROPS,
            panelOpacity: 1,
            dividerColor: '#4BA6DC',
            frameBorder: 'rgba(75, 166, 220, 0.55)',
            showWindowGrid: true,
            useSimpleView: false,
        };
    }

    if (layer === 'blackout') {
        return {
            variant: 'blackout',
            foldStyle: 'pleats',
            stripeEven: BLACKOUT_EVEN,
            stripeOdd: BLACKOUT_ODD,
            pleatBarColors: BLACKOUT_PLEAT,
            ...PLEAT_BAR_PROPS,
            panelOpacity: 1,
            dividerColor: '#7c3aed',
            frameBorder: 'rgba(137, 71, 202, 0.72)',
            showWindowGrid: true,
            useSimpleView: true,
        };
    }

    return {
        variant: 'default',
        foldStyle: 'pleats',
        stripeEven: DEFAULT_EVEN,
        stripeOdd: DEFAULT_ODD,
        pleatBarColors: DEFAULT_PLEAT,
        ...PLEAT_BAR_PROPS,
        panelOpacity: 1,
        dividerColor: '#7c3aed',
        frameBorder: 'rgba(255,255,255,0.18)',
        showWindowGrid: true,
        useSimpleView: false,
    };
}
