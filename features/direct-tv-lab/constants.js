export const TV_TYPES = {
    SAMSUNG: 'samsung',
    LG: 'lg',
    ANDROID: 'android',
};

export const DEFAULT_PORTS = {
    [TV_TYPES.SAMSUNG]: 8001,
    [TV_TYPES.LG]: 3000,
    [TV_TYPES.ANDROID]: 5555,
};

export const STORAGE_KEYS = {
    [TV_TYPES.SAMSUNG]: 'tvlab_samsung_config',
    [TV_TYPES.LG]: 'tvlab_lg_config',
    [TV_TYPES.ANDROID]: 'tvlab_android_config',
};

export const CONNECTION_TIMEOUT = 10000;
export const RECONNECT_DELAY = 3000;
export const MAX_RECONNECT_ATTEMPTS = 3;
