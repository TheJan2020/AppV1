import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import * as SecureStore from 'expo-secure-store';

/**
 * Simple Wake Word Manager
 * Listens for "Hey Butler" using continuous audio transcription
 * TODO: Replace with Picovoice when account approved
 */
export class WakeWordManager {
    constructor() {
        this.isListening = false;
        this.recording = null;
        this.onWakeWordDetected = null;
        this.checkInterval = null;
    }

    async start(onWakeWordDetected) {
        if (this.isListening) return;

        this.onWakeWordDetected = onWakeWordDetected;
        this.isListening = true;

        console.log('[WakeWord] Starting continuous listening for "Hey Butler"...');

        // Set audio mode for background listening
        await Audio.setAudioModeAsync({
            allowsRecordingIOS: true,
            playsInSilentModeIOS: true,
            staysActiveInBackground: true,
        });

        // Start continuous recording loop
        this.startListeningLoop();
    }

    async startListeningLoop() {
        while (this.isListening) {
            try {
                // Ensure previous recording is unloaded
                if (this.recording) {
                    try {
                        await this.recording.stopAndUnloadAsync();
                    } catch (e) {
                        // Ignore already unloaded errors
                    }
                    this.recording = null;
                }

                // Record 2 seconds chunks (Faster checking)
                const { recording } = await Audio.Recording.createAsync(
                    Audio.RecordingOptionsPresets.HIGH_QUALITY
                );
                this.recording = recording;

                // Wait 2 seconds
                await new Promise(resolve => setTimeout(resolve, 2000));

                // Stop and process
                await recording.stopAndUnloadAsync();
                const uri = recording.getURI();
                this.recording = null; // Mark as null immediately

                // Check for wake word
                const detected = await this.checkForWakeWord(uri);
                if (detected && this.onWakeWordDetected) {
                    console.log('[WakeWord] ✅ Wake word detected!');
                    this.onWakeWordDetected();
                }

                // Small pause before next chunk
                await new Promise(resolve => setTimeout(resolve, 300));

            } catch (error) {
                console.error('[WakeWord] Error in listening loop:', error);
                // Ensure cleanup on error
                if (this.recording) {
                    try {
                        await this.recording.stopAndUnloadAsync();
                    } catch (e) { }
                    this.recording = null;
                }
                await new Promise(resolve => setTimeout(resolve, 2000)); // Longer pause on error
            }
        }
    }

    async checkForWakeWord(audioUri) {
        try {
            const backendUrl = await SecureStore.getItemAsync('admin_url');
            const apiKey = await SecureStore.getItemAsync('api_key_openai');

            if (!backendUrl || !apiKey) return false;

            const formData = new FormData();
            formData.append('audio', {
                uri: audioUri,
                type: 'audio/m4a',
                name: 'audio.m4a',
            });
            formData.append('api_key', apiKey);
            formData.append('language', 'en');

            const response = await fetch(`${backendUrl}/api/voice/transcribe`, {
                method: 'POST',
                body: formData,
            });

            const data = await response.json();
            if (data.success && data.transcript) {
                const transcript = data.transcript.toLowerCase();
                console.log('[WakeWord] Heard:', transcript);

                // Check for wake words with variations
                const detected = transcript.includes('hey butler') ||
                    transcript.includes('hello butler') ||
                    transcript.includes('ok butler') ||
                    transcript.includes('hi butler') ||
                    transcript.includes('hey buffer') || // Common STT error
                    transcript.includes('hey bottle');   // Common STT error

                if (detected) {
                    console.log('[WakeWord] ✅ WAKE WORD MATCHED!');
                }

                return detected;
            }

            return false;
        } catch (error) {
            console.error('[WakeWord] Check error:', error);
            return false;
        }
    }

    async stop() {
        this.isListening = false;
        if (this.recording) {
            try {
                await this.recording.stopAndUnloadAsync();
            } catch (e) {
                // Ignore
            }
            this.recording = null;
        }
        console.log('[WakeWord] Stopped listening');
    }

    async pause() {
        this.isListening = false;
        console.log('[WakeWord] Paused listening');
    }

    async resume() {
        if (!this.isListening) {
            this.isListening = true;
            this.startListeningLoop();
            console.log('[WakeWord] Resumed listening');
        }
    }
}
