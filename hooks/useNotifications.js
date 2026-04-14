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

    const baseUrl    = (adminUrl ?? '').replace(/\/$/, '');
    const getHeaders = useCallback(() => ({
        'Authorization': `Bearer ${haToken}`,
        'Content-Type':  'application/json',
    }), [haToken]);

    // ── Fetch from server ─────────────────────────────────────────────────────
    const fetchNotifications = useCallback(() => {
        if (!adminUrl || !haToken) return;
        fetch(`${baseUrl}/api/notifications/history`, { headers: getHeaders() })
            .then(res => res.json())
            .then(data => {
                if (data.success && Array.isArray(data.notifications)) {
                    setNotifications(data.notifications);
                    setUnreadCount(data.unreadCount ?? data.notifications.filter(n => n.unread).length);
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
    }, []);

    // ── Mark all as read ──────────────────────────────────────────────────────
    const markAllRead = useCallback(() => {
        setNotifications(prev => prev.map(n => ({ ...n, unread: false, read: true })));
        setUnreadCount(0);
        if (!adminUrl || !haToken) return;
        fetch(`${baseUrl}/api/notifications/history`, { method: 'PATCH', headers: getHeaders() })
            .catch(err => console.warn('[useNotifications] markAllRead error:', err.message));
    }, [adminUrl, haToken, baseUrl, getHeaders]);

    // ── Clear all (hides everything before now on server) ────────────────────
    const clearAll = useCallback(() => {
        setNotifications([]);
        setUnreadCount(0);
        if (!adminUrl || !haToken) return;
        fetch(`${baseUrl}/api/notifications/history`, { method: 'DELETE', headers: getHeaders() })
            .catch(err => console.warn('[useNotifications] clearAll error:', err.message));
    }, [adminUrl, haToken, baseUrl, getHeaders]);

    // ── Refresh (call when modal opens) ──────────────────────────────────────
    const refresh = useCallback(() => {
        fetchNotifications();
    }, [fetchNotifications]);

    return { notifications, unreadCount, addNotification, markAllRead, clearAll, refresh };
}
