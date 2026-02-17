import { Alert } from 'react-native';

export class FrigateService {
    constructor(baseUrl, username, password, adminUrl) {
        this.baseUrl = baseUrl.replace(/\/$/, ''); // Remove trailing slash
        this.username = username;
        this.password = password;
        this.adminUrl = adminUrl ? adminUrl.replace(/\/$/, '') : '';
        this.token = null;
        this.headers = {
            'Content-Type': 'application/json'
        };
        this.sessionCookie = null;
    }

    async login() {
        if (!this.username || !this.password) {
            console.log('Frigate: Anonymous Mode (No credentials provided)');
            return true;
        }

        try {
            console.log('Logging in to Frigate...');
            const response = await fetch(`${this.baseUrl}/api/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user: this.username, password: this.password })
            });

            if (!response.ok) {
                console.error('Frigate Login Failed:', response.status);
                Alert.alert('Frigate Login Failed', `Status: ${response.status}`);
                return false;
            }

            // In v0.14, token is often returned in body or cookie. 
            // Often body: { message: "Login successful" } and set-cookie.
            // But usually we need to grab the JWT to use as Bearer if pure API.
            // Let's check response body for a token, or rely on cookie handling if React Native handles it?
            // React Native fetch does not persist cookies automatically across sessions reliably without a cookie jar,
            // but often handles them within a session.
            // Ideally, the API returns a token. Let's try to parse it.

            // Check for Set-Cookie header
            const cookie = response.headers.get('set-cookie');
            if (cookie) {
                this.sessionCookie = cookie;
                console.log('Frigate Session Cookie Captured');
            } else {
                console.log('Warning: No Set-Cookie header found in login response');
            }

            console.log('Frigate Login Successful');
            return true;
        } catch (error) {
            console.error('Frigate Login Error:', error);
            Alert.alert('Frigate Login Error', error.message || 'Unknown error');
            return false;
        }
    }

    async ensureAuth() {
        // Simple check: make a lightweight call. If 401, login.
        // Or just login once on init? Better to login on demand/fail.
        // Since we don't have an expirable token stored, let's just login if we suspect we aren't.
        // Optimistic: Just try call, if 401, login and retry.
        return true;
    }

    async request(endpoint, options = {}) {
        let url = `${this.baseUrl}${endpoint}`;

        let response = await fetch(url, {
            ...options,
            headers: { ...this.headers, ...options.headers }
        });

        if (response.status === 401) {
            console.log('Frigate 401, attempting login...');
            const loggedIn = await this.login();
            if (loggedIn) {
                // Retry
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
            // Use backend proxy
            const proxyUrl = this.adminUrl + '/api/frigate/config';
            console.log('Frigate: Fetching config from proxy:', proxyUrl);

            const response = await fetch(proxyUrl, {
                method: 'GET',
                headers: this.headers
            });

            console.log('Frigate: Config response status:', response.status);

            if (!response.ok) {
                console.error('Frigate: Config fetch failed with status:', response.status);
                Alert.alert('Connection Error', 'Unable to connect to Frigate');
                return null;
            }

            const data = await response.json();
            console.log('Frigate: Config loaded successfully');
            return data;
        } catch (error) {
            console.error('Frigate Config Error:', error.message || error);
            Alert.alert('Connection Error', 'Unable to connect to Frigate');
            return null;
        }
    }

    async getStats() {
        try {
            // Use backend proxy (assuming we add one, or skip stats for now if not used)
            const response = await this.request('/api/stats');
            return await response.json();
        } catch (error) {
            console.error('Frigate Stats Error:', error);
            // Alert.alert('Frigate Stats Error', error.message || String(error)); // Commented out to avoid spamming stats loop
            return null;
        }
    }

    async getEvents(options = {}) {
        // options: { camera, limit, has_clip, has_snapshot }
        try {
            const params = new URLSearchParams();
            if (options.limit) params.append('limit', options.limit);
            else params.append('limit', 20); // Default limit

            if (options.camera) params.append('camera', options.camera);
            if (options.label) params.append('label', options.label);
            if (options.before) params.append('before', options.before);
            if (options.after) params.append('after', options.after);
            if (options.has_clip) params.append('has_clip', 1);
            if (options.has_snapshot) params.append('has_snapshot', 1);
            if (options.include_thumbnails === 0) params.append('include_thumbnails', 0); // Frigate defaults to 1

            // Use backend proxy
            const proxyUrl = this.adminUrl + `/api/frigate/events?${params.toString()}`;
            console.log('Frigate: Fetching events from proxy:', proxyUrl);

            const response = await fetch(proxyUrl);
            return await response.json();
        } catch (error) {
            console.error('Frigate Events Error:', error);
            Alert.alert('Frigate Events Error', error.message || String(error));
            return [];
        }
    }

    getStreamUrl(cameraName) {
        // Use backend proxy instead of direct Frigate connection
        // This solves WebView authentication issues
        return `${this.adminUrl}/api/frigate/stream/${cameraName}?fps=5&height=720&bbox=1`;
    }

    getSnapshotUrl(cameraName) {
        // Use backend proxy for snapshots too
        return `${this.adminUrl}/api/frigate/snapshot/${cameraName}`;
    }

    getAudioUrl(cameraName) {
        // Frigate audio stream endpoint - using backend proxy
        return `${this.adminUrl}/api/frigate/audio/${cameraName}`;
    }

    async getRecordingSummary(cameraName) {
        try {
            const proxyUrl = this.adminUrl + `/api/frigate/recordings/${cameraName}/summary`;
            const response = await fetch(proxyUrl);
            if (!response.ok) return [];
            return await response.json();
        } catch (e) {
            console.error('Frigate Recording Summary Error:', e);
            Alert.alert('Frigate Recording Error', e.message || String(e));
            return [];
        }
    }

    getVodUrl(cameraName, start, end) {
        // /api/frigate/vod/<camera>/start/<start>/end/<end>/index.m3u8
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
            console.error('PTZ Error:', error);
            Alert.alert('PTZ Error', error.message || String(error));
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
