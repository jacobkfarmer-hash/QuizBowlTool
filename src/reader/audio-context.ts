import { recordTTS, ttsError } from './tts-diagnostics';

export class AudioUnlockError extends Error {
  constructor() { super('Tap to enable audio'); this.name = 'AudioUnlockError'; }
}
type AudioState = AudioContextState | 'interrupted' | 'uninitialized' | 'unavailable';
type AudioSnapshot = { state: AudioState; needsGesture: boolean };

function createBrowserContext(): AudioContext {
  const Constructor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Constructor) throw new Error('Web Audio is unavailable.');
  return new Constructor();
}

export class SharedAudioContextManager {
  private context?: AudioContext;
  private pending?: Promise<boolean>;
  private requested = false;
  private blocked = false;
  private unavailable = false;
  private snapshot: AudioSnapshot = { state: 'uninitialized', needsGesture: false };
  private listeners = new Set<() => void>();
  constructor(private createContext: () => AudioContext = createBrowserContext) {}
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private publish = () => {
    const state = (this.context?.state ?? (this.unavailable ? 'unavailable' : 'uninitialized')) as AudioState;
    const needsGesture = this.requested && (state !== 'running' || this.blocked);
    if (state === this.snapshot.state && needsGesture === this.snapshot.needsGesture) return;
    this.snapshot = { state, needsGesture };
    this.listeners.forEach(listener => listener());
  };
  requireGesture(error: unknown = new AudioUnlockError()) {
    this.requested = true; this.blocked = true;
    recordTTS({ lastError: ttsError(error) }); this.publish();
  }
  // Call synchronously in a click/key handler: creation, silent-buffer start and
  // resume happen before any await. Playback never creates its own context.
  unlockFromGesture(): Promise<boolean> {
    this.requested = true;
    this.pending = undefined; // A newer tap supersedes an older blocked resume.
    try {
      if (!this.context || this.context.state === 'closed') {
        this.context?.removeEventListener('statechange', this.publish);
        this.context = this.createContext();
        this.unavailable = false;
        this.context.addEventListener('statechange', this.publish);
        const silent = this.context.createBufferSource();
        silent.buffer = this.context.createBuffer(1, 1, this.context.sampleRate);
        silent.connect(this.context.destination);
        silent.onended = () => silent.disconnect();
        silent.start();
      }
      const context = this.context;
      // Do not reuse an older pending resume: this fresh gesture may be needed
      // by Safari to release an interrupted or suspended context.
      const resume = context.state === 'running' ? Promise.resolve() : context.resume();
      this.publish();
      let timer: ReturnType<typeof setTimeout>;
      const timeout = new Promise<void>((_, reject) => { timer = setTimeout(() => reject(new AudioUnlockError()), 1500); });
      const attempt = Promise.race([resume, timeout]).then(() => {
        const running = context.state === 'running';
        if (this.pending !== attempt) return running;
        this.blocked = !running;
        if (!running) recordTTS({ lastError: 'Tap to enable audio' });
        this.publish(); return running;
      }).catch(error => { if (this.pending === attempt) this.requireGesture(error); return false; }).finally(() => {
        clearTimeout(timer);
        if (this.pending === attempt) this.pending = undefined;
      });
      this.pending = attempt;
      return attempt;
    } catch (error) {
      this.unavailable = true;
      this.requireGesture(error);
      return Promise.resolve(false);
    }
  }
  async runningContext(): Promise<AudioContext> {
    if (this.pending) await this.pending;
    if (!this.context || this.context.state !== 'running') { this.requireGesture(); throw new AudioUnlockError(); }
    return this.context;
  }
}

export const sharedAudio = new SharedAudioContextManager();
