import TVController from './TVController';
import { saveConfig } from '../utils/tvLabStorage';
import { TV_TYPES } from '../constants';

const APP_NAME = 'TVControlLab';

const KEY_MAP = {
    POWER: 'KEY_POWER',
    VOLUME_UP: 'KEY_VOLUP',
    VOLUME_DOWN: 'KEY_VOLDOWN',
    MUTE: 'KEY_MUTE',
    CHANNEL_UP: 'KEY_CHUP',
    CHANNEL_DOWN: 'KEY_CHDOWN',
    UP: 'KEY_UP',
    DOWN: 'KEY_DOWN',
    LEFT: 'KEY_LEFT',
    RIGHT: 'KEY_RIGHT',
    OK: 'KEY_ENTER',
    BACK: 'KEY_RETURN',
    HOME: 'KEY_HOME',
    MENU: 'KEY_MENU',
    SOURCE: 'KEY_SOURCE',
    PLAY: 'KEY_PLAY',
    PAUSE: 'KEY_PAUSE',
    STOP: 'KEY_STOP',
};

export default class SamsungTVAdapter extends TVController {
    constructor(config) {
        super(config);
        this._apps = [];
    }

    async connect() {
        this._intentionalClose = false;
        this.connecting = true;

        const { ip, port = 8001, token } = this.config;
        const nameB64 = btoa(APP_NAME);

        // Use ws:// (port 8001) for broad compatibility — wss:// (8002) has self-signed cert issues in RN
        let url = `ws://${ip}:${port}/api/v2/channels/samsung.remote.control?name=${nameB64}`;
        if (token) {
            url += `&token=${token}`;
        }

        await this._createWebSocket(url);

        // Request installed apps after connection
        try { await this._requestApps(); } catch { }
    }

    _handleMessage(data) {
        // Handle connection token
        if (data.data?.token) {
            this.config.token = data.data.token;
            saveConfig(TV_TYPES.SAMSUNG, this.config).catch(() => { });
        }

        // Handle app list response
        if (data.data?.data?.data) {
            // ed.installedApp.get response
            const apps = data.data.data.data;
            if (Array.isArray(apps)) {
                this._apps = apps;
            }
        }

        // Handle events — emit state updates
        if (data.event === 'ms.channel.connect') {
            this._emitState({ power: true, connected: true });
        }

        // Resolve pending requests
        if (data.id) {
            this._resolveRequest(data.id, data);
        }
    }

    async sendCommand(command) {
        const key = KEY_MAP[command];
        if (!key) throw new Error(`Unknown command: ${command}`);

        this._sendJSON({
            method: 'ms.remote.control',
            params: {
                Cmd: 'Click',
                DataOfCmd: key,
                Option: 'false',
                TypeOfRemote: 'SendRemoteKey',
            },
        });
    }

    async _requestApps() {
        this._sendJSON({
            method: 'ms.channel.emit',
            params: {
                event: 'ed.installedApp.get',
                to: 'host',
            },
        });
    }

    async getApps() {
        if (this._apps.length === 0) {
            await this._requestApps();
            // Wait briefly for response
            await new Promise(r => setTimeout(r, 1000));
        }
        return this._apps.map(app => ({
            id: app.appId,
            name: app.name || app.appId,
            icon: app.icon,
        }));
    }

    async launchApp(appId, params = {}) {
        const payload = {
            method: 'ms.channel.emit',
            params: {
                event: 'ed.apps.launch',
                to: 'host',
                data: {
                    appId,
                    action_type: params.url ? 'DEEP_LINK' : 'NATIVE_LAUNCH',
                    metaTag: params.url || appId,
                },
            },
        };
        this._sendJSON(payload);
    }

    async sendText(text) {
        this._sendJSON({
            method: 'ms.remote.control',
            params: {
                Cmd: String(text),
                DataOfCmd: 'base64',
                TypeOfRemote: 'SendInputString',
            },
        });
    }

    async openYouTube(videoId) {
        await this.launchApp('111299001912', {
            url: `https://www.youtube.com/watch?v=${videoId}`,
        });
    }

    async getState() {
        // Samsung doesn't provide a direct state query via the remote WS channel
        // Power can be inferred from connection status
        return {
            power: this.connected,
            volume: null,
            source: null,
            app: null,
        };
    }
}
