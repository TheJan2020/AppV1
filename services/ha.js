import { AppState } from 'react-native';
import { toWsUrl, httpUrlFromWs, stripSlash } from './connectionEndpoints';

function hostFromWsUrl(url) {
    try {
        return new URL(url).host;
    } catch {
        return 'unknown host';
    }
}

function isLocalWs(url) {
    return /^ws:/i.test(url) && !/^wss:/i.test(url);
}

function connectTimeoutFor(url) {
    return /^wss:/i.test(url) ? 4500 : 2500;
}

export class HAService {
    constructor(url, token, { fallbackUrl } = {}) {
        const cleanUrl = stripSlash(url);
        this.primaryUrl = toWsUrl(cleanUrl);
        const fallbackHttp = stripSlash(fallbackUrl);
        this.fallbackUrl = fallbackHttp && fallbackHttp !== cleanUrl ? toWsUrl(fallbackHttp) : '';
        this.url = this.primaryUrl;
        this.token = token;
        this.usingFallback = false;
        this.ignoreClose = false;
        this.connectTimer = null;
        this.preferLocalTimer = null;
        this.socket = null;
        this.race = [];
        this.raceSettled = false;
        this.pendingLiveWinner = null;
        this.id = 1;
        this.pending = new Map();
        this.listeners = new Set();
        this.authenticated = false;
        this.reconnectTimer = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.appState = AppState.currentState;
        this.appStateSubscription = AppState.addEventListener('change', (nextState) => {
            const wasBg = this.appState !== 'active';
            this.appState = nextState;
            if (wasBg && nextState === 'active') {
                if (this.usingFallback && this.primaryUrl) {
                    this.tryPrimary();
                    return;
                }
                if (!this.socket && !this.reconnectTimer) {
                    this.reconnectAttempts = 0;
                    this.connect();
                }
            } else if (nextState !== 'active') {
                if (this.reconnectTimer) {
                    clearTimeout(this.reconnectTimer);
                    this.reconnectTimer = null;
                }
            }
        });
        HAService.instances.add(this);
    }

    connectTimeoutMs() {
        return connectTimeoutFor(this.url);
    }

    clearConnectTimer() {
        if (this.connectTimer) {
            clearTimeout(this.connectTimer);
            this.connectTimer = null;
        }
        if (this.preferLocalTimer) {
            clearTimeout(this.preferLocalTimer);
            this.preferLocalTimer = null;
        }
    }

    candidateUrls() {
        const urls = [];
        if (this.primaryUrl) urls.push(this.primaryUrl);
        if (this.fallbackUrl && this.fallbackUrl !== this.primaryUrl) urls.push(this.fallbackUrl);
        return urls;
    }

    localRaceAlive() {
        return this.race.some((entry) => isLocalWs(entry.url));
    }

    connect() {
        if (this.socket || this.race.length) return;

        this.ignoreClose = false;
        this.raceSettled = false;
        this.pendingLiveWinner = null;

        if (this.appState !== 'active') return;

        const urls = this.candidateUrls();
        if (!this.token || !urls.length || !String(urls[0]).startsWith('ws')) {
            if (__DEV__) {
                console.warn('[HAService] Skipping connect — missing token or invalid WebSocket URL');
            }
            return;
        }

        urls.forEach((url) => this.openRaceSocket(url));
    }

    openRaceSocket(url) {
        if (this.race.some((entry) => entry.url === url)) return;

        const ws = new WebSocket(url);
        const entry = { url, ws, timer: null };
        this.race.push(entry);

        entry.timer = setTimeout(() => {
            if (this.raceSettled && this.socket === ws) return;
            try { ws.close(); } catch { /* ignore */ }
        }, connectTimeoutFor(url));

        ws.onopen = () => {
            this.reconnectAttempts = 0;
        };

        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (!this.raceSettled) {
                    this.handleRaceMessage(entry, data);
                } else if (this.socket === ws) {
                    this.handleMessage(data);
                }
            } catch (e) {
                console.error('[HAService] Failed to parse WebSocket message:', e.message);
            }
        };

        ws.onclose = (event) => {
            this.clearEntryTimer(entry);
            if (this.raceSettled) {
                if (this.socket === ws) this.handleSettledClose(event);
                return;
            }
            this.race = this.race.filter((item) => item !== entry);
            if (isLocalWs(url) && this.pendingLiveWinner && !this.localRaceAlive()) {
                this.settleRace(this.pendingLiveWinner);
                return;
            }
            if (!this.race.length && !this.socket) {
                this.handleAllRaceFailed(event);
            }
        };

        ws.onerror = () => {};
    }

    clearEntryTimer(entry) {
        if (entry?.timer) {
            clearTimeout(entry.timer);
            entry.timer = null;
        }
    }

    handleRaceMessage(entry, data) {
        if (data.type === 'auth_required') {
            try {
                entry.ws.send(JSON.stringify({ type: 'auth', access_token: this.token }));
            } catch { /* ignore */ }
            return;
        }
        if (data.type === 'auth_invalid') {
            try { entry.ws.close(); } catch { /* ignore */ }
            return;
        }
        if (data.type !== 'auth_ok') return;

        if (isLocalWs(entry.url)) {
            this.settleRace(entry);
            return;
        }
        if (!this.localRaceAlive()) {
            this.settleRace(entry);
            return;
        }
        this.pendingLiveWinner = entry;
        if (this.preferLocalTimer) clearTimeout(this.preferLocalTimer);
        this.preferLocalTimer = setTimeout(() => {
            this.preferLocalTimer = null;
            if (!this.raceSettled && this.pendingLiveWinner) {
                this.settleRace(this.pendingLiveWinner);
            }
        }, 250);
    }

    settleRace(entry) {
        if (this.raceSettled || !entry?.ws) return;
        this.raceSettled = true;
        this.pendingLiveWinner = null;
        if (this.preferLocalTimer) {
            clearTimeout(this.preferLocalTimer);
            this.preferLocalTimer = null;
        }

        this.socket = entry.ws;
        this.url = entry.url;
        this.usingFallback = !!this.fallbackUrl && this.fallbackUrl === entry.url;
        this.authenticated = true;
        this.clearEntryTimer(entry);

        for (const other of this.race) {
            if (other === entry) continue;
            this.clearEntryTimer(other);
            try {
                other.ws.onclose = null;
                other.ws.onmessage = null;
                other.ws.onerror = null;
                other.ws.close();
            } catch { /* ignore */ }
        }
        this.race = [entry];

        entry.ws.onmessage = (event) => {
            try {
                this.handleMessage(JSON.parse(event.data));
            } catch (e) {
                console.error('[HAService] Failed to parse WebSocket message:', e.message);
            }
        };
        entry.ws.onclose = (event) => this.handleSettledClose(event);

        if (__DEV__) {
            console.log(`[HAService] Connected via ${isLocalWs(entry.url) ? 'local HTTP' : 'live HTTPS'} (${hostFromWsUrl(entry.url)})`);
        }
        this.notifyListeners({ type: 'connected' });
        if (this.usingFallback) {
            this.notifyListeners({
                type: 'endpoint_switched',
                via: 'local',
                httpUrl: httpUrlFromWs(this.url),
            });
        }
        this.sendMessage({ type: 'subscribe_events', event_type: 'state_changed' });
    }

    handleAllRaceFailed(event) {
        const closeCode = event?.code ?? 0;
        const closeReason = (event?.reason || '').trim();
        const host = hostFromWsUrl(this.url);
        this.authenticated = false;
        this.socket = null;
        this.race = [];
        this.raceSettled = false;
        this.notifyListeners({
            type: 'disconnected',
            code: closeCode,
            reason: closeReason || undefined,
        });
        this.pending.forEach(({ resolve }) => {
            try { resolve(null); } catch { /* ignore */ }
        });
        this.pending.clear();
        this.scheduleReconnect(closeCode, closeReason, host);
    }

    handleSettledClose(event) {
        this.clearConnectTimer();
        if (this.ignoreClose) {
            this.ignoreClose = false;
            this.socket = null;
            this.authenticated = false;
            this.race = [];
            this.raceSettled = false;
            return;
        }

        const closeCode = event?.code ?? 0;
        const closeReason = (event?.reason || '').trim();
        const host = hostFromWsUrl(this.url);
        const wasFallback = this.usingFallback;

        this.authenticated = false;
        this.socket = null;
        this.race = [];
        this.raceSettled = false;
        this.notifyListeners({
            type: 'disconnected',
            code: closeCode,
            reason: closeReason || undefined,
        });

        this.pending.forEach(({ resolve }) => {
            try { resolve(null); } catch { /* ignore */ }
        });
        this.pending.clear();

        if (this.appState === 'active' && this.fallbackUrl && this.primaryUrl) {
            if (!wasFallback) {
                if (__DEV__) {
                    console.warn(`[HAService] Live HTTPS dropped (${host}) — trying local HTTP`);
                }
                this.switchToFallback();
                return;
            }
            if (__DEV__) {
                console.warn(`[HAService] Local HTTP dropped (${host}) — trying live HTTPS`);
            }
            this.tryPrimary();
            return;
        }

        this.scheduleReconnect(closeCode, closeReason, host);
    }

    scheduleReconnect(closeCode, closeReason, host) {
        const willRetry = this.appState === 'active' && this.reconnectAttempts < this.maxReconnectAttempts;

        if (__DEV__ && closeCode !== 1000) {
            const retryNote = willRetry
                ? ` — retry ${this.reconnectAttempts + 1}/${this.maxReconnectAttempts}`
                : ' — not retrying';
            console.warn(
                `[HAService] WebSocket closed (${host}, code ${closeCode}${closeReason ? `, ${closeReason}` : ''})${retryNote}`,
            );
        }

        if (willRetry) {
            const delay = Math.min(5000 * Math.pow(2, this.reconnectAttempts), 60000);
            this.reconnectAttempts++;
            this.reconnectTimer = setTimeout(() => {
                this.reconnectTimer = null;
                this.connect();
            }, delay);
        } else if (this.appState === 'active') {
            this.notifyListeners({ type: 'reconnect_exhausted' });
            if (__DEV__ && closeCode !== 1000) {
                console.warn(`[HAService] WebSocket gave up reconnecting to ${host}`);
            }
        }
    }

    setFallbackUrl(httpUrl) {
        const fallbackHttp = stripSlash(httpUrl);
        const ws = fallbackHttp ? toWsUrl(fallbackHttp) : '';
        this.fallbackUrl = ws && ws !== this.primaryUrl ? ws : '';
        if (!this.fallbackUrl || this.authenticated || this.appState !== 'active') return;
        if (this.raceSettled) return;
        if (this.race.length) {
            this.openRaceSocket(this.fallbackUrl);
            return;
        }
        this.connect();
    }

    switchToFallback() {
        if (!this.fallbackUrl) return;
        this.usingFallback = true;
        this.url = this.fallbackUrl;
        this.reconnectAttempts = 0;
        this.notifyListeners({
            type: 'endpoint_switched',
            via: 'local',
            httpUrl: httpUrlFromWs(this.url),
        });
        this.dropSocketsForSwitch();
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.connect();
        }, 50);
    }

    tryPrimary() {
        if (!this.primaryUrl || !this.usingFallback) {
            if (!this.socket && !this.reconnectTimer && !this.race.length) {
                this.reconnectAttempts = 0;
                this.connect();
            }
            return;
        }
        this.usingFallback = false;
        this.url = this.primaryUrl;
        this.authenticated = false;
        this.reconnectAttempts = 0;
        this.notifyListeners({
            type: 'endpoint_switched',
            via: 'live',
            httpUrl: httpUrlFromWs(this.url),
        });
        this.dropSocketsForSwitch();
        this.connect();
    }

    dropSocketsForSwitch() {
        this.ignoreClose = true;
        this.clearConnectTimer();
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        for (const entry of this.race) {
            this.clearEntryTimer(entry);
            try {
                entry.ws.onclose = null;
                entry.ws.close();
            } catch { /* ignore */ }
        }
        this.race = [];
        this.raceSettled = false;
        if (this.socket) {
            try {
                this.socket.onclose = null;
                this.socket.close();
            } catch { /* ignore */ }
            this.socket = null;
        }
        this.ignoreClose = false;
    }

    disconnect() {
        this.clearConnectTimer();
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }

        if (this.appStateSubscription) {
            this.appStateSubscription.remove();
            this.appStateSubscription = null;
        }

        this.pending.forEach(({ resolve }) => {
            try { resolve(null); } catch { /* ignore */ }
        });
        this.pending.clear();

        this.dropSocketsForSwitch();
        this.authenticated = false;
        HAService.instances.delete(this);
    }

    handleMessage(data) {
        if (data.type === 'auth_required') {
            this.sendAuth();
        } else if (data.type === 'auth_invalid') {
            this.notifyListeners({ type: 'auth_failed', message: data.message });
        } else if (data.type === 'auth_ok') {
            this.authenticated = true;
            this.notifyListeners({ type: 'connected' });
            this.sendMessage({ type: 'subscribe_events', event_type: 'state_changed' });
        } else if (data.type === 'event' && data.event && data.event.event_type === 'state_changed') {
            this.notifyListeners({ type: 'state_changed', event: data.event });
        } else if (data.id && this.pending.has(data.id)) {
            const pending = this.pending.get(data.id);
            this.pending.delete(data.id);
            const { resolve, reject } = pending;
            if (data.success === false) {
                const err = new Error(data.error?.message || data.error?.code || 'Home Assistant request failed');
                if (data.error?.code) err.code = data.error.code;
                reject(err);
            } else {
                resolve(data.result);
            }
        }
    }

    sendAuth() {
        this.socket.send(JSON.stringify({
            type: 'auth',
            access_token: this.token
        }));
    }

    /**
     * @param {object} [options]
     * @param {boolean} [options.returnResponse] — set true for services that return data (e.g. Music Assistant `get_queue`)
     */
    async callService(domain, service, serviceData = {}, options = {}) {
        const { returnResponse = false } = options;
        const msg = {
            type: 'call_service',
            domain,
            service,
            service_data: serviceData,
        };
        if (returnResponse) {
            msg.return_response = true;
        }
        return this.sendMessage(msg);
    }

    /**
     * Browse media for a media_player (Music Assistant library folders, filesystem, etc.).
     * Omit type/id for root listing.
     */
    async browseMedia(entityId, mediaContentType, mediaContentId) {
        const payload = {
            type: 'media_player/browse_media',
            entity_id: entityId,
        };
        if (mediaContentType != null && mediaContentType !== '' && mediaContentId != null && mediaContentId !== '') {
            payload.media_content_type = mediaContentType;
            payload.media_content_id = mediaContentId;
        }
        return this.sendMessage(payload);
    }

    async getAreaRegistry() {
        return this.sendMessage({
            type: 'config/area_registry/list',
        });
    }

    async getEntityRegistry() {
        return this.sendMessage({
            type: 'config/entity_registry/list',
        });
    }

    async getDeviceRegistry() {
        return this.sendMessage({
            type: 'config/device_registry/list',
        });
    }

    /** All integrations’ config entries (entry_id, domain, …). Used to tie entities → Music Assistant. */
    async getConfigEntries() {
        return this.sendMessage({
            type: 'config_entries/get',
        });
    }

    async getFloorRegistry() {
        return this.sendMessage({
            type: 'config/floor_registry/list',
        });
    }

    async getPersonRegistry() {
        return this.sendMessage({
            type: 'config/person/list',
        });
    }

    async getConfig() {
        return this.sendMessage({
            type: 'get_config',
        });
    }

    sendMessage(msg) {
        if (!this.socket) return Promise.reject(new Error('No socket — HA not connected'));

        return new Promise((resolve, reject) => {
            const id = this.id++;
            this.pending.set(id, { resolve, reject });
            const payload = { ...msg, id };
            this.socket.send(JSON.stringify(payload));
        });
    }

    async getStates() {
        return this.sendMessage({ type: 'get_states' });
    }

    subscribe(callback) {
        this.listeners.add(callback);
        return () => this.listeners.delete(callback);
    }

    notifyListeners(data) {
        this.listeners.forEach(l => l(data));
    }
}

HAService.instances = new Set();

HAService.disconnectAll = () => {
    HAService.instances.forEach(instance => {
        try {
            instance.disconnect();
        } catch (e) {
            console.error('[HAService] Error disconnecting instance:', e);
        }
    });
    HAService.instances.clear();
};
