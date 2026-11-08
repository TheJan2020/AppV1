import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import IntercomCallModal from './IntercomCallModal';
import { getAdminUrl, getHaToken } from '../../utils/storage';
import { getIntercomUnlockService } from '../../services/intercomHaBridge';
import IntercomCall from '../../modules/expo-intercom-call';
import { registerForPushNotificationsAsync } from '../../services/notifications';
import { setIntercomLineStatus } from '../../services/intercomLineStatus';

function readUser(raw) {
    try {
        const user = raw ? JSON.parse(raw) : null;
        return {
            userId: String(user?.userId || user?.user_id || user?.id || '').trim(),
            userName: String(user?.name || user?.username || '').trim(),
        };
    } catch {
        return { userId: '', userName: '' };
    }
}

export default function IntercomHost() {
    const [ctx, setCtx] = useState({ adminUrl: '', userId: '', userName: '', token: '' });

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            if (AppState.currentState !== 'active') return;
            try {
                const [adminUrl, raw, token] = await Promise.all([
                    getAdminUrl(),
                    SecureStore.getItemAsync('logged_in_user'),
                    getHaToken(),
                ]);
                const user = readUser(raw);
                if (cancelled) return;
                const next = {
                    adminUrl: String(adminUrl || '').trim(),
                    userId: user.userId,
                    userName: user.userName,
                    token: String(token || '').trim(),
                };
                setCtx((prev) => (
                    prev.adminUrl === next.adminUrl
                    && prev.userId === next.userId
                    && prev.userName === next.userName
                    && prev.token === next.token
                        ? prev
                        : next
                ));
                if (!next.adminUrl) {
                    setIntercomLineStatus({ level: 'off' });
                }
                if (next.adminUrl && IntercomCall.isAvailable()) {
                    IntercomCall.configure(next.adminUrl, next.userId, next.userName);
                }
                if (next.adminUrl) {
                    registerForPushNotificationsAsync().catch(() => {});
                }
            } catch {
                /* keep last */
            }
        };
        load();
        const tick = setInterval(load, 12000);
        const sub = AppState.addEventListener('change', (state) => {
            if (state === 'active') load();
        });
        return () => {
            cancelled = true;
            clearInterval(tick);
            sub.remove();
        };
    }, []);

    if (!ctx.adminUrl) return null;

    return (
        <IntercomCallModal
            adminUrl={ctx.adminUrl}
            userId={ctx.userId}
            userName={ctx.userName}
            callService={getIntercomUnlockService()}
            token={ctx.token}
        />
    );
}
