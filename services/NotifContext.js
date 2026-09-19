/**
 * Last tapped / cold-start push notification.
 * Intercom taps open the door-call screen; other taps keep the existing alert modal.
 */
import { createContext, useCallback, useEffect, useMemo, useState } from 'react';
import Constants from 'expo-constants';

const isExpoGo = Constants.appOwnership === 'expo'
    || Constants.executionEnvironment === 'storeClient';

export const NotifContext = createContext({
    pendingNotif: null,
    clearNotif: () => {},
});

function parseResponse(response) {
    const content = response?.notification?.request?.content;
    if (!content) return null;
    const data = content.data && typeof content.data === 'object' ? content.data : {};
    return {
        title: content.title || '',
        body: content.body || '',
        category: data.category || data.type || '',
        timestamp: Date.now(),
        data,
        type: data.type || '',
    };
}

export function PushNotifProvider({ children }) {
    const [pendingNotif, setPendingNotif] = useState(null);
    const clearNotif = useCallback(() => setPendingNotif(null), []);

    useEffect(() => {
        if (isExpoGo) return undefined;
        let Notifications;
        try {
            Notifications = require('expo-notifications');
        } catch {
            return undefined;
        }

        let sub;
        (async () => {
            try {
                const last = await Notifications.getLastNotificationResponseAsync();
                const parsed = parseResponse(last);
                if (parsed) setPendingNotif(parsed);
            } catch { /* ignore */ }
        })();

        sub = Notifications.addNotificationResponseReceivedListener((response) => {
            const parsed = parseResponse(response);
            if (parsed) setPendingNotif(parsed);
        });
        return () => {
            try { sub?.remove(); } catch { /* ignore */ }
        };
    }, []);

    const value = useMemo(() => ({ pendingNotif, clearNotif }), [pendingNotif, clearNotif]);
    return (
        <NotifContext.Provider value={value}>
            {children}
        </NotifContext.Provider>
    );
}
