export class FrigateService {
    constructor(baseUrl, username, password, adminUrl, haToken) {
        this.baseUrl = (baseUrl || '').replace(/\/$/, '');
        this.username = username;
        this.password = password;
        this.adminUrl = adminUrl ? adminUrl.replace(/\/$/, '') : '';
        this.token = null;
        this.headers = {
            'Content-Type': 'application/json',
            ...(haToken ? { 'Authorization': `Bearer ${haToken}` } : {})
        };
        this.sessionCookie = null;
    }

    async login() {
        if (!this.username || !this.password) {
            return true;
        }

        try {
            const response = await fetch(`${this.baseUrl}/api/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user: this.username, password: this.password })
            });

            if (!response.ok) {
                console.warn('Frigate login skipped:', response.status);
                return false;
            }

            const cookie = response.headers.get('set-cookie');
            if (cookie) {
                this.sessionCookie = cookie;
            }

            return true;
        } catch (error) {
            console.warn('Frigate login skipped:', error.message || error);
            return false;
        }
    }

    async ensureAuth() {
        return true;
    }

    async request(endpoint, options = {}) {
        let url = `${this.baseUrl}${endpoint}`;

        let response = await fetch(url, {
            ...options,
            headers: { ...this.headers, ...options.headers }
        });

        if (response.status === 401) {
            const loggedIn = await this.login();
            if (loggedIn) {
                response = await fetch(url, {
                    ...options,
                    headers: { ...this.headers, ...options.headers }
                });
            }
        }
        return response;
    }

    async getConfig() {
        try {
            if (!this.adminUrl) return null;
            const proxyUrl = this.adminUrl + '/api/frigate/config';
            const response = await fetch(proxyUrl, {
                method: 'GET',
                headers: this.headers
            });

            if (!response.ok) {
                console.warn('Frigate config unavailable:', response.status);
                return null;
            }

            const data = await response.json();
            if (data?.error && !data.cameras) return null;
            return data;
        } catch (error) {
            console.warn('Frigate config skipped:', error.message || error);
            return null;
        }
    }

    async getStats() {
        try {
            if (!this.adminUrl) return null;
            const proxyUrl = this.adminUrl + '/api/frigate/stats';
            const response = await fetch(proxyUrl, {
                method: 'GET',
                headers: this.headers,
            });
            if (!response.ok) return null;
            const text = await response.text();
            if (!text || text.trim().startsWith('<')) return null;
            return JSON.parse(text);
        } catch {
            return null;
        }
    }

    async getEvents(options = {}) {
        try {
            if (!this.adminUrl) return [];
            const params = new URLSearchParams();
            if (options.limit) params.append('limit', options.limit);
            else params.append('limit', 20);

            if (options.camera) params.append('camera', options.camera);
            if (options.label) params.append('label', options.label);
            if (options.before) params.append('before', options.before);
            if (options.after) params.append('after', options.after);
            if (options.has_clip) params.append('has_clip', 1);
            if (options.has_snapshot) params.append('has_snapshot', 1);
            if (options.include_thumbnails === 0) params.append('include_thumbnails', 0);

            const proxyUrl = this.adminUrl + `/api/frigate/events?${params.toString()}`;
            const response = await fetch(proxyUrl, { headers: this.headers });
            if (!response.ok) return [];
            const data = await response.json();
            return Array.isArray(data) ? data : [];
        } catch (error) {
            console.warn('Frigate events skipped:', error.message || error);
            return [];
        }
    }

    getStreamUrl(cameraName) {
        const url = `${this.adminUrl}/api/frigate/stream/${cameraName}?fps=5&height=720&bbox=1`;
        return url;
    }

    getSnapshotUrl(cameraName) {
        const url = `${this.adminUrl}/api/frigate/snapshot/${cameraName}`;
        return url;
    }

    getHASnapshotUrl(entityIdOrName) {
        const entity = entityIdOrName.startsWith('camera.') ? entityIdOrName : `camera.${entityIdOrName}`;
        const url = `${this.adminUrl}/api/ha-camera/${entity}`;
        return url;
    }

    getAudioUrl(cameraName) {
        const url = `${this.adminUrl}/api/frigate/audio/${cameraName}`;
        return url;
    }

    async getRecordingSummary(cameraName) {
        try {
            if (!this.adminUrl) return [];
            const proxyUrl = this.adminUrl + `/api/frigate/recordings/${cameraName}/summary`;
            const response = await fetch(proxyUrl, { headers: this.headers });
            if (!response.ok) return [];
            return await response.json();
        } catch (e) {
            console.warn('Frigate recordings skipped:', e.message || e);
            return [];
        }
    }

    getVodUrl(cameraName, start, end) {
        const proxyUrl = this.adminUrl + '/api/frigate/vod';
        return `${proxyUrl}/${cameraName}/start/${start}/end/${end}/index.m3u8`;
    }

    async ptzControl(cameraName, action) {
        try {
            const response = await this.request(`/api/${cameraName}/ptz`, {
                method: 'POST',
                body: JSON.stringify({ action: action })
            });
            return response.ok;
        } catch (error) {
            console.warn('PTZ skipped:', error.message || error);
            return false;
        }
    }

    getImageHeaders() {
        if (this.sessionCookie) {
            return {
                'Cookie': this.sessionCookie
            };
        }
        return {};
    }
}
