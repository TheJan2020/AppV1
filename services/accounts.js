/**
 * Multi-account session helpers.
 * Accounts are stored in SecureStore so several users can stay "logged in"
 * and switch from the homepage name without re-entering credentials.
 */
import * as SecureStore from 'expo-secure-store';

const ACCOUNTS_KEY = 'saved_accounts';
const ACTIVE_ACCOUNT_KEY = 'active_account_id';

function makeAccountId(profileId, username) {
    return `${profileId || 'noprofile'}::${(username || '').trim().toLowerCase()}`;
}

export async function listAccounts() {
    try {
        const raw = await SecureStore.getItemAsync(ACCOUNTS_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

async function saveAccounts(accounts) {
    await SecureStore.setItemAsync(ACCOUNTS_KEY, JSON.stringify(accounts));
}

export async function getActiveAccountId() {
    return SecureStore.getItemAsync(ACTIVE_ACCOUNT_KEY);
}

/**
 * Upsert the account that just logged in and make it active.
 * Credentials are kept so the user can switch without typing again.
 */
export async function upsertAccountAndActivate({
    username,
    password,
    name,
    userId = '',
    profileId,
    profileName = '',
}) {
    const id = makeAccountId(profileId, username);
    const accounts = await listAccounts();
    const next = {
        id,
        username: (username || '').trim(),
        password: password || '',
        name: name || username || 'User',
        userId: userId || '',
        profileId: profileId || '',
        profileName: profileName || '',
        updatedAt: Date.now(),
    };

    const idx = accounts.findIndex((a) => a.id === id);
    if (idx >= 0) accounts[idx] = { ...accounts[idx], ...next };
    else accounts.push(next);

    await saveAccounts(accounts);
    await activateAccount(id);
    return next;
}

/**
 * Make an existing saved account the active session (profile + logged_in_user).
 */
export async function activateAccount(accountId) {
    const accounts = await listAccounts();
    const account = accounts.find((a) => a.id === accountId);
    if (!account) throw new Error('Account not found');

    if (account.profileId) {
        await SecureStore.setItemAsync('ha_active_profile_id', account.profileId);
    }

    await SecureStore.setItemAsync(ACTIVE_ACCOUNT_KEY, account.id);
    await SecureStore.setItemAsync('is_logged_in', 'true');
    await SecureStore.setItemAsync('has_logged_in_before', 'true');
    await SecureStore.setItemAsync(
        'logged_in_user',
        JSON.stringify({ name: account.name, userId: account.userId || '' }),
    );

    // Keep legacy Face ID keys in sync with the active account
    if (account.username && account.password) {
        await SecureStore.setItemAsync('saved_username', account.username);
        await SecureStore.setItemAsync('saved_password', account.password);
    }

    return account;
}

/**
 * Remove one account. If others remain, activate the next one.
 * Returns { nextAccount | null } — null means go to login.
 */
export async function removeAccount(accountId) {
    const accounts = await listAccounts();
    const remaining = accounts.filter((a) => a.id !== accountId);
    await saveAccounts(remaining);

    const activeId = await getActiveAccountId();
    if (activeId === accountId || !activeId) {
        if (remaining.length > 0) {
            const next = await activateAccount(remaining[0].id);
            return { nextAccount: next };
        }
        await SecureStore.deleteItemAsync(ACTIVE_ACCOUNT_KEY);
        await SecureStore.deleteItemAsync('is_logged_in');
        await SecureStore.deleteItemAsync('logged_in_user');
        await SecureStore.deleteItemAsync('saved_username');
        await SecureStore.deleteItemAsync('saved_password');
        return { nextAccount: null };
    }

    return { nextAccount: accounts.find((a) => a.id === activeId) || remaining[0] || null };
}

/**
 * Log out the currently active account (remove it from the multi-account list).
 */
export async function logoutActiveAccount() {
    const activeId = await getActiveAccountId();
    if (activeId) return removeAccount(activeId);

    // Legacy single-session: clear session keys only
    await SecureStore.deleteItemAsync('is_logged_in');
    await SecureStore.deleteItemAsync('logged_in_user');
    const faceOn = (await SecureStore.getItemAsync('face_id_enabled')) === 'true';
    if (!faceOn) {
        await SecureStore.deleteItemAsync('saved_username');
        await SecureStore.deleteItemAsync('saved_password');
    }
    return { nextAccount: null };
}

/**
 * Migrate legacy session into saved_accounts if the list is empty.
 * Password is optional (needed later for Face ID / re-auth only).
 */
export async function ensureAccountsMigrated() {
    const existing = await listAccounts();
    if (existing.length > 0) return existing;

    const [isLoggedIn, userJson, username, password, profileId, profilesJson] = await Promise.all([
        SecureStore.getItemAsync('is_logged_in'),
        SecureStore.getItemAsync('logged_in_user'),
        SecureStore.getItemAsync('saved_username'),
        SecureStore.getItemAsync('saved_password'),
        SecureStore.getItemAsync('ha_active_profile_id'),
        SecureStore.getItemAsync('ha_profiles'),
    ]);

    if (isLoggedIn !== 'true' || !userJson || !profileId) return existing;

    let name = 'User';
    let userId = '';
    try {
        const u = JSON.parse(userJson);
        name = u.name || name;
        userId = u.userId || '';
    } catch {
        // ignore
    }

    let profileName = '';
    try {
        const profiles = JSON.parse(profilesJson || '[]');
        profileName = profiles.find((p) => p.id === profileId)?.name || '';
    } catch {
        // ignore
    }

    // Prefer saved username; fall back to a stable id from the display name
    const uname =
        (username || '').trim() ||
        name.toLowerCase().replace(/\s+/g, '_') ||
        `user_${profileId}`;

    await upsertAccountAndActivate({
        username: uname,
        password: password || '',
        name,
        userId,
        profileId,
        profileName,
    });
    return listAccounts();
}
