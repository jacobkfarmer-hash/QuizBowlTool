import { plainText } from '../api/parser';
import { normalizeAnswer } from './answers';
import { conceptSimilarity, conceptTokens, entityNames, STOP } from './clue-text';
import { connectWorkDetails, type ConceptCluster } from './connections';
import { cleanCluePhrase, detailStrength, generateCluePhrase } from './phrases';
import { positionedSegments, relativeCluePosition, type PositionedSegment } from './positions';
import { occurrenceScore, scoreConcept } from './scoring';
import type { ClueConcept, ClueOccurrence, SourceItem } from './types';
export { conceptSimilarity, conceptTokens } from './clue-text';
export { dominantMetadata, formatClue, inferAnswerType } from './answer-types';
export type Segment = Omit<PositionedSegment, 'context'> & { context?: string };

// Preserve this public helper for existing callers, while segmentation uses absolute positions.
export function powerSections(html: string, powerWords?: number): { hard: string; common: string } {
  const text = plainText(html);
  if (Number.isInteger(powerWords) && powerWords! > 0) {
    const words = text.replace(/\(\*\)/g, '').trim().split(/\s+/);
    return { hard: words.slice(0, powerWords).join(' '), common: words.slice(powerWords).join(' ') };
  }
  const marker = text.indexOf('(*)');
  if (marker >= 0) return { hard: text.slice(0, marker), common: text.slice(marker + 3) };
  const prefix = html.match(/^\s*(?:<(?:b|strong)\b[^>]*>[\s\S]*?<\/(?:b|strong)>\s*[,;:–—-]?\s*)+/i);
  return prefix ? { hard: plainText(prefix[0]), common: plainText(html.slice(prefix[0].length)) } : { hard: '', common: text };
}
export const segmentClues = (source: SourceItem): Segment[] => positionedSegments(source);
interface Candidate { anchor: string; segment: Segment; position: number; title: boolean }
function candidate(anchor: string, segment: Segment, title = false, offset?: number): Candidate {
  const found = segment.text.toLowerCase().indexOf(anchor.toLowerCase());
  return { anchor, segment, title, position: (segment.start || 0) + Math.max(0, offset ?? found) };
}
function titlesIn(segment: Segment): string[] {
  return (segment.titles || []).filter(t => normalizeAnswer(segment.text).includes(normalizeAnswer(t)));
}
function baseCandidates(segment: Segment, target: string): Candidate[] {
  const titles = titlesIn(segment).filter(t => !normalizeAnswer(t).includes(normalizeAnswer(target)));
  if (titles.length) return titles.map(t => candidate(t, segment, true));
  const names = entityNames(segment.text).filter(t => !normalizeAnswer(t).includes(normalizeAnswer(target)));
  if (names.length) return names.map(t => candidate(t, segment));
  const text = cleanCluePhrase(segment.text, target);
  return text && text.split(/\s+/).length <= 22 && conceptTokens(text).length >= 2 ? [candidate(text, segment)] : [];
}
function minePhrases(segments: Segment[], target: string): Candidate[] {
  const phrases = new Map<string, { anchor: string; tokens: string[]; matches: Map<string, Candidate>; weight: number }>();
  for (const segment of segments) {
    if (titlesIn(segment).length) continue;
    const words = [...segment.text.matchAll(/[\p{L}\p{N}’'-]+/gu)];
    for (let start = 0; start < words.length; start++) for (let length = 2; length <= 7 && start + length <= words.length; length++) {
      const end = words[start + length - 1];
      if (STOP.has(normalizeAnswer(words[start][0])) || STOP.has(normalizeAnswer(end[0]))) continue;
      const anchor = cleanCluePhrase(segment.text.slice(words[start].index!, end.index! + end[0].length), target);
      const tokens = conceptTokens(anchor);
      if (!anchor || anchor.length > 80 || tokens.length < 2) continue;
      const key = [...tokens].sort().join(' '), item = candidate(anchor, segment, false, words[start].index);
      if (!phrases.has(key)) phrases.set(key, { anchor, tokens, matches: new Map(), weight: 0 });
      const entry = phrases.get(key)!, question = `${segment.kind || 'tossup'}:${segment.questionId || segment.sourceId}`;
      if (!entry.matches.has(question)) { entry.matches.set(question, item); entry.weight += occurrenceScore(toOccurrence(item)); }
    }
  }
  const frequent = [...phrases.values()].filter(p => p.matches.size >= 2).sort((a, b) => b.weight - a.weight || b.tokens.length - a.tokens.length).slice(0, 500);
  const byToken = new Map<string, Set<number>>();
  frequent.forEach((p, i) => p.tokens.forEach(token => { if (!byToken.has(token)) byToken.set(token, new Set()); byToken.get(token)!.add(i); }));
  return frequent.filter(p => {
    const possible = p.tokens.map(t => byToken.get(t)!).sort((a, b) => a.size - b.size)[0];
    return ![...possible].some(i => { const other = frequent[i]; return other !== p && other.weight >= p.weight * .7 && other.tokens.length > p.tokens.length && p.tokens.every(t => other.tokens.includes(t)); });
  }).slice(0, 120).flatMap(p => [...p.matches.values()]);
}
function toOccurrence(c: Candidate): ClueOccurrence {
  const s = c.segment, kind = s.kind || 'tossup';
  return { sourceId: s.sourceId, questionId: s.questionId || s.sourceId, kind, tournament: s.tournament || s.sourceId,
    year: s.year, relativePosition: kind === 'bonus' ? undefined : s.totalLength ? relativeCluePosition(c.position, s.totalLength) : s.relativePosition,
    sentencePosition: kind === 'bonus' ? undefined : s.sentencePosition,
    inPower: kind === 'tossup' && (s.powerBoundary !== undefined ? c.position < s.powerBoundary : s.pool === 'hard'),
    anchor: c.anchor, context: s.context || s.text, position: c.position, sentenceId: s.sentenceId || `${s.sourceId}:${s.start || 0}` };
}
export function clusterClues(segments: Segment[], target: string, currentYear = new Date().getFullYear()): ClueConcept[] {
  const clusters: ConceptCluster[] = [];
  const index = new Map<string, Set<number>>();
  const all = [...segments.flatMap(s => baseCandidates(s, target)), ...minePhrases(segments, target)];
  for (const c of all) {
    const tokens = conceptTokens(c.anchor);
    if (tokens.length < 2) continue;
    const possible = new Set(tokens.flatMap(t => [...(index.get(t) || [])]));
    let best = -1, similarity = .62;
    for (const i of possible) {
      if (c.title !== clusters[i].title && c.title && conceptSimilarity(c.anchor, clusters[i].anchor) < .75) continue;
      const value = conceptSimilarity(c.anchor, clusters[i].anchor);
      if (value > similarity) { best = i; similarity = value; }
    }
    if (best < 0) { best = clusters.length; clusters.push({ anchor: c.anchor, title: c.title, tokens, occurrences: new Map() }); }
    const cluster = clusters[best], occurrence = toOccurrence(c);
    const key = `${occurrence.sourceId}|${occurrence.sentenceId}`;
    const previous = cluster.occurrences.get(key);
    if (!previous || occurrenceScore(occurrence, currentYear) > occurrenceScore(previous, currentYear)) cluster.occurrences.set(key, occurrence);
    if (c.title || (!cluster.title && c.anchor.length < cluster.anchor.length && tokens.length >= 2)) { cluster.anchor = c.anchor; cluster.tokens = tokens; cluster.title ||= c.title; }
    tokens.forEach(t => { if (!index.has(t)) index.set(t, new Set()); index.get(t)!.add(best); });
  }
  const totalQuestions = new Set(segments.map(s => `${s.kind || 'tossup'}:${s.questionId || s.sourceId}`)).size;
  const documentFrequency = new Map<string, Set<string>>();
  for (const s of segments) for (const token of conceptTokens(s.text)) {
    if (!documentFrequency.has(token)) documentFrequency.set(token, new Set());
    documentFrequency.get(token)!.add(`${s.kind || 'tossup'}:${s.questionId || s.sourceId}`);
  }
  return connectWorkDetails(clusters).map(c => {
    const occurrences = [...c.occurrences.values()];
    const text = generateCluePhrase(c.anchor, occurrences, target), tokens = conceptTokens(c.anchor);
    const idf = tokens.reduce((sum, t) => sum + Math.log1p(totalQuestions / Math.max(1, documentFrequency.get(t)?.size || 0)), 0) / Math.max(1, tokens.length);
    const distinctiveness = .9 + Math.min(.5, idf * .15) + (c.title ? .2 : 0) + Math.min(.35, detailStrength(text, c.anchor) * .04);
    const genericness = tokens.length < 2 ? 5 : /\b(?:important figure|several works|this person|this artist|this country)\b/i.test(text) ? 4 : /^(?:depicts?|shows?|features?)\s+(?:a|an|the)\s+\w+$/i.test(text) ? 4 : 0;
    const diagnostics = scoreConcept(occurrences, distinctiveness, genericness, currentYear);
    const position = diagnostics.weightedAverageRelativePosition;
    const hard = position !== undefined ? position <= .38 || (position <= .5 && diagnostics.powerRate > .3) : diagnostics.powerRate > 0;
    return { text, anchor: c.anchor, occurrences, diagnostics, frequency: diagnostics.independentQuestionCount,
      powerFrequency: diagnostics.powerOccurrenceCount, sourceIds: [...new Set(occurrences.map(o => o.sourceId))],
      pool: hard ? 'hard' as const : 'common' as const, score: hard ? diagnostics.finalHardScore : diagnostics.finalCommonScore };
  }).filter(c => c.text && conceptTokens(c.text).length >= 2);
}
export function redundantConcept(a: ClueConcept, b: ClueConcept): boolean {
  const aa = a.anchor || a.text, bb = b.anchor || b.text;
  return conceptSimilarity(aa, bb) >= .55 || normalizeAnswer(aa).includes(normalizeAnswer(bb)) || normalizeAnswer(bb).includes(normalizeAnswer(aa));
}
export function orderClues(concepts: ClueConcept[]): ClueConcept[] {
  return [...concepts].sort((a, b) => {
    if (a.pool !== b.pool) return a.pool === 'hard' ? -1 : 1;
    const ap = a.diagnostics?.weightedAverageRelativePosition, bp = b.diagnostics?.weightedAverageRelativePosition;
    if (ap !== undefined && bp !== undefined && Math.floor(ap * 20) !== Math.floor(bp * 20)) return Math.floor(ap * 20) - Math.floor(bp * 20);
    return a.pool === 'hard' ? (b.diagnostics?.finalHardScore ?? b.score) - (a.diagnostics?.finalHardScore ?? a.score)
      : (a.diagnostics?.finalCommonScore ?? a.score) - (b.diagnostics?.finalCommonScore ?? b.score);
  });
}
export function rankClues(concepts: ClueConcept[], limit = 6): ClueConcept[] {
  const chosen: ClueConcept[] = [], recurring = concepts.filter(c => c.frequency >= 2);
  const add = (c: ClueConcept, pool = c.pool) => { if (chosen.length < limit && !chosen.some(p => redundantConcept(p, c))) chosen.push({ ...c, pool }); };
  const hard = recurring.filter(c => c.pool === 'hard').sort((a, b) => (b.diagnostics?.finalHardScore ?? b.score) - (a.diagnostics?.finalHardScore ?? a.score));
  for (const clue of hard) if (chosen.length < Math.min(3, Math.floor(limit / 2))) add(clue, 'hard');
  const common = recurring.filter(c => c.pool === 'common').sort((a, b) => (b.diagnostics?.finalCommonScore ?? b.score) - (a.diagnostics?.finalCommonScore ?? a.score));
  for (const clue of common) add(clue, 'common');
  for (const clue of [...recurring].sort((a, b) => b.score - a.score)) add(clue);
  if (chosen.length < 5) for (const clue of [...concepts].sort((a, b) => b.score - a.score)) add(clue);
  return orderClues(chosen);
}
