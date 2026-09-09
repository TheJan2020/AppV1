import { Buffer } from 'buffer';
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';

/**
 * Load an authenticated JPEG via fetch and return a data URI.
 * Android Image/WebView often drop Authorization headers; this does not.
 * Use only for live snapshot polling — not event grids.
 */
export async function loadAuthedImageDataUri(url, headers = {}) {
    const res = await fetch(url, { headers });
    if (!res.ok) {
        throw new Error(`image ${res.status}`);
    }
    const contentType = (res.headers.get('content-type') || '').split(';')[0].trim();
    if (contentType.includes('json') || contentType.includes('text/html')) {
        throw new Error(`image content-type ${contentType || 'unknown'}`);
    }
    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.byteLength < 32) {
        throw new Error('image too small');
    }
    const mime = contentType.startsWith('image/') ? contentType : 'image/jpeg';
    return `data:${mime};base64,${bytes.toString('base64')}`;
}

function cachePathForUrl(url) {
    let hash = 0;
    const s = String(url);
    for (let i = 0; i < s.length; i += 1) {
        hash = ((hash << 5) - hash + s.charCodeAt(i)) | 0;
    }
    return `${FileSystem.cacheDirectory}frigate_img_${Math.abs(hash).toString(16)}.jpg`;
}

/**
 * Native download with Authorization headers. Avoids JS-thread base64 and
 * Android Image dropping auth headers.
 */
export async function downloadAuthedImageToCache(url, headers = {}) {
    if (Platform.OS !== 'android') return url;

    const dest = cachePathForUrl(url);
    const existing = await FileSystem.getInfoAsync(dest);
    if (existing.exists && existing.size > 32) return dest;

    const result = await FileSystem.downloadAsync(url, dest, { headers });
    const contentType = String(
        result.headers?.['Content-Type'] || result.headers?.['content-type'] || ''
    ).toLowerCase();
    if (
        result.status < 200
        || result.status >= 300
        || contentType.includes('json')
        || contentType.includes('text/html')
    ) {
        await FileSystem.deleteAsync(dest, { idempotent: true }).catch(() => {});
        throw new Error(`image ${result.status}`);
    }
    return result.uri || dest;
}

function bustUrl(url) {
    return `${url}${url.includes('?') ? '&' : '?'}t=${Date.now()}`;
}

/**
 * One live snapshot frame to a unique file so expo-image reloads it.
 */
export async function downloadLiveFrame(url, headers = {}, instanceId = 'cam') {
    const dest = `${FileSystem.cacheDirectory}live_${instanceId}_${Date.now()}.jpg`;
    const result = await FileSystem.downloadAsync(bustUrl(url), dest, { headers });
    const contentType = String(
        result.headers?.['Content-Type'] || result.headers?.['content-type'] || ''
    ).toLowerCase();
    if (
        result.status < 200
        || result.status >= 300
        || contentType.includes('json')
        || contentType.includes('text/html')
    ) {
        await FileSystem.deleteAsync(dest, { idempotent: true }).catch(() => {});
        throw new Error(`image ${result.status}`);
    }
    return result.uri || dest;
}
