/**
 * useNotifications — DB-backed notification store
 *
 * Fetches notifications from /api/notifications/history on mount.
 * Persists across app kills — the backend saves every push to the
 * Notification table, so the list is always available after a cold start.
 *
 * Notification shape (from DB, normalised for the modal):
 *   { id, title, body, category, entity_id, read, unread, timestamp, createdAt }
 */

import { useState, useCallback, useEffect, useRef } from 'react';

export default function useNotifications(adminUrl, haToken) {
    const [notifications, setNotifications] = useState([]);
    const [unreadCount,   setUnreadCount]   = useState(0);
    const loadedRef = useRef(false);

    // ── Build request headers ─────────────────────────────────────────────────
    const getHeaders = useCallback(() => ({
        'Authorization': `Bearer ${haToken}`,
        'Content-Type':  'application/json',
    }), [haToken]);

    const baseUrl = (adminUrl ?? '').replace(/\/$/, '');

    // ── Fetch from DB ─────────────────────────────────────────────────────────
    const fetchNotifications = useCallback(() => {
        if (!adminUrl || !haToken) return;
        fetch(`${baseUrl}/api/notifications/history`, { headers: getHeaders() })
            .then(res => res.json())
            .then(data => {
                if (data.success && Array.isArray(data.notifications)) {
                    const normalised = data.notifications.map(n => ({
                        ...n,
                        unread:    !n.read,
                        timestamp: new Date(n.createdAt).getTime(),
                    }));
                    setNotifications(normalised);
                    setUnreadCount(data.unreadCount ?? normalised.filter(n => n.unread).length);
                }
            })
            .catch(err => console.warn('[useNotifications] fetch error:', err.message));
    }, [adminUrl, haToken, baseUrl, getHeaders]);

    // Load once on mount
    useEffect(() => {
        if (loadedRef.current) return;
        loadedRef.current = true;
        fetchNotifications();
    }, [fetchNotifications]);

    // ── Add (optimistic) — real save happens server-side in ha-notifier ───────
    // Shows the notification immediately in the modal while foreground.
    const addNotification = useCallback((title, body, category = 'default') => {
        const newItem = {
            id:        `local_${Date.now()}`,
            title:     title    || '',
            body:      body     || '',
            category:  category || 'default',
            entity_id: null,
            read:      false,
            unread:    true,
            timestamp: Date.now(),
            createdAt: new Date().toISOString(),
        };
        setNotifications(prev => [newItem, ...prev].slice(0, 100));
        setUnreadCount(prev => prev + 1);
    }, []);

    // ── Mark all as read ──────────────────────────────────────────────────────
    const markAllRead = useCallback(() => {
        setNotifications(prev => prev.map(n => ({ ...n, unread: false, read: true })));
        setUnreadCount(0);
        if (!adminUrl || !haToken) return;
        fetch(`${baseUrl}/api/notifications/history`, { method: 'PATCH', headers: getHeaders() })
            .catch(err => console.warn('[useNotifications] markAllRead error:', err.message));
    }, [adminUrl, haToken, baseUrl, getHeaders]);

    // ── Clear all ─────────────────────────────────────────────────────────────
    const clearAll = useCallback(() => {
        setNotifications([]);
        setUnreadCount(0);
        if (!adminUrl || !haToken) return;
        fetch(`${baseUrl}/api/notifications/history`, { method: 'DELETE', headers: getHeaders() })
            .catch(err => console.warn('[useNotifications] clearAll error:', err.message));
    }, [adminUrl, haToken, baseUrl, getHeaders]);

    // ── Refresh (call when modal opens to get latest) ─────────────────────────
    const refresh = useCallback(() => {
        fetchNotifications();
    }, [fetchNotifications]);

    return { notifications, unreadCount, addNotification, markAllRead, clearAll, refresh };
}
