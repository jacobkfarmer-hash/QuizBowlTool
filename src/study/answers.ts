import { api } from '../api/client';
import { plainText } from '../api/parser';

export function normalizeAnswer(value: string): string {
  return value.normalize('NFKD').replace(/\p{M}/gu, '').replace(/\b(?:\p{L}\.){2,}/gu, acronym => acronym.replace(/\./g, '')).toLowerCase()
    .replace(/&/g, ' and ').replace(/[’']/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim().replace(/^(?:a|an|the)\s+/, '').replace(/\s+/g, ' ');
}
export function answerAliases(answerline: string): string[] {
  const text = plainText(answerline);
  const main = text.split(/[[(]/)[0].trim();
  const accepted = text.split(/[;[\]()]/).slice(1)
    .filter(part => /^\s*(?:accept|or)\s+/i.test(part) && !/\b(?:before|until|after)\b/i.test(part))
    .flatMap(part => part.replace(/^\s*(?:accept|or)\s+/i, '').replace(/\b(?:before|until|after|but|do not|prompt on)\b.*$/i, '').split(/\s+or\s+/i))
    .map(part => part.trim());
  return [...new Set([main, ...accepted].filter(Boolean))];
}
export function targetsAnswer(answerline: string, target: string): boolean {
  const normalized = normalizeAnswer(target);
  return !!normalized && answerAliases(answerline).some(alias => normalizeAnswer(alias) === normalized);
}
export function localAnswerMatch(given: string, answer: string, aliases: string[] = []): boolean {
  const value = normalizeAnswer(given);
  if (!value) return false;
  return [answer, ...aliases].some(expected => {
    const full = normalizeAnswer(expected);
    if (value === full) return true;
    // Omit a subtitle, but never accept an arbitrary one-word fragment or surname.
    const title = normalizeAnswer(expected.split(/[:—]/)[0]);
    return title !== full && title.split(' ').length >= 2 && value === title;
  });
}
export async function checkStudyAnswer(given: string, answer: string, aliases: string[]) {
  if (localAnswerMatch(given, answer, aliases)) return { correct: true };
  if (!normalizeAnswer(given)) return { correct: false };
  // A curated answerline includes only the target and its accepted aliases.
  const line = `${answer}${aliases.length ? ` [accept ${aliases.join('; accept ')}]` : ''}`;
  try {
    const result = await api.check(line, given);
    return { correct: result.directive === 'accept', prompt: result.directive === 'prompt' ? result.directedPrompt || 'Be more specific.' : undefined };
  } catch {
    return { correct: false, warning: 'QBReader answer checking is unavailable. The full answer and saved aliases still work locally.' };
  }
}
