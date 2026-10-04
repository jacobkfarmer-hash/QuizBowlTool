import { expect, test } from '@playwright/test';
test('personal dictionary persists, edits, exports, validates imports and deletes on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto('/'); await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Add correction' }).click(); await page.getByLabel('Word or full name', { exact: true }).fill('Diomedes'); await page.getByLabel('Spoken spelling', { exact: true }).fill('dye oh MEE deez'); await page.getByRole('button', { name: 'Save correction' }).click();
  await expect(page.getByRole('button', { name: 'Edit Diomedes' })).toBeVisible(); await page.reload(); await page.getByRole('button', { name: 'Settings', exact: true }).click(); await page.getByRole('button', { name: 'Edit Diomedes' }).click(); await page.getByLabel('Spoken spelling', { exact: true }).fill('dye oh mee deez'); await page.getByRole('button', { name: 'Save correction' }).click();
  const download = page.waitForEvent('download'); await page.getByRole('button', { name: 'Export Data' }).click(); const file = await (await download).path(); if (!file) throw new Error('No export was downloaded.');
  await page.getByRole('button', { name: 'Delete Diomedes' }).click(); await expect(page.getByRole('button', { name: 'Edit Diomedes' })).toHaveCount(0);
  await page.getByLabel('Import Data').setInputFiles(file); await expect(page.getByRole('button', { name: 'Edit Diomedes' })).toBeVisible(); await expect(page.getByText(/Imported 0 sessions/)).toBeVisible();
  await page.getByLabel('Import Data').setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from('{"format":"cadence-data","version":999}') }); await expect(page.getByText(/Unsupported backup/)).toBeVisible(); await expect(page.getByRole('button', { name: 'Edit Diomedes' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); await page.getByRole('button', { name: 'About', exact: true }).click(); await expect(page.getByRole('heading', { name: 'How Cadence works' })).toBeVisible();
});
test('dictionary preview honors the voice selected in setup without starting a session', async ({ page }) => {
  await page.addInitScript(() => {
    const recorded: { text?: string; voice?: string }[] = []; Object.assign(window, { recordedSpeech: recorded });
    class TestWorker {
      onmessage?: (event: { data: object }) => void;
      postMessage(request: { id: number; type: string; text?: string; voice?: string }) { if (request.type === 'generate') recorded.push(request); queueMicrotask(() => this.onmessage?.({ data: request.type === 'init' ? { id: request.id, ready: true } : { id: request.id, samples: new Float32Array(24000), sampleRate: 24000 } })); }
      terminate() {}
    }
    Object.assign(window, { Worker: TestWorker });
  });
  await page.goto('/'); await page.getByLabel('Reader engine', { exact: true }).selectOption('kokoro'); await page.getByLabel('Voice', { exact: true }).selectOption('am_michael');
  await page.getByRole('button', { name: 'Settings', exact: true }).click(); await page.getByRole('button', { name: 'Add correction' }).click(); await page.getByLabel('Spoken spelling', { exact: true }).fill('dye oh MEE deez'); await page.getByRole('button', { name: 'Preview selected voice' }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { recordedSpeech: { voice: string; text: string }[] }).recordedSpeech)).toEqual([{ id: 2, type: 'generate', voice: 'am_michael', text: 'This clue refers to dye oh mee deez.', speed: 1 }]);
  await page.getByRole('button', { name: 'Close pronunciation editor' }).click(); await page.getByRole('button', { name: 'Practice room', exact: true }).click(); await expect(page.getByLabel('Voice', { exact: true })).toHaveValue('am_michael');
});
