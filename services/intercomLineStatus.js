const listeners = new Set();

let current = {
    level: 'off',
    title: '',
    detail: '',
};

export function getIntercomLineStatus() {
    return current;
}

export function setIntercomLineStatus(next) {
    if (next?.level === 'off') {
        if (current.level === 'off') return;
        current = { level: 'off', title: '', detail: '' };
        listeners.forEach((listener) => {
            try { listener(current); } catch { /* ignore */ }
        });
        return;
    }
    const level = next?.level === 'connected' || next?.level === 'error' ? next.level : 'connecting';
    const title = String(next?.title || '').trim() || (
        level === 'connected' ? 'Door line connected' : level === 'error' ? 'Door line error' : 'Connecting to the door line'
    );
    const detail = String(next?.detail || '').trim() || title;
    if (current.level === level && current.title === title && current.detail === detail) return;
    current = { level, title, detail };
    listeners.forEach((listener) => {
        try { listener(current); } catch { /* ignore */ }
    });
}

export function subscribeIntercomLineStatus(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}
