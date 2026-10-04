import type { Session } from '../core/types';
import { aggregate, buzzPercent, grouped } from './metrics';
export function patterns(sessions: Session[]): string[] {
  const attempts = sessions.flatMap(s => s.attempts); const observations: string[] = [];
  if (attempts.length < 10) return ['Play at least 10 tossups for pattern observations. Category comparisons need at least 5 tossups per category.'];
  const categories = grouped(attempts, a => a.draw.group).filter(g => g.tuh >= 5).sort((a, b) => b.perTU - a.perTU);
  if (categories.length >= 2) {
    const best = categories[0], weak = categories.at(-1)!;
    observations.push(`${best.name} had the highest points per tossup (${best.perTU.toFixed(1)} across ${best.tuh} tossups), with ${best.conversion.toFixed(0)}% conversion.`);
    if (best.perTU - weak.perTU >= 2) observations.push(`${weak.name} offers room to improve: ${weak.conversion.toFixed(0)}% conversion across ${weak.tuh} tossups.`);
    const timed = categories.filter(c => c.correctBuzz !== null && c.p + c.ten >= 3).sort((a, b) => a.correctBuzz! - b.correctBuzz!);
    if (timed.length >= 2) observations.push(`Your earliest correct buzzes were in ${timed[0].name}, at ${timed[0].correctBuzz!.toFixed(0)}% on average; ${timed.at(-1)!.name} averaged ${timed.at(-1)!.correctBuzz!.toFixed(0)}%.`);
    const maxNeg = [...categories].sort((a, b) => b.n - a.n)[0]; if (maxNeg.n >= 3) observations.push(`${maxNeg.name} accounted for ${maxNeg.n} of ${aggregate(attempts).n} negs.`);
    const maxPower = [...categories].sort((a, b) => b.powerRate - a.powerRate)[0]; if (maxPower.p >= 3) observations.push(`${maxPower.name} had your highest power rate: ${maxPower.powerRate.toFixed(0)}%.`);
  }
  const diffs = grouped(attempts, a => String(a.draw.difficulty)).filter(g => g.tuh >= 5).sort((a, b) => Number(a.name) - Number(b.name));
  for (let i = 1; i < diffs.length; i++) { const a = diffs[i - 1], b = diffs[i]; if (a.conversion - b.conversion >= 15) observations.push(`Conversion fell from ${a.conversion.toFixed(0)}% at difficulty ${a.name} to ${b.conversion.toFixed(0)}% at difficulty ${b.name}.`); if (a.correctBuzz !== null && b.correctBuzz !== null && b.correctBuzz - a.correctBuzz >= 10) observations.push(`Correct buzzes moved ${Math.round(b.correctBuzz - a.correctBuzz)} percentage points later at difficulty ${b.name}.`); }
  const negs = attempts.flatMap(a => a.events).filter(e => e.result === 'neg'); const earlyNegs = negs.filter(e => buzzPercent(e.buzz.words, e.buzz.total) < 35); if (negs.length >= 4 && earlyNegs.length >= 3) observations.push(`${earlyNegs.length} of ${negs.length} negs occurred before 35% of the tossup. Consider waiting for another clue.`);
  const early = aggregate(attempts.filter(a => a.number / a.totalTossups <= .5)); const late = aggregate(attempts.filter(a => a.number / a.totalTossups > .75));
  if (early.p + early.ten >= 3 && late.p + late.ten >= 3 && early.correctBuzz !== null && late.correctBuzz !== null && Math.abs(early.correctBuzz - late.correctBuzz) >= 8) observations.push(`Correct buzzes moved from ${early.correctBuzz.toFixed(0)}% in the first half to ${late.correctBuzz.toFixed(0)}% in the final quarter.`);
  const matches = sessions.filter(s => s.config.mode === 'match' && s.completedAt).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  if (matches.length >= 6) { const previous = matches.slice(-6, -3).map(s => aggregate(s.attempts).perTU).reduce((a, b) => a + b, 0) / 3; const recent = matches.slice(-3).map(s => aggregate(s.attempts).perTU).reduce((a, b) => a + b, 0) / 3; if (Math.abs(recent - previous) >= 1) observations.push(`Your latest 3 matches averaged ${recent.toFixed(1)} points per tossup, compared with ${previous.toFixed(1)} in the preceding 3. Round lengths are normalized.`); }
  return observations.length ? observations : ['No clear pattern yet at these sample sizes. Keep playing to build more reliable comparisons.'];
}
