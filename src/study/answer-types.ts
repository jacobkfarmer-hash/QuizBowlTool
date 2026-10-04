import { plainText } from '../api/parser';
import type { ClueConcept, ImportedTerm, SourceItem } from './types';
const TYPE_RULES: [string, RegExp][] = [
  ['Play', /\b(?:this play|this drama|this tragedy|this comedy)\b/gi], ['Novel', /\bthis novel\b/gi], ['Poem', /\bthis poem\b/gi],
  ['Painting', /\bthis painting\b/gi], ['Painter', /\bthis painter\b/gi], ['Sculptor', /\bthis sculptor\b/gi], ['Poet', /\bthis poet\b/gi], ['Composer', /\bthis composer\b/gi],
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
