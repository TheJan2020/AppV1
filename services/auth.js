import { toWsUrl, isLanHost, hostPart } from './connectionEndpoints';

/**
 * Validates user credentials against Home Assistant.
 * HTTP 200 is not success — HA always returns 200 for login_flow.
 * Success is type === 'create_entry'.
 */
export const validateCredentials = async (haUrl, username, password) => {
    const baseUrl = haUrl
        .replace(/^wss:\/\//i, 'https://')
        .replace(/^ws:\/\//i, 'http://')
        .replace(/\/$/, '');
    const user = String(username || '').trim();
    const pass = String(password || '');
    const client_id = 'https://home-assistant.io/android/';
    const timeoutMs = /^https:/i.test(baseUrl) ? 10000 : 5000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    console.log('[Auth] Step 1: Init flow at:', `${baseUrl}/auth/login_flow`);
    console.log('[Auth] Username:', user);

    try {
        const initResponse = await fetch(`${baseUrl}/auth/login_flow`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                client_id,
                handler: ['homeassistant', null],
                redirect_uri: client_id,
            }),
            signal: controller.signal,
        });

        console.log('[Auth] Init response status:', initResponse.status);

        if (!initResponse.ok) {
            const errText = await initResponse.text();
            console.error('[Auth] Init FAILED:', initResponse.status, errText);
            return { ok: false, reason: 'init_failed' };
        }

        const initData = await initResponse.json();
        console.log('[Auth] Init data:', JSON.stringify(initData));
        const flowId = initData.flow_id;

        if (!flowId) {
            console.error('[Auth] No flow_id in response:', JSON.stringify(initData));
            return { ok: false, reason: 'no_flow' };
        }

        console.log('[Auth] Step 2: Submitting credentials for flow:', flowId);
        const loginResponse = await fetch(`${baseUrl}/auth/login_flow/${flowId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: user,
                password: pass,
                client_id,
            }),
            signal: controller.signal,
        });

        console.log('[Auth] Login response status:', loginResponse.status);
        const loginData = await loginResponse.json();
        console.log('[Auth] Login response data:', JSON.stringify(loginData));

        if (loginData.type === 'create_entry') {
            console.log('[Auth] ✅ Login SUCCESS');
            return { ok: true };
        }
        if (loginData.type === 'mfa_required') {
            console.log('[Auth] MFA required — password was valid, treating as success');
            return { ok: true };
        }

        const haError = loginData.errors?.base || loginData.errors?.username || '';
        console.log('[Auth] ❌ Login FAILED. type:', loginData.type, 'errors:', JSON.stringify(loginData.errors || {}));
        return {
            ok: false,
            reason: haError === 'invalid_auth' ? 'invalid_auth' : (loginData.type || 'failed'),
        };
    } catch (error) {
        console.error('[Auth] ❌ Exception:', error.message || error);
        return { ok: false, reason: 'network' };
    } finally {
        clearTimeout(timer);
    }
};

export async function validateCredentialsViaDashboard(adminUrl, haToken, username, password) {
    const baseUrl = String(adminUrl || '')
        .replace(/^wss:\/\//i, 'https://')
        .replace(/^ws:\/\//i, 'http://')
        .replace(/\/$/, '');
    if (!baseUrl) return { ok: false, reason: 'network' };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
        const res = await fetch(`${baseUrl}/api/app-login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(haToken ? { Authorization: `Bearer ${haToken}` } : {}),
            },
            body: JSON.stringify({
                username: String(username || '').trim(),
                password: String(password || ''),
            }),
            signal: controller.signal,
        });
        let data = null;
        try { data = await res.json(); } catch { data = null; }
        if (res.ok && data?.ok) return { ok: true };
        if (res.status === 401) return { ok: false, reason: 'invalid_auth' };
        return { ok: false, reason: 'network' };
    } catch (error) {
        console.error('[Auth] Dashboard login failed:', error.message || error);
        return { ok: false, reason: 'network' };
    } finally {
        clearTimeout(timer);
    }
}

function uniqueHttpUrls(urls) {
    const out = [];
    for (const raw of urls || []) {
        const n = String(raw || '')
            .replace(/^wss:\/\//i, 'https://')
            .replace(/^ws:\/\//i, 'http://')
            .replace(/\/$/, '');
        if (n && !out.includes(n)) out.push(n);
    }
    return out;
}

/**
 * Check password against HA from the phone, then via the dashboard if HA is unreachable
 * (typical when creating an account away from home without a local HA IP).
 */
export async function validateCredentialsWithFallback({
    haUrls,
    adminUrl,
    haToken,
    username,
    password,
} = {}) {
    const urls = uniqueHttpUrls(haUrls);
    const liveUrls = urls.filter((u) => !isLanHost(hostPart(u)));
    const localUrls = urls.filter((u) => isLanHost(hostPart(u)));
    let last = { ok: false, reason: 'network' };

    for (const url of liveUrls) {
        last = await validateCredentials(url, username, password);
        if (last.ok) return { ...last, usedUrl: url };
        if (last.reason === 'invalid_auth') return { ...last, usedUrl: url };
    }

    if (adminUrl) {
        last = await validateCredentialsViaDashboard(adminUrl, haToken, username, password);
        if (last.ok) return { ...last, usedUrl: liveUrls[0] || localUrls[0] || '' };
        if (last.reason === 'invalid_auth') return last;
    }

    for (const url of localUrls) {
        last = await validateCredentials(url, username, password);
        if (last.ok) return { ...last, usedUrl: url };
        if (last.reason === 'invalid_auth') return { ...last, usedUrl: url };
    }

    return last;
}

/**
 * Map Home Assistant user ids → login usernames (person slug is often different).
 */
export function fetchHaLoginUsernames(haUrl, haToken) {
    return new Promise((resolve) => {
        const wsUrl = toWsUrl(haUrl);
        if (!wsUrl || !haToken) {
            resolve([]);
            return;
        }
        let settled = false;
        const finish = (value) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            try { ws.close(); } catch { /* ignore */ }
            resolve(value);
        };
        const timer = setTimeout(() => finish([]), 8000);
        let nextId = 1;
        let ws;
        try {
            ws = new WebSocket(wsUrl);
        } catch {
            finish([]);
            return;
        }
        ws.onmessage = (ev) => {
            let msg;
            try { msg = JSON.parse(ev.data); } catch { return; }
            if (msg.type === 'auth_required') {
                ws.send(JSON.stringify({ type: 'auth', access_token: haToken }));
                return;
            }
            if (msg.type === 'auth_ok') {
                ws.send(JSON.stringify({ id: nextId++, type: 'config/auth/list' }));
                return;
            }
            if (msg.type === 'auth_invalid') {
                finish([]);
                return;
            }
            if (msg.type === 'result') {
                finish(msg.success && Array.isArray(msg.result) ? msg.result : []);
            }
        };
        ws.onerror = () => finish([]);
        ws.onclose = () => finish([]);
    });
}

export function mergePersonsWithAuthUsers(persons, authUsers) {
    const people = Array.isArray(persons) ? persons : [];
    const auths = (Array.isArray(authUsers) ? authUsers : []).filter((u) => (
        u
        && u.is_active !== false
        && !u.system_generated
        && String(u.username || '').trim()
        && !String(u.name || '').toLowerCase().includes('home assistant')
        && String(u.name || '').toLowerCase() !== 'supervisor'
    ));

    const merged = [];
    const seenPerson = new Set();
    const seenUser = new Set();

    for (const auth of auths) {
        const username = String(auth.username).trim();
        const person = people.find((p) => (
            (p.user_id && String(p.user_id) === String(auth.id))
            || String(p.username || '').toLowerCase() === username.toLowerCase()
            || String(p.id || '').replace(/^person\./, '').toLowerCase() === username.toLowerCase()
        ));
        if (person) {
            merged.push({
                ...person,
                username: username || person.username,
                user_id: auth.id || person.user_id,
                name: person.name || auth.name || username,
            });
            seenPerson.add(person.id);
            if (person.user_id) seenUser.add(String(person.user_id));
        } else {
            merged.push({
                id: `user.${username}`,
                name: auth.name || username,
                user_id: auth.id || '',
                username,
            });
        }
        if (auth.id) seenUser.add(String(auth.id));
    }

    for (const person of people) {
        if (seenPerson.has(person.id)) continue;
        if (person.user_id && seenUser.has(String(person.user_id))) continue;
        merged.push({
            ...person,
            username: person.username || String(person.id || '').replace(/^person\./, ''),
        });
    }

    return merged.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
}

export function usernameForPerson(person, authUsers = []) {
    if (person?.username) return String(person.username).trim();
    const slug = String(person?.id || '').replace(/^(person|user)\./, '');
    const uid = String(person?.user_id || '').trim();
    const match = uid ? (authUsers || []).find((u) => String(u.id) === uid) : null;
    return String(match?.username || slug || '').trim();
}
