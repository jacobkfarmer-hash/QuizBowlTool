import { expect, test } from '@playwright/test';
import { tossup } from '../tests/fixtures';
test('production app installs its shell, hides diagnostics and retains local history/dictionary offline', async ({ page, context }) => {
  await page.route('https://www.qbreader.org/api/random-tossup?*', r => r.fulfill({ json: { tossups: [tossup] } }));
  await page.goto('/'); await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  await expect(page.getByRole('button', { name: 'Diagnostics', exact: true })).toHaveCount(0);
  const cached = await page.evaluate(async () => { const shell = (await caches.keys()).find(k => k.startsWith('cadence-shell-')); return (await (await caches.open(shell!)).keys()).map(r => new URL(r.url).pathname); });
  expect(cached).toContain('/index.html'); expect(cached.some(p => /onnx|kokoro.worker|runtime/.test(p))).toBe(false);
  await page.getByRole('spinbutton', { name: 'Custom tossup count' }).fill('1'); await page.getByLabel('Presentation', { exact: true }).selectOption('text'); await page.getByRole('button', { name: /Start session/ }).click(); await expect(page.getByRole('button', { name: /Buzz/ })).toBeEnabled(); await page.getByRole('button', { name: 'Give up', exact: true }).click(); await page.getByRole('button', { name: /Finish session/ }).click(); await expect(page.getByTestId('stat-line')).toHaveText('0 / 0 / 0');
  await page.getByRole('button', { name: 'Settings', exact: true }).click(); await page.getByRole('button', { name: 'Add correction' }).click(); await page.getByLabel('Word or full name', { exact: true }).fill('Diomedes'); await page.getByLabel('Spoken spelling', { exact: true }).fill('dye oh MEE deez'); await page.getByRole('button', { name: 'Save correction' }).click(); await expect(page.getByRole('button', { name: 'Edit Diomedes' })).toBeVisible();
  await context.setOffline(true); await page.reload(); await page.getByRole('button', { name: 'Settings', exact: true }).click(); await expect(page.getByRole('button', { name: 'Edit Diomedes' })).toBeVisible(); await page.getByRole('button', { name: 'History & stats' }).click(); await page.getByRole('button', { name: 'View results' }).click(); await expect(page.getByTestId('stat-line')).toHaveText('0 / 0 / 0');
});
