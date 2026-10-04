import { pronunciationPipeline } from "./pronunciation";
import { plainText, safeHTML } from '../api/parser';
export interface DisplayToken { text: string; html: string }
export interface Tokenized { fullDisplayText: string; tokens: DisplayToken[]; powerBoundary: number | null }
export interface SpeechSegment { text: string; start: number; end: number; weights: number[] }
export function tokenize(html: string): Tokenized {
  const root = document.createElement('div'); root.innerHTML = safeHTML(html);
  const tokens: DisplayToken[] = []; let boundary: number | null = null;
  let pendingText = '', pendingHTML = '';
  const flush = () => { if (pendingText) tokens.push({ text: pendingText, html: pendingHTML }); pendingText = ''; pendingHTML = ''; };
  function walk(node: Node, tags: string[]) {
    if (node.nodeType === Node.TEXT_NODE) {
      for (const text of (node.textContent ?? '').replace(/\(\*\)/g, ' (*) ').match(/\s+|\S+/g) ?? []) {
        if (/^\s+$/.test(text)) { flush(); continue; }
        if (text === '(*)') { flush(); boundary = tokens.length; continue; }
        const span = document.createElement('span'); span.textContent = text;
        pendingText += text;
        pendingHTML += tags.map(t => `<${t}>`).join('') + span.innerHTML + [...tags].reverse().map(t => `</${t}>`).join('');
      }
    } else { const el = node as Element; const tag = el.tagName?.toLowerCase(); if (tag === 'br') { flush(); return; } const next = tag && ['b', 'u', 'i', 'em', 'strong', 'sub', 'sup'].includes(tag) ? [...tags, tag] : tags; for (const child of node.childNodes) walk(child, next); }
  }
  walk(root, []); flush();
  return { fullDisplayText: plainText(html), tokens, powerBoundary: boundary };
}
export const preprocessSpeech = (input: string) => pronunciationPipeline(input).spokenText;
export const tokenWeight = (text: string) => 1 + Math.min(text.length, 14) / 18 + (/[.!?][”"')]*$/.test(text) ? 1.4 : /[,;:][”"')]*$/.test(text) ? .65 : 0);
export const speechSegments = (t: Tokenized) => pronunciationPipeline(t).segments;
export function timeline(weights: number[], durationMs: number): number[] { const sum = weights.reduce((a, b) => a + b, 0); let acc = 0; return weights.map(w => { acc += w; return durationMs * acc / sum; }); }
export function textTimeline(t: Tokenized, wpm: number): number[] { return timeline(t.tokens.map(t => tokenWeight(t.text)), t.tokens.length * 60000 / wpm); }
export function reached(times: number[], ms: number): number { let lo = 0, hi = times.length; while (lo < hi) { const mid = (lo + hi) >>> 1; if (times[mid] <= ms) lo = mid + 1; else hi = mid; } return lo; }
