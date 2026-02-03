/**
 * Extract YouTube video ID from various URL formats
 * @param {string} url - YouTube URL
 * @returns {string|null} - Video ID or null if invalid
 */
export function extractYouTubeVideoId(url) {
    if (!url) return null;

    const patterns = [
        // Standard watch URL
        /(?:youtube\.com\/watch\?v=)([^&\n?#]+)/,
        // Short URL
        /(?:youtu\.be\/)([^&\n?#]+)/,
        // Mobile URL
        /(?:m\.youtube\.com\/watch\?v=)([^&\n?#]+)/,
        // Embed URL
        /(?:youtube\.com\/embed\/)([^&\n?#]+)/,
        // Shorts URL
        /(?:youtube\.com\/shorts\/)([^&\n?#]+)/,
    ];

    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match && match[1]) {
            return match[1];
        }
    }

    return null;
}

/**
 * Validate if a URL is a valid YouTube URL
 * @param {string} url - URL to validate
 * @returns {boolean} - True if valid YouTube URL
 */
export function isValidYouTubeUrl(url) {
    return extractYouTubeVideoId(url) !== null;
}

/**
 * Format YouTube URL for specific media player type
 * @param {string} videoId - YouTube video ID
 * @param {string} playerType - 'appletv' or 'lgtv' or 'default'
 * @returns {string} - Formatted URL
 */
export function formatYouTubeUrl(videoId, playerType = 'default') {
    if (playerType === 'appletv') {
        // Apple TV uses youtube:// protocol
        return `youtube://www.youtube.com/watch?v=${videoId}`;
    } else {
        // LG TV and others use standard HTTPS URL
        return `https://www.youtube.com/watch?v=${videoId}`;
    }
}

/**
 * Detect media player type from entity_id
 * @param {string} entityId - Media player entity ID
 * @returns {string} - Player type: 'appletv', 'lgtv', or 'default'
 */
export function detectPlayerType(entityId) {
    const id = entityId.toLowerCase();

    if (id.includes('apple_tv') || id.includes('appletv')) {
        return 'appletv';
    } else if (id.includes('lg') || id.includes('webos')) {
        return 'lgtv';
    }

    return 'default';
}
