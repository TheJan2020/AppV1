import Constants from 'expo-constants';

const HA_HEADERS = {
    Accept: 'application/json',
    'User-Agent': 'HomeAssistant/2024.1 (AppV1; React Native)',
};

export const SAME_NETWORK_MESSAGE =
    'Could not connect. Your phone may not be on the same network as Home Assistant. Join the home Wi-Fi and try again.';

export function stripSlash(url) {
    return coerceHttpUrl(url);
}

/** Turn profile/bootstrap values into an http(s) URL. Rejects `[object Object]`. */
export function coerceHttpUrl(value, depth = 0) {
    if (value == null || value === '') return '';
    if (depth > 4) return '';
    if (typeof value === 'object') {
        if (Array.isArray(value)) return coerceHttpUrl(value[0], depth + 1);
        return coerceHttpUrl(
            value.haUrlLive
            || value.ha_url_live
            || value.haUrl
            || value.ha_url
            || value.adminUrl
            || value.adminUrlLive
            || value.url
            || value.href
            || '',
            depth + 1,
        );
    }
    const s = String(value).trim();
    if (!s || /\[object object\]/i.test(s)) return '';
    return s.replace(/\/+$/, '');
}

export function hostPart(url) {
    return stripSlash(url).replace(/^https?:\/\//i, '').replace(/\/.*$/, '');
}

export function hostnameOnly(url) {
    return hostPart(url).split(':')[0];
}

export function isLoopbackHost(host) {
    return /^(localhost|127\.0\.0\.1)$/i.test(String(host || '').split(':')[0]);
}

export function isLanHost(host) {
    const h = String(host || '').split(':')[0];
    return /^\d{1,3}(\.\d{1,3}){3}$/.test(h)
        || isLoopbackHost(h)
        || /\.local$/i.test(h);
}

export function getDevMachineHostFromMetro() {
    const hostUri =
        Constants.expoConfig?.hostUri
        ?? Constants.expoGoConfig?.debuggerHost
        ?? Constants.manifest2?.extra?.expoClient?.hostUri;
    if (!hostUri || typeof hostUri !== 'string') return null;
    const host = hostUri.split(':')[0]?.trim();
    if (!host || isLoopbackHost(host)) return null;
    return host;
}

/** True when the URL is this computer (simulator/Metro), not the house LAN. */
export function isThisDevMachineDashboard(url) {
    const host = hostnameOnly(url);
    if (!host) return false;
    if (isLoopbackHost(host)) return true;
    const metro = getDevMachineHostFromMetro();
    return !!(metro && host === metro);
}

/**
 * Do not fall back from a public house dashboard to the developer Mac's
 * AppBackend (office data on :3000) when the live home is unreachable.
 */
export function allowLocalUrlFallback(liveUrl, localUrl) {
    const live = stripSlash(liveUrl);
    const local = stripSlash(localUrl);
    if (!local || local === live) return false;
    if (!live) return true;
    if (isThisDevMachineDashboard(local) && !isLanHost(hostPart(live))) return false;
    return true;
}

export function isHttpsUrl(url) {
    return /^https:/i.test(stripSlash(url));
}

export function isHttpUrl(url) {
    const raw = stripSlash(url);
    return /^http:/i.test(raw) && !/^https:/i.test(raw);
}

export function toWsUrl(httpUrl) {
    const clean = stripSlash(httpUrl);
    if (!clean) return '';
    return `${clean.replace(/^https/i, 'wss').replace(/^http(?!s)/i, 'ws')}/api/websocket`;
}

export function httpUrlFromWs(wsUrl) {
    return String(wsUrl || '')
        .replace(/\/api\/websocket\/?$/i, '')
        .replace(/^wss/i, 'https')
        .replace(/^ws(?!s)/i, 'http');
}

export function endpointsFromProfile(profile = {}) {
    const haUrl = stripSlash(profile.haUrl);
    const adminUrl = stripSlash(profile.adminUrl);
    const haLive = stripSlash(profile.haUrlLive) || (isHttpsUrl(haUrl) ? haUrl : '');
    const haLocal = stripSlash(profile.haUrlLocal)
        || (isHttpUrl(haUrl) ? haUrl : '');
    const adminLive = stripSlash(profile.adminUrlLive)
        || stripSlash(profile.dashboardUrl)
        || (isHttpsUrl(adminUrl) ? adminUrl : '');
    const adminLocal = stripSlash(profile.adminUrlLocal)
        || stripSlash(profile.dashboardUrlLocal)
        || (isHttpUrl(adminUrl) ? adminUrl : '');

    return {
        haLive,
        haLocal,
        adminLive,
        adminLocal,
        token: String(profile.haToken || '').trim(),
        startHaUrl: haLive || haUrl,
        startAdminUrl: adminLive || adminUrl,
    };
}

export function connectionConfigFromProfile(profile = {}) {
    const ep = endpointsFromProfile(profile);
    const publicAdmin = [ep.adminLive, coerceHttpUrl(profile.dashboardUrl)]
        .find((u) => u && !isThisDevMachineDashboard(u) && !isLanHost(hostPart(u)));
    const publicHa = [ep.haLive, coerceHttpUrl(profile.haUrl)]
        .find((u) => u && !isThisDevMachineDashboard(u) && !isLanHost(hostPart(u)) && /^https?:\/\//i.test(u));
    let startAdminUrl = ep.startAdminUrl;
    let startHaUrl = ep.startHaUrl;
    if (isThisDevMachineDashboard(startAdminUrl) && publicAdmin) startAdminUrl = publicAdmin;
    if ((!startHaUrl || isThisDevMachineDashboard(startHaUrl) || !/^https?:\/\//i.test(startHaUrl)) && publicHa) {
        startHaUrl = publicHa;
    }
    const haLocal = allowLocalUrlFallback(ep.haLive || startHaUrl, ep.haLocal) ? ep.haLocal : '';
    const adminLocal = allowLocalUrlFallback(ep.adminLive || startAdminUrl, ep.adminLocal) ? ep.adminLocal : '';
    const cfg = {
        url: startHaUrl,
        token: String(ep.token || '').trim(),
        adminUrl: startAdminUrl,
        haUrlLive: publicHa || ep.haLive,
        haUrlLocal: haLocal,
        adminUrlLive: publicAdmin || ep.adminLive,
        adminUrlLocal: adminLocal,
        loaded: true,
    };
    rememberAdminFailover(cfg);
    return cfg;
}

/** Last-known admin HTTPS / HTTP pair so API calls can retry locally if Cloudflare is down. */
let _adminFailover = { live: '', local: '', active: '' };

export function getAdminUrlOverride() {
    return _adminFailover.active || '';
}

export function rememberAdminFailover(config = {}) {
    const live = stripSlash(config.adminUrlLive || (isHttpsUrl(config.adminUrl) ? config.adminUrl : ''));
    const local = stripSlash(config.adminUrlLocal || (isHttpUrl(config.adminUrl) ? config.adminUrl : ''));
    const active = stripSlash(config.adminUrl) || live || local;
    _adminFailover = {
        live: live || active,
        local: allowLocalUrlFallback(live || active, local) ? local : '',
        active,
    };
}

export function connectionConfigFromBoot(bootProf) {
    if (!bootProf) {
        return { url: '', token: '', adminUrl: '', loaded: false };
    }
    const cfg = {
        url: bootProf.url || bootProf.haUrlLive || '',
        token: bootProf.token || '',
        adminUrl: bootProf.adminUrl || bootProf.adminUrlLive || '',
        haUrlLive: bootProf.haUrlLive || '',
        haUrlLocal: bootProf.haUrlLocal || '',
        adminUrlLive: bootProf.adminUrlLive || '',
        adminUrlLocal: bootProf.adminUrlLocal || '',
        loaded: true,
    };
    rememberAdminFailover(cfg);
    return cfg;
}

/** If `url` is on the live admin host, rewrite it to the local HTTP admin host. */
export function rewriteUrlViaAdminFailover(url) {
    const live = stripSlash(_adminFailover.live || _adminFailover.active);
    const local = stripSlash(_adminFailover.local);
    const raw = String(url || '');
    if (!raw || !live || !local || live === local) return '';
    if (!allowLocalUrlFallback(live, local)) return '';
    if (!raw.startsWith(live)) return '';
    _adminFailover.active = local;
    return raw.replace(live, local);
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 4000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, {
            ...options,
            signal: controller.signal,
            headers: { ...HA_HEADERS, ...(options.headers || {}) },
        });
    } finally {
        clearTimeout(timer);
    }
}

/** True if the host answered (including 401/403). False on timeout/network errors. */
export async function hostReached(url, { path = '/', headers = {}, timeoutMs = 4000 } = {}) {
    const base = stripSlash(url);
    if (!base) return false;
    try {
        const res = await fetchWithTimeout(`${base}${path.startsWith('/') ? path : `/${path}`}`, { headers }, timeoutMs);
        return res.status > 0;
    } catch {
        return false;
    }
}

export async function probeAdminUrl(url, timeoutMs = 4000) {
    return hostReached(url, { path: '/api/app-bootstrap', timeoutMs });
}

export async function probeHaUrl(url, token, timeoutMs = 4000) {
    return hostReached(url, {
        path: '/api/',
        timeoutMs,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
}

/**
 * Try the live HTTPS URL first, then the local HTTP URL.
 * @returns {{ url: string, via: 'live' | 'local' } | null}
 */
export async function pickHttpsThenLocal(liveUrl, localUrl, probe) {
    const live = stripSlash(liveUrl);
    const local = stripSlash(localUrl);
    if (live && await probe(live, isHttpsUrl(live) ? 4000 : 5000)) {
        return { url: live, via: 'live' };
    }
    if (local && local !== live && await probe(local, 6000)) {
        return { url: local, via: 'local' };
    }
    return live ? { url: live, via: 'live' } : local ? { url: local, via: 'local' } : null;
}

export function withFailoverUrls(prev, { via, httpUrl } = {}) {
    const nextUrl = stripSlash(httpUrl) || prev.url;
    let nextAdmin = prev.adminUrl;
    if (via === 'local') {
        const candidate = prev.adminUrlLocal || prev.adminUrl;
        nextAdmin = allowLocalUrlFallback(prev.adminUrlLive || prev.adminUrl, candidate)
            ? candidate
            : (prev.adminUrlLive || prev.adminUrl);
    } else if (via === 'live') {
        nextAdmin = prev.adminUrlLive || prev.adminUrl;
    }
    if (nextUrl === prev.url && nextAdmin === prev.adminUrl) return prev;
    const next = { ...prev, url: nextUrl, adminUrl: nextAdmin };
    rememberAdminFailover(next);
    return next;
}
