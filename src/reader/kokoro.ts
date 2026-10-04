import type { PlaybackHandle, Progress, TTSEngine, TTSOptions, Voice } from './playback';
import { reached, timeline, type SpeechSegment } from './text';
import { AudioUnlockError, sharedAudio } from './audio-context';
import { recordTTS, ttsError } from './tts-diagnostics';
export interface WorkerResponse { backend?: string; dtype?: string; fallbackReason?: string; backendError?: string; phonemes?: string[]; texts?: string[]; id: number; ready?: boolean; voices?: Voice[]; samples?: Float32Array; sampleRate?: number; error?: string; status?: string }
export const KOKORO_VOICES: Voice[] = [{ id: 'af_heart', name: 'Heart · American' }, { id: 'af_bella', name: 'Bella · American' }, { id: 'am_michael', name: 'Michael · American' }, { id: 'am_puck', name: 'Puck · American' }, { id: 'bf_emma', name: 'Emma · British' }, { id: 'bm_george', name: 'George · British' }];
export class KokoroEngine implements TTSEngine {
  id = 'kokoro'; name = 'Kokoro · on-device';
  unavailableReason = '';
  disable(error: unknown) { this.unavailableReason = ttsError(error); this.dispose(); }
  private worker?: Worker; private ready?: Promise<void>; private serial = 0; private voices = KOKORO_VOICES;
  private pending = new Map<number, { resolve(r: WorkerResponse): void; reject(e: Error): void; timer: ReturnType<typeof setTimeout> }>(); private status: (s: string) => void = () => {};
  async isSupported() { return typeof Worker !== 'undefined' && typeof WebAssembly !== 'undefined'; }
  private rpc(type: 'init' | 'generate', text?: string, voice?: string, speed = 1): Promise<WorkerResponse> {
    return new Promise((resolve, reject) => { const id = ++this.serial; const timer = setTimeout(() => { this.pending.delete(id); reject(new Error('Local reader took too long. Using the system voice.')); }, 120000); this.pending.set(id, { resolve, reject, timer }); this.worker!.postMessage({ id, type, text, voice, speed }); });
  }
  initialize(onStatus: (s: string) => void) {
    if (this.unavailableReason) return Promise.reject(new Error(this.unavailableReason));
    this.status = onStatus;
    return this.ready ??= (async () => {
      this.worker = new Worker(new URL('./kokoro.worker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = (e: MessageEvent<WorkerResponse>) => { if (e.data.status) { this.status(e.data.status); return; } const p = this.pending.get(e.data.id); if (!p) return; clearTimeout(p.timer); this.pending.delete(e.data.id); if (e.data.error) p.reject(new Error(e.data.error)); else p.resolve(e.data); };
      this.worker.onerror = () => { for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(new Error('Local voice model could not initialize.')); } this.pending.clear(); };
      onStatus('First voice load downloads the model once; speech then runs locally. Preparing reader…'); const result = await this.rpc('init'); this.voices = result.voices ?? KOKORO_VOICES;
      recordTTS({ backend: `${result.backend ?? 'unknown'} ${result.dtype ?? ''}`.trim(), fallbackReason: result.fallbackReason ?? '', ...(result.backendError ? { lastError: result.backendError } : {}) });
    })();
  }
  async diagnose(text: string, voice: string) { await this.initialize(() => {}); return this.rpc('generate', text, voice); }
  async listVoices() { return this.voices; }
  async speak(segments: SpeechSegment[], options: TTSOptions): Promise<PlaybackHandle> {
    const ctx = await sharedAudio.runningContext();
    let index = segments.findIndex(s => s.end > (options.startToken ?? 0)); if (index < 0) index = segments.length;
    let source: AudioBufferSourceNode | undefined, buffer: AudioBuffer | undefined;
    let offset = 0, origin = 0, totalElapsed = 0, paused = false, stopped = false, loading = false;
    let currentTokens = options.startToken ?? 0; let ends: number[] = [];
    const cache = new Map<number, Promise<AudioBuffer>>();
    let raf = 0;
    const announce = () => { options.onStatus('Reading · Kokoro on-device'); options.onAudioStart?.('kokoro'); };
    const releaseSource = () => { if (source) { source.onended = null; try { source.stop(); } catch { /* Already ended. */ } source.disconnect(); source = undefined; } };
    const cleanup = () => { cancelAnimationFrame(raf); ctx.removeEventListener('statechange', stateChanged); releaseSource(); cache.clear(); };
    const synthesize = (i: number) => { if (!cache.has(i)) cache.set(i, (async () => { options.onStatus('Synthesizing next speech chunk…'); const r = await this.rpc('generate', segments[i].text, options.voice.startsWith('system:') ? 'af_heart' : options.voice, options.speed); const b = ctx.createBuffer(1, r.samples!.length, r.sampleRate!); b.copyToChannel(new Float32Array(r.samples!), 0); return b; })()); return cache.get(i)!; };
    const current = (): Progress => { const time = buffer ? Math.min(buffer.duration, offset + (source && !paused ? (ctx.currentTime - origin) : 0)) : 0; if (buffer && segments[index]) currentTokens = Math.max(currentTokens, segments[index].start + reached(ends, time * 1000)); return { tokens: currentTokens, elapsedMs: totalElapsed + time * 1000, ended: index >= segments.length }; };
    const play = () => {
      if (stopped || paused || !buffer || options.signal?.aborted) return;
      if (ctx.state === 'closed') throw new AudioUnlockError();
      const node = ctx.createBufferSource(); source = node;
      node.buffer = buffer; node.playbackRate.value = 1; node.connect(ctx.destination); origin = ctx.currentTime;
      node.onended = () => {
        if (paused || stopped || source !== node) return;
        node.disconnect(); currentTokens = segments[index].end; totalElapsed += buffer!.duration * 1000;
        source = undefined; cache.delete(index); index++; offset = 0; buffer = undefined;
        if (index >= segments.length) { options.onProgress(current()); cleanup(); } else void start().catch(fail);
      };
      node.start(0, offset);
      if (ctx.state === 'running') announce(); else { sharedAudio.requireGesture(); options.onStatus('Tap to enable audio'); }
    };
    const fail = (error: unknown) => {
      if (stopped) return;
      stopped = true; cleanup();
      options.onError?.(error instanceof AudioUnlockError ? error : new Error(`Local reader failed: ${ttsError(error)}. Trying the fallback reader.`));
    };
    const stateChanged = () => {
      if (stopped) return;
      if (ctx.state === 'closed') { sharedAudio.requireGesture(); fail(new AudioUnlockError()); }
      else if (ctx.state === 'running' && source && !paused) announce();
      else if (ctx.state !== 'running') options.onStatus('Tap to enable audio');
    };
    ctx.addEventListener('statechange', stateChanged);
    const start = async () => { if (index >= segments.length || stopped) return; loading = true; buffer = await synthesize(index); if (stopped || options.signal?.aborted) return; ends = timeline(segments[index].weights, buffer.duration * 1000); if (options.startToken && currentTokens > segments[index].start && !offset) offset = ends[currentTokens - segments[index].start - 1] / 1000; loading = false; for (let lookahead = 1; lookahead <= 2; lookahead++) if (index + lookahead < segments.length) void synthesize(index + lookahead).catch(() => {}); play(); };
    try { await start(); } catch (error) { cleanup(); throw error; }
    const tick = () => { if (stopped || index >= segments.length) return; if (!paused && !loading) options.onProgress(current()); raf = requestAnimationFrame(tick); }; raf = requestAnimationFrame(tick);
    return {
      current,
      pause() { const progress = current(); currentTokens = progress.tokens; if (source) { offset += ctx.currentTime - origin; releaseSource(); } paused = true; },
      resume() { if (stopped || !paused) return; paused = false; void sharedAudio.runningContext().then(() => { if (ctx.state === 'closed') throw new AudioUnlockError(); play(); }).catch(fail); },
      stop() { stopped = true; cleanup(); },
    };
  }
  dispose() { this.worker?.terminate(); for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(new Error('Reader canceled.')); } this.pending.clear(); this.worker = undefined; this.ready = undefined; }
}
