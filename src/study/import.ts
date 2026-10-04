import { normalizeAnswer } from './answers';
import type { ImportedTerm } from './types';

function csvRows(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') { cell += '"'; i++; }
      else if (quoted || !cell.trim()) quoted = !quoted;
      else cell += c;
    } else if (c === ',' && !quoted) { row.push(cell.trim()); cell = ''; }
    else if ((c === '\n' || c === '\r') && !quoted) {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell.trim()); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (quoted) throw new Error('CSV has an unclosed quoted field.');
  row.push(cell.trim()); rows.push(row); return rows;
}
export function importTerms(text: string, format: 'txt' | 'csv' = 'txt'): ImportedTerm[] {
  if (text.length > 4 * 1024 * 1024) throw new Error('Choose a term list under 4 MB.');
  text = text.replace(/^\uFEFF/, '');
  let terms: ImportedTerm[];
  if (format === 'csv') {
    const rows = csvRows(text).filter(row => row.some(Boolean));
    if (!rows.length) return [];
    const headers = rows[0].map(s => s.toLowerCase());
    const hasHeader = headers.includes('answer'), answer = hasHeader ? headers.indexOf('answer') : 0;
    const category = hasHeader ? headers.indexOf('category') : -1, type = hasHeader ? headers.indexOf('type') : -1;
    terms = rows.slice(hasHeader ? 1 : 0).map(row => ({ answer: row[answer] || '', category: category >= 0 ? row[category] : undefined, type: type >= 0 ? row[type] : undefined }));
  } else terms = text.split(/\r?\n/).map(answer => ({ answer: answer.trim() }));
  const seen = new Set<string>();
  return terms.filter(term => {
    const key = normalizeAnswer(term.answer);
    if (!key || seen.has(key)) return false;
    if (term.answer.length > 500) throw new Error('One answer exceeds 500 characters. Check the input format.');
    seen.add(key); return true;
  });
}
