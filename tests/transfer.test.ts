import { beforeEach, expect, it, vi } from 'vitest';
import { clearAll, db, saveGame, savePronunciation, saveSetting } from '../src/data/db';
import { exportData, importData, parseBackup } from '../src/data/transfer';
import { DEFAULT_CONFIG } from '../src/core/config';
import { gameReducer, newGame } from '../src/core/game';
import { tossup } from './fixtures';
beforeEach(clearAll);
async function fixture() {
  let s = newGame(structuredClone(DEFAULT_CONFIG)); s = gameReducer(s, { type: 'LOAD', question: tossup, draw: { group: 'Science & Math', category: 'Science', difficulty: 3 }, generation: 1 }); s = gameReducer(s, { type: 'GIVE_UP' });
  await saveGame(s); await db.presets.put({ id: 'test', name: 'Mine', config: DEFAULT_CONFIG }); await savePronunciation({ canonical: 'Diomedes', spoken: 'my spelling' }); await saveSetting('config', DEFAULT_CONFIG); await saveSetting('theme', 'dark'); return s;
}
it('round-trips raw history, presets, corrections and preferences without copying recovery', async () => {
  const original = await fixture(); const json = await exportData(); expect(json).not.toContain('recovery'); const backup = parseBackup(json); expect(backup.sessions[0].attempts[0].question.question).toBe(tossup.question); await clearAll(); await importData(json); db.close(); await db.open(); expect(await db.sessions.get(original.session.id)).toEqual(original.session); expect((await db.pronunciations.toArray())[0].spoken).toBe('my spelling'); expect(await db.presets.count()).toBe(1); expect((await db.settings.get('theme'))?.value).toBe('dark');
});
it('merges idempotently and overwrites only matching dictionary/preferences', async () => { await fixture(); const json = await exportData(); await importData(json); await importData(json); expect(await db.sessions.count()).toBe(1); expect(await db.presets.count()).toBe(1); await savePronunciation({ canonical: 'Diomedes', spoken: 'replacement' }); await importData(json); expect((await db.pronunciations.toArray())[0].spoken).toBe('my spelling'); });
it('rejects invalid nested records and unsupported versions before any writes', async () => {
  await fixture(); const json = await exportData(); const original = JSON.parse(json);
  for (const mutate of [(x: typeof original) => { x.version = 2; }, (x: typeof original) => { x.sessions[0].attempts[0].events = [{ points: 1e100 }]; }, (x: typeof original) => { x.presets[0].config.categories.History = -1; }, (x: typeof original) => { x.pronunciations[0].spoken = '<script>x</script>'; }, (x: typeof original) => { x.sessions[0].attempts[0].sessionId = 'wrong'; }, (x: typeof original) => { x.sessions.push(x.sessions[0]); }]) { const x = structuredClone(original); mutate(x); await expect(importData(JSON.stringify(x))).rejects.toThrow(); expect(await db.sessions.count()).toBe(1); }
  expect(() => parseBackup('{"__proto__": {"polluted":true}}')).toThrow();
});
it('edits the key of a saved correction and deletes it from the durable dictionary', async () => { const entry = await savePronunciation({ canonical: 'Old name', spoken: 'test' }); await savePronunciation({ canonical: 'New name', spoken: 'new sound', caseSensitive: true }, entry.id); expect(await db.pronunciations.get(entry.id)).toBeUndefined(); expect(await db.pronunciations.count()).toBe(1); await clearAll(); expect(await db.pronunciations.count()).toBe(0); });
it('rolls back all tables if a storage write fails after validation', async () => { await fixture(); const json = await exportData(); await clearAll(); vi.spyOn(db.pronunciations, 'bulkPut').mockRejectedValueOnce(new Error('Storage quota reached')); await expect(importData(json)).rejects.toThrow('Storage quota'); expect(await db.sessions.count()).toBe(0); expect(await db.presets.count()).toBe(0); expect(await db.settings.count()).toBe(0); });
