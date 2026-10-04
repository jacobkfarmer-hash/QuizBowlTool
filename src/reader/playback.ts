export interface Progress { tokens: number; elapsedMs: number; durationMs?: number; ended: boolean }
export interface PlaybackHandle { pause(): void; resume(): void; stop(): void; current(): Progress; seek?(ms: number): void }
export interface Voice { id: string; name: string }
export interface TTSOptions { voice: string; speed: number; onProgress(p: Progress): void; onStatus(message: string): void; startToken?: number; signal?: AbortSignal; onError?(error: Error): void }
import type { SpeechSegment } from './text';
export interface TTSEngine { id: string; name: string; initialize(onStatus: (s: string) => void): Promise<void>; speak(segments: SpeechSegment[], options: TTSOptions): Promise<PlaybackHandle>; listVoices(): Promise<Voice[]>; isSupported(): Promise<boolean>; dispose(): void }
import { reached } from './text';
export function clockPlayback(times: number[], onProgress: (p: Progress) => void, offset = 0): PlaybackHandle {
  let position = offset, origin = performance.now(), running = true, stopped = false;
  const durationMs = times.at(-1) ?? 0;
  const current = (): Progress => { if (running) position = Math.min(durationMs, position + performance.now() - origin); origin = performance.now(); return { tokens: reached(times, position), elapsedMs: position, durationMs, ended: position >= durationMs }; };
  const tick = () => { if (stopped) return; if (running) { const p = current(); onProgress(p); if (p.ended) { running = false; return; } } raf = requestAnimationFrame(tick); };
  let raf = requestAnimationFrame(tick);
  return { pause() { current(); running = false; }, resume() { if (!stopped) { running = true; origin = performance.now(); } }, stop() { stopped = true; running = false; cancelAnimationFrame(raf); }, current, seek(ms) { position = Math.max(0, Math.min(durationMs, ms)); origin = performance.now(); } };
}
