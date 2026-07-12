import { Audio } from 'expo-av';
import { ButlerProxyClient } from './ButlerProxyClient';
import { createButlerPcmPlayer, createButlerPcmRecorder } from './audioBackend';
import { getNativeAudioStatus } from './nativeAudio';

export function buildContextMessage(context) {
    if (!context) return '';
    const lines = [];
    if (context.userName) lines.push(`User: ${context.userName}`);
    if (context.time) lines.push(`Local time: ${context.time}`);
    if (context.rooms?.length) {
        const names = context.rooms.map((r) => r.name || r.area_id).filter(Boolean).slice(0, 10);
        if (names.length) lines.push(`Rooms: ${names.join(', ')}`);
    }
    if (!lines.length) return '';
    return `[app context]\n${lines.join('\n')}`;
}

/**
 * Manages one Butler voice call (WS + mic + speaker). All errors are returned, never thrown uncaught.
 */
export class ButlerVoiceSession {
    constructor(wsBaseUrl) {
        this.wsBaseUrl = wsBaseUrl;
        this.client = null;
        this.player = null;
        this.recorder = null;
        this.handlers = {};
        this._sendMic = null;
        this._audioRoute = 'SPEAKER';
        /** False until Butler finishes the opening greeting (stops hello-echo loops). */
        this._micOpen = false;
        /** True while Butler audio is playing — mute uplink so VAD doesn't re-trigger. */
        this._modelSpeaking = false;
    }

    setInitialRoute(route) {
        this._audioRoute = route === 'SPEAKER' ? 'SPEAKER' : 'HEADSET';
    }

    on(event, fn) {
        this.handlers[event] = fn;
    }

    emit(event, payload) {
        this.handlers[event]?.(payload);
    }

    async start(context, options = {}) {
        const callLanguage =
            options.callLanguage === 'ar' || options.callLanguage === 'en'
                ? options.callLanguage
                : 'en';
        const native = getNativeAudioStatus();
        if (!native.ready) {
            return { ok: false, error: native.message };
        }

        const { status: perm } = await Audio.requestPermissionsAsync();
        if (perm !== 'granted') {
            return { ok: false, error: 'Microphone permission is required.' };
        }

        this.client = new ButlerProxyClient(this.wsBaseUrl);
        this.player = createButlerPcmPlayer();
        this.recorder = createButlerPcmRecorder();
        this._callLanguage = callLanguage;

        this.client.setAllowInterruption(true);
        this._micOpen = false;
        this._modelSpeaking = false;
        this._sendMic = (chunk) => {
            // Keep mic closed only until the opening greeting finishes.
            // After that, keep streaming so the user can interrupt mid-reply.
            if (!this._micOpen) return;
            this.client?.sendAudioChunk(chunk);
        };
        const sendMic = this._sendMic;
        this.client.on('audio', (b64) => {
            this._modelSpeaking = true;
            this.emit('speaking', null);
            try {
                this.player.enqueue(b64);
            } catch (e) {
                this.emit('error', { message: e?.message ?? String(e) });
            }
        });
        this.client.on('turnEnd', () => {
            this._modelSpeaking = false;
            this._micOpen = true;
            this.emit('listening', null);
        });
        this.client.on('interrupted', () => {
            this._modelSpeaking = false;
            this._micOpen = true;
            this.emit('interrupted', null);
        });
        this.client.on('text', (t) => this.emit('text', t));
        this.client.on('userTranscript', (t) => this.emit('userTranscript', t));
        this.client.on('userTranscriptFinal', (t) => this.emit('userTranscriptFinal', t));
        this.client.on('assistantTranscript', (t) => this.emit('assistantTranscript', t));
        this.client.on('toolCall', (name) => this.emit('toolCall', name));
        this.client.on('toolResult', (name) => this.emit('toolResult', name));
        this.client.on('error', (err) => this.emit('error', { message: err?.message ?? String(err) }));
        this.client.on('close', (reason) => {
            this.emit('error', { message: `Call disconnected${reason ? `: ${reason}` : ''}` });
        });

        try {
            // Prepare playback session BEFORE mic — otherwise first Butler audio
            // reconfigures AVAudioSession and can silence the recorder on iOS.
            await this.player.ensurePrepared(this._audioRoute);
        } catch (e) {
            await this.stop();
            return { ok: false, error: e?.message ?? String(e) };
        }

        try {
            await this.client.connect(callLanguage);
        } catch (e) {
            await this.stop();
            return { ok: false, error: e?.message ?? String(e) };
        }

        const ctxMsg = buildContextMessage(context);
        if (ctxMsg) {
            // Defer so mic + Gemini handshake aren't competing with a large context frame.
            setTimeout(() => this.client?.sendContext(ctxMsg), 400);
        }

        try {
            this.recorder.start(sendMic);
        } catch (e) {
            await this.stop();
            return { ok: false, error: e?.message ?? String(e) };
        }

        // Safety: if greeting never ends cleanly, open the mic anyway.
        setTimeout(() => {
            if (this.client && !this._micOpen) {
                console.log('[ButlerVoice] opening mic after greeting timeout');
                this._micOpen = true;
                this._modelSpeaking = false;
            }
        }, 8000);

        return { ok: true };
    }

    lockCallLanguage(language) {
        if (language !== 'en' && language !== 'ar') return;
        this._callLanguage = language;
        this.client?.setCallLanguage(language);
    }

    async setRoute(route) {
        const next = route === 'SPEAKER' ? 'SPEAKER' : 'HEADSET';
        this._audioRoute = next;
        if (!this.player) return;
        try {
            await this.player.setRoute(next);
        } catch (e) {
            console.warn('[ButlerVoice] setRoute', e?.message ?? e);
            return; // don't touch mic if route switch failed
        }
        // Soft mic rebind after route settle — avoid cutting the Gemini PCM stream hard.
        if (this.recorder?.started && this._sendMic) {
            const sendMic = this._sendMic;
            setTimeout(() => {
                if (!this.recorder?.started || this._sendMic !== sendMic) return;
                try {
                    this.recorder.stop();
                    this.recorder.start(sendMic);
                } catch (e) {
                    console.warn('[ButlerVoice] mic restart on route', e?.message ?? e);
                }
            }, 250);
        }
    }

    async stop() {
        try {
            this.recorder?.stop();
        } catch (_) { /* ignore */ }
        this.recorder = null;
        try {
            await this.player?.flush();
        } catch (_) { /* ignore */ }
        this.player = null;
        try {
            this.client?.close();
        } catch (_) { /* ignore */ }
        this.client = null;
    }
}
