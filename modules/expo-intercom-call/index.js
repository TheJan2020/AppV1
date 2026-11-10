import { EventEmitter, requireNativeModule } from 'expo-modules-core';

let nativeModule = null;
let loadError = null;
let emitter = null;

function getNative() {
    if (nativeModule) return nativeModule;
    if (loadError) throw loadError;
    try {
        nativeModule = requireNativeModule('ExpoIntercomCall');
        return nativeModule;
    } catch (e) {
        loadError = e;
        throw e;
    }
}

function getEmitter() {
    if (!emitter) emitter = new EventEmitter(getNative());
    return emitter;
}

export function isNativeCallAvailable() {
    try {
        return !!getNative()?.isAvailable?.();
    } catch {
        return false;
    }
}

export default {
    isAvailable: () => {
        try {
            return !!getNative().isAvailable();
        } catch {
            return false;
        }
    },
    configure: (adminUrl, userId, userName) => {
        try {
            getNative().configure(String(adminUrl || ''), String(userId || ''), String(userName || ''));
        } catch {
            // Expo Go / missing native binary
        }
    },
    getVoipToken: () => {
        try {
            return getNative().getVoipToken?.() || '';
        } catch {
            return '';
        }
    },
    hasPending: () => {
        try {
            return !!getNative().hasPending?.();
        } catch {
            return false;
        }
    },
    consumePending: () => {
        try {
            return getNative().consumePending?.() || null;
        } catch {
            return null;
        }
    },
    reportIncoming: (callId, label) => {
        try {
            getNative().reportIncoming(String(callId || ''), String(label || 'Front door'));
        } catch {
            // Expo Go
        }
    },
    endCall: (reason) => {
        try {
            getNative().endCall(String(reason || 'remote'));
        } catch {
            // Expo Go
        }
    },
    addListener: (event, listener) => {
        try {
            return getEmitter().addListener(event, listener);
        } catch {
            return { remove() {} };
        }
    },
};
