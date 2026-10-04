import { KokoroEngine } from './kokoro';
import { SystemEngine } from './system';
import { clockPlayback, type PlaybackHandle, type TTSOptions } from './playback';
import { textTimeline, tokenize, tokenWeight } from './text';
import { pronunciationPipeline } from './pronunciation';
import { db } from '../data/db';
import type { Config } from '../core/types';
export class ReaderManager {
  constructor(private kokoro = new KokoroEngine(), private ownsModel = true) {}
  private system = new SystemEngine(); private generation = 0; private handle?: PlaybackHandle; private cancellation?: AbortController; private desiredPaused = false; private kokoroUnavailable = false;
  status = '';
  async read(html: string, c: Config, options: Omit<TTSOptions, 'voice' | 'speed'>, pronunciationMode: 'normal' | 'preview' = 'normal') {
    this.stop(); const generation = this.generation; this.cancellation = new AbortController(); let lastToken = options.startToken ?? 0; let usingSystem = c.engine === 'system' || c.voice.startsWith('system:');
    const t = tokenize(html); const onStatus = (s: string) => { if (generation === this.generation) { this.status = s; options.onStatus(s); } };
    const onProgress: TTSOptions['onProgress'] = p => { if (generation === this.generation) { lastToken = p.tokens; options.onProgress(p); } };
    const opts = { ...options, onStatus, onProgress, voice: c.voice, speed: c.speed, signal: this.cancellation.signal, onError: (error: Error) => { if (generation !== this.generation) return; onStatus(error.message); void this.read(html, { ...c, engine: 'system', presentation: usingSystem ? 'text' : c.presentation }, { ...options, startToken: lastToken }, pronunciationMode); } };
    const text = () => { onStatus('Reading · text'); const times = textTimeline(t, c.wpm); return clockPlayback(times, onProgress, options.startToken ? times[options.startToken - 1] : 0); };
    let handle: PlaybackHandle;
    if (c.presentation === 'text') handle = text();
    else {
      const corrections = await db.pronunciations.toArray().catch(() => []);
      if (generation !== this.generation) return;
      const segments = pronunciationMode === 'preview' ? [{ text: t.tokens.map(token => token.text).join(' '), start: 0, end: t.tokens.length, weights: t.tokens.map(token => tokenWeight(token.text)) }] : pronunciationPipeline(t, corrections).segments;
      try {
        if (usingSystem || (c.engine === 'auto' && this.kokoroUnavailable)) { usingSystem = true; await this.system.initialize(); if (generation !== this.generation) return; handle = await this.system.speak(segments, opts); }
        else {
          try { await this.kokoro.initialize(onStatus); if (generation !== this.generation) return; handle = await this.kokoro.speak(segments, opts); }
          catch { if (generation !== this.generation) return; this.kokoroUnavailable = true; this.kokoro.dispose(); usingSystem = true; onStatus('Local neural reader unavailable. Trying System Voice…'); await this.system.initialize(); if (generation !== this.generation) return; handle = await this.system.speak(segments, opts); }
        }
      } catch { if (generation !== this.generation) return; onStatus('Audio unavailable. Using progressive text; install a local system voice or retry Kokoro.'); handle = text(); }
    }
    if (generation !== this.generation) { handle.stop(); return; }
    this.handle = handle; if (this.desiredPaused) handle.pause(); return handle;
  }
  current() { return this.handle?.current(); }
  pause() { this.desiredPaused = true; this.handle?.pause(); }
  resume() { this.desiredPaused = false; this.handle?.resume(); }
  stop() { this.desiredPaused = false; this.generation++; this.cancellation?.abort(); this.handle?.stop(); this.handle = undefined; }
  useSystem() { this.stop(); this.kokoro.dispose(); }
  dispose() { this.stop(); if (this.ownsModel) this.kokoro.dispose(); this.system.dispose(); }
}
// Retain one local model across rounds and screen changes until the tab closes.
export const sharedKokoro = new KokoroEngine();
export const sharedReader = new ReaderManager(sharedKokoro);
if (import.meta.hot) import.meta.hot.dispose(() => sharedReader.dispose());
