import { getHaToken } from './storage';
import { rewriteUrlViaAdminFailover } from '../services/connectionEndpoints';

export async function authFetch(url, options = {}, tokenOverride = null) {
    const token = tokenOverride || await getHaToken();
    const { timeoutMs = 12000, signal: callerSignal, ...rest } = options;
    const headers = {
        ...(rest.headers || {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {})
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    if (callerSignal) {
        if (callerSignal.aborted) controller.abort();
        else callerSignal.addEventListener('abort', () => controller.abort(), { once: true });
    }

    const run = (target) => fetch(target, { ...rest, headers, signal: controller.signal });

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
    } finally {
        clearTimeout(timer);
    }
}
