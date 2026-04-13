/**
 * useNotifications — persistent notification store with 3-day TTL
 *
 * AsyncStorage keys:
 *   'app_notifications'  — JSON array of notification objects
 *   'pending_notif_open' — '1' when the user tapped a push from the lock screen
 *
 * Notification shape:
 *   { id: string, title: string, body: string, category: string,
 *     timestamp: number, unread: boolean }
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY   = 'app_notifications';
const TTL_MS        = 3 * 24 * 60 * 60 * 1000; // 3 days
const MAX_ITEMS     = 100;

/** Remove notifications older than TTL_MS */
function pruneOld(list) {
    const cutoff = Date.now() - TTL_MS;
    return list.filter(n => n.timestamp >= cutoff);
}

/** Stable string ID from current time + random nibble */
function makeId() {
    return `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

export default function useNotifications() {
    const [notifications, setNotifications] = useState([]);
    const [unreadCount,   setUnreadCount]   = useState(0);
    // Prevents double-writes on concurrent addNotification calls
    const writeLock = useRef(false);

    // ── Load from AsyncStorage on mount ──────────────────────────────────────
    useEffect(() => {
        (async () => {
            try {
                const raw  = await AsyncStorage.getItem(STORAGE_KEY);
                const list = raw ? JSON.parse(raw) : [];
                const fresh = pruneOld(list);

                // Persist pruned version if something was removed
                if (fresh.length !== list.length) {
                    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
                }

                setNotifications(fresh);
                setUnreadCount(fresh.filter(n => n.unread).length);
            } catch (e) {
                console.warn('[useNotifications] load error:', e);
            }
        })();
    }, []);

    // ── Add a new notification ────────────────────────────────────────────────
    const addNotification = useCallback(async (title, body, category = 'default') => {
        const newItem = {
            id:        makeId(),
            title:     title  || '',
            body:      body   || '',
            category:  category,
            timestamp: Date.now(),
            unread:    true,
        };

        try {
            // Read → update → write (serialised via lock)
            while (writeLock.current) {
                await new Promise(r => setTimeout(r, 20));
            }
            writeLock.current = true;

            const raw      = await AsyncStorage.getItem(STORAGE_KEY);
            const existing = raw ? JSON.parse(raw) : [];
            const fresh    = pruneOld(existing);
            const updated  = [newItem, ...fresh].slice(0, MAX_ITEMS);

            await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
            setNotifications(updated);
            setUnreadCount(updated.filter(n => n.unread).length);
        } catch (e) {
            console.warn('[useNotifications] addNotification error:', e);
            // Still update UI state so the bell works even if storage fails
            setNotifications(prev => [newItem, ...prev].slice(0, MAX_ITEMS));
            setUnreadCount(prev => prev + 1);
        } finally {
            writeLock.current = false;
        }
    }, []);

    // ── Mark all as read ──────────────────────────────────────────────────────
    const markAllRead = useCallback(async () => {
        try {
            const raw  = await AsyncStorage.getItem(STORAGE_KEY);
            const list = raw ? JSON.parse(raw) : [];
            const updated = list.map(n => ({ ...n, unread: false }));
            await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
            setNotifications(updated);
            setUnreadCount(0);
        } catch (e) {
            console.warn('[useNotifications] markAllRead error:', e);
            setNotifications(prev => prev.map(n => ({ ...n, unread: false })));
            setUnreadCount(0);
        }
    }, []);

    // ── Clear all notifications ───────────────────────────────────────────────
    const clearAll = useCallback(async () => {
        try {
            await AsyncStorage.removeItem(STORAGE_KEY);
        } catch (e) {
            console.warn('[useNotifications] clearAll error:', e);
        }
        setNotifications([]);
        setUnreadCount(0);
    }, []);

    return {
        notifications,
        unreadCount,
        addNotification,
        markAllRead,
        clearAll,
    };
}
