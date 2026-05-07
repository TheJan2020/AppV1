/**
 * useNotifications — unified notification store
 *
 * Merges TWO sources into one sorted list (newest first):
 *   1. /api/notifications/history  — EntityHistory DB (lights, AC, sensors, etc.)
 *   2. /api/notifications/log      — notifications-log.json (locks/sensors sent by backend push)
 *
 * "Clear all"  → DELETE both endpoints
 * "Mark read"  → PATCH  /api/notifications/history  (log entries are always unread until cleared)
 *
 * Notification shape:
 *   { id, entity_id, title, body, category, timestamp, read, unread, source }
 */

import { useState, useCallback, useEffect, useRef } from 'react';

export default function useNotifications(adminUrl, haToken) {
    const [notifications, setNotifications] = useState([]);
    const [unreadCount,   setUnreadCount]   = useState(0);
    const loadedRef = useRef(false);

    const adminUrlRef = useRef(adminUrl);
    const haTokenRef  = useRef(haToken);
    useEffect(() => { adminUrlRef.current = adminUrl; }, [adminUrl]);
    useEffect(() => { haTokenRef.current  = haToken;  }, [haToken]);

    const getBase    = () => (adminUrlRef.current ?? '').replace(/\/$/, '');
    const getHeaders = () => ({
        'Authorization': `Bearer ${haTokenRef.current}`,
        'Content-Type':  'application/json',
    });

    // ── Fetch + merge both sources ────────────────────────────────────────────
    const fetchNotifications = useCallback(() => {
        if (!adminUrlRef.current || !haTokenRef.current) return;
        const base = getBase();
        const hdrs = getHeaders();

        Promise.allSettled([
            fetch(`${base}/api/notifications/history`, { headers: hdrs }).then(r => r.json()),
            fetch(`${base}/api/notifications/log`,     { headers: hdrs }).then(r => r.json()),
        ]).then(([histResult, logResult]) => {
            // Source 1 — EntityHistory
            const histItems = (histResult.status === 'fulfilled' && histResult.value?.success)
                ? (histResult.value.notifications || []).map(n => ({ ...n, source: 'history' }))
                : [];

            // Source 2 — notifications-log.json (lock/sensor push alerts)
            const logItems = (logResult.status === 'fulfilled' && logResult.value?.success)
                ? (logResult.value.notifications || []).map((n, i) => ({
                    id:        `log_${n.timestamp}_${i}`,
                    entity_id: null,
                    title:     n.title    || '',
                    body:      n.body     || '',
                    category:  n.category || 'lock',
                    timestamp: n.timestamp,
                    read:      false,
                    unread:    true,
                    source:    'log',
                  }))
                : [];

            // Merge & sort newest first — deduplicate by id
            const seen = new Set();
            const merged = [...logItems, ...histItems]
                .filter(n => { if (seen.has(n.id)) return false; seen.add(n.id); return true; })
                .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
                .slice(0, 150);

            setNotifications(merged);
            setUnreadCount(merged.filter(n => n.unread).length);
        });
    }, []);

    // Load once on mount
    useEffect(() => {
        if (!adminUrl || !haToken) return;
        if (loadedRef.current) return;
        loadedRef.current = true;
        fetchNotifications();
    }, [adminUrl, haToken]);

    // ── Optimistic add (foreground socket events appear instantly) ────────────
    const addNotification = useCallback((title, body, category = 'default') => {
        const newItem = {
            id:        `local_${Date.now()}`,
            title:     title    || '',
            body:      body     || '',
            category:  category || 'default',
            entity_id: null,
            read:      false,
            unread:    true,
            timestamp: new Date().toISOString(),
            source:    'local',
        };
        setNotifications(prev => [newItem, ...prev].slice(0, 150));
        setUnreadCount(prev => prev + 1);
    }, []);

    // ── Mark all as read ──────────────────────────────────────────────────────
    const markAllRead = useCallback(() => {
        setNotifications(prev => prev.map(n => ({ ...n, unread: false, read: true })));
        setUnreadCount(0);
        if (!adminUrlRef.current || !haTokenRef.current) return;
        fetch(`${getBase()}/api/notifications/history`, { method: 'PATCH', headers: getHeaders() })
            .catch(err => console.warn('[useNotifications] markAllRead error:', err.message));
    }, []);

    // ── Clear all (both sources) ──────────────────────────────────────────────
    const clearAll = useCallback(() => {
        setNotifications([]);
        setUnreadCount(0);
        if (!adminUrlRef.current || !haTokenRef.current) return;
        const base = getBase();
        const hdrs = getHeaders();
        Promise.allSettled([
            fetch(`${base}/api/notifications/history`, { method: 'DELETE', headers: hdrs }),
            fetch(`${base}/api/notifications/log`,     { method: 'DELETE', headers: hdrs }),
        ]).catch(err => console.warn('[useNotifications] clearAll error:', err.message));
    }, []);

    const refresh = fetchNotifications;

    return { notifications, unreadCount, addNotification, markAllRead, clearAll, refresh };
}
