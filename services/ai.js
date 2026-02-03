import * as SecureStore from 'expo-secure-store';

export class AIService {
    static async saveKey(provider, key) {
        try {
            await SecureStore.setItemAsync(`api_key_${provider}`, key);
            return true;
        } catch (error) {
            console.error(`Error saving key for ${provider}:`, error);
            return false;
        }
    }

    static async getKey(provider) {
        try {
            return await SecureStore.getItemAsync(`api_key_${provider}`);
        } catch (error) {
            console.error(`Error getting key for ${provider}:`, error);
            return null;
        }
    }

    static async transcribeAudio(uri) {
        const apiKey = await this.getKey('openai');
        if (!apiKey) throw new Error('No OpenAI API key found');

        const formData = new FormData();
        formData.append('file', {
            uri,
            type: 'audio/m4a',
            name: 'audio.m4a',
        });
        formData.append('model', 'whisper-1');

        const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'multipart/form-data',
            },
            body: formData,
        });

        const data = await response.json();
        if (data.error) throw new Error(data.error.message);
        return data.text;
    }

    static async testKey(provider, key) {
        if (!key) throw new Error('No API key provided');

        try {
            if (provider === 'openai') {
                const response = await fetch('https://api.openai.com/v1/models', {
                    headers: { 'Authorization': `Bearer ${key}` }
                });
                const data = await response.json();
                if (data.error) throw new Error(data.error.message);
                return true;
            }

            if (provider === 'anthropic') {
                // Determine if key is old or new format, but generally we can try a simple message or just check if we can hit an endpoint
                // Anthropic doesn't have a simple "list models" without authing, but we can try a dummy message
                const response = await fetch('https://api.anthropic.com/v1/messages', {
                    method: 'POST',
                    headers: {
                        'x-api-key': key,
                        'anthropic-version': '2023-06-01',
                        'content-type': 'application/json'
                    },
                    body: JSON.stringify({
                        model: 'claude-3-haiku-20240307',
                        max_tokens: 1,
                        messages: [{ role: 'user', content: 'Hi' }]
                    })
                });
                const data = await response.json();
                if (data.error) throw new Error(data.error.message);
                return true;
            }

            if (provider === 'gemini') {
                const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
                const data = await response.json();
                if (data.error) throw new Error(data.error.message);
                return true;
            }

            throw new Error('Unknown Provider');
        } catch (error) {
            throw error;
        }
    }

    static async setActiveModel(model) { // model: 'openai' | 'anthropic' | 'gemini'
        try {
            await SecureStore.setItemAsync('active_ai_model', model);
        } catch (error) {
            console.error('Error saving active model:', error);
        }
    }

    static async getActiveModel() {
        try {
            return await SecureStore.getItemAsync('active_ai_model') || 'openai';
        } catch (error) {
            return 'openai';
        }
    }

    static async determineCameraIntent(message, availableCameras, model = null) {
        const activeModel = model || await this.getActiveModel();
        const apiKey = await this.getKey(activeModel);

        if (!apiKey) return { needs_camera: false };

        const cameraList = availableCameras.map(c => `${c.entity_id} (${c.attributes.friendly_name || ''})`).join(', ');

        const systemPrompt = `You are a helper that classifies if a user wants to see a camera.
        Available Cameras: ${cameraList}
        
        Output JSON ONLY: { "needs_camera": boolean, "entity_id": string | null }
        If the user asks to "see", "show", "check", "look at" a location, and that location matches a camera, return true.
        Otherwise false.`;

        try {
            // We use a separate lightweight call (always OpenAI or compatible for JSON speed)
            // For now, reuse the generic callOpenAI if active model is OpenAI, or just force OpenAI if available for tools?
            // To keep it simple, we use the active model's text capability.

            // NOTE: For better reliability, we force a short completion.
            // Construct a distinct messages array
            const messages = [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: message }
            ];

            let responseText = '';
            if (activeModel === 'openai') {
                // Reuse callOpenAI but we need IT to return JSON. callOpenAI returns string.
                // We can just parse the string.
                const response = await fetch('https://api.openai.com/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${apiKey}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        model: 'gpt-4o-mini',
                        messages: messages,
                        max_tokens: 100,
                        response_format: { type: "json_object" }
                    })
                });
                const data = await response.json();
                if (data.error) throw new Error(data.error.message);
                responseText = data.choices[0].message.content;

            } else {
                // Fallback for others (Anthropic/Gemini) if they don't support JSON mode easily or just prompt engineering
                // For this task, let's assume OpenAI is primary as per previous flows.
                // If not OpenAI, we skip smart detection or try standard generic send?
                // Let's implement generic fallback if needed, but for now specific OpenAI JSON call is safest.
                return { needs_camera: false };
            }

            console.log('[AIService] Intent Detection Raw:', responseText);
            return JSON.parse(responseText);

        } catch (error) {
            console.error('[AIService] Intent Detection Failed:', error);
            return { needs_camera: false };
        }
    }

    static async sendMessage(message, history = [], context = {}, model = null, image = null) {
        const activeModel = model || await this.getActiveModel();
        const apiKey = await this.getKey(activeModel);

        if (!apiKey) {
            throw new Error(`No API key found for ${activeModel}`);
        }

        const systemPrompt = `You are a helpful home assistant AI. You have access to the following home state: ${JSON.stringify(context)}. 
        Use this information to answer user questions. 
        YOU CAN CONTROL DEVICES. To do so, you MUST output a VALID JSON block inside a special tag: [[COMMAND: {JSON} ]].
        Format: [[COMMAND: { "action": "call_service", "domain": "light", "service": "turn_on", "service_data": { "entity_id": "light.living_room" } } ]]
        
        IMPORTANT:
        1. Always reply to the user in natural language first.
        2. If you need to perform an action, append the [[COMMAND: ... ]] block at the end of your response.
        3. Do NOT output the JSON without the special [[COMMAND: ... ]] wrapper.`;

        try {
            if (activeModel === 'openai') {
                return await this.callOpenAI(apiKey, message, history, systemPrompt, image);
            } else if (activeModel === 'anthropic') {
                return await this.callAnthropic(apiKey, message, history, systemPrompt);
            } else if (activeModel === 'gemini') {
                return await this.callGemini(apiKey, message, history, systemPrompt);
            }
        } catch (error) {
            console.error('AI Request Failed:', error);
            throw error;
        }
    }

    static async callOpenAI(apiKey, message, history, systemPrompt, image = null) {
        const messages = [
            { role: 'system', content: systemPrompt },
            ...history,
        ];

        // Construct User Message
        if (image) {
            messages.push({
                role: 'user',
                content: [
                    { type: 'text', text: message },
                    {
                        type: 'image_url',
                        image_url: {
                            url: `data:image/jpeg;base64,${image}`
                        }
                    }
                ]
            });
        } else {
            messages.push({ role: 'user', content: message });
        }

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini', // Supports Vision
                messages: messages,
                max_tokens: 500
            })
        });

        const data = await response.json();
        if (data.error) throw new Error(data.error.message);
        return data.choices[0].message.content;
    }

    static async callAnthropic(apiKey, message, history, systemPrompt) {
        // Anthropic requires system prompt at top level, not in messages array for some versions, or differently structred.
        // Using Messages API
        const messages = [
            ...history,
            { role: 'user', content: message }
        ];

        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
                'content-type': 'application/json'
            },
            body: JSON.stringify({
                model: 'claude-3-5-sonnet-20240620', // or latest
                max_tokens: 1024,
                system: systemPrompt,
                messages: messages
            })
        });

        const data = await response.json();
        if (data.error) throw new Error(data.error.message);
        return data.content[0].text;
    }

    static async callGemini(apiKey, message, history, systemPrompt) {
        // Simple implementation for Gemini Pro
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${apiKey}`;

        // Convert history to Gemini format if needed, simplistic approach:
        const contents = [
            {
                role: 'user',
                parts: [{ text: `${systemPrompt}\n\n${message}` }] // Injecting system prompt into first user message for simplicity as system instructions are separate in newer API
            }
        ];

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents })
        });

        const data = await response.json();
        if (data.error) throw new Error(data.error.message);
        return data.candidates[0].content.parts[0].text;
    }
}
