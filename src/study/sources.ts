import { request } from '../api/client';
import { parseBonuses, parseTossups, plainText } from '../api/parser';
import { db } from '../data/db';
import { normalizeAnswer, targetsAnswer } from './answers';
import type { SourceItem } from './types';

function list(data: unknown, key: string): unknown[] {
  if (!data || typeof data !== 'object') throw new Error('Parsing failure: invalid QBReader search response.');
  const group = (data as Record<string, unknown>)[key];
  if (Array.isArray(group)) return group;
  if (group && typeof group === 'object' && Array.isArray((group as Record<string, unknown>).questionArray)) return (group as { questionArray: unknown[] }).questionArray;
  throw new Error(`Parsing failure: QBReader search is missing ${key}.`);
}
export function extractSources(data: unknown, target: string, relatedOnly = false): SourceItem[] {
  const result: SourceItem[] = [];
  if (!relatedOnly) for (const raw of list(data, 'tossups')) {
    const q = parseTossups({ tossups: [raw] })[0];
    if (!targetsAnswer(q.answer, target)) continue;
    const structural = (raw as Record<string, unknown>).powerWords;
    result.push({ id: `tossup:${q._id}`, questionId: q._id, kind: 'tossup', text: q.question, answerline: q.answer,
      category: q.category, subcategory: q.subcategory, difficulty: q.difficulty, setName: q.set.name, packetName: q.packet.name,
      powerWords: typeof structural === 'number' ? structural : undefined });
  }
  for (const raw of list(data, 'bonuses')) {
    const q = parseBonuses({ bonuses: [raw] })[0];
    for (let part = 0; part < q.parts.length; part++) {
      const direct = targetsAnswer(q.answers[part], target);
      const mentions = normalizeAnswer(plainText(q.parts[part])).includes(normalizeAnswer(target));
      // A related part must itself name the target. Never attach arbitrary sibling parts.
      if ((!relatedOnly && !direct) || (relatedOnly && (direct || !mentions))) continue;
      const answer = plainText(q.answers[part]).split(/[[(]/)[0].trim();
      const text = direct ? q.parts[part] : `${q.parts[part]} Associated answer: ${answer}.`;
      result.push({ id: `bonus:${q._id}:${part}`, questionId: q._id, kind: 'bonus', text, answerline: q.answers[part],
        category: q.category, subcategory: q.subcategory, difficulty: q.difficulty, setName: q.set.name, packetName: q.packet.name, part, related: !direct });
    }
  }
  return result;
}
export async function searchSources(target: string, difficulties: number[], signal?: AbortSignal, fresh = false): Promise<SourceItem[]> {
  const key = `${normalizeAnswer(target)}|${[...difficulties].sort((a, b) => a - b).join(',')}|v1`;
  const cached = await db.studySources.get(key);
  if (!fresh && cached && Date.now() - Date.parse(cached.fetchedAt) < 30 * 86400000) return cached.items;
  signal?.throwIfAborted();
  const params = { queryString: target.replace(/^(?:a|an|the)\s+/i, ''), difficulties: difficulties.join(','), exactPhrase: true, maxReturnLength: 80, randomize: false };
  const data = await request('/query', { ...params, searchType: 'answer', questionType: 'all' }, { signal, descriptiveErrors: true });
  const items = extractSources(data, target);
  // Supplemental bonuses are optional: direct evidence survives a failed supplemental query.
  try {
    const bonuses = await request('/query', { ...params, searchType: 'question', questionType: 'bonus', maxReturnLength: 25 }, { signal, descriptiveErrors: true });
    items.push(...extractSources(bonuses, target, true));
  } catch (error) { if (signal?.aborted) throw error; }
  const unique = [...new Map(items.map(item => [item.id, item])).values()];
  signal?.throwIfAborted();
  await db.studySources.put({ key, items: unique, fetchedAt: new Date().toISOString() });
  return unique;
}
