import { beforeEach, describe, expect, it, vi } from 'vitest';
import Dexie from 'dexie';
import { api } from '../src/api/client';
import { clearAll, db, saveSetting } from '../src/data/db';
import { answerAliases, checkStudyAnswer, localAnswerMatch, normalizeAnswer, targetsAnswer } from '../src/study/answers';
import { clusterClues, conceptSimilarity, inferAnswerType, powerSections, rankClues, segmentClues } from '../src/study/clues';
import { createDraft, emptyCard, generateCard, generateDeck } from '../src/study/generation';
import { importTerms } from '../src/study/import';
import { randomCards, recordAppearance, selectSets, splitSets, studySummary } from '../src/study/practice';
import { extractSources, searchSources } from '../src/study/sources';
import * as sourceService from '../src/study/sources';
import { groupedStudyMetrics, studyMetrics } from '../src/study/statistics';
import { advanceStudy, deckCards, deleteDeck, editCard, newStudySession, submitAttempt } from '../src/study/storage';
import type { SourceItem } from '../src/study/types';
import { tossup, bonus } from './fixtures';
const term = { answer: 'A Streetcar Named Desire' };
const source = (i: number): SourceItem => ({ id: `tossup:${i}`, questionId: String(i), kind: 'tossup', text: 'Stanley throws a radio through a window. A Chinese paper lantern covers a bulb. A silver cigarette case is engraved. (*) Allan Grey committed suicide. Blanche DuBois visits her sister. Tennessee Williams wrote this play.', answerline: term.answer, category: 'Literature', subcategory: 'American Literature', difficulty: 3, setName: 'Test set', packetName: 'Packet 1' });
const card = (i = 1) => generateCard(term, Array.from({ length: 11 }, (_, j) => source(j)), { ...emptyCard(term, 'deck'), id: String(i) });
beforeEach(clearAll);
describe('study answer and import normalization', () => {
  it('ignores leading articles, punctuation, case, accents and whitespace', () => {
    expect(normalizeAnswer('  THE House-on Mángo Street!  ')).toBe('house on mango street');
    expect(normalizeAnswer('An   American Tragedy')).toBe('american tragedy');
    expect(localAnswerMatch('streetcar named desire', term.answer)).toBe(true);
    expect(localAnswerMatch('STREETCAR NAMED DESIRE!!!', term.answer)).toBe(true);
    expect(localAnswerMatch('Streetcar', term.answer)).toBe(false);
  });
  it('accepts aliases and intact shortened subtitles without broad fragments', async () => {
    expect(localAnswerMatch('US', 'United States', ['U.S.'])).toBe(true);
    expect(localAnswerMatch('On the Origin of Species', 'On the Origin of Species: By Means of Natural Selection')).toBe(true);
    expect(localAnswerMatch('Streetcar', term.answer)).toBe(false);
    const check = vi.spyOn(api, 'check'); await expect(checkStudyAnswer('streetcar named desire', term.answer, [])).resolves.toEqual({ correct: true }); expect(check).not.toHaveBeenCalled();
  });
  it('uses QBReader for uncertain shortened answers and does not advance on a prompt', async () => {
    vi.spyOn(api, 'check').mockResolvedValue({ directive: 'prompt', directedPrompt: 'Which Williams?' });
    expect(await checkStudyAnswer('Williams', 'Tennessee Williams', [])).toEqual({ correct: false, prompt: 'Which Williams?' });
  });
  it('keeps practice usable offline through local answers', async () => {
    vi.spyOn(api, 'check').mockRejectedValue(new Error('offline'));
    expect((await checkStudyAnswer('wrong', term.answer, [])).warning).toMatch(/unavailable/);
    expect((await checkStudyAnswer(term.answer, term.answer, [])).correct).toBe(true);
  });
  it('keeps an author and a work separate and filters irrelevant answerline mentions', () => {
    expect(targetsAnswer('Tennessee Williams [accept Thomas Lanier Williams]', term.answer)).toBe(false);
    expect(answerAliases('United States [accept USA; prompt on America]')).toEqual(['United States', 'USA']);
    expect(targetsAnswer('A Streetcar Named Desire [accept Streetcar]', term.answer)).toBe(true);
    expect(answerAliases('Mercury [do not accept Venus or Mars; prompt on planet]')).toEqual(['Mercury']);
  });
  it('imports TXT and quoted CSV with deduplication and hints', () => {
    expect(importTerms('\nA Streetcar Named Desire\nTennessee Williams\nstreetcar named desire\n')).toHaveLength(2);
    expect(importTerms('answer\n"A ""Quoted"" Title"', 'csv')[0].answer).toBe('A "Quoted" Title');
    expect(importTerms('answer,category,type\n"The Lion, the Witch and the Wardrobe",Literature,Novel\n"The Lion, the Witch and the Wardrobe",Literature,Novel', 'csv')).toEqual([{ answer: 'The Lion, the Witch and the Wardrobe', category: 'Literature', type: 'Novel' }]);
    expect(() => importTerms('answer\n"unclosed', 'csv')).toThrow(/unclosed/);
  });
});
describe('evidence-based clue generation', () => {
  it('uses power markers, explicit structural words, or the end of initial bold power text', () => {
    expect(powerSections('Hard clue (*) Easy clue')).toEqual({ hard: 'Hard clue ', common: ' Easy clue' });
    expect(powerSections('One two three four', 2)).toEqual({ hard: 'One two', common: 'three four' });
    expect(powerSections('<b>This is a continuous initial power clue with many words.</b> Giveaway.').hard).toContain('power clue');
    expect(powerSections('<b>Hard clue</b>, <strong>another clue</strong> Easy clue.')).toEqual({ hard: 'Hard clue, another clue', common: 'Easy clue.' });
    expect(powerSections('A sentence with <b>Blanche DuBois</b> later.').hard).toBe('');
    expect(powerSections('No power marker exists in this tossup.').hard).toBe('');
  });
  it('segments sentences and semicolons while preserving initials and hard/common pools', () => {
    const segments = segmentClues(source(1));
    expect(segments).toHaveLength(6); expect(segments.filter(s => s.pool === 'hard')).toHaveLength(3);
    expect(segments[5].text).toContain('Tennessee Williams');
    expect(segmentClues({ ...source(1), text: 'J. R. R. Tolkien wrote this novel. Another clue follows.' })).toHaveLength(2);
  });
  it('merges paraphrased concepts rather than exact strings and counts distinct sources', () => {
    expect(conceptSimilarity('throws a radio out the window', 'a radio is hurled through a window')).toBeGreaterThan(.7);
    const clues = clusterClues([{ text: 'Stanley throws a radio out the window.', pool: 'hard', sourceId: '1' }, { text: 'A radio is hurled through a window.', pool: 'hard', sourceId: '2' }, { text: 'A radio is hurled through a window.', pool: 'hard', sourceId: '2' }], term.answer);
    expect(clues).toHaveLength(1); expect(clues[0].frequency).toBe(2); expect(clues[0].powerFrequency).toBe(2);
  });
  it('ranks recurrence above an obscure singleton and puts power concepts first', () => {
    const concepts = clusterClues(Array.from({ length: 11 }, (_, i) => segmentClues(source(i))).flat(), term.answer);
    concepts.push({ text: 'One obscure event', sourceIds: ['rare'], frequency: 1, powerFrequency: 1, score: 9, pool: 'hard' });
    const selected = rankClues(concepts);
    expect(selected).toHaveLength(6); expect(selected[0].pool).toBe('hard');
    expect(selected.at(-1)?.pool).toBe('common'); expect(selected.some(c => c.text === 'One obscure event')).toBe(false);
    expect(selected.map(c => c.text).join(';')).toContain('Blanche DuBois');
  });
  it('creates exactly one compact card per target and enforces more than ten usable sources', () => {
    const generated = card(); expect(generated.generationStatus).toBe('ready'); expect(generated.answer).toBe(term.answer);
    expect(generated.clueText).toMatch(/^Play:/); expect(generated.clueText).not.toContain(term.answer);
    expect(generated.hardClues).toHaveLength(3); expect(generated.commonClues).toHaveLength(3);
    expect(generateCard(term, Array.from({ length: 10 }, (_, i) => source(i)), emptyCard(term, 'deck')).generationStatus).toBe('insufficient');
    expect(generateCard(term, [], emptyCard(term, 'deck')).generationStatus).toBe('no-matches');
  });
  it('uses evidence over type/category hints and never converts a work to its author', () => {
    expect(inferAnswerType({ ...term, type: 'Author' }, [source(1)])).toBe('Play');
    const generated = generateCard({ ...term, category: 'History', type: 'Author' }, [source(1)], emptyCard(term, 'deck'));
    expect(generated.category).toBe('Literature'); expect(generated.answer).toBe(term.answer);
  });
  it('extracts direct tossups and only relevant bonus parts, with traceable IDs', () => {
    const direct = { ...tossup, answer: term.answer, question: source(1).text };
    const data = { tossups: { questionArray: [direct, { ...direct, _id: 'author', answer: 'Tennessee Williams' }] }, bonuses: { questionArray: [{ ...bonus, parts: ['Name this play.', 'Name a character in A Streetcar Named Desire.', 'Name a country.'], answers: [term.answer, 'Blanche DuBois', 'France'] }] } };
    expect(extractSources(data, term.answer)).toHaveLength(2);
    const related = extractSources(data, term.answer, true); expect(related).toHaveLength(1); expect(related[0].part).toBe(1); expect(related[0].text).toContain('Blanche DuBois');
  });
  it('does not treat supplemental related bonuses as sufficient direct answer evidence', () => {
    const generated = generateCard(term, Array.from({ length: 20 }, (_, i) => ({ ...source(i), kind: 'bonus' as const, related: true })), emptyCard(term, 'deck'));
    expect(generated.sourceCount).toBe(0); expect(generated.generationStatus).toBe('insufficient');
  });
});
describe('sets, selection and attempt summaries', () => {
  it('splits into numbered sets and combines valid inclusive ranges', () => {
    const values = Array.from({ length: 43 }, (_, i) => i);
    expect(splitSets(values, 20).map(s => s.length)).toEqual([20, 20, 3]);
    expect(selectSets(values, 20, 1, 2)).toHaveLength(40); expect(selectSets(values, 20, 3)).toEqual([40, 41, 42]);
    expect(selectSets(values, 20, 0, 3)).toEqual([]); expect(selectSets(values, 20, 3, 1)).toEqual([]); expect(() => splitSets(values, 0)).toThrow();
  });
  it('randomly selects unique targets and respects category/deck/type filters', () => {
    const a = card(1), b = { ...card(2), answer: 'France', normalizedAnswer: 'france', category: 'Geography', answerType: 'Country' };
    const pool = [a, { ...a, id: 'duplicate', deckId: 'other' }, b];
    expect(randomCards(pool, 100)).toHaveLength(2);
    expect(randomCards(pool, 20, { category: 'Literature', deckId: 'other', answerType: 'Play' }, () => 0).map(c => c.id)).toEqual(['duplicate']);
  });
  it('wrong answers retain the appearance and completed cards reject extra counts', () => {
    let a = { cardId: '1', attempts: 0, correct: false };
    a = recordAppearance(a, false); expect(a).toMatchObject({ attempts: 1, correct: false });
    a = recordAppearance(a, true); expect(a).toMatchObject({ attempts: 2, correct: true });
    expect(recordAppearance(a, false)).toBe(a);
  });
  it('calculates first/second/third+ recall, total attempts and trouble cards', () => {
    const appearances = [1, 1, 2, 4].map((attempts, i) => ({ cardId: String(i), attempts, correct: true }));
    expect(studySummary(appearances)).toEqual({ cards: 4, first: 2, second: 1, third: 1, attempts: 8, firstAccuracy: 50, submissionAccuracy: 50, troubleIds: ['2', '3'] });
    expect(studySummary([]).firstAccuracy).toBe(0);
  });
});
describe('durable study data', () => {
  it('upgrades a real version-two database without losing existing settings, history, presets or pronunciations', async () => {
    await db.delete();
    const legacy = new Dexie('cadence-quizbowl');
    legacy.version(2).stores({ sessions: 'id,createdAt,completedAt,config.mode', seen: 'id,kind,at', settings: 'key', presets: 'id,name', pronunciations: 'id,canonical,updatedAt' });
    await legacy.open();
    await legacy.table('settings').put({ key: 'theme', value: 'dark' });
    await legacy.table('sessions').put({ id: 'legacy-session', createdAt: '2026-10-01T00:00:00Z', config: { mode: 'practice' } });
    await legacy.table('presets').put({ id: 'legacy-preset', name: 'Saved preset' });
    await legacy.table('pronunciations').put({ id: 'legacy-pronunciation', canonical: 'Diomedes', spoken: 'my sound' });
    legacy.close(); await db.open();
    expect(db.verno).toBe(3); expect((await db.settings.get('theme'))?.value).toBe('dark');
    expect(await db.sessions.count()).toBe(1); expect(await db.presets.count()).toBe(1); expect(await db.pronunciations.count()).toBe(1);
    expect(await db.flashcards.count()).toBe(0); expect(await db.studySessions.count()).toBe(0);
  });
  it('creates draft records atomically and preserves existing settings and history tables', async () => {
    await saveSetting('theme', 'dark');
    const deck = await createDraft('Literature', [term, { answer: 'Tennessee Williams' }], [2, 3, 4], 20);
    expect(deck.status).toBe('draft'); expect(await deckCards(deck)).toHaveLength(2);
    db.close(); await db.open(); expect((await db.settings.get('theme'))?.value).toBe('dark'); expect(await db.decks.get(deck.id)).toEqual(deck);
  });
  it('persists 0/1 then 1/2 on the same card, repeats fresh, and retains history through edits/deletion', async () => {
    const c = card(); await db.flashcards.put(c); const spec = { label: 'Set 1', deckId: 'deck', cards: [c] };
    let session = newStudySession(spec); session = await submitAttempt(session, c, 'wrong', false);
    expect(session.position).toBe(0); expect(session.appearances[0].attempts).toBe(1); expect(await advanceStudy(session)).toEqual(session);
    session = await submitAttempt(session, c, term.answer, true); expect(session.appearances[0]).toMatchObject({ correct: true, attempts: 2 });
    session = await advanceStudy(session); expect(session.completedAt).toBeTruthy();
    expect(newStudySession(spec).appearances[0].attempts).toBe(0);
    await editCard({ ...c, answerType: 'Drama', clueText: 'Play: Manually edited supported clue.' });
    expect((await db.flashcards.get(c.id))?.clueText).toMatch(/^Drama:/);
    expect(await db.cardAttempts.count()).toBe(2); await deleteDeck('deck'); expect(await db.flashcards.count()).toBe(0); expect(await db.cardAttempts.count()).toBe(2);
    expect(studyMetrics(await db.cardAttempts.toArray())).toMatchObject({ appearances: 1, second: 1, attempts: 2, lifetimeAccuracy: 50 });
    expect(groupedStudyMetrics(await db.cardAttempts.toArray(), 'category')[0].key).toBe('Literature');
  });
  it('rolls back attempts when the session checkpoint write fails', async () => {
    const c = card(), session = newStudySession({ label: 'Test', cards: [c] });
    vi.spyOn(db.studySessions, 'put').mockRejectedValueOnce(new Error('quota'));
    await expect(submitAttempt(session, c, term.answer, true)).rejects.toThrow('quota'); expect(await db.cardAttempts.count()).toBe(0);
  });
  it('uses cached sources for regeneration and leaves cancelled draft terms untouched', async () => {
    await db.studySources.put({ key: 'streetcar named desire|2,3,4|v1', fetchedAt: new Date().toISOString(), items: [source(1)] });
    const fetchMock = vi.spyOn(globalThis, 'fetch'); expect(await searchSources(term.answer, [4, 2, 3])).toEqual([source(1)]); expect(fetchMock).not.toHaveBeenCalled();
    const deck = await createDraft('Cancelled', [term], [2, 3, 4], 20), abort = new AbortController(); abort.abort();
    await generateDeck(deck, await deckCards(deck), abort.signal, () => {});
    expect((await deckCards(deck))[0].generationStatus).toBe('pending');
  });
  it('saves successful terms despite another term failing and retries without replacing card IDs', async () => {
    const deck = await createDraft('Partial', [term, { answer: 'Tennessee Williams' }], [2, 3, 4], 20);
    const initial = await deckCards(deck), progress = vi.fn();
    const search = vi.spyOn(sourceService, 'searchSources').mockImplementation(async target => {
      if (target === 'Tennessee Williams') throw new Error('QBReader rate limited this request.');
      return Array.from({ length: 11 }, (_, i) => source(i));
    });
    await generateDeck(deck, initial, new AbortController().signal, progress);
    const partial = await deckCards(deck);
    expect(partial[0].generationStatus).toBe('ready'); expect(partial[1].generationStatus).toBe('error');
    expect(progress.mock.calls.at(-1)?.[0]).toMatchObject({ completed: 2, total: 2, failed: 1 });
    search.mockResolvedValue(Array.from({ length: 11 }, (_, i) => ({ ...source(i), answerline: 'Tennessee Williams' })));
    await generateDeck(deck, [partial[1]], new AbortController().signal, () => {});
    expect((await deckCards(deck))[1].id).toBe(initial[1].id);
    search.mockRejectedValue(new Error('offline'));
    await generateDeck(deck, [partial[0]], new AbortController().signal, () => {}, true);
    const retained = (await deckCards(deck))[0]; expect(retained.clueText).toBe(partial[0].clueText); expect(retained.generationStatus).toBe('ready'); expect(retained.error).toBe('offline');
  });
});
