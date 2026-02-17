import { CONNECTION_TIMEOUT, RECONNECT_DELAY, MAX_RECONNECT_ATTEMPTS } from '../constants';

export default class TVController {
    constructor(config = {}) {
        this.config = config;
        this.ws = null;
        this.connected = false;
        this.connecting = false;
        this._stateCallback = null;
        this._disconnectCallback = null;
        this._connectCallback = null;
        this._errorCallback = null;
        this._logCallback = null;
        this._reconnectAttempts = 0;
        this._intentionalClose = false;
        this._messageId = 1;
        this._pendingRequests = new Map();
    }

    // --- Event registration ---
    onStateChange(cb) { this._stateCallback = cb; }
    onDisconnect(cb) { this._disconnectCallback = cb; }
    onConnect(cb) { this._connectCallback = cb; }
    onError(cb) { this._errorCallback = cb; }
    onLog(cb) { this._logCallback = cb; }

    _emitState(state) { this._stateCallback?.(state); }
    _emitError(err) { this._errorCallback?.(err); }
    _log(msg) {
        console.log(`[TV] ${msg}`);
        this._logCallback?.(msg);
    }

    _nextId() { return String(this._messageId++); }

    // --- WebSocket helpers ---
    _createWebSocket(url, suppressReconnect = false) {
        return new Promise((resolve, reject) => {
            let settled = false;
            const timeout = setTimeout(() => {
                if (!settled) {
                    settled = true;
                    reject(new Error(`Connection timed out (${url})`));
                    try { ws.close(); } catch { }
                }
            }, CONNECTION_TIMEOUT);

            const ws = new WebSocket(url);

            ws.onopen = () => {
                clearTimeout(timeout);
                if (settled) return;
                settled = true;
                this.ws = ws;
                this.connected = true;
                this.connecting = false;
                this._reconnectAttempts = 0;
                this._connectCallback?.();
                resolve(ws);
            };

            ws.onerror = (e) => {
                clearTimeout(timeout);
                if (settled) return;
                settled = true;
                this.connecting = false;
                const msg = e.message || `WebSocket error (${url})`;
                this._emitError(msg);
                reject(new Error(msg));
            };

            ws.onclose = () => {
                this.connected = false;
                this.connecting = false;
                if (!settled) {
                    // Connection failed before open
                    settled = true;
                    clearTimeout(timeout);
                    reject(new Error(`Connection closed before open (${url})`));
                    return;
                }
                this._disconnectCallback?.();
                if (!this._intentionalClose && !suppressReconnect) {
                    this._attemptReconnect();
                }
            };

            ws.onmessage = (event) => {
                try {
                    const raw = typeof event.data === 'string' ? event.data : String(event.data);
                    this._log(`WS recv: ${raw.substring(0, 200)}`);
                    const data = JSON.parse(raw);
                    this._handleMessage(data);
                } catch (e) {
                    this._log(`WS parse error: ${e.message}`);
                }
            };
        });
    }

    _attemptReconnect() {
        if (this._reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) return;
        this._reconnectAttempts++;
        setTimeout(() => {
            if (!this.connected && !this._intentionalClose) {
                this.connect().catch(() => { });
            }
        }, RECONNECT_DELAY);
    }

    _sendJSON(payload) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            throw new Error('Not connected');
        }
        const json = JSON.stringify(payload);
        this._log(`WS send: ${json.substring(0, 200)}`);
        this.ws.send(json);
    }

    _request(payload, timeout = 5000) {
        return new Promise((resolve, reject) => {
            const id = payload.id || this._nextId();
            payload.id = id;

            const timer = setTimeout(() => {
                this._pendingRequests.delete(id);
                reject(new Error('Request timed out'));
            }, timeout);

            this._pendingRequests.set(id, { resolve, reject, timer });
            this._sendJSON(payload);
        });
    }

    _resolveRequest(id, data) {
        const pending = this._pendingRequests.get(id);
        if (pending) {
            clearTimeout(pending.timer);
            this._pendingRequests.delete(id);
            pending.resolve(data);
        }
    }

    // --- Override in subclasses ---
    _handleMessage(data) { }
    async connect() { throw new Error('Not implemented'); }

    async disconnect() {
        this._intentionalClose = true;
        this._pendingRequests.forEach(p => {
            clearTimeout(p.timer);
            p.reject(new Error('Disconnected'));
        });
        this._pendingRequests.clear();

        if (this.ws) {
            try { this.ws.close(); } catch { }
            this.ws = null;
        }
        this.connected = false;
    }

    async sendCommand(command) { throw new Error('Not implemented'); }
    async power() { return this.sendCommand('POWER'); }
    async volumeUp() { return this.sendCommand('VOLUME_UP'); }
    async volumeDown() { return this.sendCommand('VOLUME_DOWN'); }
    async mute() { return this.sendCommand('MUTE'); }
    async channelUp() { return this.sendCommand('CHANNEL_UP'); }
    async channelDown() { return this.sendCommand('CHANNEL_DOWN'); }
    async up() { return this.sendCommand('UP'); }
    async down() { return this.sendCommand('DOWN'); }
    async left() { return this.sendCommand('LEFT'); }
    async right() { return this.sendCommand('RIGHT'); }
    async ok() { return this.sendCommand('OK'); }
    async back() { return this.sendCommand('BACK'); }
    async home() { return this.sendCommand('HOME'); }
    async menu() { return this.sendCommand('MENU'); }
    async getApps() { return []; }
    async launchApp(appId, params) { throw new Error('Not implemented'); }
    async sendText(text) { throw new Error('Not implemented'); }
    async openYouTube(videoId) { throw new Error('Not implemented'); }
    async getState() { return null; }
}
