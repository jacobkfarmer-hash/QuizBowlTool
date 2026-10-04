import { afterEach, expect, it, vi } from 'vitest';
import { AudioUnlockError, SharedAudioContextManager, sharedAudio } from '../src/reader/audio-context';
import { KokoroEngine } from '../src/reader/kokoro';

class TestContext extends EventTarget {
  state: AudioContextState | 'interrupted' = 'suspended';
  sampleRate = 24000; currentTime = 0; destination = {};
  sources: Array<{ onended: (() => void) | null; start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }> = [];
  resume = vi.fn(async () => { this.state = 'running'; this.dispatchEvent(new Event('statechange')); });
  close = vi.fn(async () => { this.state = 'closed'; this.dispatchEvent(new Event('statechange')); });
  createBuffer = vi.fn((_channels: number, samples: number, rate: number) => ({ duration: samples / rate, copyToChannel: vi.fn() }));
  createBufferSource = vi.fn(() => {
    const node = { buffer: null, playbackRate: { value: 1 }, connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn(), onended: null as (() => void) | null };
    this.sources.push(node); return node;
  });
  asContext() { return this as unknown as AudioContext; }
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

it('creates and resumes in the gesture stack and reuses one context across questions', async () => {
  const context = new TestContext(); const create = vi.fn(() => context.asContext());
  const audio = new SharedAudioContextManager(create);
  const unlocked = audio.unlockFromGesture();
  expect(create).toHaveBeenCalledOnce(); expect(context.resume).toHaveBeenCalledOnce();
  expect(context.sources[0].start).toHaveBeenCalledOnce();
  await expect(unlocked).resolves.toBe(true);
  expect(await audio.runningContext()).toBe(context);
  expect(await audio.runningContext()).toBe(context);
  await audio.unlockFromGesture();
  expect(create).toHaveBeenCalledOnce(); expect(context.close).not.toHaveBeenCalled();
});

it.each(['suspended', 'interrupted'] as const)('requires a fresh gesture after the context becomes %s', async state => {
  const context = new TestContext(); const create = vi.fn(() => context.asContext());
  const audio = new SharedAudioContextManager(create); await audio.unlockFromGesture();
  context.state = state; context.dispatchEvent(new Event('statechange'));
  expect(audio.getSnapshot()).toEqual({ state, needsGesture: true });
  await expect(audio.runningContext()).rejects.toBeInstanceOf(AudioUnlockError);
  const unlocked = audio.unlockFromGesture();
  expect(context.resume).toHaveBeenCalledTimes(2);
  await expect(unlocked).resolves.toBe(true);
  expect(audio.getSnapshot()).toEqual({ state: 'running', needsGesture: false });
  expect(create).toHaveBeenCalledOnce();
});

it('recreates a closed context only from another gesture', async () => {
  const first = new TestContext(), second = new TestContext();
  const create = vi.fn().mockReturnValueOnce(first.asContext()).mockReturnValueOnce(second.asContext());
  const audio = new SharedAudioContextManager(create); await audio.unlockFromGesture();
  await first.close();
  await expect(audio.runningContext()).rejects.toBeInstanceOf(AudioUnlockError);
  expect(create).toHaveBeenCalledOnce();
  await audio.unlockFromGesture(); expect(await audio.runningContext()).toBe(second);
  expect(create).toHaveBeenCalledTimes(2);
});

it('reports a blocked or never-resolving resume without hanging', async () => {
  vi.useFakeTimers();
  const context = new TestContext(); context.resume.mockImplementation(() => new Promise(() => {}));
  const audio = new SharedAudioContextManager(() => context.asContext());
  const attempt = audio.unlockFromGesture();
  await vi.advanceTimersByTimeAsync(1500);
  await expect(attempt).resolves.toBe(false);
  expect(audio.getSnapshot().needsGesture).toBe(true);
});

it('notifies the UI when context creation is unavailable so the enable button is visible', async () => {
  const audio = new SharedAudioContextManager(() => { throw new Error('Unsupported'); });
  const listener = vi.fn(); audio.subscribe(listener);
  await expect(audio.unlockFromGesture()).resolves.toBe(false);
  expect(audio.getSnapshot()).toEqual({ state: 'unavailable', needsGesture: true });
  expect(listener).toHaveBeenCalled();
});

it('an older blocked resume cannot overwrite a successful newer gesture', async () => {
  vi.useFakeTimers();
  const context = new TestContext(); context.resume.mockImplementationOnce(() => new Promise(() => {}));
  const audio = new SharedAudioContextManager(() => context.asContext());
  const first = audio.unlockFromGesture();
  await expect(audio.unlockFromGesture()).resolves.toBe(true);
  await vi.advanceTimersByTimeAsync(1500); await expect(first).resolves.toBe(false);
  expect(audio.getSnapshot()).toEqual({ state: 'running', needsGesture: false });
});

it('Kokoro uses the shared context and never closes it on end, stop or disposal', async () => {
  const context = new TestContext();
  const audio = new SharedAudioContextManager(() => context.asContext()); await audio.unlockFromGesture();
  vi.spyOn(sharedAudio, 'runningContext').mockImplementation(() => audio.runningContext());
  const constructor = vi.fn(() => context.asContext()); vi.stubGlobal('AudioContext', constructor);
  class TestWorker {
    onmessage?: (event: { data: object }) => void;
    postMessage(request: { id: number; type: string }) {
      queueMicrotask(() => this.onmessage?.({ data: request.type === 'init'
        ? { id: request.id, ready: true, backend: 'wasm', dtype: 'q8' }
        : { id: request.id, samples: new Float32Array(24000), sampleRate: 24000 } }));
    }
    terminate() {}
  }
  vi.stubGlobal('Worker', TestWorker);
  const engine = new KokoroEngine(); await engine.initialize(() => {});
  const segments = [{ text: 'A clue.', start: 0, end: 2, weights: [1, 1] }];
  const options = { voice: 'af_heart', speed: 1, onStatus: vi.fn(), onProgress: vi.fn(), onAudioStart: vi.fn() };
  const first = await engine.speak(segments, options);
  context.sources.at(-1)!.onended?.();
  expect(first.current().ended).toBe(true);
  const second = await engine.speak(segments, options); second.stop(); engine.dispose();
  expect(options.onAudioStart).toHaveBeenCalledWith('kokoro');
  expect(sharedAudio.runningContext).toHaveBeenCalledTimes(2);
  expect(constructor).not.toHaveBeenCalled(); expect(context.close).not.toHaveBeenCalled();
});
