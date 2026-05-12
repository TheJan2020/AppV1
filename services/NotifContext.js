/**
 * NotifContext
 *
 * Provides the last-tapped push notification to any screen that needs it.
 * Captured once in _layout.jsx (which is always mounted first) and consumed
 * in dashboard-v2.jsx to show the AlertNotificationModal.
 */
import { createContext } from 'react';

export const NotifContext = createContext({
    pendingNotif: null,       // { title, body, category, timestamp } | null
    clearNotif:   () => {},   // call after consuming to avoid re-showing
});
