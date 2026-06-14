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
        // Panel hangs left — close expands →, open pulls back ←
        return { close: 'right', open: 'left' };
    }

    if (coverType === 'curtain_right') {
        // Panel hangs right — close expands →, open pulls back ←
        return { close: 'right', open: 'left' };
    }

    return isOpen
        ? { close: 'right', open: 'left' }
        : { close: 'left', open: 'right' };
}

/**
 * Map touch X (view coords) to cover open percentage 0–100.
 * Matches panel/handle layout for middle, left-hung, and right-hung curtains.
 */
export function coverPositionFromTouchX(x, frameWidth, coverType) {
    'worklet';
    const fw = frameWidth;
    if (!fw || fw <= 0) return 0;

    let pos;
    if (coverType === 'curtain_middle') {
        const halfW = fw * 0.5;
        const distFromEdge = Math.min(x, fw - x);
        pos = (distFromEdge / halfW) * 100;
    } else if (coverType === 'curtain_right') {
        pos = 100 - ((fw - x) / fw) * 100;
    } else if (coverType === 'curtain_left') {
        pos = 100 - (x / fw) * 100;
    } else {
        const halfW = fw * 0.5;
        const distFromEdge = Math.min(x, fw - x);
        pos = (distFromEdge / halfW) * 100;
    }

    return Math.max(0, Math.min(100, pos));
}

/**
 * Pan delta for middle curtains — drag right spreads panels (opens), drag left closes.
 * Left/right curtains use absolute touch via coverPositionFromTouchX.
 */
export function coverPositionFromPanDelta(startPos, translationX, frameWidth, coverType) {
    'worklet';
    const fw = frameWidth;
    if (!fw || fw <= 0) return startPos;
    const maxW = coverType === 'curtain_middle' ? fw * 0.5 : fw;
    const delta = (translationX / maxW) * 100;
    return Math.max(0, Math.min(100, startPos + delta));
}

/** Map touch X inside an outer panel to frame coords (for All-tab drag on top layer only). */
export function coverPositionFromPanelTouchX(xInPanel, panelWidth, frameWidth, coverType) {
    'worklet';
    const fw = frameWidth;
    if (!fw || fw <= 0) return 0;

    let frameX = xInPanel;
    if (coverType === 'curtain_right') {
        frameX = fw - panelWidth + xInPanel;
    } else if (coverType === 'curtain_middle') {
        const halfW = fw * 0.5;
        if (xInPanel <= panelWidth) {
            frameX = xInPanel;
        } else {
            frameX = fw - panelWidth + (xInPanel - (fw - panelWidth));
        }
    }
    // curtain_left: panel anchored left, xInPanel is already frame X

    return coverPositionFromTouchX(frameX, fw, coverType);
}
