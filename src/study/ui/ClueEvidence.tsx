import type { ClueConcept, ClueDiagnostics } from '../types';

const LABELS: Record<keyof ClueDiagnostics, string> = {
  independentQuestionCount: 'Independent questions', rawOccurrenceCount: 'Detected sentence occurrences', powerOccurrenceCount: 'Power questions',
  powerRate: 'Power rate', weightedPowerOccurrences: 'Recency-weighted power evidence', recentOccurrenceCount: 'Recent questions',
  recentEarlyOccurrenceCount: 'Recent early questions', recentEarlyPowerOccurrenceCount: 'Recent early power questions',
  averageRelativePosition: 'Mean tossup position', weightedAverageRelativePosition: 'Recency-weighted tossup position', averageSentencePosition: 'Mean sentence position',
  newestAppearanceYear: 'Newest year', oldestAppearanceYear: 'Oldest year', numberOfDistinctYears: 'Distinct years', numberOfDistinctTournaments: 'Distinct tournaments',
  distinctivenessScore: 'Distinctiveness', genericnessPenalty: 'Generic wording penalty', staleCluePenalty: 'Stale clue penalty', finalHardScore: 'Hard score', finalCommonScore: 'Common score',
};
function value(key: string, n: number) {
  return /Position|Rate/.test(key) ? `${Math.round(n * 100)}%` : Number.isInteger(n) ? String(n) : n.toFixed(2);
}
export function ClueEvidence({ clue }: { clue: ClueConcept }) {
  return <details className="study-clue-evidence"><summary>{clue.text} · {clue.pool} · {clue.frequency} independent questions · {clue.powerFrequency} in power</summary>{clue.diagnostics ? <dl>{Object.entries(clue.diagnostics).filter(([, n]) => n !== undefined).map(([key, n]) => <div key={key}><dt>{LABELS[key as keyof ClueDiagnostics]}</dt><dd>{value(key, n)}</dd></div>)}</dl> : <p className="help">Regenerate this saved card to calculate position and recency diagnostics.</p>}</details>;
}
