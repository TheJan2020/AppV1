import TVController from './TVController';

/**
 * AndroidTVAdapter — Bridge-based approach
 *
 * Android TV's native remote protocol requires raw TCP + protobuf (not available in Expo managed).
 * This adapter works with an optional REST bridge the user can run on their network.
 * Example bridge: simple ADB-over-HTTP server that accepts keyevent commands.
 *
 * Expected bridge API:
 *   POST {bridgeUrl}/command  body: { key: 'KEYCODE_VOLUME_UP' }
 *   GET  {bridgeUrl}/state    returns: { power, volume, app, ... }
 *   GET  {bridgeUrl}/apps     returns: [{ id, name, icon }]
 */

const ADB_KEY_MAP = {
    POWER: 'KEYCODE_POWER',
    VOLUME_UP: 'KEYCODE_VOLUME_UP',
    VOLUME_DOWN: 'KEYCODE_VOLUME_DOWN',
    MUTE: 'KEYCODE_VOLUME_MUTE',
    CHANNEL_UP: 'KEYCODE_CHANNEL_UP',
    CHANNEL_DOWN: 'KEYCODE_CHANNEL_DOWN',
    UP: 'KEYCODE_DPAD_UP',
    DOWN: 'KEYCODE_DPAD_DOWN',
    LEFT: 'KEYCODE_DPAD_LEFT',
    RIGHT: 'KEYCODE_DPAD_RIGHT',
    OK: 'KEYCODE_DPAD_CENTER',
    BACK: 'KEYCODE_BACK',
    HOME: 'KEYCODE_HOME',
    MENU: 'KEYCODE_MENU',
    PLAY: 'KEYCODE_MEDIA_PLAY',
    PAUSE: 'KEYCODE_MEDIA_PAUSE',
    STOP: 'KEYCODE_MEDIA_STOP',
};

export default class AndroidTVAdapter extends TVController {
    constructor(config) {
        super(config);
        this._tvState = { power: false, volume: null, source: null, app: null };
    }

    async connect() {
        const { bridgeUrl } = this.config;
        if (!bridgeUrl) {
            throw new Error('Bridge URL is required for Android TV control');
        }

        this._intentionalClose = false;
        this.connecting = true;

        // Test bridge connectivity
        try {
            const resp = await fetch(`${bridgeUrl}/state`, { method: 'GET', timeout: 5000 });
            if (!resp.ok) throw new Error(`Bridge returned ${resp.status}`);
            const state = await resp.json();
            this._tvState = { ...this._tvState, ...state };
            this.connected = true;
            this.connecting = false;
            this._connectCallback?.();
            this._emitState({ ...this._tvState, connected: true });
        } catch (err) {
            this.connecting = false;
            throw new Error(`Cannot reach bridge: ${err.message}`);
        }
    }

    async disconnect() {
        this._intentionalClose = true;
        this.connected = false;
        this._disconnectCallback?.();
    }

    async sendCommand(command) {
        const key = ADB_KEY_MAP[command];
        if (!key) throw new Error(`Unknown command: ${command}`);

        const { bridgeUrl } = this.config;
        const resp = await fetch(`${bridgeUrl}/command`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key }),
        });

        if (!resp.ok) throw new Error(`Command failed: ${resp.status}`);
    }

    async getApps() {
        try {
            const { bridgeUrl } = this.config;
            const resp = await fetch(`${bridgeUrl}/apps`);
            if (!resp.ok) return [];
            return await resp.json();
        } catch {
            return [];
        }
    }

    async launchApp(appId) {
        const { bridgeUrl } = this.config;
        await fetch(`${bridgeUrl}/launch`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ appId }),
        });
    }

    async sendText(text) {
        const { bridgeUrl } = this.config;
        await fetch(`${bridgeUrl}/text`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text }),
        });
    }

    async openYouTube(videoId) {
        const { bridgeUrl } = this.config;
        await fetch(`${bridgeUrl}/launch`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                appId: 'com.google.android.youtube.tv',
                intentUri: `https://www.youtube.com/watch?v=${videoId}`,
            }),
        });
    }

    async getState() {
        try {
            const { bridgeUrl } = this.config;
            const resp = await fetch(`${bridgeUrl}/state`);
            if (resp.ok) {
                const state = await resp.json();
                this._tvState = { ...this._tvState, ...state };
            }
        } catch { }
        return { ...this._tvState };
    }
}
