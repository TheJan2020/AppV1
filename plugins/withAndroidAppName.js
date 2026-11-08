const { withStringsXml } = require('@expo/config-plugins');

const ANDROID_APP_NAME = 'PRIMEWAVE AI';

function withAndroidAppName(config) {
    return withStringsXml(config, (mod) => {
        const resources = mod.modResults.resources || {};
        const strings = Array.isArray(resources.string) ? resources.string : [];
        const existing = strings.find((item) => item.$ && item.$.name === 'app_name');
        if (existing) existing._ = ANDROID_APP_NAME;
        else strings.push({ $: { name: 'app_name' }, _: ANDROID_APP_NAME });
        resources.string = strings;
        mod.modResults.resources = resources;
        return mod;
    });
}

module.exports = withAndroidAppName;
