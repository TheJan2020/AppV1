const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

const RN_TEXT = path.resolve(__dirname, 'node_modules/react-native/Libraries/Text/Text.js');
const RN_TEXT_INPUT = path.resolve(
    __dirname,
    'node_modules/react-native/Libraries/Components/TextInput/TextInput.js',
);
const APP_TEXT = path.resolve(__dirname, 'utils/AppText.js');
const APP_TEXT_INPUT = path.resolve(__dirname, 'utils/AppTextInput.js');

function isFromAppFontWrapper(originModulePath = '') {
    return (
        originModulePath === APP_TEXT
        || originModulePath === APP_TEXT_INPUT
        || originModulePath.endsWith(`${path.sep}utils${path.sep}AppText.js`)
        || originModulePath.endsWith(`${path.sep}utils${path.sep}AppTextInput.js`)
        || originModulePath.endsWith(`${path.sep}utils${path.sep}appFontStyle.js`)
    );
}

function isRnTextModule(moduleName = '') {
    return (
        moduleName === './Libraries/Text/Text'
        || moduleName === 'react-native/Libraries/Text/Text'
        || moduleName === 'react-native/Libraries/Text/Text.js'
        || moduleName.endsWith('/Libraries/Text/Text')
        || moduleName.endsWith('/Libraries/Text/Text.js')
    );
}

function isRnTextInputModule(moduleName = '') {
    return (
        moduleName === './Libraries/Components/TextInput/TextInput'
        || moduleName === 'react-native/Libraries/Components/TextInput/TextInput'
        || moduleName === 'react-native/Libraries/Components/TextInput/TextInput.js'
        || moduleName.endsWith('/Libraries/Components/TextInput/TextInput')
        || moduleName.endsWith('/Libraries/Components/TextInput/TextInput.js')
    );
}

config.resolver.resolveRequest = (context, moduleName, platform) => {
    const origin = context.originModulePath || '';

    // App wrappers pull the real RN implementations through these aliases.
    if (moduleName === './rn-text-original' || moduleName.endsWith('/utils/rn-text-original')) {
        return { filePath: RN_TEXT, type: 'sourceFile' };
    }
    if (moduleName === './rn-textinput-original' || moduleName.endsWith('/utils/rn-textinput-original')) {
        return { filePath: RN_TEXT_INPUT, type: 'sourceFile' };
    }

    // Redirect every other RN Text / TextInput import to Clash-aware wrappers.
    if (isRnTextModule(moduleName) && !isFromAppFontWrapper(origin)) {
        return { filePath: APP_TEXT, type: 'sourceFile' };
    }
    if (isRnTextInputModule(moduleName) && !isFromAppFontWrapper(origin)) {
        return { filePath: APP_TEXT_INPUT, type: 'sourceFile' };
    }

    return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
