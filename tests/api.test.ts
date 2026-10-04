import { afterEach, expect, it, vi } from 'vitest';
import { api, request } from '../src/api/client';
import { tossup, bonus } from './fixtures';
afterEach(() => vi.unstubAllGlobals());
it('sends documented filter parameters and preserves answerline formatting', async () => {
  const urls: URL[] = []; vi.stubGlobal('fetch', vi.fn(async (url: string) => { urls.push(new URL(url)); return new Response(JSON.stringify(url.includes('random-tossup') ? { tossups: [tossup] } : url.includes('random-bonus') ? { bonuses: [bonus] } : { directive: 'prompt', directedPrompt: 'What kind?' })); }));
  await api.tossups('Science', 3); await api.bonuses(2); const ruling = await api.check(tossup.answer, 'liquid');
  expect(urls[0].searchParams.get('difficulties')).toBe('3'); expect(urls[0].searchParams.get('standardOnly')).toBe('true'); expect(urls[0].searchParams.has('difficulty')).toBe(false); expect(urls[1].searchParams.has('categories')).toBe(false); expect(urls[1].searchParams.get('threePartBonuses')).toBe('true'); expect(urls[2].searchParams.get('answerline')).toBe(tossup.answer); expect(ruling.directive).toBe('prompt');
});
it('does not retry a permanent 400 error', async () => { const fetch = vi.fn(async () => new Response('', { status: 400 })); vi.stubGlobal('fetch', fetch); await expect(request('/random-tossup', {})).rejects.toThrow('400'); expect(fetch).toHaveBeenCalledTimes(1); });
it('retries a transient failure with a finite bound', async () => { const fetch = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(new Response(JSON.stringify({ directive: 'accept' }))); vi.stubGlobal('fetch', fetch); await expect(api.check('water', 'water')).resolves.toMatchObject({ directive: 'accept' }); expect(fetch).toHaveBeenCalledTimes(2); });
