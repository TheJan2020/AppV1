import { useMemo } from 'react';
import {
    analyzeEntitiesHealth,
    HA_STATUS,
    ADMIN_STATUS,
} from '../utils/haEntityHealth';

/**
 * Derive banner copy + whether HA service calls should be allowed.
 */
export function useHaSystemHealth({ entities = [], haStatus, adminStatus }) {
    return useMemo(() => {
        const entityHealth = analyzeEntitiesHealth(entities, { thresholdPct: 0.5 });

        const haLoading = haStatus === HA_STATUS.LOADING;
        const haConnected = haStatus === HA_STATUS.CONNECTED;
        const haDisconnected =
            haStatus === HA_STATUS.DISCONNECTED ||
            haStatus === HA_STATUS.AUTH_FAILED ||
            haStatus === HA_STATUS.NOT_CONFIGURED;
        const adminDown = adminStatus === ADMIN_STATUS.ERROR;

        let banner = null;

        if (haLoading) {
            banner = null;
        } else if (haStatus === HA_STATUS.NOT_CONFIGURED) {
            banner = {
                variant: 'ha_down',
                shortLabel: 'HA is down',
                title: 'Home Assistant not configured',
                body: 'Add your Home Assistant URL and token in Settings to control devices.',
            };
        } else if (haStatus === HA_STATUS.AUTH_FAILED) {
            banner = {
                variant: 'ha_down',
                shortLabel: 'HA is down',
                title: 'Home Assistant login failed',
                body: 'Your access token was rejected. Check Settings and try again.',
            };
        } else if (haStatus === HA_STATUS.DISCONNECTED) {
            banner = {
                variant: 'ha_down',
                shortLabel: 'HA is down',
                title: 'Home Assistant is offline',
                body: 'Cannot reach your Home Assistant server. Controls are disabled until it reconnects.',
            };
        } else if (adminDown) {
            banner = {
                variant: 'admin_down',
                shortLabel: 'Admin server down',
                title: 'Admin dashboard unreachable',
                body: 'Scenes, mappings, and some features may not work until the admin server is back.',
            };
        } else if (entityHealth.isDegraded) {
            const pct = Math.round(entityHealth.badPct * 100);
            banner = {
                variant: 'degraded',
                shortLabel: 'HA is down',
                title: 'Home Assistant degraded',
                body: `${entityHealth.badCount} of ${entityHealth.total} devices are unknown or unavailable (${pct}%). Home Assistant may be starting up or having issues.`,
            };
        }

        const canControlHa = haConnected && !haDisconnected;

        return {
            entityHealth,
            banner,
            canControlHa,
            haConnected,
            haDisconnected,
            adminDown,
        };
    }, [entities, haStatus, adminStatus]);
}
