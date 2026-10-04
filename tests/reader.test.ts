import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ neuralInit: vi.fn(), neuralSpeak: vi.fn(), systemInit: vi.fn(), systemSpeak: vi.fn(), dispose: vi.fn(), disable: vi.fn() }));
vi.mock('../src/reader/kokoro', () => ({ KokoroEngine: class { initialize = mocks.neuralInit; speak = mocks.neuralSpeak; dispose = mocks.dispose; disable = mocks.disable; } }));
vi.mock('../src/reader/system', () => ({ primeSystemSpeech() {}, SystemEngine: class { initialize = mocks.systemInit; speak = mocks.systemSpeak; dispose = mocks.dispose; } }));
import { ReaderManager } from '../src/reader/manager';
import { DEFAULT_CONFIG } from '../src/core/config';
import { clearAll, savePronunciation } from '../src/data/db';
import { AudioUnlockError } from '../src/reader/audio-context';
beforeEach(() => { for (const mock of Object.values(mocks)) mock.mockReset(); vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance'] }); });
afterEach(() => vi.useRealTimers());
it('text reader pauses immediately and resumes at the same offset', async () => {
  const r = new ReaderManager(); const progress = vi.fn(); await r.read('A longer test clue continues into a second clause.', { ...DEFAULT_CONFIG, presentation: 'text' }, { onProgress: progress, onStatus() {} });
  vi.advanceTimersByTime(700); r.pause(); const before = r.current()!; vi.advanceTimersByTime(1000); expect(r.current()).toEqual(before); r.resume(); vi.advanceTimersByTime(700); expect(r.current()!.tokens).toBeGreaterThan(before.tokens); r.dispose(); const calls = progress.mock.calls.length; vi.advanceTimersByTime(1000); expect(progress).toHaveBeenCalledTimes(calls);
});
it('Auto falls back from a failed neural initialization to system voice', async () => {
  mocks.neuralInit.mockRejectedValue(new Error('GPU unavailable')); mocks.systemInit.mockResolvedValue(undefined); const h = { stop: vi.fn(), pause: vi.fn(), resume: vi.fn(), current: () => ({ tokens: 0, elapsedMs: 0, ended: false }) }; mocks.systemSpeak.mockResolvedValue(h);
  const r = new ReaderManager(); await r.read('Read this sentence.', DEFAULT_CONFIG, { onProgress() {}, onStatus() {} }); expect(mocks.systemSpeak).toHaveBeenCalledOnce(); expect(r.current()?.tokens).toBe(0); r.pause(); expect(h.pause).toHaveBeenCalledOnce(); r.dispose();
});
it('failed local engines still leave a functional text reader', async () => {
  mocks.neuralInit.mockRejectedValue(new Error('Unsupported')); mocks.systemInit.mockRejectedValue(new Error('No voice')); const r = new ReaderManager(); await r.read('A test question.', DEFAULT_CONFIG, { onProgress() {}, onStatus() {} }); vi.advanceTimersByTime(1200); expect(r.current()?.tokens).toBeGreaterThan(0); r.dispose();
});
it('a stale model initialization cannot start speaking after stop', async () => {
  let resolve!: () => void; mocks.neuralInit.mockImplementation(() => new Promise<void>(r => { resolve = r; })); const r = new ReaderManager(); const reading = r.read('Old question.', DEFAULT_CONFIG, { onProgress() {}, onStatus() {} }); await vi.waitFor(() => expect(resolve).toBeTypeOf('function')); r.stop(); resolve(); await reading; expect(mocks.neuralSpeak).not.toHaveBeenCalled(); expect(r.current()).toBeUndefined(); r.dispose();
});
it('saved corrections reach System Voice as well as neural speech without changing display text', async () => {
  await clearAll(); await savePronunciation({ canonical: 'Diomedes', spoken: 'dye oh MEE deez' }); mocks.systemSpeak.mockResolvedValue({ stop() {}, pause() {}, resume() {}, current() { return { tokens: 0, elapsedMs: 0, ended: false }; } });
  const r = new ReaderManager(); await r.read('The hero is Diomedes.', { ...DEFAULT_CONFIG, engine: 'system' }, { onProgress() {}, onStatus() {} }); expect(mocks.systemSpeak.mock.calls[0][0][0].text).toBe('The hero is dye oh mee deez.'); r.dispose();
});
it('preview speaks the proposed spelling directly without a second dictionary substitution', async () => {
  mocks.systemSpeak.mockResolvedValue({ stop() {}, pause() {}, resume() {}, current() { return { tokens: 0, elapsedMs: 0, ended: false }; } });
  const r = new ReaderManager(); await r.read('This clue refers to Goethe.', { ...DEFAULT_CONFIG, engine: 'system' }, { onProgress() {}, onStatus() {} }, 'preview'); expect(mocks.systemSpeak.mock.calls[0][0][0].text).toBe('This clue refers to Goethe.'); r.dispose();
});
it('Auto honors an explicitly selected system voice instead of substituting Heart', async () => {
  mocks.systemSpeak.mockResolvedValue({ stop() {}, pause() {}, resume() {}, current() { return { tokens: 0, elapsedMs: 0, ended: false }; } }); const r = new ReaderManager();
  await r.read('Read this clue.', { ...DEFAULT_CONFIG, voice: 'system:installed-local-voice' }, { onProgress() {}, onStatus() {} }); expect(mocks.neuralInit).not.toHaveBeenCalled(); expect(mocks.systemSpeak.mock.calls[0][1].voice).toBe('system:installed-local-voice'); r.dispose();
});

it('does not retry failed Kokoro on later questions, including explicitly selected Kokoro', async () => {
  mocks.neuralInit.mockRejectedValue(new Error('WASM unavailable'));
  mocks.systemSpeak.mockResolvedValue({ stop() {}, pause() {}, resume() {}, current: () => ({ tokens: 0, elapsedMs: 0, ended: false }) });
  const reader = new ReaderManager();
  await reader.read('First question.', { ...DEFAULT_CONFIG, engine: 'kokoro' }, { onProgress() {}, onStatus() {} });
  await reader.read('Second question.', { ...DEFAULT_CONFIG, engine: 'kokoro' }, { onProgress() {}, onStatus() {} });
  expect(mocks.neuralInit).toHaveBeenCalledOnce(); expect(mocks.disable).toHaveBeenCalledOnce();
  expect(mocks.systemSpeak).toHaveBeenCalledTimes(2); reader.dispose();
});

it('audio permission failure falls back without permanently disabling a healthy model', async () => {
  mocks.neuralSpeak.mockRejectedValue(new AudioUnlockError());
  mocks.systemSpeak.mockResolvedValue({ stop() {}, pause() {}, resume() {}, current: () => ({ tokens: 0, elapsedMs: 0, ended: false }) });
  const reader = new ReaderManager();
  await reader.read('First question.', DEFAULT_CONFIG, { onProgress() {}, onStatus() {} });
  await reader.read('Second question.', DEFAULT_CONFIG, { onProgress() {}, onStatus() {} });
  expect(mocks.disable).not.toHaveBeenCalled(); expect(mocks.neuralSpeak).toHaveBeenCalledTimes(2);
  reader.dispose();
});

it('asynchronous native speech failure becomes usable text without a fatal gameplay error', async () => {
  const status = vi.fn();
  mocks.systemSpeak.mockImplementation(async (_segments, options) => {
    queueMicrotask(() => options.onError(new Error('synthesis-failed')));
    return { stop() {}, pause() {}, resume() {}, current: () => ({ tokens: 0, elapsedMs: 0, ended: false }) };
  });
  const reader = new ReaderManager();
  const initial = await reader.read('A question remains playable.', { ...DEFAULT_CONFIG, engine: 'system' }, { onProgress() {}, onStatus: status });
  expect(initial).toBeDefined(); // Gameplay receives a ready handle before fallback.
  await Promise.resolve(); await Promise.resolve();
  vi.advanceTimersByTime(1600);
  expect(status).toHaveBeenCalledWith('Reading · text'); expect(reader.current()?.tokens).toBeGreaterThan(0);
  reader.dispose();
});
