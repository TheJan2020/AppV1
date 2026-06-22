import { useMemo, useState, useEffect, useRef } from 'react';
import {
    analyzeEntitiesHealth,
    HA_STATUS,
    ADMIN_STATUS,
} from '../utils/haEntityHealth';

/**
 * Derive banner copy + whether HA service calls should be allowed.
 * Warnings are delayed by 10 seconds to avoid showing transient connection issues.
 */
export function useHaSystemHealth({ entities = [], haStatus, adminStatus }) {
    const [debouncedStatus, setDebouncedStatus] = useState({
        haStatus: haStatus,
        adminStatus: adminStatus,
        showWarning: false,
    });
    const timerRef = useRef(null);
    const errorStartTimeRef = useRef(null);

    // Debounce error states by 10 seconds
    useEffect(() => {
        const hasError = 
            haStatus === HA_STATUS.DISCONNECTED ||
            haStatus === HA_STATUS.AUTH_FAILED ||
            adminStatus === ADMIN_STATUS.ERROR;

        const hasDegradedEntities = analyzeEntitiesHealth(entities, { thresholdPct: 0.5 }).isDegraded;

        if (hasError || hasDegradedEntities) {
            // Start or continue error timer
            if (!errorStartTimeRef.current) {
                errorStartTimeRef.current = Date.now();
            }

            if (timerRef.current) {
                clearTimeout(timerRef.current);
            }

            timerRef.current = setTimeout(() => {
                setDebouncedStatus({
                    haStatus,
                    adminStatus,
                    showWarning: true,
                });
            }, 10000); // 10 second delay
        } else {
            // Clear error state immediately when recovered
            if (timerRef.current) {
                clearTimeout(timerRef.current);
                timerRef.current = null;
            }
            errorStartTimeRef.current = null;
            setDebouncedStatus({
                haStatus,
                adminStatus,
                showWarning: false,
            });
        }

        return () => {
            if (timerRef.current) {
                clearTimeout(timerRef.current);
            }
        };
    }, [haStatus, adminStatus, entities]);

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

        // Only show banner if debounce timer has completed OR if it's a config issue (NOT_CONFIGURED/AUTH_FAILED)
        const shouldShowBanner = debouncedStatus.showWarning || 
            haStatus === HA_STATUS.NOT_CONFIGURED || 
            haStatus === HA_STATUS.AUTH_FAILED;

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
        } else if (shouldShowBanner && haStatus === HA_STATUS.DISCONNECTED) {
            banner = {
                variant: 'ha_down',
                shortLabel: 'HA is down',
                title: 'Home Assistant is offline',
                body: 'Cannot reach your Home Assistant server. Controls are disabled until it reconnects. If this persists, please contact support.',
            };
        } else if (shouldShowBanner && adminDown) {
            banner = {
                variant: 'admin_down',
                shortLabel: 'Admin server down',
                title: 'System issue detected',
                body: 'The admin dashboard is unreachable. Scenes, mappings, and some features may not work. Please contact support if this continues.',
            };
        } else if (shouldShowBanner && entityHealth.isDegraded) {
            const pct = Math.round(entityHealth.badPct * 100);
            banner = {
                variant: 'degraded',
                shortLabel: 'HA is down',
                title: 'Home Assistant degraded',
                body: `${entityHealth.badCount} of ${entityHealth.total} devices are unknown or unavailable (${pct}%). Home Assistant may be starting up or having issues. Contact support if this persists.`,
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
    }, [entities, haStatus, adminStatus, debouncedStatus.showWarning]);
}
