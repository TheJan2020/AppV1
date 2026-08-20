/**
 * Turn Home Assistant WebSocket / service errors into short UI copy.
 */

export function isEmptyQueueError(message) {
    const lower = String(message ?? '').toLowerCase();
    return (
        (lower.includes('queue') && lower.includes('empty')) ||
        (lower.includes('no active') && lower.includes('queue')) ||
        lower.includes('resume queue requested')
    );
}

/** Last playable item from a media_player state object. */
export function getLastPlayedMedia(attributes = {}) {
    const media_content_id = attributes.media_content_id;
    if (!media_content_id || typeof media_content_id !== 'string') return null;
    return {
        media_content_id,
        media_content_type: attributes.media_content_type || 'music',
        media_title: attributes.media_title,
    };
}

export function formatHaServiceError(message, context = {}) {
    const raw = message != null ? String(message).trim() : '';
    const lower = raw.toLowerCase();
    const displayName = context.displayName || context.entityName || 'this player';

    if (lower.includes('queue') && lower.includes('empty')) {
        const queueMatch = raw.match(/queue\s+(.+?)\s+is empty/i);
        const queueName = queueMatch?.[1]?.trim() || displayName;
        return {
            title: 'Nothing to play',
            body: `The queue for “${queueName}” is empty. Open Song List and choose a track first.`,
        };
    }

    if (lower.includes('no active') && lower.includes('queue')) {
        return {
            title: 'Nothing to play',
            body: 'There is no active queue. Pick a song from Song List to start playback.',
        };
    }

    if (lower.includes('not supported') || lower.includes('unsupported')) {
        return {
            title: 'Not supported',
            body: 'This player does not support that action in Home Assistant.',
        };
    }

    if (lower.includes('unavailable')) {
        return {
            title: 'Player unavailable',
            body: `${displayName} is unavailable in Home Assistant right now.`,
        };
    }

    const rangeMatch = raw.match(/accepted range is\s+([\d.]+)\s+to\s+([\d.]+)/i);
    const providedTempMatch = raw.match(/provided temperature\s+([\d.]+)/i);
    if (rangeMatch || (lower.includes('validation error') && lower.includes('temperature'))) {
        const min = rangeMatch?.[1];
        const max = rangeMatch?.[2];
        const provided = providedTempMatch?.[1];
        let body = raw.replace(/^validation error:\s*/i, '').trim();
        if (min && max) {
            body = provided
                ? `Temperature ${provided}°C is outside the allowed range (${min}°C–${max}°C).`
                : `Temperature must be between ${min}°C and ${max}°C.`;
        }
        return {
            title: 'Temperature out of range',
            body,
        };
    }

    let body = raw
        .replace(/^Failed to perform the action\s+[\w./]+\.\s*/i, '')
        .replace(/^Home Assistant error:\s*/i, '')
        .trim();

    if (!body) {
        body = 'Home Assistant could not run this command. Try again or pick a track from Song List.';
    }

    const action = context.action || 'action';
    const title =
        action === 'media_play'
            ? 'Could not start playback'
            : action === 'media_pause'
              ? 'Could not pause'
              : action === 'turn_on'
                ? 'Could not turn on'
                : action === 'turn_off'
                  ? 'Could not turn off'
                  : action === 'select_source'
                    ? 'Could not open app'
              : action === 'set_temperature'
                ? 'Could not set temperature'
                : action === 'set_hvac_mode'
                  ? 'Could not change mode'
                  : 'Something went wrong';

    return { title, body };
}
