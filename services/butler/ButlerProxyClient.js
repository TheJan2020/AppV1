/**
 * WebSocket client for Butlerv1 backend `/voice` (Gemini Live proxy).
 */
export class ButlerProxyClient {
    constructor(wsBaseUrl) {
        this.wsBaseUrl = wsBaseUrl.replace(/\/$/, '');
        this.ws = null;
        this.allowInterruption = true;
        this.listeners = {};
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

    connect(callLanguage = null, timeoutMs = 15000) {
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

            const ws = new WebSocket(url);
            this.ws = ws;

            const timer = setTimeout(() => {
                try {
                    this.ws?.close();
                } catch (_) { /* ignore */ }
                finish(reject, new Error(
                    `Butler server did not answer in ${timeoutMs / 1000}s. Check URL in Settings (simulator: http://127.0.0.1:8787).`,
                ));
            }, timeoutMs);
            ws.onopen = () => {
                console.log('[ButlerProxy] open');
                this.emit('open');
                finish(resolve);
            };
            ws.onmessage = (ev) => this._handleMessage(ev.data);
            ws.onerror = () => {
                const err = new Error('Butler voice WebSocket error — is uvicorn running on port 8787?');
                this.emit('error', err);
                finish(reject, err);
            };
            ws.onclose = (ev) => {
                console.warn('[ButlerProxy] closed', ev.code, ev.reason);
                this.emit('close', `${ev.code} ${ev.reason || ''}`.trim());
                if (!settled) {
                    finish(reject, new Error(`Butler connection closed (${ev.code})`));
                }
            };
        });
    }

    close() {
        this.ws?.close();
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
            case 'error':
                this.emit('error', new Error(String(msg.message ?? 'Butler backend error')));
                break;
            default:
                break;
        }
    }
}
