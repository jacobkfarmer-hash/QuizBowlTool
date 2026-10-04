import { KokoroEngine } from './kokoro';
import { SystemEngine } from './system';
import { clockPlayback, type PlaybackHandle, type TTSOptions } from './playback';
import { textTimeline, tokenize, tokenWeight } from './text';
import { pronunciationPipeline } from './pronunciation';
import { db } from '../data/db';
import type { Config } from '../core/types';
import { AudioUnlockError } from './audio-context';
import { unlockReaderAudio } from './audio-gesture';
import { recordTTS, ttsError } from './tts-diagnostics';
export class ReaderManager {
  constructor(private kokoro = new KokoroEngine(), private ownsModel = true) {}
  private system = new SystemEngine(); private generation = 0; private handle?: PlaybackHandle; private cancellation?: AbortController; private desiredPaused = false; private kokoroUnavailable = false;
  status = '';
  private retry?: () => void;
  private audioRequested = false;
  private fallbackTimer?: ReturnType<typeof setTimeout>;
  async read(html: string, c: Config, options: Omit<TTSOptions, 'voice' | 'speed'>, pronunciationMode: 'normal' | 'preview' = 'normal', forceText = false) {
    this.stop(); const generation = this.generation; this.cancellation = new AbortController(); let lastToken = options.startToken ?? 0; let usingSystem = c.engine === 'system' || c.voice.startsWith('system:');
    this.audioRequested = c.presentation !== 'text';
    const t = tokenize(html); const onStatus = (s: string) => { if (generation === this.generation) { this.status = s; options.onStatus(s); } };
    const onProgress: TTSOptions['onProgress'] = p => { if (generation === this.generation) { lastToken = p.tokens; options.onProgress(p); } };
    const disableKokoro = (error: unknown) => {
      if (error instanceof AudioUnlockError) return;
      this.kokoroUnavailable = true; this.kokoro.disable(error);
    };
    const opts = { ...options, onStatus, onProgress, voice: c.voice, speed: c.speed, signal: this.cancellation.signal,
      onAudioStart: (engine: 'kokoro' | 'system') => { if (generation === this.generation) options.onAudioStart?.(engine); },
      onError: (error: Error) => {
        if (generation !== this.generation) return;
        recordTTS({ lastError: ttsError(error), fallbackReason: usingSystem ? 'System speech failed; using Text Only.' : 'Kokoro playback failed; trying System Voice.' });
        if (!usingSystem) disableKokoro(error);
        // Engines can report errors synchronously while speak() is returning.
        // Retire that handle before starting a fallback at the same token.
        clearTimeout(this.fallbackTimer);
        this.fallbackTimer = setTimeout(() => {
          if (generation !== this.generation) return;
          const paused = this.desiredPaused;
          void this.read(html, { ...c, engine: 'system' }, { ...options, startToken: lastToken }, pronunciationMode, usingSystem);
          if (paused) this.pause();
        }, 0);
      },
    };
    const text = () => {
      onStatus('Reading · text');
      if (this.audioRequested) this.retry = () => { void this.read(html, c, { ...options, startToken: this.current()?.tokens ?? lastToken }, pronunciationMode); };
      const times = textTimeline(t, c.wpm); return clockPlayback(times, onProgress, options.startToken ? times[options.startToken - 1] : 0);
    };
    let handle: PlaybackHandle;
    if (c.presentation === 'text' || forceText) handle = text();
    else {
      const corrections = await db.pronunciations.toArray().catch(() => []);
      if (generation !== this.generation) return;
      const segments = pronunciationMode === 'preview' ? [{ text: t.tokens.map(token => token.text).join(' '), start: 0, end: t.tokens.length, weights: t.tokens.map(token => tokenWeight(token.text)) }] : pronunciationPipeline(t, corrections).segments;
      try {
        if (usingSystem || this.kokoroUnavailable || this.kokoro.unavailableReason) { usingSystem = true; await this.system.initialize(); if (generation !== this.generation) return; handle = await this.system.speak(segments, opts); }
        else {
          try { await this.kokoro.initialize(onStatus); if (generation !== this.generation) return; handle = await this.kokoro.speak(segments, opts); }
          catch (error) { if (generation !== this.generation) return; disableKokoro(error); recordTTS({ lastError: ttsError(error), fallbackReason: 'Kokoro unavailable; trying System Voice.' }); usingSystem = true; onStatus('High-quality reader unavailable. Trying System Voice…'); await this.system.initialize(); if (generation !== this.generation) return; handle = await this.system.speak(segments, opts); }
        }
      } catch (error) { if (generation !== this.generation) return; recordTTS({ lastError: ttsError(error), fallbackReason: 'System speech unavailable; using Text Only.' }); handle = text(); }
    }
    if (generation !== this.generation) { handle.stop(); return; }
    this.handle = handle; if (this.desiredPaused) handle.pause(); return handle;
  }
  current() { return this.handle?.current(); }
  pause() { this.desiredPaused = true; this.handle?.pause(); }
  resume() { this.desiredPaused = false; if (this.audioRequested) void unlockReaderAudio().then(() => this.retryAudio()); this.handle?.resume(); }
  retryAudio() { if (this.desiredPaused || this.current()?.ended) return; this.retry?.(); }
  stop() { clearTimeout(this.fallbackTimer); this.retry = undefined; this.desiredPaused = false; this.generation++; this.cancellation?.abort(); this.handle?.stop(); this.handle = undefined; }
  useSystem() { this.stop(); this.kokoro.dispose(); }
  dispose() { this.stop(); if (this.ownsModel) this.kokoro.dispose(); this.system.dispose(); }
}
// Retain one local model across rounds and screen changes until the tab closes.
export const sharedKokoro = new KokoroEngine();
export const sharedReader = new ReaderManager(sharedKokoro);
if (import.meta.hot) import.meta.hot.dispose(() => sharedReader.dispose());
