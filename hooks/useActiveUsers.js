import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Active app sessions from {adminUrl}/api/sessions?online=1
 */
export function useActiveUsers(adminUrl, token, pollMs = 20000) {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [hasLoaded, setHasLoaded] = useState(false);
    const intervalRef = useRef(null);
    const abortRef = useRef(null);
    const fetchIdRef = useRef(0);
    const hasLoadedRef = useRef(false);

    const fetchActiveUsers = useCallback(async () => {
        if (!adminUrl) {
            setUsers([]);
            setLoading(false);
            setHasLoaded(true);
            hasLoadedRef.current = true;
            return;
        }

        const fetchId = ++fetchIdRef.current;
        if (abortRef.current) abortRef.current.abort();
        const controller = new AbortController();
        abortRef.current = controller;
        const timer = setTimeout(() => controller.abort(), 6000);

        try {
            const base = adminUrl.endsWith('/') ? adminUrl : `${adminUrl}/`;
            const headers = {};
            if (token) headers.Authorization = `Bearer ${token}`;

            const response = await fetch(`${base}api/sessions?online=1&t=${Date.now()}`, {
                signal: controller.signal,
                headers,
            });

            if (fetchId !== fetchIdRef.current) return;
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();
            setUsers(Array.isArray(data.online) ? data.online : []);
            setError(null);
            setHasLoaded(true);
            hasLoadedRef.current = true;
        } catch (err) {
            if (fetchId !== fetchIdRef.current) return;
            if (err?.name === 'AbortError') {
                if (!hasLoadedRef.current) setError('Timed out');
                return;
            }
            setError(err?.message || 'Failed to load');
        } finally {
            clearTimeout(timer);
            if (fetchId === fetchIdRef.current) setLoading(false);
        }
    }, [adminUrl, token]);

    useEffect(() => {
        setHasLoaded(false);
        hasLoadedRef.current = false;
        setLoading(true);
        setError(null);
        fetchActiveUsers();
        intervalRef.current = setInterval(fetchActiveUsers, pollMs);
        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
            if (abortRef.current) abortRef.current.abort();
        };
    }, [fetchActiveUsers, pollMs]);

    return { users, loading: loading && !hasLoaded, error, refetch: fetchActiveUsers };
}
