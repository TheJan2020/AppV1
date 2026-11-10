import { authFetch } from '../utils/authFetch';

function asOptionalJson(raw) {
    if (typeof raw !== 'string') return null;
    const text = raw.trim();
    if (!text || (text[0] !== '{' && text[0] !== '[')) return null;
    try {
        return JSON.parse(text);
    } catch {
        return null;
    }
}

export function readIntercomMessage(raw) {
    return asOptionalJson(raw);
}

async function optionalIntercomFetch(url, options) {
    try {
        const res = await authFetch(url, options);
        if (!res || res.status === 404) return null;
        if (!res.ok) return null;
        const parsed = asOptionalJson(await res.text().catch(() => ''));
        return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
        return null;
    }
}

function baseUrl(adminUrl) {
    const s = String(adminUrl || '').trim();
    if (!s) return '';
    return s.endsWith('/') ? s : `${s}/`;
}

export function adminToWsUrl(adminUrl) {
    const clean = String(adminUrl || '').replace(/\/+$/, '');
    if (!clean) return '';
    return `${clean.replace(/^https/i, 'wss').replace(/^http(?!s)/i, 'ws')}/ws/intercom`;
}

/** Same-origin SIP signaling proxy — each house’s backend forwards to that house’s FreePBX WSS. */
export function adminToSipWsUrl(adminUrl) {
    const clean = String(adminUrl || '').replace(/\/+$/, '');
    if (!clean) return '';
    return `${clean.replace(/^https/i, 'wss').replace(/^http(?!s)/i, 'ws')}/ws/sip`;
}

export function sipWsCandidates(wssUrl) {
    const urls = [];
    const add = (u) => {
        const v = String(u || '').trim();
        if (v && !urls.includes(v)) urls.push(v);
    };
    try {
        const normalized = String(wssUrl || '').replace(/^wss:/i, 'https:').replace(/^ws:/i, 'http:');
        const u = new URL(normalized);
        const path = u.pathname && u.pathname !== '/' ? u.pathname : '/ws';
        add(wssUrl);
        add(`ws://${u.hostname}:8088${path}`);
    } catch {
        add(wssUrl);
    }
    return urls;
}

export async function fetchIntercomCall(adminUrl, userId) {
    const base = baseUrl(adminUrl);
    if (!base) return { call: null };
    const qs = userId ? `?userId=${encodeURIComponent(userId)}` : '';
    const data = await optionalIntercomFetch(`${base}api/intercom/call${qs}`);
    return data && typeof data === 'object' ? data : { call: null };
}

export async function answerIntercomCall(adminUrl, { userId, username }) {
    const base = baseUrl(adminUrl);
    if (!base) return { ok: false, error: 'This home has no office address.' };
    try {
        const res = await authFetch(`${base}api/intercom/answer`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, username }),
        });
        const parsed = asOptionalJson(await res.text().catch(() => ''));
        if (parsed && typeof parsed === 'object') return parsed;
        return { ok: false, error: res.ok ? 'Could not answer' : `Could not answer (${res.status})` };
    } catch {
        return { ok: false, error: 'Could not answer' };
    }
}

export async function declineIntercomCall(adminUrl, { userId }) {
    const base = baseUrl(adminUrl);
    if (!base) return { ok: false };
    return (await optionalIntercomFetch(`${base}api/intercom/decline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
    })) || { ok: false };
}

export async function hangupIntercomCall(adminUrl, reason = 'hangup') {
    const base = baseUrl(adminUrl);
    if (!base) return { ok: false };
    return (await optionalIntercomFetch(`${base}api/intercom/hangup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
    })) || { ok: false };
}

export async function fetchIntercomClient(adminUrl, userId) {
    const base = baseUrl(adminUrl);
    if (!base) return { enabled: false, sip: null };
    const qs = userId ? `?userId=${encodeURIComponent(userId)}` : '';
    const data = await optionalIntercomFetch(`${base}api/intercom/client${qs}`);
    if (!data || data.enabled !== true || !data.sip) return { enabled: false, sip: null };
    return { enabled: true, ...data };
}

export async function releaseDoorCall(adminUrl) {
    const base = baseUrl(adminUrl);
    if (!base) return { ok: false };
    return (await optionalIntercomFetch(`${base}api/intercom/door-signal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cmd: 'cancel' }),
    })) || { ok: false };
}

export async function reportSipIncoming(adminUrl, { from } = {}) {
    const base = baseUrl(adminUrl);
    if (!base) return { ok: false };
    return (await optionalIntercomFetch(`${base}api/intercom/call`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, callerName: from || 'Front door' }),
    })) || { ok: false };
}
