
/**
 * Validates user credentials against Home Assistant
 * @param {string} haUrl - The base URL of the Home Assistant instance
 * @param {string} username - The username to authenticate
 * @param {string} password - The password to authenticate
 * @returns {Promise<boolean>} - True if authentication is successful
 */
export const validateCredentials = async (haUrl, username, password) => {
    try {
        // Normalise URL: ensure http(s) scheme (not wss/ws), strip trailing slash
        const baseUrl = haUrl
            .replace(/^wss:\/\//i, 'https://')
            .replace(/^ws:\/\//i, 'http://')
            .replace(/\/$/, '');
        const client_id = 'https://home-assistant.io/android/';

        console.log('[Auth] Step 1: Init flow at:', `${baseUrl}/auth/login_flow`);
        console.log('[Auth] Username:', username);

        // Step 1: Init Flow
        const initResponse = await fetch(`${baseUrl}/auth/login_flow`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                client_id: client_id,
                handler: ['homeassistant', null],
                redirect_uri: client_id
            })
        });

        console.log('[Auth] Init response status:', initResponse.status);

        if (!initResponse.ok) {
            const errText = await initResponse.text();
            console.error('[Auth] Init FAILED:', initResponse.status, errText);
            return false;
        }

        const initData = await initResponse.json();
        console.log('[Auth] Init data:', JSON.stringify(initData));
        const flowId = initData.flow_id;

        if (!flowId) {
            console.error('[Auth] No flow_id in response:', JSON.stringify(initData));
            return false;
        }

        // Step 2: Login with Credentials — HA requires client_id here too
        console.log('[Auth] Step 2: Submitting credentials for flow:', flowId);
        const loginResponse = await fetch(`${baseUrl}/auth/login_flow/${flowId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: username,
                password: password,
                client_id: client_id,
            })
        });

        console.log('[Auth] Login response status:', loginResponse.status);
        const loginData = await loginResponse.json();
        console.log('[Auth] Login response data:', JSON.stringify(loginData));

        // Check success
        if (loginData.type === 'create_entry') {
            console.log('[Auth] ✅ Login SUCCESS');
            return true;
        } else if (loginData.type === 'mfa_required') {
            console.log('[Auth] MFA required — password was valid, treating as success');
            return true;
        } else {
            console.log('[Auth] ❌ Login FAILED. type:', loginData.type, 'errors:', JSON.stringify(loginData.errors || loginData.input_errors || {}));
            return false;
        }

    } catch (error) {
        console.error('[Auth] ❌ Exception:', error.message || error);
        return false;
    }
};
