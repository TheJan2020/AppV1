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
    const errors = [];
    for (const url of unique) {
        try {
            const timeoutMs = /^https:/i.test(url) ? 10000 : 8000;
            const boot = await tryBootstrap(url, timeoutMs);
            return {
                ...boot,
                adminUrlLive: unique.find((u) => /^https:/i.test(u) && !isLanHost(hostPart(u))) || live,
                adminUrlLocal: allowLocalUrlFallback(live, local)
                    ? (unique.find((u) => /^http:/i.test(u) && !/^https:/i.test(u)) || local)
                    : '',
            };
        } catch (e) {
            errors.push({
                url,
                status: e?.status,
                message: e?.message || String(e),
            });
        }
    }
    throw bootstrapError(formatProbeFailure(errors, unique, local), {
        status: errors.find((e) => e.status === 401)?.status,
    });
}

async function haApiAlive(haUrl, haToken) {
    const base = stripSlash(haUrl);
    if (!base || !haToken) return false;
    try {
        const res = await fetchWithTimeout(`${base}/api/`, {
            headers: { Authorization: `Bearer ${haToken}` },
        }, 8000);
        return res.ok;
    } catch {
        return false;
    }
}

export async function pickWorkingHaUrl({ haUrlLive, haUrlLocal, haToken }) {
    const live = stripSlash(haUrlLive);
    const local = stripSlash(haUrlLocal);
    if (live && await haApiAlive(live, haToken)) return live;
    if (local && local !== live && allowLocalUrlFallback(live, local) && await haApiAlive(local, haToken)) {
        return local;
    }
    return live || (allowLocalUrlFallback(live, local) ? local : '') || '';
}

/**
 * Resolve dashboard URLs into admin + HA connection.
 * Tries the live HTTPS dashboard first, then the local HTTP dashboard.
 */
export async function bootstrapHomeFromDashboard(dashboardUrl, dashboardUrlLocal) {
    const boot = await probeDashboard(dashboardUrl, dashboardUrlLocal);
    const haUrl = await pickWorkingHaUrl(boot);
    if (!haUrl) {
        throw new Error(SAME_NETWORK_MESSAGE);
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
