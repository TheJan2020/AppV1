import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import * as SecureStore from 'expo-secure-store';
import * as Haptics from 'expo-haptics';
import { getActiveProfileConfig } from './profile';

/**
 * Conversation Session Manager
 * Handles multi-turn conversations with continuous listening
 */
export class ConversationManager {
    constructor() {
        this.isActive = false;
        this.recording = null;
        this.sound = null;
        this.history = [];
        this.onStatusChange = null;
        this.onCommand = null;
        this.silenceTimer = null;
        this.silenceStart = null;
        this.isSpeaking = false;
        this.lastMetering = -160;
    }

    async startSession({ onStatusChange, onCommand, context }) {
        if (this.isActive) return;

        this.isActive = true;
        this.history = [];
        this.onStatusChange = onStatusChange;
        this.onCommand = onCommand;
        this.context = context;

        console.log('[Conversation] Session started');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

        // Play acknowledgment sound
        await this.playAcknowledgmentSound();

        // Start listening for first command
        this.onStatusChange?.('listening');
        await this.startListening();
    }

    async startListening() {
        if (!this.isActive) return;

        try {
            this.onStatusChange?.('listening');

            // Set audio mode for recording
            await Audio.setAudioModeAsync({
                allowsRecordingIOS: true,
                playsInSilentModeIOS: true,
            });

            // Prepare recording options with metering enabled
            const recordingOptions = {
                android: {
                    ...Audio.RecordingOptionsPresets.HIGH_QUALITY.android,
                    extension: '.m4a',
                    outputFormat: Audio.AndroidOutputFormat.MPEG_4,
                    audioEncoder: Audio.AndroidAudioEncoder.AAC,
                    sampleRate: 44100,
                    numberOfChannels: 2,
                    bitRate: 128000,
                    isMeteringEnabled: true,
                },
                ios: {
                    ...Audio.RecordingOptionsPresets.HIGH_QUALITY.ios,
                    extension: '.m4a',
                    outputFormat: Audio.IOSOutputFormat.MPEG4AAC,
                    audioQuality: Audio.IOSAudioQuality.MAX,
                    sampleRate: 44100,
                    numberOfChannels: 2,
                    bitRate: 128000,
                    linearPCMBitDepth: 16,
                    linearPCMIsBigEndian: false,
                    linearPCMIsFloat: false,
                    isMeteringEnabled: true,
                },
                web: {
                    mimeType: 'audio/webm',
                    bitsPerSecond: 128000,
                },
            };

            const { recording } = await Audio.Recording.createAsync(
                recordingOptions,
                this.onRecordingStatusUpdate
            );
            this.recording = recording;

            // Reset VAD state
            this.silenceStart = Date.now();
            this.isSpeaking = false;
            this.lastMetering = -160;

            // Failsafe: Auto-stop after 15 seconds max
            this.silenceTimer = setTimeout(() => {
                this.stopListening();
            }, 15000);

        } catch (error) {
            console.error('[Conversation] Recording error:', error);
            this.onStatusChange?.('error');
        }
    }

    // Call callback every 100ms (default) to check audio levels
    onRecordingStatusUpdate = (status) => {
        if (!status.isRecording) return;

        // Update metering (fallback for some devices)
        const metering = status.metering ?? -160;
        this.lastMetering = metering;

        // VAD Thresholds - Optimizing VAD for speed
        const AUDIO_THRESHOLD = -40; // Start threshold: if metering goes above this, speech is detected
        const SILENCE_THRESHOLD = -50; // Stop threshold: if metering goes below this, silence is detected (hysteresis)
        const SILENCE_DURATION = 600; // 0.6s silence to stop (much faster response)

        if (metering > AUDIO_THRESHOLD) {
            // User is speaking
            if (!this.isSpeaking) {
                console.log('[Conversation] Speech detected (Level:', metering.toFixed(1), ')');
            }
            this.isSpeaking = true;
            this.silenceStart = Date.now(); // Reset silence timer
        } else if (metering < SILENCE_THRESHOLD) {
            // Silence detected (metering is below the silence threshold)
            if (this.isSpeaking) {
                const silenceDuration = Date.now() - this.silenceStart;
                if (silenceDuration > SILENCE_DURATION) {
                    console.log('[Conversation] Silence detected (Duration:', silenceDuration, 'ms), stopping...');
                    this.stopListening();
                    this.isSpeaking = false; // Prevent multiple stops
                }
            }
        }
        // If metering is between SILENCE_THRESHOLD and AUDIO_THRESHOLD, we maintain current state
        // (i.e., if was speaking, continue speaking; if was silent, continue silent)
        // This provides hysteresis to prevent rapid toggling.
    };

    async stopListening() {
        if (!this.recording) return;

        try {
            clearTimeout(this.silenceTimer);
            this.onStatusChange?.('processing');

            await this.recording.stopAndUnloadAsync();
            const uri = this.recording.getURI();
            this.recording = null;

            // Process the command
            await this.processCommand(uri);

        } catch (error) {
            console.error('[Conversation] Stop error:', error);
            this.onStatusChange?.('error');
        }
    }

    async processCommand(audioUri) {
        try {
            const config = await getActiveProfileConfig();
            const backendUrl = config?.adminUrl;
            const apiKey = await SecureStore.getItemAsync('api_key_openai');

            if (!backendUrl || !apiKey) {
                throw new Error('Configuration missing');
            }

            // Step 1: Transcribe
            const formData = new FormData();
            formData.append('audio', {
                uri: audioUri,
                type: 'audio/m4a',
                name: 'audio.m4a',
            });
            formData.append('api_key', apiKey);
            formData.append('language', 'en');

            const transcribeResponse = await fetch(`${backendUrl}/api/voice/transcribe`, {
                method: 'POST',
                body: formData,
            });

            const transcribeData = await transcribeResponse.json();
            if (!transcribeData.success) {
                throw new Error(transcribeData.error || 'Transcription failed');
            }

            console.log('[Conversation] User said:', transcribeData.transcript);

            // Check for end phrases FIRST
            const transcript = transcribeData.transcript.toLowerCase().trim();
            if (this.isEndPhrase(transcript)) {
                console.log('[Conversation] End phrase detected:', transcript);
                // Speak goodbye and end
                this.onStatusChange?.('speaking');
                await this.speakResponse('Goodbye! Have a great day!', apiKey, backendUrl);
                await this.endSession();
                return;
            }

            // Step 2: Process with LLM
            const processResponse = await fetch(`${backendUrl}/api/voice/process`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    transcript: transcribeData.transcript,
                    api_key: apiKey,
                    context: this.context || {},
                    history: this.history
                })
            });

            const processData = await processResponse.json();
            if (!processData.success) {
                throw new Error(processData.error || 'Processing failed');
            }

            console.log('[Conversation] Butler:', processData.response);

            // Check if Sam's response includes a goodbye (means user said goodbye)
            const responseText = processData.response.toLowerCase();
            const shouldEnd = this.isEndPhrase(responseText) ||
                responseText.includes('goodbye') ||
                responseText.includes('farewell') ||
                responseText.includes('have a great');

            // Update history
            this.history.push(
                { role: 'user', content: transcribeData.transcript },
                { role: 'assistant', content: processData.raw_response }
            );
            // Keep only last 10 messages
            this.history = this.history.slice(-10);

            // Execute commands
            if (processData.commands?.length > 0 && this.onCommand) {
                for (const cmd of processData.commands) {
                    await this.onCommand(cmd);
                }
            }

            // Step 3: Speak response
            this.onStatusChange?.('speaking');
            await this.speakResponse(processData.response, apiKey, backendUrl);

            // If this was a goodbye response, end the session
            if (shouldEnd) {
                console.log('[Conversation] Goodbye detected in response, ending session');
                await this.endSession();
                return;
            }

            // Continue listening (conversational loop)
            if (this.isActive) {
                await new Promise(resolve => setTimeout(resolve, 500)); // Brief pause
                await this.startListening();
            }

        } catch (error) {
            console.error('[Conversation] Process error:', error);
            this.onStatusChange?.('error');

            // Retry listening after error
            if (this.isActive) {
                await new Promise(resolve => setTimeout(resolve, 2000));
                await this.startListening();
            }
        }
    }

    async speakResponse(text, apiKey, backendUrl) {
        try {
            const speakResponse = await fetch(`${backendUrl}/api/voice/speak`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    text: text,
                    api_key: apiKey,
                    voice: 'alloy'
                })
            });

            const speakData = await speakResponse.json();
            if (!speakData.success) {
                throw new Error(speakData.error || 'TTS failed');
            }

            // Set audio mode for playback
            await Audio.setAudioModeAsync({
                allowsRecordingIOS: false,
                playsInSilentModeIOS: true,
                staysActiveInBackground: false,
                shouldDuckAndroid: true,
                playThroughEarpieceAndroid: false,
            });

            // Save and play
            const fileUri = `${FileSystem.cacheDirectory}tts_response.mp3`;
            await FileSystem.writeAsStringAsync(fileUri, speakData.audio, {
                encoding: 'base64',
            });

            const { sound } = await Audio.Sound.createAsync(
                { uri: fileUri },
                { shouldPlay: true }
            );

            this.sound = sound;

            // Wait for playback to finish
            await new Promise((resolve) => {
                sound.setOnPlaybackStatusUpdate((status) => {
                    if (status.didJustFinish) {
                        sound.unloadAsync();
                        resolve();
                    }
                });
            });

        } catch (error) {
            console.error('[Conversation] TTS error:', error);
        }
    }

    isEndPhrase(transcript) {
        const cleanTranscript = transcript.toLowerCase().trim();

        // Direct matches
        const endPhrases = [
            'thank you butler',
            'thanks butler',
            'goodbye butler',
            'bye butler',
            'thank you',
            'thanks',
            'goodbye',
            'good bye',
            'bye',
            'stop',
            'cancel',
            'end session',
            'that\'s all',
            'that is all',
            'thats all'
        ];

        // Check for phonetic variations of Butler (STT often mishears specific names)
        const butlerVariations = ['butler', 'buffer', 'but ler', 'battler', 'bottle', 'butter'];

        // Advanced check:
        // 1. Direct phrase match
        if (endPhrases.some(phrase => cleanTranscript.includes(phrase))) return true;

        // 2. Check for "Thank you <Variation>"
        const thanksVariations = ['thank you', 'thanks'];
        for (const thanks of thanksVariations) {
            for (const name of butlerVariations) {
                if (cleanTranscript.includes(`${thanks} ${name}`)) return true;
            }
        }

        return false;
    }

    async endSession() {
        this.isActive = false;
        clearTimeout(this.silenceTimer);

        if (this.recording) {
            await this.recording.stopAndUnloadAsync();
            this.recording = null;
        }

        if (this.sound) {
            await this.sound.unloadAsync();
            this.sound = null;
        }

        this.history = [];
        this.onStatusChange?.('ended');

        console.log('[Conversation] Session ended');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

        // Play goodbye sound
        await this.playGoodbyeSound();
    }

    async playAcknowledgmentSound() {
        // Simple beep for now - can replace with custom sound later
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }

    async playGoodbyeSound() {
        // Simple beep for now - can replace with custom sound later
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    async forceEnd() {
        await this.endSession();
    }
}
