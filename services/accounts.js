/**
 * Multi-account session helpers.
 * Account list lives in AsyncStorage so several users can stay signed in
 * (SecureStore's ~2KB cap was wiping older accounts when a second login saved).
 *
 * One signed-in user = username + Home Assistant URL. Same pair cannot be added twice.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { loadHaProfiles } from '../utils/storage';

const ACCOUNTS_KEY = 'saved_accounts_v2';
const LEGACY_SECURE_KEY = 'saved_accounts';
const ACTIVE_ACCOUNT_KEY = 'active_account_id';

export function normalizeHaUrl(url) {
    return String(url || '')
        .trim()
        .replace(/^wss:\/\//i, 'https://')
        .replace(/^ws:\/\//i, 'http://')
        .replace(/\/+$/, '')
        .toLowerCase();
}

export function normalizeUsername(username) {
    return String(username || '')
        .trim()
        .toLowerCase()
        .replace(/^person\./, '');
}

function makeAccountId(haUrl, username, userId = '') {
    const user = normalizeUsername(username);
    const url = normalizeHaUrl(haUrl);
    const uid = String(userId || '').trim();
    return `${url || 'nourl'}::${user}${uid ? `::${uid}` : ''}`;
}

export function sameAccount(a, b) {
    if (!a || !b) return false;
    if (a.id && b.id && a.id === b.id) return true;

    const aUser = normalizeUsername(a.username);
    const bUser = normalizeUsername(b.username);
    const aUrl = normalizeHaUrl(a.haUrl);
    const bUrl = normalizeHaUrl(b.haUrl);

    if (aUser && bUser && aUser === bUser && aUrl && bUrl && aUrl === bUrl) return true;

    const sameProfile = !!(a.profileId && b.profileId && a.profileId === b.profileId);
    if (sameProfile && aUser && bUser && aUser === bUser) return true;
    if (sameProfile && a.userId && b.userId && String(a.userId) === String(b.userId)) return true;
    return false;
}

function dedupeAccounts(accounts) {
    const out = [];
    for (const acc of accounts || []) {
        const idx = out.findIndex((x) => sameAccount(x, acc));
        if (idx < 0) {
            out.push(acc);
            continue;
        }
        const prev = out[idx];
        const newer = (acc.updatedAt || 0) >= (prev.updatedAt || 0) ? acc : prev;
        const older = newer === acc ? prev : acc;
        out[idx] = {
            ...older,
            ...newer,
            id: prev.id,
            haUrl: normalizeHaUrl(newer.haUrl || older.haUrl),
            username: normalizeUsername(newer.username || older.username),
        };
    }
    return out;
}

async function hydrateAccountHomes(accounts) {
    let profiles = [];
    try {
        profiles = await loadHaProfiles();
    } catch {
        profiles = [];
    }
    return (accounts || []).map((account) => {
        const fromProfile = profiles.find((p) => p.id === account.profileId);
        return {
            ...account,
            username: normalizeUsername(account.username),
            haUrl: normalizeHaUrl(account.haUrl || fromProfile?.haUrl || ''),
            profileName: account.profileName || fromProfile?.name || '',
        };
    });
}

async function readLegacySecureAccounts() {
    try {
        const raw = await SecureStore.getItemAsync(LEGACY_SECURE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

export async function listAccounts() {
    let stored = [];
    try {
        const raw = await AsyncStorage.getItem(ACCOUNTS_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) stored = parsed;
        }
    } catch (e) {
        console.log('[Accounts] list AsyncStorage failed:', e?.message || e);
    }

    if (stored.length === 0) {
        stored = await readLegacySecureAccounts();
    }

    const hydrated = await hydrateAccountHomes(stored);
    const cleaned = dedupeAccounts(hydrated);
    const shouldPersist =
        cleaned.length !== stored.length
        || cleaned.some((c) => {
            const orig = stored.find((s) => s.id === c.id);
            return !orig
                || normalizeHaUrl(orig.haUrl) !== c.haUrl
                || normalizeUsername(orig.username) !== c.username;
        });
    if (shouldPersist) {
        await saveAccounts(cleaned);
    }
    return cleaned;
}

async function saveAccounts(accounts) {
    const list = Array.isArray(accounts) ? accounts : [];
    await AsyncStorage.setItem(ACCOUNTS_KEY, JSON.stringify(list));
    try {
        await SecureStore.deleteItemAsync(LEGACY_SECURE_KEY);
    } catch {
        // ignore — legacy key may not exist
    }
}

export async function getActiveAccountId() {
    return SecureStore.getItemAsync(ACTIVE_ACCOUNT_KEY);
}

export async function findSavedAccount({ username, haUrl, profileId, userId } = {}) {
    const accounts = await listAccounts();
    return accounts.find((a) => sameAccount(a, { username, haUrl, profileId, userId })) || null;
}

/**
 * Upsert the account that just logged in and make it active.
 * Credentials are kept so the user can switch without typing again.
 * Returns { account, alreadyExisted }.
 */
export async function upsertAccountAndActivate({
    username,
    password,
    name,
    userId = '',
    profileId,
    profileName = '',
    haUrl = '',
}) {
    const accounts = await listAccounts();
    const normalizedUrl = normalizeHaUrl(haUrl);
    const normalizedUser = normalizeUsername(username);
    const next = {
        id: makeAccountId(normalizedUrl, normalizedUser, userId),
        username: normalizedUser,
        password: password || '',
        name: name || username || 'User',
        userId: userId || '',
        profileId: profileId || '',
        profileName: profileName || '',
        haUrl: normalizedUrl,
        updatedAt: Date.now(),
    };

    const idx = accounts.findIndex((a) => sameAccount(a, next));
    const alreadyExisted = idx >= 0;
    if (alreadyExisted) {
        next.id = accounts[idx].id;
        accounts[idx] = { ...accounts[idx], ...next };
    } else {
        accounts.push(next);
    }

    await saveAccounts(dedupeAccounts(accounts));
    await activateAccount(next.id);
    return { account: next, alreadyExisted };
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
 * Ensure the current session is in the saved list, and migrate any legacy store.
 */
export async function ensureAccountsMigrated() {
    let existing = await listAccounts();

    const [isLoggedIn, userJson, username, password, profileId] = await Promise.all([
        SecureStore.getItemAsync('is_logged_in'),
        SecureStore.getItemAsync('logged_in_user'),
        SecureStore.getItemAsync('saved_username'),
        SecureStore.getItemAsync('saved_password'),
        SecureStore.getItemAsync('ha_active_profile_id'),
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

    let profiles = [];
    try {
        profiles = await loadHaProfiles();
    } catch {
        profiles = [];
    }
    const activeProfile = profiles.find((p) => p.id === profileId);
    const haUrl = normalizeHaUrl(activeProfile?.haUrl || '');
    const profileName = activeProfile?.name || '';

    const uname =
        normalizeUsername(username) ||
        normalizeUsername(name) ||
        `user_${profileId}`;

    const already = existing.some((a) =>
        sameAccount(a, { username: uname, userId, profileId, name, haUrl }),
    );
    if (already) return existing;

    await upsertAccountAndActivate({
        username: uname,
        password: password || '',
        name,
        userId,
        profileId,
        profileName,
        haUrl,
    });
    return listAccounts();
}
