/**
 * Cover control button layout — Figma: curtains = left/right, shutter/roll = down/up.
 */

export const HORIZONTAL_COVER_TYPES = [
    'curtain_middle',
    'curtain_left',
    'curtain_right',
    'curtain_roll',
];

export const VERTICAL_COVER_TYPES = ['shutter', 'garage'];

/**
 * @param {object} cover
 * @returns {string}
 */
export function resolveCoverType(cover) {
    const explicit = cover?.coverType;
    if (explicit) return explicit;

    const haystack = [
        cover?.displayName,
        cover?.entity_id,
        cover?.stateObj?.attributes?.friendly_name,
    ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

    if (haystack.includes('garage')) return 'garage';
    if (haystack.includes('shutter') || haystack.includes('rolluik')) return 'shutter';
    if (haystack.includes('roll') && !haystack.includes('scroll')) return 'curtain_roll';
    if (/\bleft\b/.test(haystack) || haystack.includes(' links')) return 'curtain_left';
    if (/\bright\b/.test(haystack) || haystack.includes(' rechts')) return 'curtain_right';
    if (
        haystack.includes('middle')
        || haystack.includes('midden')
        || haystack.includes('master')
        || haystack.includes('blackout')
        || haystack.includes('chiffon')
    ) {
        return 'curtain_middle';
    }

    return 'curtain_middle';
}

/** @param {string} coverType */
export function usesVerticalControls(coverType) {
    return coverType === 'shutter' || coverType === 'garage' || coverType === 'curtain_roll';
}

/**
 * Chevron directions for close (left btn) and open (right btn).
 * @param {string} coverType
 * @param {boolean} isOpen
 * @returns {{ close: 'up'|'down'|'left'|'right', open: 'up'|'down'|'left'|'right' }}
 */
export function getCoverControlIcons(coverType, isOpen) {
    if (usesVerticalControls(coverType)) {
        return { close: 'down', open: 'up' };
    }

    if (coverType === 'curtain_middle') {
        return isOpen
            ? { close: 'right', open: 'left' }
            : { close: 'left', open: 'right' };
    }

    if (coverType === 'curtain_left') {
        return isOpen
            ? { close: 'right', open: 'right' }
            : { close: 'left', open: 'left' };
    }

    if (coverType === 'curtain_right') {
        return isOpen
            ? { close: 'left', open: 'left' }
            : { close: 'right', open: 'right' };
    }

    return isOpen
        ? { close: 'right', open: 'left' }
        : { close: 'left', open: 'right' };
}
