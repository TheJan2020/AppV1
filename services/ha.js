import { AppState } from 'react-native';

function hostFromWsUrl(url) {
    try {
        return new URL(url).host;
    } catch {
        return 'unknown host';
    }
}

export class HAService {
    constructor(url, token) {
        const cleanUrl = String(url || '').replace(/\/$/, '');
        this.url = cleanUrl.replace(/^https/i, 'wss').replace(/^http(?!s)/i, 'ws') + '/api/websocket';
        this.token = token;
        this.socket = null;
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
                // Returning to foreground — reconnect if disconnected
                if (!this.socket && !this.reconnectTimer) {
                    this.reconnectAttempts = 0;
                    this.connect();
                }
            } else if (nextState !== 'active') {
                // Going to background — stop reconnection attempts
                if (this.reconnectTimer) {
                    clearTimeout(this.reconnectTimer);
                    this.reconnectTimer = null;
                }
            }
        });
        HAService.instances.add(this);
    }

    connect() {
        if (this.socket) return;

        // Don't reconnect if app is backgrounded
        if (this.appState !== 'active') return;

        if (!this.token || !String(this.url).startsWith('ws')) {
            if (__DEV__) {
                console.warn('[HAService] Skipping connect — missing token or invalid WebSocket URL');
            }
            return;
        }

        this.socket = new WebSocket(this.url);

        this.socket.onopen = () => {
            this.reconnectAttempts = 0; // Reset on successful connection
        };

        this.socket.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                this.handleMessage(data);
            } catch (e) {
                console.error('[HAService] Failed to parse WebSocket message:', e.message);
            }
        };

        this.socket.onclose = (event) => {
            const closeCode = event?.code ?? 0;
            const closeReason = (event?.reason || '').trim();
            const host = hostFromWsUrl(this.url);

            this.authenticated = false;
            this.socket = null;
            this.notifyListeners({
                type: 'disconnected',
                code: closeCode,
                reason: closeReason || undefined,
            });

            // Silently resolve pending promises so callers don't get unhandled rejections.
            this.pending.forEach(({ resolve }) => {
                try { resolve(null); } catch (e) { /* ignore */ }
            });
            this.pending.clear();

            const willRetry = this.appState === 'active' && this.reconnectAttempts < this.maxReconnectAttempts;

            // RN WebSocket onerror often has no message; log once per close with code/reason.
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
            } else if (__DEV__ && closeCode !== 1000 && this.reconnectAttempts >= this.maxReconnectAttempts) {
                console.warn(`[HAService] WebSocket gave up reconnecting to ${host}`);
            }
        };

        // React Native does not populate error.message — details arrive via onclose.
        this.socket.onerror = () => {};
    }

    disconnect() {
        // Clear any pending reconnect timer
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }

        // Remove AppState listener
        if (this.appStateSubscription) {
            this.appStateSubscription.remove();
            this.appStateSubscription = null;
        }

        // Silently resolve pending promises — reject() causes unhandled rejection errors
        // on call sites (e.g. callService) that don't chain .catch(). Since disconnect()
        // is called during component cleanup, the result is discarded anyway.
        this.pending.forEach(({ resolve }) => {
            try { resolve(null); } catch (e) { /* ignore */ }
        });
        this.pending.clear();

        if (this.socket) {
            // Prevent auto-reconnect logic
            this.socket.onclose = null;
            this.socket.close();
            this.socket = null;
            this.authenticated = false;
        }
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
            // Subscribe to events
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
        // If we are not authenticated yet, wait? Or just try?
        // For simplicity, we assume auth happens fast.
        // In a real app we'd wait for 'connected' state.
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

// Static registry to track all instances
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

// Singleton or Factory?
// We'll export a generic helper for now, but usually we need the URL from discovery.
// So we will instantiate this in the Dashboard.
