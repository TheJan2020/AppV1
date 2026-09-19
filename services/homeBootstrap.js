import { normalizeHaUrl } from './accounts';
import {
    SAME_NETWORK_MESSAGE,
    stripSlash as sharedStripSlash,
    hostPart as sharedHostPart,
    hostnameOnly as sharedHostnameOnly,
    isLanHost as sharedIsLanHost,
    getDevMachineHostFromMetro,
    allowLocalUrlFallback,
} from './connectionEndpoints';

const BOOTSTRAP_HEADERS = {
    Accept: 'application/json',
    'User-Agent': 'HomeAssistant/2024.1 (AppV1; React Native)',
};

function stripSlash(url) {
    return sharedStripSlash(url);
}

function hostPart(url) {
    return sharedHostPart(url);
}

function hostnameOnly(url) {
    return sharedHostnameOnly(url);
}

function isLanHost(host) {
    return sharedIsLanHost(host);
}

export { getDevMachineHostFromMetro };

/** Local dashboard URL for a physical phone: Metro's machine IP, port 3000. */
export function guessLocalDashboardUrl() {
    const host = getDevMachineHostFromMetro();
    return host ? `http://${host}:3000` : '';
}

function rewriteLoopbackToDevMachine(url) {
    const lan = getDevMachineHostFromMetro();
    const raw = stripSlash(url);
    if (!lan || !raw) return raw;
    return raw.replace(/^(https?:\/\/)(localhost|127\.0\.0\.1)(?=[:/]|$)/i, `$1${lan}`);
}

export function dashboardUrlCandidates(input) {
    const raw = rewriteLoopbackToDevMachine(stripSlash(input));
    if (!raw) return [];
    const hasScheme = /^https?:\/\//i.test(raw);
    const host = hostPart(raw);
    const out = [];
    const push = (url) => {
        const n = stripSlash(url);
        if (n && !out.includes(n)) out.push(n);
    };
    if (hasScheme) push(raw);
    if (!isLanHost(host)) {
        push(`https://${host}`);
        return out;
    }
    push(`http://${host}`);
    return out;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 8000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, {
            ...options,
            signal: controller.signal,
            headers: { ...BOOTSTRAP_HEADERS, ...(options.headers || {}) },
        });
    } finally {
        clearTimeout(timer);
    }
}

function bootstrapError(message, extra = {}) {
    const err = new Error(message);
    err.status = extra.status;
    err.url = extra.url;
    return err;
}

async function tryBootstrap(adminUrl, timeoutMs = 8000) {
    const base = stripSlash(adminUrl);
    const res = await fetchWithTimeout(`${base}/api/app-bootstrap`, { method: 'GET' }, timeoutMs);
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = null; }
    if (res.ok && data && !data.haToken) {
        throw bootstrapError('Dashboard has no Home Assistant token configured.', { status: 503, url: base });
    }
    if (!res.ok || !data) {
        const message = data?.error
            || (res.status === 401
                ? 'Unauthorized'
                : res.status === 404
                    ? 'This URL is not the admin dashboard (HTTP 404). Use the AppBackend Cloudflare URL, not Home Assistant.'
                    : `Dashboard HTTP ${res.status}`);
        throw bootstrapError(message, { status: res.status, url: base });
    }
    return {
        adminUrl: base,
        haUrlLive: normalizeHaUrl(data.haUrlLive || ''),
        haUrlLocal: normalizeHaUrl(data.haUrlLocal || ''),
        haToken: String(data.haToken || '').trim(),
    };
}

export async function refreshHaFromDashboard(adminUrl) {
    return tryBootstrap(adminUrl);
}

function formatProbeFailure(errors, tried, localUrl) {
    const unauthorized = errors.some((e) => e.status === 401 || /unauthorized/i.test(e.message || ''));
    const lanTried = tried.filter((u) => isLanHost(hostPart(u)));
    const publicTried = tried.filter((u) => !isLanHost(hostPart(u)));
    const hosts = [...new Set(publicTried.map((u) => hostnameOnly(u)).filter(Boolean))];
    const triedLocal = lanTried.length > 0 || !!stripSlash(localUrl);

    if (unauthorized && !triedLocal) {
        const liveHint = hosts.length ? ` (${hosts.join(', ')})` : '';
        return (
            `The live dashboard${liveHint} blocked the app (older backend). ` +
            'Deploy the latest AppBackendV1 so HTTPS works, or add a local HTTP dashboard URL and stay on the home Wi-Fi.'
        );
    }

    if (triedLocal) {
        return SAME_NETWORK_MESSAGE;
    }

    if (errors.some((e) => e.status === 404)) {
        return (
            'This URL is not the admin dashboard (HTTP 404). ' +
            'Enter the AppBackend Cloudflare URL (the backend, not Home Assistant). ' +
            'A local IP is not required.'
        );
    }

    const last = errors[errors.length - 1];
    const lastMsg = String(last?.message || 'Could not reach the dashboard.');
    if (/abort|timeout|network request failed|failed to fetch/i.test(lastMsg)) {
        return 'Could not reach the live HTTPS dashboard. Check the Dashboard URL, or add an optional local HTTP URL.';
    }
    return lastMsg;
}

export async function probeDashboard(liveUrl, localUrl) {
    const live = rewriteLoopbackToDevMachine(liveUrl);
    const local = rewriteLoopbackToDevMachine(localUrl);
    const candidates = [
        ...dashboardUrlCandidates(live),
        ...(allowLocalUrlFallback(live, local) ? dashboardUrlCandidates(local) : []),
    ];
    const unique = [];
    for (const url of candidates) {
        if (url && !unique.includes(url)) unique.push(url);
    }
    if (!unique.length) throw new Error('Enter a dashboard URL.');
    const adminUrlLive = unique.find((u) => /^https:/i.test(u) && !isLanHost(hostPart(u))) || live;
    const adminUrlLocal = allowLocalUrlFallback(live, local)
        ? (unique.find((u) => /^http:/i.test(u) && !/^https:/i.test(u)) || local)
        : '';
    const withMeta = (boot) => ({
        ...boot,
        adminUrlLive,
        adminUrlLocal,
    });
    if (unique.length === 1) {
        return withMeta(await tryBootstrap(unique[0], /^https:/i.test(unique[0]) ? 10000 : 8000));
    }

    const errors = [];
    return await new Promise((resolve, reject) => {
        let remaining = unique.length;
        let settled = false;
        unique.forEach((url) => {
            const timeoutMs = /^https:/i.test(url) ? 10000 : 8000;
            tryBootstrap(url, timeoutMs).then((boot) => {
                if (settled) return;
                settled = true;
                resolve(withMeta(boot));
            }).catch((e) => {
                errors.push({
                    url,
                    status: e?.status,
                    message: e?.message || String(e),
                });
                remaining -= 1;
                if (!settled && remaining === 0) {
                    reject(bootstrapError(formatProbeFailure(errors, unique, local), {
                        status: errors.find((err) => err.status === 401)?.status,
                    }));
                }
            });
        });
    });
}

/**
 * Prefer the public HTTPS HA URL so a home can be saved away from Wi-Fi.
 * Do not ping HA from the phone — live HA or a LAN IP may be unreachable
 * even when the dashboard (which talks to HA) is fine.
 */
export function pickWorkingHaUrl({ haUrlLive, haUrlLocal }) {
    const live = stripSlash(haUrlLive);
    const local = stripSlash(haUrlLocal);
    if (live) return live;
    if (local && allowLocalUrlFallback(live, local)) return local;
    return '';
}

const MISSING_HA_URL_MESSAGE =
    'This dashboard has no Home Assistant URL yet. In the admin app, open Home Assistant and save the live HTTPS URL and token. A local IP is optional.';

/**
 * Resolve dashboard URLs into admin + HA connection.
 * Tries the live HTTPS dashboard first, then the optional local HTTP dashboard.
 * Local Home Assistant IP is not required to create a profile.
 */
export async function bootstrapHomeFromDashboard(dashboardUrl, dashboardUrlLocal) {
    const boot = await probeDashboard(dashboardUrl, dashboardUrlLocal);
    const haUrl = pickWorkingHaUrl(boot);
    if (!haUrl) {
        throw new Error(MISSING_HA_URL_MESSAGE);
    }
    return {
        ...boot,
        haUrl,
        usedHttps: /^https:/i.test(boot.adminUrl),
    };
}

export function applyBootstrapHaToConfig(prev, boot) {
    if (!prev || !boot) return prev;
    const haUrlLive = sharedStripSlash(boot.haUrlLive) || prev.haUrlLive;
    const incomingLocal = sharedStripSlash(boot.haUrlLocal);
    const haUrlLocal = incomingLocal && allowLocalUrlFallback(haUrlLive || prev.url, incomingLocal)
        ? incomingLocal
        : prev.haUrlLocal;
    const token = String(boot.haToken || prev.token || '').trim();
    if (
        haUrlLive === prev.haUrlLive
        && haUrlLocal === prev.haUrlLocal
        && token === prev.token
    ) {
        return prev;
    }
    return {
        ...prev,
        token,
        haUrlLive,
        haUrlLocal,
        url: prev.url || haUrlLive,
    };
}
