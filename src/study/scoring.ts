import type { ClueDiagnostics, ClueOccurrence } from './types';
export const recencyWeight = (year: number | undefined, currentYear = new Date().getFullYear()) => year === undefined ? .65 : Math.exp(-.105 * Math.max(0, currentYear - year));
export const earlinessWeight = (position: number) => .3 + 3.7 * Math.pow(1 - Math.max(0, Math.min(1, position)), 3);
export const powerBoost = (inPower: boolean) => inPower ? 1.4 : 1;
export const frequencyConfidence = (independentQuestions: number) => Math.log1p(independentQuestions);
export function occurrenceScore(o: ClueOccurrence, currentYear = new Date().getFullYear()): number {
  return recencyWeight(o.year, currentYear) * (o.kind === 'tossup' ? earlinessWeight(o.relativePosition ?? .5) * powerBoost(o.inPower) : .3);
}
export function scoreConcept(occurrences: ClueOccurrence[], distinctiveness = 1, genericness = 0, currentYear = new Date().getFullYear()): ClueDiagnostics {
  const independent = new Map<string, ClueOccurrence>();
  for (const o of occurrences) {
    const key = `${o.kind}:${o.questionId}`;
    const previous = independent.get(key);
    if (!previous || occurrenceScore(o, currentYear) > occurrenceScore(previous, currentYear)) independent.set(key, o);
  }
  const questions = [...independent.values()], tossups = questions.filter(o => o.kind === 'tossup');
  const recent = questions.filter(o => o.year !== undefined && currentYear - o.year <= 4);
  const early = recent.filter(o => o.kind === 'tossup' && o.relativePosition !== undefined && o.relativePosition <= .33);
  const earlyPower = early.filter(o => o.inPower), powered = tossups.filter(o => o.inPower);
  const years = [...new Set(questions.flatMap(o => o.year === undefined ? [] : [o.year]))];
  const tournaments = new Map<string, number>();
  questions.forEach(o => tournaments.set(o.tournament, (tournaments.get(o.tournament) || 0) + 1));
  const count = questions.length, confidence = frequencyConfidence(count);
  // Same-tournament repetition supplies diminishing evidence; independent sets strengthen it.
  const evidence = questions.reduce((sum, o) => sum + occurrenceScore(o, currentYear) / Math.sqrt(tournaments.get(o.tournament)!), 0);
  const consistency = 1 + .08 * Math.log1p(tournaments.size) + .05 * Math.log1p(years.length);
  const recentBoost = 1 + .5 * early.length / Math.max(1, tossups.length) + .35 * earlyPower.length / Math.max(1, tossups.length);
  const weightedFrequency = questions.reduce((sum, o) => sum + recencyWeight(o.year, currentYear) * (o.kind === 'bonus' ? .4 : 1) / Math.sqrt(tournaments.get(o.tournament)!), 0);
  const newest = years.length ? Math.max(...years) : undefined;
  const stale = newest !== undefined && currentYear - newest > 4 ? Math.min(.28, (currentYear - newest - 4) * .035) : 0;
  const average = (values: number[]) => values.length ? values.reduce((a, b) => a + b, 0) / values.length : undefined;
  const positioned = tossups.filter(o => o.relativePosition !== undefined);
  const recencyTotal = positioned.reduce((sum, o) => sum + recencyWeight(o.year, currentYear), 0);
  return { independentQuestionCount: count, rawOccurrenceCount: occurrences.length, powerOccurrenceCount: powered.length,
    powerRate: tossups.length ? powered.length / tossups.length : 0,
    weightedPowerOccurrences: powered.reduce((sum, o) => sum + recencyWeight(o.year, currentYear), 0),
    recentOccurrenceCount: recent.length, recentEarlyOccurrenceCount: early.length, recentEarlyPowerOccurrenceCount: earlyPower.length,
    averageRelativePosition: average(positioned.map(o => o.relativePosition!)),
    weightedAverageRelativePosition: recencyTotal ? positioned.reduce((sum, o) => sum + o.relativePosition! * recencyWeight(o.year, currentYear), 0) / recencyTotal : undefined,
    averageSentencePosition: average(tossups.flatMap(o => o.sentencePosition === undefined ? [] : [o.sentencePosition])),
    newestAppearanceYear: newest, oldestAppearanceYear: years.length ? Math.min(...years) : undefined,
    numberOfDistinctYears: years.length, numberOfDistinctTournaments: tournaments.size,
    distinctivenessScore: distinctiveness, genericnessPenalty: genericness, staleCluePenalty: stale,
    finalHardScore: Math.max(0, evidence * confidence * distinctiveness * consistency * recentBoost * (1 - stale) - genericness),
    finalCommonScore: Math.max(0, weightedFrequency * confidence * distinctiveness * consistency * (1 - stale) - genericness) };
}
