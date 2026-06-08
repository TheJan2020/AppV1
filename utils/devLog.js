/**
 * Operational / expected failures (offline server, bad JSON, aborted fetch).
 * Uses console.log so React Native LogBox does not show a red dev toast over the UI.
 */
export function logOperationalIssue(scope, err) {
    if (!__DEV__) return;
    const detail = err?.message ?? (typeof err === 'string' ? err : String(err));
    console.log(`[${scope}]`, detail);
}
