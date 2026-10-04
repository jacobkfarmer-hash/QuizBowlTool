import { PRONUNCIATIONS, spokenSpelling, type Pronunciation } from '../data/pronunciations';
import { tokenize, tokenWeight, type SpeechSegment, type Tokenized } from './text';

interface Replacement { from: number; to: number; text: string; priority: number }
interface Unit { text: string; start: number; end: number }
export interface PronunciationResult { canonicalDisplayText: string; spokenText: string; segments: SpeechSegment[]; guides: { term: string; pronunciation: string }[] }
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const namePattern = (e: Pronunciation) => new RegExp(`(?<![\\p{L}\\p{N}\\p{M}_])${escape(e.canonical.normalize('NFC')).replace(/\s+/g, '\\s+')}(?![\\p{L}\\p{N}\\p{M}_])`, e.caseSensitive ? 'gu' : 'giu');
const ordinal: Record<string, string> = { I: 'first', II: 'second', III: 'third', IV: 'fourth', V: 'fifth', VI: 'sixth', VII: 'seventh', VIII: 'eighth', IX: 'ninth', X: 'tenth' };
// Only explicit labels or recognizable phonetic notation count as moderator guides.
const guidesPattern = /((?:[\p{Lu}][\p{L}\p{M}'’-]*\s+){0,3}[\p{L}\p{M}'’-]+)\s*\(\s*((?:pronounced|pron\.)\s*:?[\s]*)?[“"']?([\p{L}\p{M} -]{1,80})[”"']?\s*\)/gu;
export function pronunciationPipeline(input: string | Tokenized, personal: Pronunciation[] = []): PronunciationResult {
  const t = typeof input === 'string' ? tokenize(input) : input;
  // Token offsets refer to the canonical display, including tokens in silent guides.
  const offsets: { from: number; to: number }[] = []; let source = '';
  t.tokens.forEach(token => { if (source) source += ' '; const from = source.length; source += token.text.normalize('NFC'); offsets.push({ from, to: source.length }); });
  const candidates: Replacement[] = []; const guides: PronunciationResult['guides'] = [];
  const entries = [...personal.map(e => ({ ...e, priority: 3 })), ...PRONUNCIATIONS.map(e => ({ ...e, priority: 2 }))];
  for (const match of source.matchAll(guidesPattern)) {
    const term = match[1].replace(/^(?:The|A|An|This|That|His|Her)\s+/, ''), spelling = match[3].trim();
    const phoneticStress = spelling.includes('-') && /[A-Z]{2}/.test(spelling);
    const compact = (s: string) => spokenSpelling(s).replace(/\s+/g, '').replace(/z/g, 's');
    const knownGuide = PRONUNCIATIONS.some(e => { const m = namePattern(e).exec(term); return m?.[0] === term && compact(e.spoken) === compact(spelling); });
    const legacyGauss = term.toLowerCase() === 'gauss' && spelling === 'gows';
    if (!match[2] && !knownGuide && !phoneticStress && !legacyGauss) continue;
    guides.push({ term, pronunciation: spelling });
    const local: Replacement[] = [];
    for (const e of entries) for (const m of term.matchAll(namePattern(e))) local.push({ from: m.index, to: m.index + m[0].length, text: spokenSpelling(e.spoken), priority: e.priority });
    const winners: Replacement[] = [];
    for (const r of local.sort((a, b) => b.priority - a.priority || (b.to - b.from) - (a.to - a.from))) if (!winners.some(w => r.from < w.to && w.from < r.to)) winners.push(r);
    let spokenTerm = term; for (const w of winners.sort((a, b) => b.from - a.from)) spokenTerm = spokenTerm.slice(0, w.from) + w.text + spokenTerm.slice(w.to);
    candidates.push({ from: match.index + match[1].length - term.length, to: match.index + match[0].length, text: winners.length ? spokenTerm : spokenSpelling(spelling), priority: 4 });
  }
  for (const entry of entries) for (const m of source.matchAll(namePattern(entry))) candidates.push({ from: m.index, to: m.index + m[0].length, text: spokenSpelling(entry.spoken), priority: entry.priority });
  const add = (pattern: RegExp, replace: (m: RegExpExecArray) => string) => { for (const m of source.matchAll(pattern)) candidates.push({ from: m.index, to: m.index + m[0].length, text: replace(m), priority: 0 }); };
  add(/\b(Dr|Mr|Mrs|Ms|Prof)\./g, m => ({ Dr: 'Doctor', Mr: 'Mister', Mrs: 'Missus', Ms: 'Miss', Prof: 'Professor' })[m[1] as 'Dr']);
  add(/\b([A-Z])\.(?=\s|[A-Z])/g, m => m[1]);
  add(/\b(Henry|Louis|Pope [A-Za-z]+|Elizabeth|Charles|George)\s+(VIII|VII|VI|IV|III|II|IX|X|V|I)\b/g, m => `${m[1]} the ${ordinal[m[2]]}`);
  add(/\b(H2O|CO2|O2|NaCl)\b/g, m => ({ H2O: 'H two O', CO2: 'C O two', O2: 'O two', NaCl: 'sodium chloride' })[m[1] as 'H2O']);
  add(/\b(\d+)\s*\^\s*([23])\b/g, m => `${m[1]} ${m[2] === '2' ? 'squared' : 'cubed'}`);
  add(/(?<=\d)\s*([=+×])\s*(?=\d)/g, m => ` ${{ '=': 'equals', '+': 'plus', '×': 'times' }[m[1]]} `);
  add(/(?<=\d)%/g, () => ' percent');
  const chosen: Replacement[] = [];
  for (const r of candidates.sort((a, b) => b.priority - a.priority || (b.to - b.from) - (a.to - a.from) || a.from - b.from)) if (!chosen.some(c => r.from < c.to && c.from < r.to)) chosen.push(r);
  chosen.sort((a, b) => a.from - b.from);
  const units: Unit[] = [];
  const range = (from: number, to: number) => { const start = offsets.findIndex(o => o.to > from); let end = start + 1; while (end < offsets.length && offsets[end].from < to) end++; return { start: Math.max(0, start), end }; };
  const unchanged = (from: number, to: number) => { const slice = source.slice(from, to); for (const m of slice.matchAll(/\S+/gu)) units.push({ text: m[0], ...range(from + m.index, from + m.index + m[0].length) }); };
  let cursor = 0;
  for (const r of chosen) { unchanged(cursor, r.from); units.push({ text: r.text.trim(), ...range(r.from, r.to) }); cursor = r.to; } unchanged(cursor, source.length);
  // Merge pieces that belong to one display token (e.g. 2+3) before chunking.
  const atoms: Unit[] = [];
  for (const u of units) { const prev = atoms.at(-1); if (prev && u.start < prev.end) { prev.text += `${/^[.,;:!?%)”']/u.test(u.text) ? '' : ' '}${u.text}`; prev.end = Math.max(prev.end, u.end); } else atoms.push({ ...u }); }
  const segments: SpeechSegment[] = []; let start = 0, words = 0, chars = 0;
  const flush = (end: number) => { const slice = atoms.slice(start, end); if (!slice.length) return; const from = slice[0].start, to = slice.at(-1)!.end; segments.push({ text: slice.map(u => u.text).join(' ').replace(/\s+/g, ' ').trim(), start: from, end: to, weights: t.tokens.slice(from, to).map(token => tokenWeight(token.text)) }); start = end; words = 0; chars = 0; };
  atoms.forEach((u, i) => {
    words += u.text.split(/\s+/).length; chars += u.text.length + 1;
    const remaining = atoms.length - i - 1;
    const boundary = /[.!?;][”"')]*$/.test(u.text) || (words >= 24 && /[,：:][”"')]*$/.test(u.text));
    // Bound context conservatively below Kokoro's 510-token budget; never split an atom/name.
    if ((words >= 10 && boundary && remaining >= 8) || ((words >= 42 || chars >= 320) && remaining >= 8)) {
      // Keep the moderator's cue attached to its surrounding clue.
      if (!/\bFor(?: 10)?$/i.test(u.text) && !/\bFor 10 points[,:]?$/i.test(atoms.slice(start, i + 1).map(a => a.text).join(' '))) flush(i + 1);
    }
  }); flush(atoms.length);
  return { canonicalDisplayText: t.fullDisplayText, spokenText: segments.map(s => s.text).join(' '), segments, guides };
}
