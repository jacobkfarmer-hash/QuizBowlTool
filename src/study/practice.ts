import type { Flashcard, StudyAppearance, StudyFilters } from './types';
export function splitSets<T>(cards: T[], size: number): T[][] {
  if (!Number.isInteger(size) || size < 1) throw new Error('Set size must be a positive whole number.');
  return Array.from({ length: Math.ceil(cards.length / size) }, (_, i) => cards.slice(i * size, (i + 1) * size));
}
export function selectSets<T>(cards: T[], size: number, first: number, last = first): T[] {
  const sets = splitSets(cards, size);
  if (!Number.isInteger(first) || !Number.isInteger(last) || first < 1 || last < first || last > sets.length) return [];
  return sets.slice(first - 1, last).flat();
}
export function randomCards(cards: Flashcard[], count: number, filters: StudyFilters = {}, rng = Math.random): Flashcard[] {
  const unique = new Map<string, Flashcard>();
  for (const card of cards) {
    if (!card.clueText.trim() || card.generationStatus === 'pending' || card.generationStatus === 'error' || card.generationStatus === 'no-matches') continue;
    if (Object.entries(filters).some(([key, value]) => value && card[key as keyof StudyFilters] !== value)) continue;
    if (!unique.has(card.normalizedAnswer)) unique.set(card.normalizedAnswer, card);
  }
  const pool = [...unique.values()];
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  return pool.slice(0, Math.max(0, Math.floor(count)));
}
export function recordAppearance(appearance: StudyAppearance, correct: boolean): StudyAppearance {
  if (appearance.correct) return appearance;
  return { ...appearance, attempts: appearance.attempts + 1, correct };
}
export function studySummary(appearances: StudyAppearance[]) {
  const completed = appearances.filter(a => a.correct);
  const first = completed.filter(a => a.attempts === 1).length, second = completed.filter(a => a.attempts === 2).length;
  const attempts = appearances.reduce((sum, a) => sum + a.attempts, 0);
  return { cards: completed.length, first, second, third: completed.length - first - second, attempts,
    firstAccuracy: completed.length ? first / completed.length * 100 : 0,
    submissionAccuracy: attempts ? completed.length / attempts * 100 : 0,
    troubleIds: appearances.filter(a => a.attempts > 1).map(a => a.cardId) };
}
