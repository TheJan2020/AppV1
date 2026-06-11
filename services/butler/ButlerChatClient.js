/**
 * WebSocket client for Butlerv1 backend `/chat` (Gemini text chat).
 *
 * Protocol:
 *   Client → Server:  {"type":"message","text":"..."}
 *                     {"type":"context","text":"..."}
 *   Server → Client:  {"type":"text","text":"..."}          (streaming chunk)
 *                     {"type":"turn_end"}                   (model finished)
 *                     {"type":"tool_call_started","name":"...","args":{}}
 *                     {"type":"tool_call_result","name":"...","result":{}}
 *                     {"type":"error","message":"..."}
 */
export class ButlerChatClient {
    constructor(wsBaseUrl) {
        this.wsBaseUrl = wsBaseUrl.replace(/\/$/, '');
        this.ws = null;
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

    connect(timeoutMs = 15000) {
        const url = `${this.wsBaseUrl}/chat`;
        console.log('[ButlerChat] connecting', url);
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
                try { this.ws?.close(); } catch (_) { /* ignore */ }
                finish(reject, new Error(
                    `Butler chat server did not answer in ${timeoutMs / 1000}s.`
                ));
            }, timeoutMs);

            ws.onopen = () => {
                console.log('[ButlerChat] connected');
                this.emit('open');
                finish(resolve);
            };

            ws.onmessage = (ev) => {
                try {
                    const msg = JSON.parse(ev.data);
                    this.emit('frame', msg);
                    if (msg.type) this.emit(msg.type, msg);
                } catch (e) {
                    console.warn('[ButlerChat] bad JSON frame', e);
                }
            };

            ws.onerror = () => {
                const err = new Error('Butler chat WebSocket error — is the backend running?');
                this.emit('error', err);
                finish(reject, err);
            };

            ws.onclose = (ev) => {
                console.log('[ButlerChat] closed', ev.code, ev.reason);
                this.emit('close', `${ev.code} ${ev.reason || ''}`.trim());
                if (!settled) {
                    finish(reject, new Error(`Butler chat connection closed (${ev.code})`));
                }
            };
        });
    }

    close() {
        this.ws?.close();
        this.ws = null;
    }

    sendMessage(text) {
        this._send({ type: 'message', text });
    }

    sendContext(text) {
        this._send({ type: 'context', text });
    }

    _send(obj) {
        if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(obj));
        } else {
            console.warn('[ButlerChat] sendMessage called but WS not open');
        }
    }

    get isConnected() {
        return this.ws?.readyState === WebSocket.OPEN;
    }
}
