/**
 * useNotifications — in-memory notification store
 *
 * Notifications live in React state (survive background, lost on full kill).
 * expo-secure-store (already in the binary) is used only for the tiny
 * lock-screen tap signal (pending_notif_open).
 *
 * Notification shape:
 *   { id: string, title: string, body: string, category: string,
 *     timestamp: number, unread: boolean }
 */

import { useState, useCallback } from 'react';

const TTL_MS    = 3 * 24 * 60 * 60 * 1000; // 3 days
const MAX_ITEMS = 100;

function pruneOld(list) {
    const cutoff = Date.now() - TTL_MS;
    return list.filter(n => n.timestamp >= cutoff);
}

function makeId() {
    return `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

export default function useNotifications() {
    const [notifications, setNotifications] = useState([]);
    const [unreadCount,   setUnreadCount]   = useState(0);

    // ── Add a new notification ────────────────────────────────────────────────
    const addNotification = useCallback((title, body, category = 'default') => {
        const newItem = {
            id:        makeId(),
            title:     title    || '',
            body:      body     || '',
            category:  category,
            timestamp: Date.now(),
            unread:    true,
        };
        setNotifications(prev => [newItem, ...pruneOld(prev)].slice(0, MAX_ITEMS));
        setUnreadCount(prev => prev + 1);
    }, []);

    // ── Mark all as read ──────────────────────────────────────────────────────
    const markAllRead = useCallback(() => {
        setNotifications(prev => prev.map(n => ({ ...n, unread: false })));
        setUnreadCount(0);
    }, []);

    // ── Clear all notifications ───────────────────────────────────────────────
    const clearAll = useCallback(() => {
        setNotifications([]);
        setUnreadCount(0);
    }, []);

    return { notifications, unreadCount, addNotification, markAllRead, clearAll };
}
