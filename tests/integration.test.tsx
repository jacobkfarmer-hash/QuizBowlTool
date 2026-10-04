import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { api } from '../src/api/client';
import { DEFAULT_CONFIG, GROUPS } from '../src/core/config';
import type { Config } from '../src/core/types';
import { clearAll, db, readSetting, saveSetting, markSeen, saveGame } from '../src/data/db';
import { QuestionPools } from '../src/data/pools';
import { gameReducer, newGame } from '../src/core/game';
import { Game } from '../src/ui/Game';
import { bonus, tossup } from './fixtures';
vi.mock('../src/api/client', () => ({ api: { tossups: vi.fn(), bonuses: vi.fn(), check: vi.fn() } }));
const configuration = (bonuses = false): Config => ({ ...structuredClone(DEFAULT_CONFIG), count: 1, presentation: 'text', wpm: 450, bonuses, categories: Object.fromEntries(GROUPS.map(g => [g, g === 'Science & Math' ? 1 : 0])) as Config['categories'] });
beforeEach(async () => { await clearAll(); vi.mocked(api.tossups).mockReset().mockResolvedValue([structuredClone(tossup)]); vi.mocked(api.bonuses).mockReset().mockResolvedValue([structuredClone(bonus)]); vi.mocked(api.check).mockReset().mockResolvedValue({ directive: 'accept' }); });
async function startAndBuzz(bonuses = false) { const complete = vi.fn(); render(<Game config={configuration(bonuses)} onComplete={complete} onExit={() => {}}/>); const button = await screen.findByRole('button', { name: /Buzz/ }); await waitFor(() => expect(button).toBeEnabled()); fireEvent.click(button); return complete; }
async function answer(text: string) { fireEvent.change(screen.getByLabelText('Your answer'), { target: { value: text } }); fireEvent.click(screen.getByRole('button', { name: 'Submit' })); }
describe('React gameplay integration with mock QBReader', () => {
  it('loads an independent weighted draw, freezes text, converts and completes without bonuses', async () => {
    const complete = await startAndBuzz();
    expect(api.tossups).toHaveBeenCalledWith('Science', 3);
    const frozen = screen.getByTestId('question-text').textContent;
    expect(screen.queryByText('water [prompt on liquid]')).not.toBeInTheDocument();
    await new Promise(r => setTimeout(r, 100)); expect(screen.getByTestId('question-text').textContent).toBe(frozen);
    await answer('water'); await screen.findByRole('button', { name: /Finish session/ }); expect(screen.getByTestId('score')).toHaveTextContent('15');
    fireEvent.click(screen.getByRole('button', { name: /Finish session/ })); await waitFor(() => expect(complete).toHaveBeenCalled()); expect(api.bonuses).not.toHaveBeenCalled();
    const saved = complete.mock.calls[0][0]; expect(saved.attempts[0].draw).toEqual({ group: 'Science & Math', category: 'Science', difficulty: 3 });
  });
  it('handles directed prompt and clarification without revealing an answer', async () => {
    vi.mocked(api.check).mockResolvedValueOnce({ directive: 'prompt', directedPrompt: 'Which liquid?' }).mockResolvedValueOnce({ directive: 'accept' });
    await startAndBuzz(); await answer('liquid');
    await screen.findByText('Which liquid?'); expect(screen.queryByText('water [prompt on liquid]')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Clarify your answer'), { target: { value: 'water' } }); fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
    await waitFor(() => expect(screen.getByTestId('score')).toHaveTextContent('15')); expect(api.check).toHaveBeenLastCalledWith(tossup.answer, 'water');
  });
  it('rejects an interrupt, resumes from frozen position and prohibits the second buzz', async () => {
    vi.mocked(api.check).mockResolvedValue({ directive: 'reject' }); const complete = await startAndBuzz(); await answer('wrong');
    const resume = await screen.findByRole('button', { name: /Resume question/ }); expect(screen.getByTestId('score')).toHaveTextContent('-5'); fireEvent.click(resume);
    expect(screen.getByRole('button', { name: /Buzz/ })).toBeDisabled();
    const finish = await screen.findByRole('button', { name: /Finish session/ }, { timeout: 5000 }); fireEvent.click(finish); await waitFor(() => expect(complete).toHaveBeenCalled()); expect(complete.mock.calls[0][0].attempts[0].events[0].result).toBe('neg');
  });
  it('prefetches an unfiltered general bonus, answers every part, calculates PPB and continues', async () => {
    const complete = await startAndBuzz(true); await answer('water'); fireEvent.click(await screen.findByRole('button', { name: /Continue to bonus/ })); fireEvent.click(await screen.findByRole('button', { name: /Begin bonus/ }));
    expect(api.bonuses).toHaveBeenCalledWith(3);
    for (let i = 0; i < 3; i++) { await screen.findByLabelText('Your answer'); await answer(['water', 'oxygen', 'salt'][i]); fireEvent.click(await screen.findByRole('button', { name: i === 2 ? /Finish bonus/ : /Next part/ })); }
    fireEvent.click(await screen.findByRole('button', { name: /Finish session/ })); await waitFor(() => expect(complete).toHaveBeenCalled()); expect(complete.mock.calls[0][0].bonuses[0].parts.reduce((sum: number, p: { points: number }) => sum + p.points, 0)).toBe(30);
  });
});
describe('durable local data', () => {
  it('saves settings, presets, seen IDs, raw events and recovery across DB close/open', async () => {
    let s = newGame(configuration()); s = gameReducer(s, { type: 'LOAD', question: tossup, draw: { group: 'Science & Math', category: 'Science', difficulty: 3 }, generation: 1 });
    await saveSetting('config', configuration()); await db.presets.put({ id: 'my-preset', name: 'Mine', config: configuration() }); await markSeen(tossup._id, 'tossup'); await saveGame(s);
    db.close(); await db.open();
    expect(await readSetting('config')).toEqual(configuration()); expect((await readSetting<typeof s>('recovery'))?.question?._id).toBe(tossup._id); expect(await db.seen.get(tossup._id)).toBeDefined(); expect((await db.sessions.get(s.session.id))?.config.count).toBe(1); expect((await db.presets.get('my-preset'))?.name).toBe('Mine');
  });
  it('deduplicates unseen pool questions and marks seen only when heard', async () => {
    vi.mocked(api.tossups).mockResolvedValue([{ ...tossup, _id: 'one' }, { ...tossup, _id: 'two' }, { ...tossup, _id: 'one' }]); const pool = new QuestionPools(configuration()); const a = await pool.reserveDraw(); const b = await pool.reserveDraw(); expect(a.question._id).not.toBe(b.question._id); expect(await db.seen.count()).toBe(0); await pool.heard(a.question._id, 'tossup'); expect(await db.seen.count()).toBe(1);
  });
  it('bounds retries when no unseen combination remains and never fetches disabled bonuses', async () => {
    await markSeen(tossup._id, 'tossup'); const pool = new QuestionPools(configuration()); await expect(pool.reserveDraw()).rejects.toThrow('No unseen'); expect(api.tossups).toHaveBeenCalledTimes(3); pool.warmBonus(); await expect(pool.reserveBonus()).rejects.toThrow('disabled'); expect(api.bonuses).not.toHaveBeenCalled();
  });
  it('clears all locally stored tables', async () => { await markSeen('x', 'bonus'); await saveSetting('x', 1); await db.presets.put({ id: 'x', name: 'x', config: configuration() }); await clearAll(); expect(await db.seen.count()).toBe(0); expect(await db.presets.count()).toBe(0); expect(await db.settings.count()).toBe(0); });
  it('conditions on an available combination without overflowing huge relative weights', async () => { const c = configuration(); c.categories['Science & Math'] = 1e308; c.categories.History = 1e308; c.difficulties[3] = 1e308; vi.spyOn(Math, 'random').mockReturnValue(0); vi.mocked(api.tossups).mockImplementation(async category => category === 'Science' ? [] : [{ ...tossup, category: 'History', _id: 'available-history' }]); const result = await new QuestionPools(c).reserveDraw(); expect(result.draw.group).toBe('History'); expect(c.categories['Science & Math']).toBe(1e308); expect(api.tossups).toHaveBeenCalledTimes(4); });
});
