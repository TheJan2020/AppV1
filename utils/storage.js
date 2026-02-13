import * as SecureStore from 'expo-secure-store';

const SETTINGS_KEY_PROFILES = 'ha_profiles';
const SETTINGS_KEY_ACTIVE_PROFILE = 'ha_active_profile_id';

/**
 * Retrieves the Admin Backend URL from the active profile in SecureStore.
 * Fallback to EXPO_PUBLIC_ADMIN_URL if not found in profile or no profile active.
 */
export const getAdminUrl = async () => {
    try {
        // 1. Get Active Profile ID
        const activeProfileId = await SecureStore.getItemAsync(SETTINGS_KEY_ACTIVE_PROFILE);
        if (!activeProfileId) {
            console.log('[Storage] No active profile ID found. Using env fallback.');
            return process.env.EXPO_PUBLIC_ADMIN_URL;
        }

        // 2. Get Profiles
        const profilesJson = await SecureStore.getItemAsync(SETTINGS_KEY_PROFILES);
        if (!profilesJson) {
            console.log('[Storage] No profiles found. Using env fallback.');
            return process.env.EXPO_PUBLIC_ADMIN_URL;
        }

        let profiles = [];
        try {
            profiles = JSON.parse(profilesJson);
        } catch (e) {
            console.error('[Storage] Error parsing profiles JSON:', e);
            return process.env.EXPO_PUBLIC_ADMIN_URL;
        }

        // 3. Find Active Profile
        const activeProfile = profiles.find(p => p.id === activeProfileId);
        if (!activeProfile) {
            console.log('[Storage] Active profile not found in list. Using env fallback.');
            return process.env.EXPO_PUBLIC_ADMIN_URL;
        }

        // 4. Return Admin URL
        const adminUrl = activeProfile.adminUrl;
        if (adminUrl) {
            console.log('[Storage] Retrieved Admin URL from profile:', adminUrl);
            return adminUrl;
        } else {
            console.log('[Storage] Active profile has no Admin URL. Using env fallback.');
            return process.env.EXPO_PUBLIC_ADMIN_URL;
        }

    } catch (error) {
        console.error('[Storage] Error retrieving Admin URL:', error);
        return process.env.EXPO_PUBLIC_ADMIN_URL;
    }
};
