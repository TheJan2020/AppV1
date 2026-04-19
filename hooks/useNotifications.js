/**
 * useNotifications — EntityHistory-backed notification store
 *
 * Reads from /api/notifications/history which queries EntityHistory
 * filtered by MonitoredEntity (ignored=0).  No new DB table needed.
 *
 * "Clear all"  → DELETE /api/notifications/history  (writes cleared_at on server)
 * "Mark read"  → PATCH  /api/notifications/history  (writes read_at on server)
 *
 * Notification shape:
 *   { id, entity_id, title, body, category, timestamp, read, unread }
 */

import { useState, useCallback, useEffect, useRef } from 'react';

export default function useNotifications(adminUrl, haToken) {
    const [notifications, setNotifications] = useState([]);
    const [unreadCount,   setUnreadCount]   = useState(0);
    const loadedRef = useRef(false);

    // Keep latest values in refs so callbacks never need to be recreated
    const adminUrlRef = useRef(adminUrl);
    const haTokenRef  = useRef(haToken);
    useEffect(() => { adminUrlRef.current = adminUrl; }, [adminUrl]);
    useEffect(() => { haTokenRef.current  = haToken;  }, [haToken]);

    const getBase    = () => (adminUrlRef.current ?? '').replace(/\/$/, '');
    const getHeaders = () => ({
        'Authorization': `Bearer ${haTokenRef.current}`,
        'Content-Type':  'application/json',
    });

    // ── Fetch from server ─────────────────────────────────────────────────────
    // Stable reference — reads latest adminUrl/haToken via refs, never changes
    const fetchNotifications = useCallback(() => {
        if (!adminUrlRef.current || !haTokenRef.current) return;
        fetch(`${getBase()}/api/notifications/history`, { headers: getHeaders() })
            .then(res => res.json())
            .then(data => {
                if (data.success && Array.isArray(data.notifications)) {
                    setNotifications(data.notifications);
                    setUnreadCount(data.unreadCount ?? data.notifications.filter(n => n.unread).length);
                }
            })
            .catch(err => console.warn('[useNotifications] fetch error:', err.message));
    }, []); // ← no deps: always stable, reads latest via refs

    // Load once — when adminUrl first becomes available
    useEffect(() => {
        if (!adminUrl || !haToken) return;   // wait until config is ready
        if (loadedRef.current) return;
        loadedRef.current = true;
        fetchNotifications();
    }, [adminUrl, haToken]); // ← run when config arrives; guard prevents double-fetch

    // ── Optimistic add (foreground in-app notifications appear instantly) ─────
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
        };
        setNotifications(prev => [newItem, ...prev].slice(0, 100));
        setUnreadCount(prev => prev + 1);
    }, []); // stable

    // ── Mark all as read ──────────────────────────────────────────────────────
    const markAllRead = useCallback(() => {
        setNotifications(prev => prev.map(n => ({ ...n, unread: false, read: true })));
        setUnreadCount(0);
        if (!adminUrlRef.current || !haTokenRef.current) return;
        fetch(`${getBase()}/api/notifications/history`, { method: 'PATCH', headers: getHeaders() })
            .catch(err => console.warn('[useNotifications] markAllRead error:', err.message));
    }, []); // stable

    // ── Clear all ─────────────────────────────────────────────────────────────
    const clearAll = useCallback(() => {
        setNotifications([]);
        setUnreadCount(0);
        if (!adminUrlRef.current || !haTokenRef.current) return;
        fetch(`${getBase()}/api/notifications/history`, { method: 'DELETE', headers: getHeaders() })
            .catch(err => console.warn('[useNotifications] clearAll error:', err.message));
    }, []); // stable

    // ── Refresh (call when modal opens) ──────────────────────────────────────
    const refresh = fetchNotifications; // same stable reference

    return { notifications, unreadCount, addNotification, markAllRead, clearAll, refresh };
}
