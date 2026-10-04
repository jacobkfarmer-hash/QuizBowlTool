import type { TTSEngine, PlaybackHandle, TTSOptions, Voice, Progress } from './playback';
import { reached, timeline, type SpeechSegment } from './text';
import { sharedAudio } from './audio-context';

export const isEnglishVoice = (voice: SpeechSynthesisVoice) => /^en(?:[-_]|$)/i.test(voice.lang);
export function selectSystemVoice(voices: SpeechSynthesisVoice[], selected: string) {
  return voices.find(voice => voice.voiceURI === selected.replace('system:', '') && isEnglishVoice(voice))
    ?? voices.find(voice => isEnglishVoice(voice) && voice.localService)
    ?? voices.find(isEnglishVoice)
    ?? voices.find(voice => voice.default)
    ?? voices[0]
    ?? null; // Some mobile browsers can speak with their default before listing voices.
}

export function loadSystemVoices(synthesis: SpeechSynthesis = window.speechSynthesis, timeoutMs = 1000): Promise<SpeechSynthesisVoice[]> {
  const voices = synthesis.getVoices();
  if (voices.length) return Promise.resolve(voices);
  return new Promise(resolve => {
    const finish = (available: SpeechSynthesisVoice[]) => {
      clearTimeout(timer); synthesis.removeEventListener('voiceschanged', changed); resolve(available);
    };
    const changed = () => { const available = synthesis.getVoices(); if (available.length) finish(available); };
    synthesis.addEventListener('voiceschanged', changed);
    const timer = setTimeout(() => finish(synthesis.getVoices()), timeoutMs);
    changed(); // Close the race between the first query and listener attachment.
  });
}

export function primeSystemSpeech() {
  if (!('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') return;
  try {
    // A silent utterance in the click stack unlocks mobile speech without waiting
    // for voice enumeration or a model download. Never disturb an active reader.
    if (speechSynthesis.speaking || speechSynthesis.pending) return;
    speechSynthesis.resume();
    const utterance = new SpeechSynthesisUtterance('Audio'); utterance.volume = 0;
    utterance.voice = selectSystemVoice(speechSynthesis.getVoices(), '');
    speechSynthesis.speak(utterance);
  } catch { /* Actual playback reports failure and falls back separately. */ }
}

export class SystemEngine implements TTSEngine {
  id = 'system'; name = 'System Voice';
  async isSupported() { return 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined'; }
  async initialize() {
    if (!(await this.isSupported())) throw new Error('System speech is unavailable. Text reading remains available.');
    await loadSystemVoices();
  }
  async listVoices(): Promise<Voice[]> {
    if (!(await this.isSupported())) return [];
    const voices = await loadSystemVoices();
    return [...voices.filter(isEnglishVoice), ...voices.filter(voice => !isEnglishVoice(voice))]
      .map(voice => ({ id: `system:${voice.voiceURI}`, name: voice.name }));
  }
  async speak(segments: SpeechSegment[], options: TTSOptions): Promise<PlaybackHandle> {
    const voices = await loadSystemVoices();
    if (options.signal?.aborted) throw new Error('Reader canceled.');
    speechSynthesis.cancel();
    let index = segments.findIndex(segment => segment.end > (options.startToken ?? 0)); if (index < 0) index = segments.length;
    let stopped = false, paused = false, speaking = false, origin = performance.now(), position = 0, elapsed = 0, tokens = options.startToken ?? 0;
    let times: number[] = []; let utterance: SpeechSynthesisUtterance;
    let startTimer: ReturnType<typeof setTimeout> | undefined;
    let raf = 0;
    const current = (): Progress => {
      const ms = speaking && !paused ? position + performance.now() - origin : position;
      const segment = segments[index];
      if (segment) tokens = Math.max(tokens, segment.start + Math.min(segment.weights.length - 1, reached(times, ms)));
      return { tokens, elapsedMs: elapsed + ms, ended: index >= segments.length };
    };
    const fail = (error: Error) => {
      if (stopped || options.signal?.aborted) return;
      stopped = true; clearTimeout(startTimer); cancelAnimationFrame(raf); speechSynthesis.cancel();
      options.onError?.(error);
    };
    const watchStart = () => {
      clearTimeout(startTimer);
      startTimer = setTimeout(() => {
        sharedAudio.requireGesture();
        fail(new Error('System voice did not start. Tap to enable audio.'));
      }, 5000);
    };
    const play = () => {
      if (stopped || options.signal?.aborted || index >= segments.length) return;
      const segment = segments[index]; let text = segment.text;
      if (tokens > segment.start) {
        const ratio = (tokens - segment.start) / (segment.end - segment.start);
        text = text.split(/\s+/).slice(Math.floor(text.split(/\s+/).length * ratio)).join(' ');
      }
      utterance = new SpeechSynthesisUtterance(text); utterance.rate = options.speed;
      utterance.voice = selectSystemVoice(speechSynthesis.getVoices().length ? speechSynthesis.getVoices() : voices, options.voice);
      times = timeline(segment.weights, segment.weights.length * 60000 / (180 * options.speed)); position = 0;
      utterance.onstart = () => {
        if (stopped) return;
        clearTimeout(startTimer); origin = performance.now(); speaking = true;
        options.onStatus('Reading · system voice'); options.onAudioStart?.('system');
      };
      utterance.onboundary = event => {
        if (stopped || paused) return;
        if (event.name === 'word') {
          tokens = Math.max(tokens, segment.start + Math.floor(event.charIndex / Math.max(1, text.length) * segment.weights.length));
          options.onProgress(current());
        }
      };
      utterance.onend = () => {
        if (stopped) return;
        clearTimeout(startTimer); tokens = segment.end;
        elapsed += Math.max(position, performance.now() - origin); index++; speaking = false; position = 0;
        options.onProgress(current());
        if (index < segments.length) { try { play(); } catch (error) { fail(error instanceof Error ? error : new Error(String(error))); } }
      };
      utterance.onerror = event => {
        if (stopped || event.error === 'canceled' || event.error === 'interrupted') return;
        const error = new Error(`System voice error: ${event.error}. Using progressive text.`);
        if (event.error === 'not-allowed') sharedAudio.requireGesture(error);
        fail(error);
      };
      watchStart(); speechSynthesis.speak(utterance);
    };
    try { play(); } catch (error) { clearTimeout(startTimer); throw error; }
    const tick = () => {
      if (stopped || index >= segments.length) return;
      if (!paused && speaking) options.onProgress(current());
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return {
      current,
      pause() { position += speaking && !paused ? performance.now() - origin : 0; paused = true; clearTimeout(startTimer); speechSynthesis.pause(); },
      resume() { if (!stopped && paused) { origin = performance.now(); paused = false; if (!speaking) watchStart(); speechSynthesis.resume(); } },
      stop() { stopped = true; clearTimeout(startTimer); cancelAnimationFrame(raf); speechSynthesis.cancel(); },
    };
  }
  dispose() { if ('speechSynthesis' in window) speechSynthesis.cancel(); }
}
