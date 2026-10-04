import { describe, expect, it, vi } from 'vitest';
import { clusterClues, inferAnswerType, orderClues, rankClues, segmentClues } from '../src/study/clues';
import { connectWorkDetails, type ConceptCluster } from '../src/study/connections';
import { emptyCard, generateCard } from '../src/study/generation';
import { generateCluePhrase } from '../src/study/phrases';
import { powerBoundary, relativeCluePosition, sourceYear } from '../src/study/positions';
import { earlinessWeight, frequencyConfidence, occurrenceScore, recencyWeight, scoreConcept } from '../src/study/scoring';
import { extractSources, searchSources } from '../src/study/sources';
import { request } from '../src/api/client';
import { db } from '../src/data/db';
import type { ClueConcept, ClueOccurrence, SourceItem } from '../src/study/types';
import { tossup } from './fixtures';

vi.mock('../src/api/client', async importOriginal => ({ ...await importOriginal<object>(), request: vi.fn() }));
const YEAR = 2026, target = 'Gian Lorenzo Bernini';
function occurrence(i = 0, overrides: Partial<ClueOccurrence> = {}): ClueOccurrence {
  return { sourceId: `tossup:${i}`, questionId: String(i), kind: 'tossup', tournament: `Set ${i}`, year: YEAR,
    relativePosition: .1, sentencePosition: .1, inPower: true, anchor: 'Distinctive clue', context: 'Distinctive clue.', position: 10, sentenceId: `${i}:0`, ...overrides };
}
function source(i: number, text: string, overrides: Partial<SourceItem> = {}): SourceItem {
  return { id: `tossup:${i}`, questionId: String(i), kind: 'tossup', text, answerline: target, category: 'Fine Arts', subcategory: 'Sculpture', difficulty: 3,
    setName: `Test ${YEAR}`, setId: `set${i}`, packetName: 'Packet 1', year: YEAR, ...overrides };
}
function scored(name: string, count: number, position: number, year: number, inPower: boolean): ClueConcept {
  const occurrences = Array.from({ length: count }, (_, i) => occurrence(i, { anchor: name, context: `${name}.`, relativePosition: position, year, inPower }));
  const diagnostics = scoreConcept(occurrences, 1, 0, YEAR);
  return { text: name, anchor: name, occurrences, diagnostics, sourceIds: occurrences.map(o => o.sourceId), frequency: count,
    powerFrequency: inPower ? count : 0, pool: position <= .38 ? 'hard' : 'common', score: diagnostics.finalHardScore };
}

describe('relative clue position and publication metadata', () => {
  it('normalizes character position to each question, rather than fixed sentence number', () => {
    const short = segmentClues(source(1, 'Short intro. Silver Compass appears here. Brief ending.'));
    const long = segmentClues(source(2, `Short intro. Silver Compass appears here. ${'A detailed explanation follows. '.repeat(30)}`));
    expect(short[1].sentencePosition).not.toEqual(long[1].sentencePosition);
    expect(short[1].relativePosition).toBeGreaterThan(long[1].relativePosition! * 10);
    expect(short[1].relativePosition).toBeCloseTo(13 / 'Short intro. Silver Compass appears here. Brief ending.'.length);
    expect(relativeCluePosition(75, 100)).toBe(.75); expect(relativeCluePosition(150, 100)).toBe(1);
  });
  it('splits sentences after quotations and preserves initials and saint abbreviations', () => {
    const segments = segmentClues(source(1, 'J. R. R. Tolkien says “Good morning.” St. Teresa follows. A final clue.'));
    expect(segments).toHaveLength(3); expect(segments[0].text).toContain('Good morning'); expect(segments[1].text).toBe('St. Teresa follows.');
  });
  it('measures the candidate itself when a sentence crosses power', () => {
    const clues = clusterClues(segmentClues(source(1, '<i>Silver Compass</i> comes before (*) <i>Golden Lantern</i> in one sentence.')), target, YEAR);
    expect(clues.find(c => c.anchor === 'Silver Compass')?.powerFrequency).toBe(1);
    expect(clues.find(c => c.anchor === 'Golden Lantern')?.powerFrequency).toBe(0);
    expect(clues.find(c => c.anchor === 'Silver Compass')?.diagnostics?.averageRelativePosition).toBeLessThan(clues.find(c => c.anchor === 'Golden Lantern')?.diagnostics?.averageRelativePosition || 0);
  });
  it('uses word boundaries before marker/bold fallbacks and never treats record updates as publication', () => {
    expect(powerBoundary('<b>One two</b> three (*) four', 1).boundary).toBe(4);
    expect(powerBoundary('<b>One two</b> three').boundary).toBe(7);
    expect(sourceYear(source(1, 'A clue.', { year: undefined, setName: '2018 Invitational', updatedAt: '2026-01-01' }))).toBe(2018);
    expect(sourceYear(source(1, 'A clue.', { year: undefined, setName: 'Undated Invitational', updatedAt: '2026-01-01' }))).toBeUndefined();
    const extracted = extractSources({ tossups: { questionArray: [{ ...tossup, answer: target, set: { ...tossup.set, year: 2024, _id: 'real-set' } }] }, bonuses: { questionArray: [] } }, target);
    expect(extracted[0]).toMatchObject({ year: 2024, setId: 'real-set' });
  });
});

describe('modern early-buzz ranking', () => {
  it('five recent early power appearances outrank ten old late appearances', () => {
    const early = scored('Silver Compass', 5, .1, 2025, true), old = scored('Golden Lantern', 10, .85, 2015, false);
    expect(early.diagnostics!.finalHardScore).toBeGreaterThan(old.diagnostics!.finalHardScore * 4);
    const filler = [scored('Copper Harpoon', 4, .2, 2023, true), scored('Ivory Telescope', 4, .3, 2024, true), scored('Crystal Palace', 5, .7, 2024, false), scored('Marble Elephant', 5, .9, 2025, false)];
    expect(rankClues([old, ...filler, early])[0].anchor).toBe('Silver Compass');
  });
  it('decays smoothly without throwing away old or undated evidence', () => {
    expect(recencyWeight(2025, YEAR)).toBeCloseTo(.9, 2);
    expect(recencyWeight(2021, YEAR)).toBeCloseTo(.59, 2);
    expect(recencyWeight(2016, YEAR)).toBeCloseTo(.35, 2);
    expect(recencyWeight(1900, YEAR)).toBeGreaterThan(0); expect(recencyWeight(undefined, YEAR)).toBeGreaterThan(0);
    expect(scored('Old Compass', 3, .1, 2016, true).diagnostics!.staleCluePenalty).toBeGreaterThan(0);
  });
  it('boosts power separately but rewards genuinely earlier clues more', () => {
    const plain = occurrence(1, { inPower: false }), power = occurrence(1);
    expect(occurrenceScore(power, YEAR) / occurrenceScore(plain, YEAR)).toBeCloseTo(1.4);
    expect(occurrenceScore(plain, YEAR)).toBeGreaterThan(occurrenceScore(occurrence(2, { relativePosition: .4 }), YEAR));
    expect(earlinessWeight(.1)).toBeGreaterThan(earlinessWeight(.3));
  });
  it('counts each tossup once, retaining raw sentence evidence and the strongest occurrence', () => {
    const first = occurrence(1), later = occurrence(1, { relativePosition: .8, inPower: false, sentenceId: '1:1' });
    const diagnostics = scoreConcept([first, later, occurrence(2)], 1, 0, YEAR);
    expect(diagnostics).toMatchObject({ independentQuestionCount: 2, rawOccurrenceCount: 3, powerOccurrenceCount: 2, recentEarlyPowerOccurrenceCount: 2 });
    expect(diagnostics.averageRelativePosition).toBe(.1);
    expect(diagnostics.finalHardScore).toBe(scoreConcept([first, occurrence(2)], 1, 0, YEAR).finalHardScore);
    const clue = clusterClues(segmentClues(source(1, '<i>Silver Compass</i> appears. <i>Silver Compass</i> recurs. <i>Silver Compass</i> returns.')), target, YEAR)[0];
    expect(clue.frequency).toBe(1); expect(clue.diagnostics!.rawOccurrenceCount).toBe(3);
  });
  it('uses diminishing confidence and modest cross-year/tournament consistency', () => {
    expect(frequencyConfidence(4) - frequencyConfidence(1)).toBeGreaterThan(frequencyConfidence(17) - frequencyConfidence(14));
    const independent = Array.from({ length: 5 }, (_, i) => occurrence(i, { year: YEAR - i % 3 }));
    const oneSet = independent.map(o => ({ ...o, tournament: 'Same set' }));
    const a = scoreConcept(independent, 1, 0, YEAR), b = scoreConcept(oneSet, 1, 0, YEAR);
    expect(a.finalHardScore).toBeGreaterThan(b.finalHardScore); expect(a.numberOfDistinctYears).toBe(3); expect(b.numberOfDistinctTournaments).toBe(1);
  });
  it('keeps bonuses supplemental and out of tossup position and power metrics', () => {
    const bonus = occurrence(2, { kind: 'bonus', relativePosition: 0, inPower: true });
    const diagnostics = scoreConcept([occurrence(1, { relativePosition: .7, inPower: false }), bonus], 1, 0, YEAR);
    expect(diagnostics.averageRelativePosition).toBe(.7); expect(diagnostics.powerRate).toBe(0); expect(diagnostics.recentEarlyOccurrenceCount).toBe(0);
    const clue = clusterClues(segmentClues(source(2, '<i>Silver Compass</i> appears.', { kind: 'bonus', powerWords: 99 })), target, YEAR)[0];
    expect(clue.pool).toBe('common'); expect(clue.diagnostics!.weightedAverageRelativePosition).toBeUndefined();
  });
  it('orders continuous positions in stable bands and ends with common recognition clues', () => {
    const clues = [scored('Golden Lantern', 15, .9, 2025, false), scored('Silver Compass', 5, .1, 2025, true), scored('Copper Harpoon', 5, .3, 2025, true), scored('Crystal Palace', 5, .6, 2025, false)];
    const ordered = orderClues(clues);
    expect(ordered.map(c => c.anchor)).toEqual(['Silver Compass', 'Copper Harpoon', 'Crystal Palace', 'Golden Lantern']);
    expect(orderClues([...clues].reverse()).map(c => c.anchor)).toEqual(ordered.map(c => c.anchor));
  });
});

describe('contextual phrase generation and work diversity', () => {
  const berniniText = 'His unfinished <i>Truth Unveiled by Time</i> depicts a woman holding the sun. '
    + '<i>Blessed Ludovica Albertoni</i> lies above a red marble sarcophagus. '
    + 'Pluto’s fingers press into Proserpina in <i>Rape of Proserpina</i>. (*) '
    + '<i>Apollo and Daphne</i> depicts Daphne turning into a laurel tree. '
    + '<i>Fountain of the Four Rivers</i> stands in Piazza Navona. '
    + '<i>Ecstasy of St. Teresa</i> depicts an angel and a swooning nun. For 10 points, name this Italian sculptor.';
  it('generates a source-backed sculptor card with context rather than a title list', () => {
    const term = { answer: target }, sources = Array.from({ length: 12 }, (_, i) => source(i, berniniText, { year: YEAR - i % 3 }));
    const card = generateCard(term, sources, emptyCard(term, 'deck'));
    expect(card.generationStatus).toBe('ready'); expect(card.answer).toBe(target); expect(card.answerType).toBe('Sculptor'); expect(card.sourceCount).toBe(12);
    expect(card.hardClues).toHaveLength(3); expect(card.commonClues).toHaveLength(3);
    const text = card.clueText.toLowerCase();
    for (const detail of ['unfinished', 'sarcophagus', 'fingers', 'laurel tree', 'piazza navona', 'swooning nun']) expect(text).toContain(detail);
    const clues = [...card.hardClues, ...card.commonClues];
    for (const clue of clues) { expect(clue.text).not.toBe(clue.anchor); expect(clue.text.split(/\s+/).length).toBeLessThanOrEqual((clue.anchor || '').split(/\s+/).length + 12); }
    expect(card.clueText).not.toContain(target); expect(card.clueText).not.toMatch(/name this|for 10 points/i);
  });
  it('preserves commas within a work title and its identifying action', () => {
    const name = 'Aeneas, Anchises, and Ascanius';
    const phrase = generateCluePhrase(name, [occurrence(1, { anchor: name, context: `${name} depicts three generations fleeing Troy.` })], target);
    expect(phrase).toContain('fleeing Troy'); expect(phrase).toContain(name);
  });
  it('preserves different kinds of context without artist-specific rules', () => {
    const examples = [
      ['Silver Compass', 'An unfinished work titled Silver Compass.', /unfinished.*Silver Compass/i],
      ['Ivory Telescope', 'Ivory Telescope shows a sailor holding a broken oar.', /holding.*broken oar/i],
      ['Copper Harpoon', 'Copper Harpoon is located in North Harbor.', /North Harbor/i],
      ['The Copper Harpoon', 'That work located in the North Harbor is The Copper Harpoon.', /^The Copper Harpoon in the North Harbor$/],
      ['Marble Elephant', 'The creature in Marble Elephant is surrounded by golden rays.', /golden rays/i],
    ] as const;
    for (const [anchor, context, expected] of examples) expect(generateCluePhrase(anchor, [occurrence(1, { anchor, context })], 'Unknown Artist')).toMatch(expected);
  });
  it('clusters transformation paraphrases and titleless details supported by multiple questions', () => {
    const sources = [source(1, '<i>Apollo and Daphne</i> depicts Daphne transforming into a laurel tree.'), source(2, '<i>Apollo and Daphne</i> depicts branches emerging from Daphne’s fingers.'), source(3, 'Daphne transforms into a laurel tree.'), source(4, 'Branches emerge from Daphne’s fingers.')];
    const concepts = clusterClues(sources.flatMap(segmentClues), target, YEAR);
    const work = concepts.find(c => c.anchor === 'Apollo and Daphne')!;
    expect(work.frequency).toBe(4); expect(work.text).toMatch(/tree|branches/); expect(rankClues(concepts)).toHaveLength(1);
  });
  it('merges connected location clues into one work while keeping ambiguous names separate', () => {
    const sources = [source(1, '<i>Silver Compass</i> is located in North Harbor.'), source(2, '<i>Silver Compass</i> stands in North Harbor.'), source(3, 'North Harbor contains an unusual monument.'), source(4, 'North Harbor has an unusual monument.')];
    const concepts = clusterClues(sources.flatMap(segmentClues), 'Unknown Artist', YEAR);
    expect(concepts.find(c => c.anchor === 'Silver Compass')?.frequency).toBe(4);
    expect(concepts.filter(c => c.anchor === 'North Harbor')).toHaveLength(0);
    function cluster(anchor: string, title: boolean): ConceptCluster {
      return { anchor, title, tokens: anchor.toLowerCase().split(' '), occurrences: new Map([1, 2].map(i => [String(i), occurrence(i, { anchor, context: `Silver Compass and Golden Lantern both stand in North Harbor.` })])) };
    }
    expect(connectWorkDetails([cluster('Silver Compass', true), cluster('Golden Lantern', true), cluster('North Harbor', false)])).toHaveLength(3);
  });
  it('keeps creator associations separate from incidental quoted objects', () => {
    const sourceText = 'A “Blue Piano” plays in the stage directions. Tennessee Williams wrote this play.';
    const concepts = clusterClues([source(1, sourceText), source(2, sourceText)].flatMap(segmentClues), 'A Streetcar Named Desire', YEAR);
    expect(concepts.find(c => c.anchor === 'Tennessee Williams')?.text).toBe('Written by Tennessee Williams');
    expect(concepts.find(c => c.anchor === 'Blue Piano')?.text).not.toMatch(/Tennessee Williams/);
  });
  it('infers Poet before Author when the evidence is specific', () => {
    expect(inferAnswerType({ answer: 'Example Writer' }, [source(1, 'Name this American poet.')])).toBe('Poet');
  });
});

describe('bounded modern source retrieval', () => {
  it('adds a recent-year sample when historical results are truncated and deduplicates evidence', async () => {
    await db.studySources.clear();
    const q = { ...tossup, answer: target, question: '<i>Silver Compass</i> appears.' };
    const response = (questions: unknown[], count: number) => ({ tossups: { count, questionArray: questions }, bonuses: { count: 0, questionArray: [] } });
    vi.mocked(request).mockResolvedValueOnce(response([q], 100)).mockResolvedValueOnce(response([q, { ...q, _id: 'new', set: { ...q.set, year: YEAR } }], 2)).mockResolvedValueOnce(response([], 0));
    const items = await searchSources(target, [2, 3, 4], undefined, true);
    expect(items).toHaveLength(2);
    expect(vi.mocked(request).mock.calls.at(-2)?.[1]).toMatchObject({ questionType: 'tossup', minYear: new Date().getFullYear() - 5 });
  });
  it('retains historical evidence if the optional recent-year request fails', async () => {
    const response = { tossups: { count: 100, questionArray: [{ ...tossup, answer: target }] }, bonuses: { questionArray: [] } };
    vi.mocked(request).mockResolvedValueOnce(response).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ tossups: { questionArray: [] }, bonuses: { questionArray: [] } });
    expect(await searchSources(target, [2], undefined, true)).toHaveLength(1);
  });
});
