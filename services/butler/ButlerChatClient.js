/**
 * WebSocket client for Butlerv1 backend `/chat` (Gemini text chat).
 *
 * Protocol:
 *   Client → Server:  {"type":"message","text":"..."}
 *                     {"type":"context","text":"..."}
 *                     {"type":"ping"}                         (keepalive)
 *   Server → Client:  {"type":"text","text":"..."}          (streaming chunk)
 *                     {"type":"turn_end"}                   (model finished)
 *                     {"type":"tool_call_started","name":"...","args":{}}
 *                     {"type":"tool_call_result","name":"...","result":{}}
 *                     {"type":"pong"}                         (keepalive ack)
 *                     {"type":"error","message":"..."}
 */
const KEEPALIVE_MS = 25000;

export class ButlerChatClient {
    constructor(wsBaseUrl) {
        this.wsBaseUrl = wsBaseUrl.replace(/\/$/, '');
        this.ws = null;
        this.listeners = {};
        this._keepaliveTimer = null;
        this._intentionalClose = false;
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
        this._intentionalClose = false;
        return new Promise((resolve, reject) => {
            let settled = false;
            const finish = (fn, arg) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                fn(arg);
            };

            // User-Agent avoids some reverse proxies blocking RN WebSockets (iOS).
            const ws = new WebSocket(url, undefined, {
                headers: { 'User-Agent': 'PrimeWave-App/1.0' },
            });
            this.ws = ws;

            const timer = setTimeout(() => {
                try { this.ws?.close(); } catch (_) { /* ignore */ }
                finish(reject, new Error(
                    `Butler chat server did not answer in ${timeoutMs / 1000}s.`
                ));
            }, timeoutMs);

            ws.onopen = () => {
                console.log('[ButlerChat] connected');
                this._startKeepalive();
                this.emit('open');
                finish(resolve);
            };

            ws.onmessage = (ev) => {
                try {
                    const msg = JSON.parse(ev.data);
                    if (msg.type === 'pong') return;
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
                this._stopKeepalive();
                console.log('[ButlerChat] closed', ev.code, ev.reason);
                this.emit('close', {
                    code: ev.code,
                    reason: ev.reason || '',
                    intentional: this._intentionalClose,
                });
                if (!settled) {
                    finish(reject, new Error(`Butler chat connection closed (${ev.code})`));
                }
            };
        });
    }

    close() {
        this._intentionalClose = true;
        this._stopKeepalive();
        try { this.ws?.close(); } catch (_) { /* ignore */ }
        this.ws = null;
    }

    sendMessage(text) {
        this._send({ type: 'message', text });
    }

    sendContext(text) {
        this._send({ type: 'context', text });
    }

    _startKeepalive() {
        this._stopKeepalive();
        this._keepaliveTimer = setInterval(() => {
            this._send({ type: 'ping' });
        }, KEEPALIVE_MS);
    }

    _stopKeepalive() {
        if (this._keepaliveTimer) {
            clearInterval(this._keepaliveTimer);
            this._keepaliveTimer = null;
        }
    }

    _send(obj) {
        if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(obj));
        } else {
            console.warn('[ButlerChat] send called but WS not open');
        }
    }

    get isConnected() {
        return this.ws?.readyState === WebSocket.OPEN;
    }
}
