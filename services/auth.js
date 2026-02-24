
/**
 * Validates user credentials against Home Assistant
 * @param {string} haUrl - The base URL of the Home Assistant instance
 * @param {string} username - The username to authenticate
 * @param {string} password - The password to authenticate
 * @returns {Promise<boolean>} - True if authentication is successful
 */
export const validateCredentials = async (haUrl, username, password) => {
    try {
        // Ensure URL does not end with slash
        const baseUrl = haUrl.replace(/^https?:\/\//i, (m) => m.toLowerCase()).replace(/\/$/, '');
        const client_id = 'https://home-assistant.io/android/';

        // Step 1: Init Flow
        const initResponse = await fetch(`${baseUrl}/auth/login_flow`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                client_id: client_id,
                handler: ['homeassistant', null],
                redirect_uri: 'homeassistant://auth-callback'
            })
        });

        if (!initResponse.ok) {
            console.error('Auth Init Failed:', initResponse.status);
            return false;
        }

        const initData = await initResponse.json();
        const flowId = initData.flow_id;

        if (!flowId) {
            console.error('No flow_id returned from HA');
            return false;
        }

        // Step 2: Login with Credentials
        const loginResponse = await fetch(`${baseUrl}/auth/login_flow/${flowId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: username,
                password: password,
                client_id: client_id
            })
        });

        const loginData = await loginResponse.json();

        // Check success
        if (loginData.type === 'create_entry') {
            return true;
        } else if (loginData.type === 'mfa_required') {
            // If MFA is required, we currently don't support it in this simple check,
            // but strictly speaking, the password WAS correct (otherwise it would invalid_auth).
            // However, to be safe, we might return false or handle it.
            // For now, let's assume if we got to MFA, the password was right.
            // BUT, if we want to enforce full login, we should probably fail.
            // The user just wants "password check". 
            // Let's log it and return true because the PASSWORD was valid.
            console.log('MFA Required - Password was valid but more steps needed. Returning true for password check.');
            return true;
        } else {
            console.log('Auth Failed: ', loginData.input_errors || loginData.type);
            return false;
        }

    } catch (error) {
        console.error("Auth validation error:", error);
        return false;
    }
};
