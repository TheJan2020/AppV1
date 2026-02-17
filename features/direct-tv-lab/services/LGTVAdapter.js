import TVController from './TVController';
import { saveConfig } from '../utils/tvLabStorage';
import { TV_TYPES } from '../constants';

export default class LGTVAdapter extends TVController {
    constructor(config) {
        super(config);
        this._registered = false;
        this._tvState = { power: false, volume: 0, muted: false, source: null, app: null, appName: null };
        this._proxyMode = false;
        this._pollTimer = null;
    }

    async connect() {
        this._intentionalClose = false;
        this.connecting = true;

        const { ip, port = 3000, clientKey, adminUrl, haEntityId } = this.config;

        // Suppress _connectCallback during connect — LG isn't "connected" until registered
        const savedConnectCallback = this._connectCallback;
        this._connectCallback = null;

        // Use proxy mode if adminUrl is available
        if (adminUrl) {
            this._proxyMode = true;
            this._log(`Using proxy via ${adminUrl}`);
            this._log(`Connecting to TV at ${ip}...`);

            try {
                const resp = await fetch(`${adminUrl}/api/tv-proxy`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'connect', ip, port, clientKey, haEntityId }),
                });
                const data = await resp.json();

                if (!resp.ok || data.error) {
                    throw new Error(data.error || 'Proxy connection failed');
                }

                this._log('Connected and registered via proxy!');
                this._registered = true;
                this.connected = true;
                this.connecting = false;

                // Save client key if received
                if (data.clientKey) {
                    this._log(`Client key received: ${data.clientKey.substring(0, 8)}...`);
                    this.config.clientKey = data.clientKey;
                    // Save only connection fields (not adminUrl which is loaded from profile)
                    const saveData = { ip, port, clientKey: data.clientKey };
                    saveConfig(TV_TYPES.LG, saveData).then(() => {
                        this._log('Client key saved to storage');
                    }).catch((err) => {
                        this._log(`Failed to save client key: ${err.message}`);
                    });
                    // Emit so UI can update the token field
                    this._emitState({ clientKey: data.clientKey });
                }

                this._emitState({ power: true, connected: true, paired: true });

                // Start polling for state updates
                this._startStatePolling();

                // Restore and fire connect callback
                this._connectCallback = savedConnectCallback;
                this._connectCallback?.();
                return;
            } catch (err) {
                this._log(`Proxy failed: ${err.message}`);
                this._connectCallback = savedConnectCallback;
                this.connecting = false;
                throw new Error(
                    `Proxy connection failed: ${err.message}. ` +
                    `Make sure the admin backend is running at ${adminUrl}.`
                );
            }
        }

        // Direct connection mode (fallback — may not work on newer LG TVs with self-signed certs)
        this._proxyMode = false;
        this._log('No admin backend URL — trying direct connection...');
        this._log('(Newer LG TVs may require proxy mode)');

        const securePort = port === 3000 ? 3001 : port;
        const attempts = [
            { url: `ws://${ip}:${port}`, label: `ws://${ip}:${port}` },
            { url: `wss://${ip}:${securePort}`, label: `wss://${ip}:${securePort}` },
        ];

        let lastError = null;
        for (const attempt of attempts) {
            this._log(`Connecting to ${attempt.label}...`);
            try {
                await this._createWebSocket(attempt.url, true);
                this._log(`WebSocket connected (${attempt.label})`);
            } catch (connError) {
                this._log(`Connection failed: ${connError.message}`);
                lastError = connError;
                continue;
            }

            this._log('Registering with TV...');
            this._log('Check TV screen for pairing prompt (accept within 30s)');
            try {
                await this._register();
                this._log('Registration complete!');
                this._connectCallback = savedConnectCallback;
                this._connectCallback?.();
                return;
            } catch (regError) {
                this._log(`Registration failed: ${regError.message}`);
                lastError = regError;
                try { this.ws?.close(); } catch {}
                this.ws = null;
                this.connected = false;
                continue;
            }
        }

        this._connectCallback = savedConnectCallback;
        this.connecting = false;
        throw new Error(
            `Could not connect to TV at ${ip}. ` +
            `Tried ws://:${port} and wss://:${securePort}. ` +
            `This TV likely requires proxy mode — configure an Admin URL.`
        );
    }

    // --- Proxy mode methods ---

    async _proxyPost(action, body = {}) {
        const { adminUrl } = this.config;
        const resp = await fetch(`${adminUrl}/api/tv-proxy`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action, ...body }),
        });
        const data = await resp.json();
        if (!resp.ok || data.error) throw new Error(data.error || 'Request failed');
        return data;
    }

    _startStatePolling() {
        this._pollTimer = setInterval(async () => {
            try {
                const { adminUrl } = this.config;
                const resp = await fetch(`${adminUrl}/api/tv-proxy`);
                const data = await resp.json();
                if (data.state) {
                    this._tvState = { ...data.state };
                    this._emitState({
                        ...this._tvState,
                        inputSocketConnected: !!data.inputSocketConnected,
                        dpadReady: !!data.dpadReady,
                        haFallback: !!data.haFallback,
                    });
                }
                if (!data.connected || !data.registered) {
                    this.connected = false;
                    this._registered = false;
                    this._disconnectCallback?.();
                    this._stopStatePolling();
                }
            } catch { }
        }, 3000);
    }

    _stopStatePolling() {
        if (this._pollTimer) {
            clearInterval(this._pollTimer);
            this._pollTimer = null;
        }
    }

    // --- Direct mode methods (kept for fallback) ---

    async _register() {
        const payload = {
            forcePairing: false,
            pairingType: 'PROMPT',
            manifest: {
                manifestVersion: 1,
                appVersion: '1.1',
                signed: {
                    created: '20140509',
                    appId: 'com.lge.test',
                    vendorId: 'com.lge.test',
                    localizedAppNames: {
                        '': 'LG Remote App',
                        'ko-KR': '리모컨 앱',
                        'zxx-XX': 'ÐÐ¨ Ñ',
                    },
                    localizedVendorNames: {
                        '': 'LG Electronics',
                    },
                    permissions: [
                        'TEST_SECURE', 'CONTROL_INPUT_TEXT', 'CONTROL_MOUSE_AND_TOUCH',
                        'READ_INSTALLED_APPS', 'READ_LGE_SDX', 'READ_NOTIFICATIONS',
                        'SEARCH', 'WRITE_SETTINGS', 'WRITE_NOTIFICATION_ALERT',
                        'CONTROL_POWER', 'READ_CURRENT_CHANNEL', 'READ_RUNNING_APPS',
                        'READ_UPDATE_INFO', 'UPDATE_FROM_REMOTE_APP',
                        'READ_LGE_TV_INPUT_EVENTS', 'READ_TV_CURRENT_TIME',
                    ],
                    serial: '2f930e2d2cfe083771f68e4fe7983211',
                },
                permissions: [
                    'LAUNCH', 'LAUNCH_WEBAPP', 'APP_TO_APP',
                    'CLOSE', 'TEST_OPEN', 'TEST_PROTECTED',
                    'CONTROL_AUDIO', 'CONTROL_DISPLAY',
                    'CONTROL_INPUT_JOYSTICK', 'CONTROL_INPUT_MEDIA_RECORDING',
                    'CONTROL_INPUT_MEDIA_PLAYBACK', 'CONTROL_INPUT_TV',
                    'CONTROL_POWER', 'CONTROL_INPUT_TEXT',
                    'CONTROL_MOUSE_AND_TOUCH', 'CONTROL_INPUT_KEYS',
                    'READ_APP_STATUS', 'READ_CURRENT_CHANNEL',
                    'READ_INPUT_DEVICE_LIST', 'READ_NETWORK_STATE',
                    'READ_RUNNING_APPS', 'READ_TV_CHANNEL_LIST',
                    'READ_INSTALLED_APPS', 'READ_POWER_STATE',
                    'READ_COUNTRY_INFO', 'READ_SETTINGS',
                    'WRITE_NOTIFICATION_TOAST',
                    'CONTROL_TV_SCREEN', 'CONTROL_TV_STANDBY',
                    'CONTROL_FAVORITE_GROUP', 'CONTROL_USER_INFO',
                    'CHECK_BLUETOOTH_DEVICE', 'CONTROL_BLUETOOTH',
                    'CONTROL_TIMER_INFO', 'STB_INTERNAL_CONNECTION',
                    'CONTROL_RECORDING', 'READ_RECORDING_STATE',
                    'WRITE_RECORDING_LIST', 'READ_RECORDING_LIST',
                    'READ_RECORDING_SCHEDULE', 'WRITE_RECORDING_SCHEDULE',
                    'READ_STORAGE_DEVICE_LIST', 'READ_TV_PROGRAM_INFO',
                    'CONTROL_BOX_CHANNEL', 'READ_TV_ACR_AUTH_TOKEN',
                    'READ_TV_CONTENT_STATE', 'READ_TV_CURRENT_TIME',
                    'ADD_LAUNCHER_CHANNEL', 'SET_CHANNEL_SKIP',
                    'RELEASE_CHANNEL_SKIP', 'CONTROL_CHANNEL_BLOCK',
                    'DELETE_SELECT_CHANNEL', 'CONTROL_CHANNEL_GROUP',
                ],
            },
        };

        if (this.config.clientKey) {
            payload['client-key'] = this.config.clientKey;
        }

        return this._request({ type: 'register', id: 'register_0', payload }, 30000);
    }

    _handleMessage(data) {
        if (data.id === 'register_0' && data.type === 'registered') {
            this._registered = true;
            const clientKey = data.payload?.['client-key'];
            if (clientKey) {
                this.config.clientKey = clientKey;
                const saveData = { ip: this.config.ip, port: this.config.port, clientKey };
                saveConfig(TV_TYPES.LG, saveData).catch(() => {});
            }
            this._emitState({ power: true, connected: true, paired: true });
            this._resolveRequest('register_0', data);
            this._subscribeToState();
            this._getInputSocket();
            return;
        }

        if (data.id === 'register_0' && data.type === 'response' && data.payload?.pairingType === 'PROMPT') {
            this._emitState({ pairingPrompt: true });
            return;
        }

        if (data.type === 'response' || data.type === 'changed') {
            this._handleStateUpdate(data);
        }

        if (data.id === 'input_0' && data.payload?.socketPath) {
            this._connectInputSocket(data.payload.socketPath);
        }

        if (data.id) {
            this._resolveRequest(data.id, data);
        }
    }

    _handleStateUpdate(data) {
        const uri = this._subscriptions?.get(data.id);
        if (uri === 'ssap://audio/getVolume' && data.payload) {
            this._tvState.volume = data.payload.volume ?? this._tvState.volume;
            this._tvState.muted = data.payload.muted ?? this._tvState.muted;
        }
        if (uri === 'ssap://com.webos.applicationManager/getForegroundAppInfo' && data.payload) {
            this._tvState.app = data.payload.appId || null;
        }
        if (uri === 'ssap://tv/getCurrentChannel' && data.payload) {
            this._tvState.source = data.payload.channelName || data.payload.channelNumber || null;
        }
        this._tvState.power = true;
        this._emitState({ ...this._tvState });
    }

    async _subscribeToState() {
        if (!this._subscriptions) this._subscriptions = new Map();
        const uris = [
            'ssap://audio/getVolume',
            'ssap://com.webos.applicationManager/getForegroundAppInfo',
            'ssap://tv/getCurrentChannel',
        ];
        for (const uri of uris) {
            const id = this._nextId();
            this._subscriptions.set(id, uri);
            try { this._sendJSON({ type: 'subscribe', id, uri }); } catch {}
        }
    }

    async _getInputSocket() {
        try {
            this._sendJSON({
                type: 'request', id: 'input_0',
                uri: 'ssap://com.webos.service.networkinput/getPointerInputSocket',
            });
        } catch {}
    }

    _connectInputSocket(socketPath) {
        try { this._inputWs = new WebSocket(socketPath); } catch {}
    }

    // --- Unified command interface ---

    async sendCommand(command) {
        if (this._proxyMode) {
            await this._proxyPost('command', { command });
            return;
        }

        // Direct mode: d-pad via input socket
        const BUTTON_MAP = { UP: 'UP', DOWN: 'DOWN', LEFT: 'LEFT', RIGHT: 'RIGHT', OK: 'ENTER', BACK: 'BACK', HOME: 'HOME', MENU: 'MENU' };
        if (BUTTON_MAP[command]) {
            if (this._inputWs && this._inputWs.readyState === WebSocket.OPEN) {
                this._inputWs.send(`type:button\nname:${BUTTON_MAP[command]}\n\n`);
                return;
            }
            throw new Error('Input socket not connected');
        }

        const COMMAND_MAP = {
            POWER: 'ssap://system/turnOff', VOLUME_UP: 'ssap://audio/volumeUp',
            VOLUME_DOWN: 'ssap://audio/volumeDown', MUTE: 'ssap://audio/setMute',
            CHANNEL_UP: 'ssap://tv/channelUp', CHANNEL_DOWN: 'ssap://tv/channelDown',
            PLAY: 'ssap://media.controls/play', PAUSE: 'ssap://media.controls/pause',
            STOP: 'ssap://media.controls/stop', HOME: 'ssap://com.webos.service.ime/sendEnterKey',
        };
        const uri = COMMAND_MAP[command];
        if (!uri) throw new Error(`Unknown command: ${command}`);

        const payload = {};
        if (command === 'MUTE') payload.mute = !this._tvState.muted;
        this._sendJSON({ type: 'request', id: this._nextId(), uri, payload });
    }

    async getApps() {
        if (this._proxyMode) {
            const data = await this._proxyPost('apps');
            return data.apps || [];
        }
        try {
            const resp = await this._request({ type: 'request', uri: 'ssap://com.webos.applicationManager/listApps' });
            return (resp?.payload?.apps || []).map(a => ({ id: a.id, name: a.title || a.id, icon: a.icon }));
        } catch { return []; }
    }

    async getInputs() {
        if (this._proxyMode) {
            const data = await this._proxyPost('inputs');
            return data.inputs || [];
        }
        return [];
    }

    async switchInput(inputId) {
        if (this._proxyMode) {
            await this._proxyPost('switchInput', { inputId });
            return;
        }
        this._sendJSON({ type: 'request', id: this._nextId(), uri: 'ssap://tv/switchInput', payload: { inputId } });
    }

    async launchApp(appId, params = {}) {
        if (this._proxyMode) {
            await this._proxyPost('launch', { appId, params });
            return;
        }
        const payload = { id: appId };
        if (params.contentId) payload.contentId = params.contentId;
        if (params.params) payload.params = params.params;
        this._sendJSON({ type: 'request', id: this._nextId(), uri: 'ssap://system.launcher/launch', payload });
    }

    async sendText(text) {
        if (this._proxyMode) {
            await this._proxyPost('text', { text });
            return;
        }
        this._sendJSON({ type: 'request', id: this._nextId(), uri: 'ssap://com.webos.service.ime/insertText', payload: { text, replace: 0 } });
    }

    async openYouTube(videoId) {
        await this.launchApp('youtube.leanback.v4', { contentId: videoId });
    }

    async setVolume(level) {
        if (this._proxyMode) {
            await this._proxyPost('volume', { level });
            return;
        }
        this._sendJSON({ type: 'request', id: this._nextId(), uri: 'ssap://audio/setVolume', payload: { volume: level } });
    }

    async getState() {
        if (this._proxyMode) {
            try {
                const { adminUrl } = this.config;
                const resp = await fetch(`${adminUrl}/api/tv-proxy`);
                const data = await resp.json();
                return data.state || {};
            } catch { return {}; }
        }
        return { ...this._tvState };
    }

    async repaire() {
        if (this._proxyMode) {
            this._log('Re-pairing: will disconnect and reconnect without client key...');
            this._log('Accept the pairing prompt on your TV!');

            // Pause state polling to prevent disconnect callback during re-pair
            this._stopStatePolling();

            try {
                const data = await this._proxyPost('repaire');
                this._log('Re-pair complete!');
                // Update client key if the proxy returned a new one
                if (data.clientKey) {
                    this.config.clientKey = data.clientKey;
                    this._emitState({ clientKey: data.clientKey });
                }
            } finally {
                // Resume state polling
                this._startStatePolling();
            }
            return;
        }
        throw new Error('Re-pair only available in proxy mode');
    }

    async disconnect() {
        this._stopStatePolling();
        if (this._proxyMode) {
            try { await this._proxyPost('disconnect'); } catch {}
            this._proxyMode = false;
            this._registered = false;
            this.connected = false;
            return;
        }
        if (this._inputWs) {
            try { this._inputWs.close(); } catch {}
            this._inputWs = null;
        }
        this._subscriptions?.clear();
        this._registered = false;
        await super.disconnect();
    }
}
