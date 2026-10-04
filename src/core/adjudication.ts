import { api } from '../api/client';
// The endpoint is stateless. Prefer a complete clarification, then include
// prior prompted words (e.g. “Johann Sebastian” + “Bach”) when necessary.
export async function adjudicate(answerline: string, answer: string, prior: string[] = []) {
  const standalone = await api.check(answerline, answer);
  if (standalone.directive !== 'reject' || !prior.length) return standalone;
  return api.check(answerline, `${answer} ${prior.join(' ')}`.trim());
}
