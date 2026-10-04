import type { CardAttempt } from './types';
export interface StudyMetrics { appearances: number; completed: number; first: number; second: number; third: number; attempts: number; trouble: number; firstAccuracy: number; lifetimeAccuracy: number; lastPracticed?: string }
export function studyMetrics(attempts: CardAttempt[]): StudyMetrics {
  const groups = new Map<string, CardAttempt[]>();
  for (const a of attempts) { const key = `${a.sessionId}|${a.appearance}`; const list = groups.get(key) || []; list.push(a); groups.set(key, list); }
  let first = 0, second = 0, third = 0, completed = 0, trouble = 0;
  for (const list of groups.values()) {
    if (list.length > 1 || !list[0].correct) trouble++;
    if (!list.some(a => a.correct)) continue;
    completed++;
    if (list.length === 1) first++; else if (list.length === 2) second++; else third++;
  }
  return { appearances: groups.size, completed, first, second, third, trouble, attempts: attempts.length,
    firstAccuracy: groups.size ? first / groups.size * 100 : 0, lifetimeAccuracy: attempts.length ? completed / attempts.length * 100 : 0,
    lastPracticed: attempts.map(a => a.at).sort().at(-1) };
}
export function groupedStudyMetrics(attempts: CardAttempt[], field: 'cardId' | 'deckId' | 'category' | 'subcategory' | 'answerType' | 'sessionId') {
  const groups = new Map<string, CardAttempt[]>();
  for (const a of attempts) { const key = a[field] || 'Unspecified'; const list = groups.get(key) || []; list.push(a); groups.set(key, list); }
  return [...groups].map(([key, values]) => ({ key, ...studyMetrics(values) })).sort((a, b) => b.attempts - a.attempts);
}
