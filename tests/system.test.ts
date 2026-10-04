import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { loadSystemVoices, selectSystemVoice, SystemEngine } from '../src/reader/system';
import { ReaderManager } from '../src/reader/manager';
import { KokoroEngine } from '../src/reader/kokoro';
import { DEFAULT_CONFIG } from '../src/core/config';

const voice = (id: string, lang = 'en-US', localService = false, isDefault = false) => ({ voiceURI: id, name: id, lang, localService, default: isDefault }) as SpeechSynthesisVoice;
class TestUtterance {
  constructor(public text: string) {}
  voice: SpeechSynthesisVoice | null = null; rate = 1;
  onstart?: () => void;
}
class TestSynthesis extends EventTarget {
  voices: SpeechSynthesisVoice[] = [];
  getVoices = vi.fn(() => this.voices);
  cancel = vi.fn(); pause = vi.fn(); resume = vi.fn();
  speak = vi.fn((utterance: TestUtterance) => { queueMicrotask(() => utterance.onstart?.()); });
}
let synthesis: TestSynthesis;
beforeEach(() => {
  synthesis = new TestSynthesis();
  vi.stubGlobal('speechSynthesis', synthesis); vi.stubGlobal('SpeechSynthesisUtterance', TestUtterance);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });
const segments = [{ text: 'Quiz bowl reader ready.', start: 0, end: 4, weights: [1, 1, 1, 1] }];
const options = () => ({ voice: 'af_heart', speed: 1, onProgress: vi.fn(), onStatus: vi.fn(), onAudioStart: vi.fn(), onError: vi.fn() });

it('waits for voiceschanged when getVoices initially returns empty', async () => {
  const remove = vi.spyOn(synthesis, 'removeEventListener');
  const loading = loadSystemVoices();
  expect(synthesis.getVoices).toHaveBeenCalled();
  synthesis.voices = [voice('remote-en')]; synthesis.dispatchEvent(new Event('voiceschanged'));
  await expect(loading).resolves.toEqual(synthesis.voices);
  expect(remove).toHaveBeenCalledWith('voiceschanged', expect.any(Function));
});

it('retries getVoices at a bounded timeout and can load voices on a later call', async () => {
  vi.useFakeTimers(); const loading = loadSystemVoices();
  await vi.advanceTimersByTimeAsync(1000); await expect(loading).resolves.toEqual([]);
  expect(synthesis.getVoices.mock.calls.length).toBeGreaterThanOrEqual(3);
  synthesis.voices = [voice('later')]; await expect(loadSystemVoices()).resolves.toEqual(synthesis.voices);
});

it('accepts remote English speech and reports readiness after native onstart', async () => {
  const remote = voice('remote-en'); synthesis.voices = [remote];
  const engine = new SystemEngine(); await engine.initialize();
  const callbacks = options(); const handle = await engine.speak(segments, callbacks);
  expect(synthesis.speak.mock.calls[0][0].voice).toBe(remote);
  expect(callbacks.onAudioStart).toHaveBeenCalledWith('system');
  expect(await engine.listVoices()).toEqual([{ id: 'system:remote-en', name: 'remote-en' }]);
  handle.stop();
});

it('prefers a selected English voice, then local English, then any English', () => {
  const remote = voice('remote'), local = voice('local'), foreign = voice('default-fr', 'fr-FR', true, true);
  const localEnglish = { ...local, localService: true } as SpeechSynthesisVoice;
  expect(selectSystemVoice([foreign, remote, localEnglish], 'system:remote')).toBe(remote);
  expect(selectSystemVoice([foreign, remote, localEnglish], 'af_heart')).toBe(localEnglish);
  expect(selectSystemVoice([foreign, remote], 'system:default-fr')).toBe(remote);
});

it('falls back to the default voice, then any available voice', () => {
  const first = voice('de', 'de-DE'), fallback = voice('fr', 'fr-FR', false, true);
  expect(selectSystemVoice([first, fallback], '')).toBe(fallback);
  expect(selectSystemVoice([first], '')).toBe(first);
  expect(selectSystemVoice([], '')).toBeNull();
});

it('tries the browser default even if enumeration stays empty', async () => {
  vi.useFakeTimers();
  const callbacks = options(); const speaking = new SystemEngine().speak(segments, callbacks);
  await vi.advanceTimersByTimeAsync(1000); const handle = await speaking;
  expect(synthesis.speak.mock.calls[0][0].voice).toBeNull();
  expect(callbacks.onAudioStart).toHaveBeenCalledWith('system'); handle.stop();
});

it('falls back from failed Kokoro to real SystemEngine without localService voices, across reader instances', async () => {
  synthesis.voices = [voice('remote-en')];
  const kokoro = new KokoroEngine(); const init = vi.spyOn(kokoro, 'initialize').mockRejectedValue(new Error('GPU and WASM unavailable'));
  const first = new ReaderManager(kokoro, false), second = new ReaderManager(kokoro, false);
  await first.read('Quiz bowl reader ready.', DEFAULT_CONFIG, options()); first.stop();
  await second.read('Another clue.', { ...DEFAULT_CONFIG, engine: 'kokoro' }, options());
  expect(init).toHaveBeenCalledOnce(); expect(kokoro.unavailableReason).toContain('WASM unavailable');
  expect(synthesis.speak).toHaveBeenCalledTimes(2);
  expect(synthesis.speak.mock.calls.every(([utterance]) => utterance.voice?.voiceURI === 'remote-en')).toBe(true);
  first.dispose(); second.dispose();
});

it('reports a native engine that never starts rather than silently waiting forever', async () => {
  vi.useFakeTimers(); synthesis.voices = [voice('remote-en')]; synthesis.speak.mockImplementation(() => {});
  const callbacks = options(); const handle = await new SystemEngine().speak(segments, callbacks);
  await vi.advanceTimersByTimeAsync(5000);
  expect(callbacks.onError).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('did not start') }));
  expect(callbacks.onAudioStart).not.toHaveBeenCalled(); handle.stop();
});
