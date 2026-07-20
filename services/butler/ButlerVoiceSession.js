import { Audio } from 'expo-av';
import { ButlerProxyClient } from './ButlerProxyClient';
import { createButlerPcmPlayer, createButlerPcmRecorder } from './audioBackend';
import { getNativeAudioStatus } from './nativeAudio';
import { pcm16Base64Rms } from './pcmEnergy';

/**
 * Soft echo gate while Butler is talking (and briefly after).
 * Mic hardware stays open — we only withhold uplink chunks that look like
 * speaker echo so barge-in still works when the user speaks over Butler.
 *
 * Values are after PcmRecorder INPUT_GAIN (~2.5× on iOS). Chunks are ~128ms.
 */
const BARGE_IN_RMS = 2200;
const LOUD_BARGE_IN_RMS = 4500;
const BARGE_IN_CHUNKS = 2;
const LOUD_BARGE_IN_CHUNKS = 1;
/** Acoustic tail / room reverb after Butler's last audio chunk. */
const ECHO_HOLDOFF_MS = 450;

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
        /** True while Butler audio is playing — soft-gate uplink; barge-in still allowed. */
        this._modelSpeaking = false;
        /** Brief post-TTS window where speaker echo still leaks into the mic. */
        this._echoHoldoff = false;
        this._echoHoldoffTimer = null;
        this._bargeHits = 0;
        this._bargeInFlight = false;
        /** After local barge-in, drop late TTS until the model turn fully ends. */
        this._suppressModelAudio = false;
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

    _clearEchoHoldoffTimer() {
        if (this._echoHoldoffTimer) {
            clearTimeout(this._echoHoldoffTimer);
            this._echoHoldoffTimer = null;
        }
    }

    _beginEchoHoldoff() {
        this._clearEchoHoldoffTimer();
        this._echoHoldoff = true;
        this._echoHoldoffTimer = setTimeout(() => {
            this._echoHoldoff = false;
            this._echoHoldoffTimer = null;
            this._bargeHits = 0;
        }, ECHO_HOLDOFF_MS);
    }

    _shouldSoftGateUplink() {
        return this._modelSpeaking || this._echoHoldoff;
    }

    async _onBargeIn() {
        if (this._bargeInFlight) return;
        this._bargeInFlight = true;
        this._modelSpeaking = false;
        this._echoHoldoff = false;
        this._suppressModelAudio = true;
        this._clearEchoHoldoffTimer();
        this._bargeHits = 0;
        try {
            await this.player?.clearPlayback();
        } catch (_) { /* ignore */ }
        this.emit('interrupted', null);
        this._bargeInFlight = false;
    }

    async start(context, options = {}) {
        // null until the first clear user utterance locks EN/AR — do not
        // inherit phone OS locale (that was flipping English calls to Arabic).
        const callLanguage =
            options.callLanguage === 'ar' || options.callLanguage === 'en'
                ? options.callLanguage
                : null;
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
        this._echoHoldoff = false;
        this._bargeHits = 0;
        this._bargeInFlight = false;
        this._suppressModelAudio = false;
        this._clearEchoHoldoffTimer();

        this._sendMic = (chunk) => {
            // Keep mic closed only until the opening greeting finishes.
            if (!this._micOpen) return;

            // Soft echo gate: hardware mic stays open; withhold speaker-echo
            // from Gemini unless energy looks like a real barge-in.
            if (this._shouldSoftGateUplink()) {
                const rms = pcm16Base64Rms(chunk);
                if (rms >= BARGE_IN_RMS) {
                    this._bargeHits += 1;
                } else {
                    this._bargeHits = 0;
                }
                const need =
                    rms >= LOUD_BARGE_IN_RMS ? LOUD_BARGE_IN_CHUNKS : BARGE_IN_CHUNKS;
                if (this._bargeHits < need) {
                    return; // drop echo / ambient during Butler speech
                }
                void this._onBargeIn();
            }

            this.client?.sendAudioChunk(chunk);
        };
        const sendMic = this._sendMic;
        this.client.on('audio', (b64) => {
            // Ignore late TTS packets after a local barge-in until turn_end.
            if (this._suppressModelAudio || this._bargeInFlight) return;
            this._modelSpeaking = true;
            this._echoHoldoff = false;
            this._clearEchoHoldoffTimer();
            this._bargeHits = 0;
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
            this._bargeHits = 0;
            this._suppressModelAudio = false;
            // Keep soft-gating briefly — speaker echo often trails the last chunk.
            this._beginEchoHoldoff();
            this.emit('listening', null);
        });
        this.client.on('interrupted', () => {
            this._modelSpeaking = false;
            this._micOpen = true;
            this._bargeHits = 0;
            this._beginEchoHoldoff();
            void this.player?.clearPlayback();
            this.emit('interrupted', null);
        });
        this.client.on('text', (t) => this.emit('text', t));
        this.client.on('userTurnStarted', () => this.emit('userTurnStarted'));
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
        // Irreversible for this call — ignore attempts to switch mid-call.
        if (this._callLanguage === 'en' || this._callLanguage === 'ar') return;
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
        this._clearEchoHoldoffTimer();
        this._micOpen = false;
        this._modelSpeaking = false;
        this._echoHoldoff = false;
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
