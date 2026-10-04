import { normalizeAnswer } from './answers';
export const STOP = new Set(('a an the this that these those it its his her their he she they who which what whose of in on at to for from by with and or as is are was were be been being has have had not one two three first name identify work works author artist sculptor painter novel play poem country man woman character characters person people also such called about after before when where into out through over under can would will does did during ftpe ftp points following names wrote written named another important famous most very many much something known related described describes associated answer protagonist created several figure').split(' '));
const SYNONYMS: Record<string, string> = {
  thrown: 'throw', throws: 'throw', threw: 'throw', tosses: 'throw', tossed: 'throw', hurled: 'throw', hurls: 'throw', flung: 'throw',
  burning: 'burn', burned: 'burn', burnt: 'burn', fire: 'burn', tears: 'tear', tore: 'tear', grey: 'gray', chinese: 'china', windows: 'window', lanterns: 'lantern',
  transforms: 'transform', transforming: 'transform', transformed: 'transform', turns: 'transform', turning: 'transform', becomes: 'transform', becoming: 'transform',
  pursues: 'pursue', pursuing: 'pursue', chased: 'pursue', chasing: 'pursue', branches: 'tree', laurel: 'tree', trees: 'tree', saint: 'st',
  emerge: 'transform', emerges: 'transform', emerging: 'transform',
  depicts: 'depict', depicting: 'depict', portrayed: 'depict', portrays: 'depict', showing: 'depict', shows: 'depict',
};
export function conceptTokens(text: string): string[] {
  return [...new Set(normalizeAnswer(text).split(' ').filter(t => t.length > 1 && !STOP.has(t) && !/^(?:titled|entitled|sculpture|sculptures|depicts|depicted|shows|showed|titular|title)$/.test(t)).map(t => SYNONYMS[t] || (t.length > 5 ? t.replace(/(?:ing|ed|s)$/, '') : t)))];
}
export function conceptSimilarity(a: string, b: string): number {
  const aa = new Set(conceptTokens(a)), bb = new Set(conceptTokens(b));
  if (!aa.size || !bb.size) return 0;
  const overlap = [...aa].filter(t => bb.has(t)).length;
  return Math.max(overlap / (aa.size + bb.size - overlap), overlap >= 2 ? .8 * overlap / Math.min(aa.size, bb.size) : 0);
}
export const escapePattern = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export function entityNames(text: string): string[] {
  return [...text.matchAll(/\b[A-Z][\p{L}’'-]+(?:\s+(?:[A-Z][\p{L}’'-]+|(?:(?:of|the|on|and|de|van|a|an)\s+){1,3}[A-Z][\p{L}’'-]+)){1,7}/gu)]
    .map(m => m[0]).filter(s => conceptTokens(s).length >= 2);
}
