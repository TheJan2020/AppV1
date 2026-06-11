import * as SecureStore from 'expo-secure-store';
import { authFetch } from '../utils/authFetch';

export async function sendChatMessage(backendUrl, message, history = [], opts = {}) {
    const apiKey = await SecureStore.getItemAsync('api_key_openai');
    if (!backendUrl) throw new Error('No backendUrl provided');
    if (!apiKey) throw new Error('No OpenAI API key found');

    const body = {
        message,
        api_key: apiKey,
        history,
        model: opts.model,
        max_tokens: opts.max_tokens,
        temperature: opts.temperature
    };

    const res = await authFetch(`${backendUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });

    return res.json();
}
