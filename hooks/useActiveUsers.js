import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Hook to fetch active app users from the backend
 * Fetches from {adminUrl}/api/sessions endpoint and returns online users
 *
 * @param {string} adminUrl - Base backend URL, e.g. https://office2be.primewave1.click
 * @param {string} token - Bearer token (HA_TOKEN) required by backend proxy auth
 * @param {number} pollMs - Polling interval in ms (default 20000)
 */
export function useActiveUsers(adminUrl, token, pollMs = 20000) {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const intervalRef = useRef(null);
    const abortRef = useRef(null);

    const fetchActiveUsers = useCallback(async () => {
        if (!adminUrl) {
            setLoading(false);
            return;
        }
        try {
            setError(null);

            if (abortRef.current) abortRef.current.abort();
            const controller = new AbortController();
            abortRef.current = controller;

            const base = adminUrl.endsWith('/') ? adminUrl : `${adminUrl}/`;
            const url = `${base}api/sessions?t=${Date.now()}`;

            const headers = {};
            if (token) headers['Authorization'] = `Bearer ${token}`;

            const response = await fetch(url, { signal: controller.signal, headers });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();

            setUsers(Array.isArray(data.online) ? data.online : []);
            setLoading(false);
        } catch (err) {
            if (err?.name === 'AbortError') return;
            console.log('[useActiveUsers] Error fetching users:', err?.message || err);
            setError(err?.message || 'Failed to load');
            setLoading(false);
        }
    }, [adminUrl, token]);

    useEffect(() => {
        fetchActiveUsers();

        intervalRef.current = setInterval(fetchActiveUsers, pollMs);

        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
            if (abortRef.current) abortRef.current.abort();
        };
    }, [fetchActiveUsers, pollMs]);

    return { users, loading, error, refetch: fetchActiveUsers };
}

