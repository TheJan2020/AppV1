export class HAService {
    constructor(url, token) {
        const cleanUrl = url.replace(/\/$/, '');
        this.url = cleanUrl.replace('http', 'ws') + '/api/websocket';
        this.token = token;
        this.socket = null;
        this.id = 1;
        this.pending = new Map();
        this.listeners = new Set();
        this.authenticated = false;
        this.reconnectTimer = null;
        HAService.instances.add(this);
    }

    connect() {
        if (this.socket) return;

        console.log('Connecting to', this.url);
        this.socket = new WebSocket(this.url);

        this.socket.onopen = () => {
            console.log('Socket Connected');
        };

        this.socket.onmessage = (event) => {
            const data = JSON.parse(event.data);
            this.handleMessage(data);
        };

        this.socket.onclose = () => {
            console.log('Socket Closed');
            this.authenticated = false;
            this.socket = null;
            // Reconnect logic usually goes here
            this.reconnectTimer = setTimeout(() => this.connect(), 5000);
        };

        this.socket.onerror = (e) => {
            console.log('Socket Error', e.message);
        };
    }

    disconnect() {
        // Clear any pending reconnect timer
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }

        if (this.socket) {
            console.log('Disconnecting socket...');
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
        } else if (data.type === 'auth_ok') {
            this.authenticated = true;
            console.log('Auth Successful');
            this.notifyListeners({ type: 'connected' });
            // Subscribe to events
            this.sendMessage({ type: 'subscribe_events', event_type: 'state_changed' });
        } else if (data.type === 'event' && data.event && data.event.event_type === 'state_changed') {
            this.notifyListeners({ type: 'state_changed', event: data.event });
        } else if (data.id && this.pending.has(data.id)) {
            const { resolve } = this.pending.get(data.id);
            resolve(data.result);
            this.pending.delete(data.id);
        }
    }

    sendAuth() {
        this.socket.send(JSON.stringify({
            type: 'auth',
            access_token: this.token
        }));
    }

    async callService(domain, service, serviceData = {}) {
        return this.sendMessage({
            type: 'call_service',
            domain,
            service,
            service_data: serviceData
        });
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
        if (!this.socket) return Promise.reject('No socket');

        return new Promise((resolve, reject) => {
            const id = this.id++;
            this.pending.set(id, { resolve, reject });
            this.socket.send(JSON.stringify({ ...msg, id }));
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
    console.log(`[HAService] Disconnecting all ${HAService.instances.size} active instances...`);
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
