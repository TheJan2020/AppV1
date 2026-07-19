import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { getActiveProfileConfig } from '../services/profile';

const BUTLER_API_PREFIX = '/api/butler';

/** Direct Butlerv1 on Mac (local dev fallback only — no in-app UI for this). */
const DIRECT_DEV_DEFAULT = 'http://127.0.0.1:8787';

function readExtraUrl() {
    const extra = Constants.expoConfig?.extra ?? {};
    const url = extra.BUTLER_BACKEND_URL || extra.butlerBackendUrl;
    if (typeof url === 'string' && url.length > 0) return url.replace(/\/$/, '');
    return null;
}

function getDevMachineHostFromMetro() {
    const hostUri =
        Constants.expoConfig?.hostUri
        ?? Constants.expoGoConfig?.debuggerHost
        ?? Constants.manifest2?.extra?.expoClient?.hostUri;
    if (!hostUri || typeof hostUri !== 'string') return null;
    const host = hostUri.split(':')[0]?.trim();
    if (!host || host === 'localhost' || host === '127.0.0.1') return null;
    return host;
}

function parseButlerUrl(raw) {
    let s = String(raw || '').trim().replace(/\/$/, '');
    if (!s) return null;
    if (!/^https?:\/\//i.test(s)) s = `http://${s}`;
    return new URL(s);
}

/** True when URL goes through AppBackend proxy (HTTPS), not direct LAN Butler. */
function isProxiedButlerBase(url) {
    return /\/api\/butler\/?$/i.test(url) || url.includes('/api/butler/');
}

/**
 * Production path: profile adminUrl (HTTPS) + /api/butler → AppBackendV1 proxies to BUTLER_URL.
 */
export function butlerApiBaseFromAdminUrl(adminUrl) {
    const base = String(adminUrl || '').trim().replace(/\/$/, '');
    if (!base) return null;
    return `${base}${BUTLER_API_PREFIX}`;
}

/**
 * Local direct Butler only (dev fallback via app.json extra.BUTLER_BACKEND_URL,
 * never the production path). Rewrites 127.0.0.1 → Mac LAN IP on device.
 */
function resolveDirectButlerUrl(url) {
    let parsed;
    try {
        parsed = parseButlerUrl(url);
    } catch {
        return url;
    }

    const isLocalHost =
        parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost';

    if (Device.isDevice && isLocalHost) {
        const metroHost = getDevMachineHostFromMetro();
        if (metroHost) {
            parsed.hostname = metroHost;
            parsed.protocol = 'http:';
        }
    }

    if (!Device.isDevice && parsed.hostname.startsWith('192.168.')) {
        parsed.hostname = '127.0.0.1';
        parsed.protocol = 'http:';
    }

    return parsed.toString().replace(/\/$/, '');
}

export async function getButlerBackendUrl() {
    const profile = await getActiveProfileConfig();
    if (profile?.adminUrl) {
        const proxied = butlerApiBaseFromAdminUrl(profile.adminUrl);
        if (proxied) return proxied;
    }

    const extra = readExtraUrl();
    if (extra) return resolveDirectButlerUrl(extra);

    return resolveDirectButlerUrl(DIRECT_DEV_DEFAULT);
}

export function toButlerWsUrl(httpUrl) {
    const base = httpUrl.replace(/\/$/, '');
    if (/^https:\/\//i.test(base)) return base.replace(/^https/i, 'wss');
    return base.replace(/^http/i, 'ws');
}

export function normalizeHaBaseUrl(url) {
    return String(url || '')
        .trim()
        .replace(/\/$/, '')
        .replace(/\/api\/websocket\/?$/i, '');
}

export async function syncButlerHaConfig(haUrl, haToken) {
    const base = await getButlerBackendUrl();
    const ha_url = normalizeHaBaseUrl(haUrl);
    const ha_token = (haToken || '').trim();
    if (!ha_url || !ha_token) {
        return { ok: false, error: 'Missing Home Assistant URL or token from app profile' };
    }
    try {
        const res = await fetch(`${base}/admin/save`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ha_url, ha_token }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            return { ok: false, error: data.detail || `HTTP ${res.status}` };
        }
        return { ok: true, changed: data.changed };
    } catch (e) {
        return { ok: false, error: e?.message ?? String(e) };
    }
}

function formatProxied502Error(base) {
    return [
        `HTTP 502 — ${base} cannot reach Butlerv1.`,
        '',
        'App Backend cannot reach Butlerv1. On the HABackend container set BUTLER_URL or config.json butler_url to the Butler container IP (e.g. http://192.168.100.52:8787), then restart.',
        '',
        'Deploy latest AppBackendV1 to app-backend.primewave2.tech after updating env/config.',
    ].join('\n');
}

export async function checkButlerBackendHealth() {
    const base = await getButlerBackendUrl();
    const proxied = isProxiedButlerBase(base);
    try {
        const res = await fetch(`${base}/healthz`, { method: 'GET' });
        if (!res.ok) {
            let error = `HTTP ${res.status}`;
            if (res.status === 502 && proxied) {
                error = formatProxied502Error(base);
            } else {
                const body = await res.text().catch(() => '');
                if (body && body.length < 400) error += `\n${body}`;
            }
            return { ok: false, base, error, proxied };
        }
        const data = await res.json();
        return { ok: true, base, data, proxied };
    } catch (e) {
        let error = e?.message ?? String(e);
        if (proxied && /502|bad gateway/i.test(error)) {
            error = formatProxied502Error(base);
        } else if (Device.isDevice && !proxied) {
            try {
                const parsed = parseButlerUrl(base);
                if (parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost') {
                    const hint = getDevMachineHostFromMetro();
                    error = hint
                        ? `${error}\n\nSet app.json extra.BUTLER_BACKEND_URL to http://${hint}:8787 (rebuild required) or ensure App Backend proxies Butler.`
                        : `${error}\n\nUse your Mac LAN IP via app.json extra.BUTLER_BACKEND_URL, or use profile admin URL (HTTPS).`;
                }
            } catch (_) { /* ignore */ }
        }
        return { ok: false, base, error, proxied };
    }
}
