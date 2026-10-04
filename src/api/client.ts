import { parseBonuses, parseRuling, parseTossups } from './parser';
import type { Difficulty } from '../core/types';
export const API = { base: 'https://www.qbreader.org/api', tossup: '/random-tossup', bonus: '/random-bonus', answer: '/check-answer' };
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
// One in-flight request, at least 400ms between starts: far below the documented 20/sec.
let queue = Promise.resolve(); let lastStart = 0;
export class ApiError extends Error { constructor(message: string, public status = 0) { super(message); } }
export async function request(endpoint: string, params: Record<string, string | number | boolean>): Promise<unknown> {
  let release!: () => void; const previous = queue; queue = new Promise<void>(resolve => { release = resolve; }); await previous;
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      await delay(Math.max(0, 400 - (Date.now() - lastStart))); lastStart = Date.now();
      try {
        const query = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]));
        const response = await fetch(`${API.base}${endpoint}?${query}`, { signal: AbortSignal.timeout(12000) });
        if (!response.ok) throw new ApiError(`QBReader returned ${response.status}.`, response.status);
        return await response.json();
      } catch (error) {
        if (error instanceof ApiError && error.status >= 400 && error.status < 500 && error.status !== 429) throw error;
        if (attempt === 2) throw new ApiError('Internet connection is required to load more QBReader questions. Check your connection and retry.');
        await delay(700 * 2 ** attempt);
      }
    }
  } finally { release(); }
  throw new ApiError('QBReader is unavailable.');
}
export const api = {
  tossups: async (category: string, difficulty: Difficulty) => parseTossups(await request(API.tossup, { categories: category, difficulties: difficulty, standardOnly: true, number: 2 })),
  bonuses: async (difficulty: Difficulty) => parseBonuses(await request(API.bonus, { difficulties: difficulty, standardOnly: true, threePartBonuses: true, number: 2 })),
  check: async (answerline: string, givenAnswer: string) => parseRuling(await request(API.answer, { answerline, givenAnswer }))
};
