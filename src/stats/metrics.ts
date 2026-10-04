import type { Attempt, Session } from '../core/types';
export const mean = (x: number[]) => x.length ? x.reduce((a, b) => a + b, 0) / x.length : null;
export const median = (x: number[]) => { const sorted = [...x].sort((a, b) => a - b); const n = sorted.length; return n ? n % 2 ? sorted[Math.floor(n / 2)] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2 : null; };
export const buzzPercent = (words: number, total: number) => total ? 100 * words / total : 0;
export const quarter = (number: number, total: number) => Math.min(3, Math.max(0, Math.ceil(number / total * 4) - 1));
export function aggregate(attempts: Attempt[]) {
  const events = attempts.flatMap(a => a.events); const powers = events.filter(e => e.result === 'power'); const tens = events.filter(e => e.result === 'ten'); const negs = events.filter(e => e.result === 'neg'); const correct = events.filter(e => e.accepted); const position = (list: typeof events) => list.map(e => buzzPercent(e.buzz.words, e.buzz.total)); const tuh = attempts.length;
  return { tuh, p: powers.length, ten: tens.length, n: negs.length, points: events.reduce((sum, e) => sum + e.points, 0), conversion: tuh ? attempts.filter(a => a.events.some(e => e.accepted)).length / tuh * 100 : 0, powerRate: tuh ? powers.length / tuh * 100 : 0, negRate: tuh ? negs.length / tuh * 100 : 0, correctBuzz: mean(position(correct)), medianBuzz: median(position(correct)), powerBuzz: mean(position(powers)), tenBuzz: mean(position(tens)), negBuzz: mean(position(negs)), perTU: tuh ? events.reduce((s, e) => s + e.points, 0) / tuh : 0 };
}
export function statistics(sessions: Session[]) {
  const attempts = sessions.flatMap(s => s.attempts); const totals = aggregate(attempts);
  const matches = sessions.filter(s => s.config.mode === 'match' && s.completedAt); const matchPoints = aggregate(matches.flatMap(s => s.attempts)).points;
  const bonuses = sessions.flatMap(s => s.bonuses); const parts = bonuses.flatMap(b => b.parts); const bonusPoints = parts.reduce((s, p) => s + p.points, 0);
  return { ...totals, gp: matches.length, ppg: matches.length ? matchPoints / matches.length : null, bonusesHeard: bonuses.length, partsHeard: parts.length, partsCorrect: parts.filter(p => p.correct).length, bonusPoints, ppb: sessions.some(s => s.config.bonuses) && bonuses.length ? bonusPoints / bonuses.length : null, total: totals.points + bonusPoints };
}
export function grouped(attempts: Attempt[], key: (a: Attempt) => string) { const groups = new Map<string, Attempt[]>(); for (const a of attempts) { const k = key(a); groups.set(k, [...(groups.get(k) ?? []), a]); } return [...groups].map(([name, attempts]) => ({ name, attempts, ...aggregate(attempts) })); }
