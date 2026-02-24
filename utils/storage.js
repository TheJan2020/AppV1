import * as SecureStore from 'expo-secure-store';

const SETTINGS_KEY_PROFILES = 'ha_profiles';
const SETTINGS_KEY_ACTIVE_PROFILE = 'ha_active_profile_id';

/**
 * Retrieves the Admin Backend URL from the active profile in SecureStore.
 * Returns null if no profile or no admin URL is configured.
 */
export const getAdminUrl = async () => {
    try {
        // 1. Get Active Profile ID
        const activeProfileId = await SecureStore.getItemAsync(SETTINGS_KEY_ACTIVE_PROFILE);
        if (!activeProfileId) {
            console.log('[Storage] No active profile ID found.');
            return null;
        }

        // 2. Get Profiles
        const profilesJson = await SecureStore.getItemAsync(SETTINGS_KEY_PROFILES);
        if (!profilesJson) {
            console.log('[Storage] No profiles found.');
            return null;
        }

        let profiles = [];
        try {
            profiles = JSON.parse(profilesJson);
        } catch (e) {
            console.error('[Storage] Error parsing profiles JSON:', e);
            return null;
        }

        // 3. Find Active Profile
        const activeProfile = profiles.find(p => p.id === activeProfileId);
        if (!activeProfile) {
            console.log('[Storage] Active profile not found in list.');
            return null;
        }

        // 4. Return Admin URL
        const adminUrl = activeProfile.adminUrl;
        if (adminUrl) {
            const normalizedUrl = adminUrl.replace(/^https?:\/\//i, (m) => m.toLowerCase());
            console.log('[Storage] Retrieved Admin URL from profile:', normalizedUrl);
            return normalizedUrl;
        } else {
            console.log('[Storage] Active profile has no Admin URL.');
            return null;
        }

    } catch (error) {
        console.error('[Storage] Error retrieving Admin URL:', error);
        return null;
    }
};
