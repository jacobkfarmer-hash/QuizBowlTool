import { expect, test, type Page } from '@playwright/test';
import { tossup } from '../tests/fixtures';

test.use({ viewport: { width: 390, height: 844 }, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1' });
type AudioEvidence = { contexts: number; resumes: boolean[]; creationGestures: boolean[]; generated: string[]; spoken: string[]; closes: number; voiceCounts: number[]; modelInitializations: number };
async function mobileAudio(page: Page, mode: 'kokoro' | 'system' | 'blocked' | 'failed-model' | 'no-audio') {
  await page.addInitScript(mode => {
    const evidence: AudioEvidence = { contexts: 0, resumes: [], creationGestures: [], generated: [], spoken: [], closes: 0, voiceCounts: [], modelInitializations: 0 };
    Object.assign(window, { audioEvidence: evidence });
    class Context extends EventTarget {
      state = 'suspended'; sampleRate = 24000; destination = {}; currentTime = 0;
      constructor() { super(); evidence.contexts++; evidence.creationGestures.push(navigator.userActivation.isActive); }
      resume() {
        evidence.resumes.push(navigator.userActivation.isActive);
        if (mode === 'blocked' && evidence.resumes.length === 1) return Promise.reject(new Error('Gesture blocked'));
        this.state = 'running'; this.dispatchEvent(new Event('statechange')); return Promise.resolve();
      }
      close() { evidence.closes++; this.state = 'closed'; return Promise.resolve(); }
      createBuffer(_channels: number, samples: number, rate: number) { return { duration: samples / rate, copyToChannel() {} }; }
      createBufferSource() { return { buffer: null, playbackRate: { value: 1 }, onended: null, connect() {}, disconnect() {}, start() {}, stop() {} }; }
    }
    class Speech extends EventTarget {
      voices: object[] = []; speaking = false; pending = false;
      getVoices() { evidence.voiceCounts.push(this.voices.length); return this.voices; }
      cancel() {} pause() {} resume() {}
      speak(utterance: { text: string; volume: number; onstart?: () => void }) {
        if (utterance.volume !== 0) evidence.spoken.push(utterance.text);
        queueMicrotask(() => utterance.onstart?.());
      }
    }
    class Utterance { constructor(public text: string) {} volume = 1; voice = null; }
    const speech = new Speech();
    setTimeout(() => { speech.voices = [{ voiceURI: 'remote-en', name: 'Browser English', lang: 'en-US', localService: false, default: true }]; speech.dispatchEvent(new Event('voiceschanged')); }, 200);
    class ModelWorker {
      onmessage?: (event: { data: object }) => void;
      postMessage(request: { id: number; type: string; text?: string }) {
        if (request.type === 'init') {
          evidence.modelInitializations++;
          if (mode === 'failed-model' || mode === 'no-audio') {
            queueMicrotask(() => this.onmessage?.({ data: { id: request.id, error: 'GPU and WASM unavailable' } }));
            return;
          }
        }
        if (request.type === 'generate') evidence.generated.push(request.text!);
        queueMicrotask(() => this.onmessage?.({ data: request.type === 'init'
          ? { id: request.id, ready: true, backend: 'wasm', dtype: 'q8' }
          : { id: request.id, samples: new Float32Array(24000), sampleRate: 24000 } }));
      }
      terminate() {}
    }
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: speech });
    Object.assign(window, { AudioContext: Context, SpeechSynthesisUtterance: mode === 'blocked' || mode === 'no-audio' ? undefined : Utterance, Worker: ModelWorker });
  }, mode);
}
const evidence = (page: Page) => page.evaluate(() => (window as unknown as { audioEvidence: AudioEvidence }).audioEvidence);
async function mockQuestions(page: Page) {
  let serial = 0;
  await page.route('**/api/random-tossup?*', route => {
    const url = new URL(route.request().url());
    return route.fulfill({ json: { tossups: [{ ...tossup, _id: `mobile-${++serial}`, category: url.searchParams.get('categories'), difficulty: Number(url.searchParams.get('difficulties')) }] } });
  });
}

test('mobile Settings voice test unlocks synchronously and reuses the context', async ({ page }) => {
  await mobileAudio(page, 'kokoro'); await page.goto('/');
  await page.getByLabel('Reader engine', { exact: true }).selectOption('kokoro');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Test voice', exact: true }).click();
  await expect(page.getByText('High-quality voice ready', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Test voice', exact: true }).click();
  await expect.poll(async () => (await evidence(page)).generated.length).toBe(2);
  const result = await evidence(page);
  expect(result.generated).toEqual(['Quiz bowl reader ready.', 'Quiz bowl reader ready.']);
  expect(result.contexts).toBe(1); expect(result.creationGestures).toEqual([true]);
  expect(result.resumes).toEqual([true]); expect(result.closes).toBe(0);
});

test('mobile voice test accepts delayed non-local English speech', async ({ page }) => {
  await mobileAudio(page, 'system'); await page.goto('/');
  await page.getByLabel('Reader engine', { exact: true }).selectOption('system');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Test voice', exact: true }).click();
  await expect(page.getByText('System voice ready', { exact: true })).toBeVisible();
  const result = await evidence(page);
  expect(result.spoken).toContain('Quiz bowl reader ready.');
  expect(result.voiceCounts).toContain(0); expect(result.voiceCounts).toContain(1);
});

test('blocked mobile audio displays an enable button and recovers without losing the question', async ({ page }) => {
  await mobileAudio(page, 'blocked');
  await mockQuestions(page);
  await page.goto('/');
  await page.getByRole('spinbutton', { name: 'Custom tossup count' }).fill('1');
  await page.getByLabel('Reader engine', { exact: true }).selectOption('kokoro');
  await page.getByRole('button', { name: /Start session/ }).click();
  await expect(page.locator('.reader-status')).toContainText('Reading · text');
  await expect(page.getByRole('button', { name: 'Tap to enable audio', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Tap to enable audio', exact: true }).click();
  await expect(page.locator('.reader-status')).toContainText('Reading · Kokoro');
  await expect(page.getByRole('button', { name: 'Tap to enable audio', exact: true })).toHaveCount(0);
  const result = await evidence(page);
  expect(result.contexts).toBe(1); expect(result.resumes).toEqual([true, true]); expect(result.closes).toBe(0);
  await page.getByRole('button', { name: 'Give up', exact: true }).click();
  await page.getByRole('button', { name: /Finish session/ }).click();
  await expect(page.getByTestId('stat-line')).toHaveText('0 / 0 / 0');
});

test('mobile model failure uses non-local System Voice and is not retried in a new session', async ({ page }) => {
  await mobileAudio(page, 'failed-model');
  await mockQuestions(page);
  await page.goto('/');
  await page.getByLabel('Reader engine', { exact: true }).selectOption('kokoro');
  await page.getByRole('spinbutton', { name: 'Custom tossup count' }).fill('1');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Test voice', exact: true }).click();
  await expect(page.getByText('System voice ready', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Stop voice test' }).click();
  await page.getByRole('button', { name: 'Practice room', exact: true }).click();
  await page.getByRole('button', { name: /Start session/ }).click();
  await expect(page.locator('.reader-status')).toContainText('Reading · system voice');
  expect((await evidence(page)).modelInitializations).toBe(1);
  await page.getByRole('button', { name: 'Give up', exact: true }).click();
  await page.getByRole('button', { name: /Finish session/ }).click();
  await expect(page.getByTestId('stat-line')).toHaveText('0 / 0 / 0');
});

test('mobile voice test reports failure when both engines are unavailable and gameplay still completes', async ({ page }) => {
  await mobileAudio(page, 'no-audio');
  await mockQuestions(page);
  await page.goto('/');
  await page.getByRole('spinbutton', { name: 'Custom tossup count' }).fill('1');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Test voice', exact: true }).click();
  await expect(page.getByText('Audio could not start', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Practice room', exact: true }).click();
  await page.getByRole('button', { name: /Start session/ }).click();
  await expect(page.locator('.reader-status')).toContainText('Reading · text');
  await page.getByRole('button', { name: 'Give up', exact: true }).click();
  await page.getByRole('button', { name: /Finish session/ }).click();
  await expect(page.getByTestId('stat-line')).toHaveText('0 / 0 / 0');
});
