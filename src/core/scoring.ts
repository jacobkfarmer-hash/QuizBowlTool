import type { Buzz, Config, Outcome } from './types';
export function tossupScore(accepted: boolean, buzz: Buzz, c: Config): { result: Outcome; points: number } {
  const result = accepted ? (c.powers && buzz.inPower ? 'power' : 'ten') : (!buzz.ended && c.negs ? 'neg' : 'incorrect_no_penalty');
  const points = !c.scoring ? 0 : accepted ? (result === 'power' ? c.scores.power : c.scores.ten) : buzz.ended ? c.scores.endWrong : c.negs ? c.scores.neg : 0;
  return { result, points };
}
export const bonusScore = (correct: boolean, c: Config, actualValue?: number) => correct && c.scoring ? actualValue ?? c.scores.bonus : 0;
