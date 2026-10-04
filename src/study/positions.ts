import { plainText } from '../api/parser';
import type { SourceItem } from './types';

export interface PositionedSegment {
  text: string; context: string; pool: 'hard' | 'common'; sourceId: string;
  start?: number; totalLength?: number; relativePosition?: number; sentencePosition?: number;
  sentenceId?: string; powerBoundary?: number; questionId?: string; kind?: 'tossup' | 'bonus';
  year?: number; tournament?: string; titles?: string[];
}
export function powerBoundary(html: string, powerWords?: number): { text: string; boundary?: number } {
  const marked = plainText(html), text = marked.replace(/\(\*\)/g, '').replace(/\s+/g, ' ').trim();
  if (Number.isInteger(powerWords) && powerWords! > 0) {
    const words = [...text.matchAll(/\S+/g)];
    return { text, boundary: words[powerWords!]?.index ?? text.length };
  }
  const marker = marked.indexOf('(*)');
  if (marker >= 0) return { text, boundary: marked.slice(0, marker).trimEnd().length };
  const prefix = html.match(/^\s*(?:<(?:b|strong)\b[^>]*>[\s\S]*?<\/(?:b|strong)>\s*[,;:–—-]?\s*)+/i);
  return { text, boundary: prefix ? plainText(prefix[0]).length : undefined };
}
export function sourceYear(source: SourceItem): number | undefined {
  // Updating a database record does not establish the tournament's publication year.
  if (source.year && source.year >= 1900 && source.year <= new Date().getFullYear() + 1) return source.year;
  const year = source.setName.match(/\b(?:19|20)\d{2}\b/);
  return year ? Number(year[0]) : undefined;
}
export function relativeCluePosition(position: number, totalLength: number): number {
  return totalLength > 0 ? Math.max(0, Math.min(1, position / totalLength)) : .5;
}
export function sourceTitles(html: string): string[] {
  const formatted = [...html.matchAll(/<(?:i|em)\b[^>]*>([\s\S]*?)<\/(?:i|em)>/gi)].map(m => plainText(m[1]));
  // Quotation marks also surround dialogue and incidental objects; those remain ordinary entities.
  return [...new Set(formatted.map(t => t.replace(/[.,;!?]+$/, '').trim()).filter(t => t.split(/\s+/).length >= 2 && t.length <= 120))];
}
export function positionedSegments(source: SourceItem): PositionedSegment[] {
  const { text, boundary } = source.kind === 'tossup' ? powerBoundary(source.text, source.powerWords) : { text: plainText(source.text), boundary: undefined };
  const protectedText = text.replace(/\b(?:[A-Z]|Mr|Mrs|Dr|St|Saint)\./g, m => m.replace('.', '\uE000'));
  const breaks = [...protectedText.matchAll(/(?<=[.!?])\s+(?=[A-Z“"[])|(?<=[.!?][”"'])\s+(?=[A-Z“"[])|\s*;\s*/g)];
  const ranges: { start: number; end: number }[] = []; let start = 0;
  for (const match of breaks) { ranges.push({ start, end: match.index! }); start = match.index! + match[0].length; }
  ranges.push({ start, end: text.length });
  const titles = sourceTitles(source.text);
  return ranges.flatMap((range, index) => {
    const raw = text.slice(range.start, range.end), leading = raw.length - raw.trimStart().length;
    const start = range.start + leading, phrase = raw.trim();
    if (phrase.length < 8) return [];
    return [{ text: phrase, context: phrase, pool: boundary !== undefined && start < boundary ? 'hard' as const : 'common' as const,
      sourceId: source.id, questionId: source.questionId, kind: source.kind, year: sourceYear(source), tournament: source.setId || source.setName,
      start, totalLength: text.length, relativePosition: source.kind === 'tossup' ? relativeCluePosition(start, text.length) : undefined,
      sentencePosition: source.kind === 'tossup' ? index / ranges.length : undefined, sentenceId: `${source.id}:${index}`, powerBoundary: boundary, titles }];
  });
}
