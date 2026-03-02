import { getHaToken } from './storage';

export async function authFetch(url, options = {}, tokenOverride = null) {
    const token = tokenOverride || await getHaToken();
    const headers = {
        ...(options.headers || {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {})
    };

    return fetch(url, {
        ...options,
        headers,
    });
}
