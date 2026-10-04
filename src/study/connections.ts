import { conceptTokens } from './clue-text';
import type { ClueOccurrence } from './types';

export interface ConceptCluster {
  anchor: string; title: boolean; tokens: string[]; occurrences: Map<string, ClueOccurrence>;
}
// Learn work/detail associations from this answer's evidence, never from a fixed list of works.
// Ambiguous details shared by multiple works stay separate rather than guessing a relationship.
export function connectWorkDetails(clusters: ConceptCluster[]): ConceptCluster[] {
  const works = clusters.filter(c => c.title);
  const profiles = works.map(work => ({ work, contexts: [...work.occurrences.values()].map(o => ({ o, tokens: new Set(conceptTokens(o.context)) })) }));
  const merged = new Set<ConceptCluster>();
  for (const detail of clusters.filter(c => !c.title && c.tokens.length >= 2)) {
    const questions = new Set([...detail.occurrences.values()].map(o => `${o.kind}:${o.questionId}`));
    const matches = profiles.map(({ work, contexts }) => {
      const direct = new Set(contexts.filter(({ tokens }) => detail.tokens.filter(t => tokens.has(t)).length >= Math.max(2, Math.ceil(detail.tokens.length * .75))).map(({ o }) => `${o.kind}:${o.questionId}`)).size;
      const cooccurrences = new Set(contexts.filter(({ o }) => questions.has(`${o.kind}:${o.questionId}`)).map(({ o }) => `${o.kind}:${o.questionId}`)).size;
      return { work, support: direct, cooccurrences };
    }).sort((a, b) => b.support - a.support || b.cooccurrences - a.cooccurrences);
    const best = matches[0], next = matches[1];
    if (!best) continue;
    const explicit = best.support >= 2 && best.support >= 2 * Math.max(1, next?.support || 0);
    if (!explicit) continue;
    for (const [key, occurrence] of detail.occurrences) if (!best.work.occurrences.has(key)) best.work.occurrences.set(key, { ...occurrence, associatedTitle: best.work.anchor });
    merged.add(detail);
  }
  return clusters.filter(c => !merged.has(c));
}
