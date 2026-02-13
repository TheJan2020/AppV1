import * as SecureStore from 'expo-secure-store';

export const getActiveProfileConfig = async () => {
    try {
        const activeProfileId = await SecureStore.getItemAsync('ha_active_profile_id');
        const profilesJson = await SecureStore.getItemAsync('ha_profiles');

        if (activeProfileId && profilesJson) {
            const profiles = JSON.parse(profilesJson);
            const activeProfile = profiles.find(p => p.id === activeProfileId);

            if (activeProfile) {
                // Ensure URLs don't have trailing slashes if they are meant to be base URLs
                const cleanUrl = activeProfile.haUrl ? activeProfile.haUrl.replace(/\/$/, '') : '';
                const cleanAdminUrl = activeProfile.adminUrl ? activeProfile.adminUrl.replace(/\/$/, '') : '';

                return {
                    ...activeProfile,
                    haUrl: cleanUrl,
                    adminUrl: cleanAdminUrl
                };
            }
        }
        return null;
    } catch (e) {
        console.error('[ProfileService] Error getting active config:', e);
        return null;
    }
};
