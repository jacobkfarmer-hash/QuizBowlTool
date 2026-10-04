import { expect, test, type Page } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { tossup } from '../tests/fixtures';

async function completeSessionAndSaveCorrection(page: Page) {
  await page.route('https://www.qbreader.org/api/random-tossup?*', route => {
    const url = new URL(route.request().url());
    return route.fulfill({ json: { tossups: [{ ...tossup, category: url.searchParams.get('categories'), difficulty: Number(url.searchParams.get('difficulties')) }] } });
  });
  await page.getByRole('spinbutton', { name: 'Custom tossup count' }).fill('1');
  await page.getByLabel('Presentation', { exact: true }).selectOption('text');
  await page.getByRole('button', { name: /Start session/ }).click();
  await expect(page.getByRole('button', { name: /Buzz/ })).toBeEnabled();
  await page.getByRole('button', { name: 'Give up', exact: true }).click();
  await page.getByRole('button', { name: /Finish session/ }).click();
  await expect(page.getByTestId('stat-line')).toHaveText('0 / 0 / 0');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Add correction' }).click();
  await page.getByLabel('Word or full name', { exact: true }).fill('Diomedes');
  await page.getByLabel('Spoken spelling', { exact: true }).fill('dye oh MEE deez');
  await page.getByRole('button', { name: 'Save correction' }).click();
  await expect(page.getByRole('button', { name: 'Edit Diomedes' })).toBeVisible();
}

async function expectSavedData(page: Page) {
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Edit Diomedes' })).toBeVisible();
  await page.getByRole('button', { name: 'History & stats' }).click();
  await page.getByRole('button', { name: 'View results' }).click();
  await expect(page.getByTestId('stat-line')).toHaveText('0 / 0 / 0');
}

test('production has no worker, refreshes repeatedly and retains IndexedDB history/settings', async ({ page }) => {
  const workerRequests: string[] = [];
  page.on('request', request => { if (new URL(request.url()).pathname === '/sw.js') workerRequests.push(request.url()); });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Diagnostics', exact: true })).toHaveCount(0);
  await completeSessionAndSaveCorrection(page);
  for (let i = 0; i < 3; i++) {
    await page.reload();
    await expectSavedData(page);
    expect(await page.evaluate(async () => ({ count: (await navigator.serviceWorker.getRegistrations()).length, controlled: Boolean(navigator.serviceWorker.controller) }))).toEqual({ count: 0, controlled: false });
  }
  expect(workerRequests).toEqual([]);
});

test('legacy controlled page unregisters and reloads once, preserving model caches and IndexedDB', async ({ page }) => {
  // Test-only origin serves an old worker fixture. No worker is written to dist.
  // Its shell contains the new release, allowing startup migration to execute.
  const fixtureWorker = `
    self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
    self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
    self.addEventListener('fetch', event => {
      if (event.request.mode === 'navigate') event.respondWith(
        caches.open('cadence-shell-old').then(cache => cache.match('/index.html')).then(cached => cached || fetch(event.request))
      );
    });
  `;
  const types: Record<string, string> = { js: 'text/javascript', css: 'text/css', html: 'text/html', json: 'application/json', svg: 'image/svg+xml', png: 'image/png', wasm: 'application/wasm', webmanifest: 'application/manifest+json' };
  const server = createServer(async (request, response) => {
    const pathname = new URL(request.url!, 'http://127.0.0.1').pathname;
    if (pathname === '/sw.js') {
      response.writeHead(200, { 'Content-Type': 'text/javascript', 'Cache-Control': 'no-store' });
      response.end(fixtureWorker);
      return;
    }
    try {
      const name = pathname === '/' ? 'index.html' : pathname.slice(1);
      const body = await readFile(fileURLToPath(new URL(`../dist/${name}`, import.meta.url)));
      response.writeHead(200, { 'Content-Type': types[name.split('.').pop()!] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
      response.end(body);
    } catch { response.writeHead(404); response.end(); }
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as { port: number };
  try {
    await page.goto(`http://127.0.0.1:${address.port}`);
    await completeSessionAndSaveCorrection(page);
    await page.evaluate(async () => {
      const shell = await caches.open('cadence-shell-old');
      await shell.put('/index.html', await fetch('/'));
      for (const name of ['cadence-runtime-old', 'transformers-cache', 'kokoro-voices', 'unrelated-app']) {
        await (await caches.open(name)).put('/preserved-resource', new Response('preserved'));
      }
      await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
    });
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
    let navigations = 0;
    page.on('framenavigated', frame => { if (frame === page.mainFrame()) navigations++; });
    await page.reload();
    await expect(page.getByRole('button', { name: /Start session/ })).toBeVisible();
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(false);
    expect(navigations).toBe(2);
    expect(await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length)).toBe(0);
    const remaining = await page.evaluate(async () => {
      const names = await caches.keys();
      return Promise.all(names.map(async name => [name, await (await (await caches.open(name)).match('/preserved-resource'))?.text()]));
    });
    expect(remaining.sort()).toEqual([['kokoro-voices', 'preserved'], ['transformers-cache', 'preserved'], ['unrelated-app', 'preserved']]);
    await expectSavedData(page);
    await page.reload();
    await expectSavedData(page);
    expect(navigations).toBe(3);
  } finally {
    await page.goto('about:blank');
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
