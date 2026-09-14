/**
 * Owner-only global camera visibility switch. Mirrors the backend routes in
 * AppBackendV1: /api/cameras/visibility/{disable,request-enable,verify-enable}.
 *
 * Turning cameras OFF is instant (hides them from every account/device).
 * Turning them back ON requires a 6-digit code emailed to the owner's
 * recovery address (same pattern as "Forgot password").
 */
import { authFetch } from '../utils/authFetch';

function base(adminUrl) {
    const clean = String(adminUrl || '').replace(/\/+$/, '');
    return clean;
}

async function postJson(adminUrl, path, body) {
    const url = `${base(adminUrl)}${path}`;
    const res = await authFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body || {}),
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok && data?.ok !== false, ...data };
}

/** Instantly hides cameras from every account/device. Owner-only. */
export async function disableCamerasGlobally(adminUrl, username) {
    return postJson(adminUrl, '/api/cameras/visibility/disable', { username });
}

/** Emails a 6-digit code to the owner's recovery address. Owner-only. */
export async function requestEnableCameras(adminUrl, username) {
    return postJson(adminUrl, '/api/cameras/visibility/request-enable', { username });
}

/** Verifies the emailed code; on success, cameras become visible for everyone again. */
export async function verifyEnableCameras(adminUrl, username, code) {
    return postJson(adminUrl, '/api/cameras/visibility/verify-enable', { username, code });
}
