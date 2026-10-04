import { plainText } from '../api/parser';
import { normalizeAnswer } from './answers';
import type { ClueConcept, ImportedTerm, SourceItem } from './types';

export interface Segment { text: string; pool: 'hard' | 'common'; sourceId: string }
export function powerSections(html: string, powerWords?: number): { hard: string; common: string } {
  const text = plainText(html);
  const marker = text.indexOf('(*)');
  if (marker >= 0) return { hard: text.slice(0, marker), common: text.slice(marker + 3) };
  if (Number.isInteger(powerWords) && powerWords! > 0) {
    const words = text.split(/\s+/); return { hard: words.slice(0, powerWords).join(' '), common: words.slice(powerWords).join(' ') };
  }
  // Only an initial continuous bold region is evidence of power. Bold names elsewhere are not.
  const prefix = html.match(/^\s*(?:<(?:b|strong)\b[^>]*>[\s\S]*?<\/(?:b|strong)>\s*[,;:–—-]?\s*)+/i);
  if (prefix) {
    return { hard: plainText(prefix[0]), common: plainText(html.slice(prefix[0].length)) };
  }
  return { hard: '', common: text };
}
export function segmentClues(source: SourceItem): Segment[] {
  const sections = source.kind === 'tossup' ? powerSections(source.text, source.powerWords) : { hard: '', common: plainText(source.text) };
  const result: Segment[] = [];
  for (const pool of ['hard', 'common'] as const) {
    // Protect initials and common abbreviations before sentence segmentation.
    const protectedText = sections[pool].replace(/\b(?:[A-Z]|Mr|Mrs|Dr|St)\./g, m => m.replace('.', '\uE000'));
    for (const phrase of protectedText.split(/(?<=[.!?])\s+(?=[A-Z“"[])|\s*;\s*/)) {
      const text = phrase.replace(/\uE000/g, '.').replace(/\[[^\]]*\]/g, '').trim();
      if (text.length >= 8) result.push({ text, pool, sourceId: source.id });
    }
  }
  return result;
}
const STOP = new Set(('a an the this that these those it its his her their he she they who which what whose of in on at to for from by with and or as is are was were be been being has have had not one two three first name identify work works author novel play poem country man woman character characters person people also such called about after before when where into out through over under can would will does did during ftpe ftp points following names wrote written named another important famous most very many much something known related described describes associated answer protagonist').split(' '));
const SYNONYMS: Record<string, string> = { thrown: 'throw', throws: 'throw', threw: 'throw', tosses: 'throw', tossed: 'throw', hurled: 'throw', hurls: 'throw', flung: 'throw', burning: 'burn', burned: 'burn', burnt: 'burn', fire: 'burn', tears: 'tear', tore: 'tear', grey: 'gray', chinese: 'china', windows: 'window', lanterns: 'lantern' };
export function conceptTokens(text: string): string[] {
  return [...new Set(normalizeAnswer(text).split(' ').filter(t => t.length > 1 && !STOP.has(t)).map(t => SYNONYMS[t] || (t.length > 5 ? t.replace(/(?:ing|ed|s)$/, '') : t)))];
}
export function conceptSimilarity(a: string, b: string): number {
  const aa = new Set(conceptTokens(a)), bb = new Set(conceptTokens(b));
  if (!aa.size || !bb.size) return 0;
  const overlap = [...aa].filter(t => bb.has(t)).length;
  return Math.max(overlap / (aa.size + bb.size - overlap), overlap >= 2 ? .8 * overlap / Math.min(aa.size, bb.size) : 0);
}
function cleanPhrase(value: string, target: string): string {
  let text = value.replace(/\(\*\)/g, '').replace(/\b(?:for (?:ten|10) points|FTP|FTPE),?\s*/gi, '')
    .replace(/^(?:name|identify)\s+(?:this|the)\s+\w+[,:]?\s*/i, '')
    .replace(/^(?:in|of|from)\s+this\s+(?:play|novel|poem|work|country|city)[,:]?\s*/i, '')
    .replace(/^this\s+(?:play|novel|poem|work|author|country|city|person|battle)\s+/i, '')
    .replace(/\b(?:this|that)\s+(play|novel|poem|work|author|country|city|person|battle)\b/gi, 'the $1')
    .replace(/\b(?:during|in|on|at|with|by|for|to)\s+(?:a|an|the|this)?\s*$/i, '')
    .replace(/\s+/g, ' ').replace(/^[\s,.:;’']+|[\s,.:;!?]+$/g, '').trim();
  // Discard answer-revealing phrases rather than altering their factual meaning.
  if (!text || normalizeAnswer(text).includes(normalizeAnswer(target))) return '';
  const words = text.split(' ');
  if (words.length > 22) {
    // Prefer an intact short clause over a sentence-sized clue.
    const clauses = text.split(/,\s+|\s+(?:while|although|because|whereas)\s+/);
    const concise = clauses.find(c => c.split(' ').length >= 4 && c.split(' ').length <= 18 && /[A-Z]|"|“/.test(c));
    if (concise) text = concise;
    else return ''; // Never truncate to an unsupported or incomplete statement.
  }
  return text.charAt(0).toUpperCase() + text.slice(1);
}
function candidates(segment: Segment, target: string): string[] {
  const whole = cleanPhrase(segment.text, target);
  const entities = [...segment.text.matchAll(/\b[A-Z][\p{L}’'-]+(?:\s+(?:[A-Z][\p{L}’'-]+|(?:(?:of|the|on|and|de|van|a|an)\s+){1,3}[A-Z][\p{L}’'-]+)){1,6}/gu)]
    .map(m => cleanPhrase(m[0], target)).filter(s => s && conceptTokens(s).length >= 2);
  // A sentence that has multiple distinct facts can still yield its recurring named entities.
  return [...new Set([whole, ...entities].filter(s => s && conceptTokens(s).length >= 2))];
}
function recurringPhrases(segments: Segment[], target: string): Segment[] {
  const phrases = new Map<string, { text: string; appearances: Map<string, Segment> }>();
  for (const segment of segments) {
    const words = segment.text.replace(/[“”"(),;.!?]/g, ' ').split(/\s+/).filter(Boolean);
    for (let start = 0; start < words.length; start++) for (let length = 2; length <= 7 && start + length <= words.length; length++) {
      const span = words.slice(start, start + length);
      if (STOP.has(normalizeAnswer(span[0])) || STOP.has(normalizeAnswer(span.at(-1)!))) continue;
      const text = cleanPhrase(span.join(' '), target), tokens = conceptTokens(text);
      if (!text || text.length > 65 || tokens.length < 2) continue;
      const key = [...tokens].sort().join(' ');
      if (!phrases.has(key)) phrases.set(key, { text, appearances: new Map() });
      const entry = phrases.get(key)!;
      entry.appearances.set(`${segment.sourceId}|${segment.pool}`, { ...segment, text: entry.text });
    }
  }
  // Cap mining work, and prefer recurring, longer distinctive phrases over fragments.
  const recurring = [...phrases.values()].filter(p => new Set([...p.appearances.values()].map(s => s.sourceId)).size >= 2)
    .map(p => ({ ...p, tokens: conceptTokens(p.text) }))
    .sort((a, b) => b.appearances.size - a.appearances.size || b.tokens.length - a.tokens.length).slice(0, 600);
  const byToken = new Map<string, number[]>();
  recurring.forEach((p, i) => p.tokens.forEach(token => { const ids = byToken.get(token) || []; ids.push(i); byToken.set(token, ids); }));
  const frequent = recurring.filter(p => {
    const tokens = p.tokens;
    const possible = tokens.map(token => byToken.get(token)!).sort((a, b) => a.length - b.length)[0];
    return !possible.some(i => {
      const other = recurring[i];
      if (other === p || other.appearances.size < p.appearances.size * .6) return false;
      const longer = other.tokens;
      return longer.length > tokens.length && tokens.every(t => longer.includes(t));
    });
  }).sort((a, b) => b.appearances.size - a.appearances.size || conceptTokens(b.text).length - conceptTokens(a.text).length).slice(0, 180);
  return frequent.flatMap(p => [...p.appearances.values()]);
}
export function clusterClues(segments: Segment[], target: string): ClueConcept[] {
  const clusters: { phrases: string[]; sources: Set<string>; hard: Set<string>; representative: string }[] = [];
  const index = new Map<string, Set<number>>();
  for (const segment of [...segments, ...recurringPhrases(segments, target)]) for (const phrase of candidates(segment, target)) {
    const tokens = conceptTokens(phrase);
    const possible = new Set(tokens.flatMap(token => [...(index.get(token) || [])]));
    let best = -1, similarity = .62;
    for (const i of possible) {
      const value = conceptSimilarity(phrase, clusters[i].representative);
      if (value > similarity) { best = i; similarity = value; }
    }
    if (best < 0) { best = clusters.length; clusters.push({ phrases: [], sources: new Set(), hard: new Set(), representative: phrase }); }
    const cluster = clusters[best]; cluster.phrases.push(phrase); cluster.sources.add(segment.sourceId);
    if (segment.pool === 'hard') cluster.hard.add(segment.sourceId);
    // Use an actual source phrase, preferring a compact representative with identifying detail.
    const phraseTokens = conceptTokens(phrase).length;
    const properName = /^(?:[A-Z][\p{L}’'-]+\s+)+[A-Z][\p{L}’'-]+$/u.test(phrase) || /^[A-Z][\p{L}’'-]+\s+[\p{L}’'-]+$/u.test(phrase);
    if (phrase.length < cluster.representative.length && (phraseTokens >= 3 || properName || conceptTokens(cluster.representative).length <= 2)) cluster.representative = phrase;
    for (const token of tokens) { if (!index.has(token)) index.set(token, new Set()); index.get(token)!.add(best); }
  }
  return clusters.map(c => {
    const text = c.representative, frequency = c.sources.size, powerFrequency = c.hard.size;
    const entity = /\b[A-Z][a-z]+\s+[A-Z]/.test(text) ? 1.5 : 0;
    const specificity = Math.min(4, conceptTokens(text).length / 2);
    return { text, frequency, powerFrequency, sourceIds: [...c.sources], pool: powerFrequency > 0 ? 'hard' : 'common', score: frequency * 5 + powerFrequency * 2 + specificity + entity };
  });
}
export function rankClues(concepts: ClueConcept[], limit = 6): ClueConcept[] {
  const ranked = [...concepts].sort((a, b) => b.score - a.score || a.text.length - b.text.length);
  const chosen: ClueConcept[] = [];
  const add = (c: ClueConcept) => {
    if (chosen.length < limit && !chosen.some(p => conceptSimilarity(p.text, c.text) >= .55 || normalizeAnswer(p.text).includes(normalizeAnswer(c.text)) || normalizeAnswer(c.text).includes(normalizeAnswer(p.text)))) chosen.push(c);
  };
  // Repeated evidence outranks singletons. Start with three power concepts, then three common.
  const recurring = ranked.filter(c => c.frequency >= 2);
  for (const pool of ['hard', 'common'] as const) for (const clue of recurring.filter(c => c.pool === pool).sort((a, b) => pool === 'hard' ? b.powerFrequency - a.powerFrequency || b.score - a.score : b.score - a.score)) {
    if (chosen.filter(c => c.pool === pool).length < 3) add(clue);
  }
  for (const clue of recurring) add(clue);
  // Sparse material may provide fewer concepts; singletons are visibly kept under review.
  if (chosen.length < 5) for (const clue of ranked) add(clue);
  return chosen.sort((a, b) => (a.pool === 'hard' ? 0 : 1) - (b.pool === 'hard' ? 0 : 1) || b.powerFrequency - a.powerFrequency || b.score - a.score);
}
const TYPE_RULES: [string, RegExp][] = [
  ['Play', /\b(?:this play|this drama|this tragedy|this comedy)\b/gi], ['Novel', /\bthis novel\b/gi], ['Poem', /\bthis poem\b/gi],
  ['Painting', /\bthis painting\b/gi], ['Painter', /\bthis painter\b/gi], ['Composer', /\bthis composer\b/gi],
  ['Opera', /\bthis opera\b/gi], ['Symphony', /\bthis symphony\b/gi], ['Film', /\bthis (?:film|movie)\b/gi], ['Director', /\bthis director\b/gi],
  ['Author', /\bthis (?:author|writer|poet|playwright|novelist)\b/gi], ['Country', /\bthis (?:country|nation)\b/gi], ['City', /\bthis city\b/gi],
  ['Battle', /\bthis battle\b/gi], ['War', /\bthis war\b/gi], ['Treaty', /\bthis treaty\b/gi], ['President', /\bthis president\b/gi],
  ['Scientist', /\bthis (?:scientist|physicist|chemist|biologist|mathematician)\b/gi], ['Philosopher', /\bthis philosopher\b/gi],
  ['Religion', /\bthis religion\b/gi], ['Mythological Figure', /\bthis (?:god|goddess|deity|mythological figure)\b/gi], ['Character', /\bthis character\b/gi],
  ['Event', /\bthis (?:event|revolution|uprising|festival)\b/gi], ['Person', /\bthis (?:man|woman|person|ruler|king|queen)\b/gi],
  ['Work', /\bthis work\b/gi],
];
export function inferAnswerType(term: ImportedTerm, sources: SourceItem[]): string {
  const scores = new Map<string, number>();
  for (const source of sources.filter(s => !s.related)) {
    const text = plainText(source.text).replace(/\bthis\s+(?:(?:American|English|French|Russian|German|Italian|British|Japanese|Chinese|Spanish|Greek|Roman|Irish|Scottish|Indian|African|Mexican|Canadian|Australian|ancient|modern|romantic|baroque|Victorian|female|male)\s+){1,3}/gi, 'this ');
    for (const [type, pattern] of TYPE_RULES) {
      const matches = [...text.matchAll(pattern)];
      if (matches.length) scores.set(type, (scores.get(type) || 0) + 1 + (matches.some(m => m.index! > text.length - 140) ? 1 : 0));
    }
  }
  const best = [...scores].sort((a, b) => b[1] - a[1])[0];
  if (best) return best[0];
  if (term.type?.trim()) return term.type.trim().replace(/:$/, '');
  if (/^battle of\b/i.test(term.answer)) return 'Battle';
  return sources.some(s => s.category === 'Literature') ? 'Work' : 'Answer';
}
export function dominantMetadata(sources: SourceItem[], hint?: string): { category: string; subcategory: string } {
  const relevant = sources.filter(s => !s.related);
  const mode = (values: string[]) => {
    const counts = new Map<string, number>(); values.filter(Boolean).forEach(v => counts.set(v, (counts.get(v) || 0) + 1));
    return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0];
  };
  const category = mode(relevant.map(s => s.category)) || hint || mode(sources.map(s => s.category)) || 'Other';
  return { category, subcategory: mode(relevant.filter(s => s.category === category).map(s => s.subcategory)) || '' };
}
export function formatClue(answerType: string, concepts: ClueConcept[]): string {
  return concepts.length ? `${answerType}: ${concepts.map(c => c.text.replace(/[.;]+$/, '')).join('; ')}.` : '';
}
