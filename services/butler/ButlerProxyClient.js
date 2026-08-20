/**
 * WebSocket client for Butlerv1 backend `/voice` (Gemini Live proxy).
 */
export class ButlerProxyClient {
    constructor(wsBaseUrl) {
        this.wsBaseUrl = wsBaseUrl.replace(/\/$/, '');
        this.ws = null;
        this.allowInterruption = false;
        this.listeners = {};
        this._pingTimer = null;
        this._connected = false;
        this._closing = false;
    }

    on(event, fn) {
        (this.listeners[event] ||= []).push(fn);
        return () => {
            this.listeners[event] = (this.listeners[event] || []).filter((f) => f !== fn);
        };
    }

    emit(event, ...args) {
        for (const fn of this.listeners[event] || []) fn(...args);
    }

    setAllowInterruption(allow) {
        if (this.allowInterruption === allow) return;
        this.allowInterruption = allow;
        if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ type: 'set_allow_interruption', value: allow }));
        }
    }

    connect(callLanguage = null, timeoutMs = 30000) {
        const lang =
            callLanguage === 'en' || callLanguage === 'ar' ? callLanguage : null;
        const langQuery = lang ? `&lang=${lang}` : '';
        const url = `${this.wsBaseUrl}/voice?allow_interruption=${this.allowInterruption ? 'true' : 'false'}${langQuery}`;
        console.log('[ButlerProxy] connecting', url);
        return new Promise((resolve, reject) => {
            let settled = false;
            const finish = (fn, arg) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                fn(arg);
            };

            this._closing = false;
            const ws = new WebSocket(url);
            this.ws = ws;

            const timer = setTimeout(() => {
                try {
                    this.ws?.close();
                } catch (_) { /* ignore */ }
                finish(reject, new Error(
                    `Butler server did not answer in ${timeoutMs / 1000}s. Check the backend is reachable (simulator: http://127.0.0.1:8787).`,
                ));
            }, timeoutMs);
            ws.onopen = () => {
                console.log('[ButlerProxy] open');
                this._connected = true;
                this._startPing();
                this.emit('open');
                finish(resolve);
            };
            ws.onmessage = (ev) => this._handleMessage(ev.data);
            ws.onerror = () => {
                if (this._closing) return;
                const err = new Error('Butler voice WebSocket error — is uvicorn running on port 8787?');
                this.emit('error', err);
                finish(reject, err);
            };
            ws.onclose = (ev) => {
                console.warn('[ButlerProxy] closed', ev.code, ev.reason);
                this._stopPing();
                const wasConnected = this._connected;
                this._connected = false;
                if (this._closing) return;
                this.emit('close', `${ev.code} ${ev.reason || ''}`.trim());
                if (!settled) {
                    finish(reject, new Error(`Butler connection closed (${ev.code})`));
                } else if (wasConnected) {
                    this.emit('error', new Error(`Butler disconnected (${ev.code})`));
                }
            };
        });
    }

    _startPing() {
        this._stopPing();
        this._pingTimer = setInterval(() => {
            if (this.ws?.readyState === WebSocket.OPEN) {
                try {
                    this.ws.send(JSON.stringify({ type: 'ping' }));
                } catch (_) { /* ignore */ }
            }
        }, 25000);
    }

    _stopPing() {
        if (this._pingTimer) {
            clearInterval(this._pingTimer);
            this._pingTimer = null;
        }
    }

    close() {
        this._closing = true;
        this._stopPing();
        this._connected = false;
        try {
            this.ws?.close();
        } catch (_) { /* ignore */ }
        this.ws = null;
    }

    sendAudioChunk(pcmBase64) {
        if (this.ws?.readyState !== WebSocket.OPEN) return;
        this.ws.send(JSON.stringify({ type: 'audio', data: pcmBase64 }));
    }

    sendContext(text) {
        if (this.ws?.readyState !== WebSocket.OPEN || !text) return;
        this.ws.send(JSON.stringify({ type: 'context', text }));
    }

    setCallLanguage(language) {
        if (this.ws?.readyState !== WebSocket.OPEN) return;
        if (language !== 'en' && language !== 'ar') return;
        this.ws.send(JSON.stringify({ type: 'set_call_language', language }));
    }

    _handleMessage(raw) {
        let msg;
        try {
            msg = typeof raw === 'string' ? JSON.parse(raw) : null;
        } catch {
            return;
        }
        if (!msg?.type) return;

        switch (msg.type) {
            case 'audio':
                if (typeof msg.data === 'string') this.emit('audio', msg.data);
                break;
            case 'text':
                if (typeof msg.text === 'string') this.emit('text', msg.text);
                break;
            case 'user_turn_started':
                this.emit('userTurnStarted');
                break;
            case 'user_transcript':
                if (typeof msg.text === 'string') this.emit('userTranscript', msg.text);
                break;
            case 'user_transcript_final':
                if (typeof msg.text === 'string') this.emit('userTranscriptFinal', msg.text);
                break;
            case 'assistant_transcript':
                if (typeof msg.text === 'string') this.emit('assistantTranscript', msg.text);
                break;
            case 'tool_call_started':
                this.emit('toolCall', String(msg.name ?? '?'), msg.args ?? {});
                break;
            case 'tool_call_result':
                this.emit('toolResult', String(msg.name ?? '?'), msg.result);
                break;
            case 'turn_end':
                this.emit('turnEnd');
                break;
            case 'interrupted':
                this.emit('interrupted');
                break;
            case 'pong':
                break;
            case 'error':
                this.emit('error', new Error(String(msg.message ?? 'Butler backend error')));
                break;
            default:
                break;
        }
    }
}
