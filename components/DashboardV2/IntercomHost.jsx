import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import IntercomCallModal from './IntercomCallModal';
import { getAdminUrl, getHaToken, loadHaProfiles, readSessionMirror } from '../../utils/storage';
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
            const pending = IntercomCall.hasPending();
            if (AppState.currentState !== 'active' && !pending) return;
            try {
                let [adminUrl, raw, token] = await Promise.all([
                    getAdminUrl().catch(() => ''),
                    SecureStore.getItemAsync('logged_in_user').catch(() => ''),
                    getHaToken().catch(() => ''),
                ]);
                if (!adminUrl || !raw) {
                    const [mirror, profiles] = await Promise.all([
                        readSessionMirror(),
                        loadHaProfiles(),
                    ]);
                    const profile = profiles.find((p) => p.id === mirror?.profileId) || profiles[0];
                    if (!adminUrl && profile) {
                        adminUrl = profile.adminUrl || profile.adminUrlLive || profile.dashboardUrl || '';
                    }
                    if (!raw && mirror) {
                        raw = JSON.stringify({ name: mirror.name || '', userId: mirror.userId || '' });
                    }
                }
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
