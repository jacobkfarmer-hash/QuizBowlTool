type TTSDiagnostics = { backend: string; lastError: string; fallbackReason: string };
let snapshot: TTSDiagnostics = { backend: 'Not initialized', lastError: '', fallbackReason: '' };
const listeners = new Set<() => void>();
export const ttsDiagnostics = {
  getSnapshot: () => snapshot,
  subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
};
// In-memory diagnostics only. No persistence or telemetry.
export function recordTTS(update: Partial<TTSDiagnostics>) {
  snapshot = { ...snapshot, ...update };
  listeners.forEach(listener => listener());
}
export function ttsError(error: unknown) { return error instanceof Error ? error.message : String(error); }
