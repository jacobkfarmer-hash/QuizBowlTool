import type { TTSEngine, PlaybackHandle, TTSOptions, Voice, Progress } from './playback';
import { reached, timeline, type SpeechSegment } from './text';
export class SystemEngine implements TTSEngine {
  id = 'system'; name = 'System Voice';
  async isSupported() { return 'speechSynthesis' in window; }
  async initialize() { if (!(await this.isSupported())) throw new Error('System speech is unavailable. Text reading remains available.'); }
  async listVoices(): Promise<Voice[]> { if (!(await this.isSupported())) return []; return speechSynthesis.getVoices().filter(v => v.localService && v.lang.startsWith('en')).map(v => ({ id: `system:${v.voiceURI}`, name: v.name })); }
  async speak(segments: SpeechSegment[], options: TTSOptions): Promise<PlaybackHandle> {
    speechSynthesis.cancel();
    let index = segments.findIndex(s => s.end > (options.startToken ?? 0)); if (index < 0) index = segments.length;
    let stopped = false, paused = false, speaking = false, origin = performance.now(), position = 0, elapsed = 0, tokens = options.startToken ?? 0;
    let times: number[] = []; let utterance: SpeechSynthesisUtterance;
    const current = (): Progress => { const ms = speaking && !paused ? position + performance.now() - origin : position; const seg = segments[index]; if (seg) tokens = Math.max(tokens, seg.start + Math.min(seg.weights.length - 1, reached(times, ms))); return { tokens, elapsedMs: elapsed + ms, ended: index >= segments.length }; };
    const play = () => {
      if (stopped || options.signal?.aborted || index >= segments.length) return;
      const seg = segments[index]; let text = seg.text;
      // On refresh only: native speech cannot seek; restart the current short clause.
      if (tokens > seg.start) { const ratio = (tokens - seg.start) / (seg.end - seg.start); text = text.split(/\s+/).slice(Math.floor(text.split(/\s+/).length * ratio)).join(' '); }
      utterance = new SpeechSynthesisUtterance(text); utterance.rate = options.speed;
      utterance.voice = speechSynthesis.getVoices().find(v => v.localService && v.voiceURI === options.voice.replace('system:', '')) ?? speechSynthesis.getVoices().find(v => v.localService && v.lang.startsWith('en')) ?? null;
      // Refuse remote browser voices so fallback remains local and free.
      if (!utterance.voice) throw new Error('No local English system voice installed. Use Kokoro or Text Only.');
      times = timeline(seg.weights, seg.weights.length * 60000 / (180 * options.speed)); position = 0;
      utterance.onstart = () => { origin = performance.now(); speaking = true; options.onStatus('Reading · local system voice'); };
      utterance.onboundary = e => { if (stopped || paused) return; if (e.name === 'word') { const ratio = e.charIndex / Math.max(1, text.length); tokens = Math.max(tokens, seg.start + Math.floor(ratio * seg.weights.length)); options.onProgress(current()); } };
      utterance.onend = () => { if (stopped) return; tokens = seg.end; elapsed += Math.max(position, performance.now() - origin); index++; speaking = false; position = 0; options.onProgress(current()); if (index < segments.length) play(); };
      utterance.onerror = e => { if (!stopped && e.error !== 'canceled' && e.error !== 'interrupted') options.onError?.(new Error(`System voice error: ${e.error}. Using progressive text.`)); };
      speechSynthesis.speak(utterance);
    };
    play();
    const tick = () => { if (stopped || index >= segments.length) return; if (!paused && speaking) options.onProgress(current()); raf = requestAnimationFrame(tick); }; let raf = requestAnimationFrame(tick);
    return { current, pause() { position += speaking ? performance.now() - origin : 0; paused = true; speechSynthesis.pause(); }, resume() { if (!stopped && paused) { origin = performance.now(); paused = false; speechSynthesis.resume(); } }, stop() { stopped = true; cancelAnimationFrame(raf); speechSynthesis.cancel(); } };
  }
  dispose() { if ('speechSynthesis' in window) speechSynthesis.cancel(); }
}
