const { withInfoPlist, withAndroidManifest } = require('@expo/config-plugins');

const BACKGROUND_MODES = ['audio', 'voip', 'remote-notification'];

function withIntercomVoip(config) {
    config = withInfoPlist(config, (mod) => {
        const current = mod.modResults.UIBackgroundModes;
        const modes = Array.isArray(current) ? [...current] : [];
        for (const mode of BACKGROUND_MODES) {
            if (!modes.includes(mode)) modes.push(mode);
        }
        mod.modResults.UIBackgroundModes = modes;
        return mod;
    });

    config = withAndroidManifest(config, (mod) => {
        const manifest = mod.modResults.manifest;
        if (!manifest['uses-permission']) manifest['uses-permission'] = [];
        const permissions = [
            'android.permission.USE_FULL_SCREEN_INTENT',
            'android.permission.TURN_SCREEN_ON',
            'android.permission.DISABLE_KEYGUARD',
            'android.permission.WAKE_LOCK',
            'android.permission.VIBRATE',
            'android.permission.POST_NOTIFICATIONS',
        ];
        const existing = new Set(
            manifest['uses-permission'].map((p) => p.$?.['android:name']).filter(Boolean)
        );
        for (const name of permissions) {
            if (existing.has(name)) continue;
            manifest['uses-permission'].push({ $: { 'android:name': name } });
        }
        return mod;
    });

    return config;
}

module.exports = withIntercomVoip;
