import { getHaToken } from './storage';
import { rewriteUrlViaAdminFailover } from '../services/connectionEndpoints';

export async function authFetch(url, options = {}, tokenOverride = null) {
    const token = tokenOverride || await getHaToken();
    const headers = {
        ...(options.headers || {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {})
    };

    const run = (target) => fetch(target, { ...options, headers });

    try {
        const res = await run(url);
        if (res.ok || res.status < 500) return res;
        const fallback = rewriteUrlViaAdminFailover(url);
        if (!fallback || fallback === url) return res;
        return run(fallback);
    } catch (err) {
        if (err?.name === 'AbortError') throw err;
        const fallback = rewriteUrlViaAdminFailover(url);
        if (!fallback || fallback === url) throw err;
        return run(fallback);
    }
}
