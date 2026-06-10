import { Audio } from 'expo-av';
import { ButlerProxyClient } from './ButlerProxyClient';
import { PcmPlayer } from './PcmPlayer';
import { PcmRecorder } from './PcmRecorder';
import { getNativeAudioStatus } from './nativeAudio';

export function buildContextMessage(context) {
    if (!context) return '';
    const lines = [];
    if (context.userName) lines.push(`User: ${context.userName}`);
    if (context.time) lines.push(`Local time: ${context.time}`);
    if (context.rooms?.length) {
        const names = context.rooms.map((r) => r.name || r.area_id).filter(Boolean).slice(0, 24);
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

    async start(context) {
        const native = getNativeAudioStatus();
        if (!native.ready) {
            return { ok: false, error: native.message };
        }

        const { status: perm } = await Audio.requestPermissionsAsync();
        if (perm !== 'granted') {
            return { ok: false, error: 'Microphone permission is required.' };
        }

        this.client = new ButlerProxyClient(this.wsBaseUrl);
        this.player = new PcmPlayer();
        this.recorder = new PcmRecorder();

        this.client.setAllowInterruption(true);
        let micRestartedForPlayback = false;
        this._sendMic = (chunk) => this.client.sendAudioChunk(chunk);
        const sendMic = this._sendMic;
        this.client.on('audio', (b64) => {
            this.emit('speaking', null);
            if (!micRestartedForPlayback && this.recorder?.chunkCount === 0) {
                micRestartedForPlayback = true;
                try {
                    console.log('[ButlerVoice] restarting mic after playback begins');
                    this.recorder.stop();
                    this.recorder.start(sendMic);
                } catch (e) {
                    console.warn('[ButlerVoice] mic restart', e?.message ?? e);
                }
            }
            try {
                this.player.enqueue(b64);
            } catch (e) {
                this.emit('error', { message: e?.message ?? String(e) });
            }
        });
        this.client.on('turnEnd', () => this.emit('listening', null));
        this.client.on('text', (t) => this.emit('text', t));
        this.client.on('toolCall', (name) => this.emit('toolCall', name));
        this.client.on('error', (err) => this.emit('error', { message: err?.message ?? String(err) }));

        try {
            // Prepare playback session BEFORE mic — otherwise first Butler audio
            // reconfigures AVAudioSession and can silence the recorder on iOS.
            await this.player.ensurePrepared(this._audioRoute);
        } catch (e) {
            await this.stop();
            return { ok: false, error: e?.message ?? String(e) };
        }

        try {
            await this.client.connect();
        } catch (e) {
            await this.stop();
            return { ok: false, error: e?.message ?? String(e) };
        }

        const ctxMsg = buildContextMessage(context);
        if (ctxMsg) this.client.sendContext(ctxMsg);

        try {
            this.recorder.start(sendMic);
        } catch (e) {
            await this.stop();
            return { ok: false, error: e?.message ?? String(e) };
        }

        return { ok: true };
    }

    async setRoute(route) {
        const next = route === 'SPEAKER' ? 'SPEAKER' : 'HEADSET';
        this._audioRoute = next;
        if (!this.player) return;
        try {
            await this.player.setRoute(next);
        } catch (e) {
            console.warn('[ButlerVoice] setRoute', e?.message ?? e);
        }
        if (this.recorder?.started && this._sendMic) {
            try {
                this.recorder.stop();
                this.recorder.start(this._sendMic);
            } catch (e) {
                console.warn('[ButlerVoice] mic restart on route', e?.message ?? e);
            }
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
