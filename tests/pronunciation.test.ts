import { describe, expect, it } from 'vitest';
import { pronunciationPipeline } from '../src/reader/pronunciation';
import { tokenize } from '../src/reader/text';
// Original minimal sentences, intentionally not a packet or question corpus.
export const REGRESSION = [
  ['Greek mythology', 'The hero is Diomedes.', 'The hero is dye oh meedees.'],
  ['Ancient history', 'Read Thucydides.', 'Read thoo siddy deez.'],
  ['European names', 'René Descartes wrote this.', 'ruh nay day cart wrote this.'],
  ['World literature', 'Name Ngũgĩ wa Thiong’o.', 'Name Ngũgĩ wa Thiong’o.'],
  ['Fine arts', 'Dvořák composed this.', 'duh vor zhahk composed this.'],
  ['Science', 'Euler studied this; H2O is water.', 'Euler studied this; H two O is water.'],
  ['Geography', 'Visit Ljubljana.', 'Visit Ljubljana.'],
  ['Religion / philosophy', 'Define Bodhisattva.', 'Define boh dee saht vah.'],
] as const;
describe('deterministic pronunciation regression', () => {
  it.each(REGRESSION)('%s: stable spoken text', (_, input, expected) => { const p = pronunciationPipeline(input); expect(p.spokenText).toBe(expected); expect(p.canonicalDisplayText).toBe(input); });
  it('uses user, built-in, guide, default priority without reading an explicit guide twice', () => {
    const input = 'Diomedes (pronounced "DYE-oh-MEE-deez") fought.';
    expect(pronunciationPipeline(input).spokenText).toBe('dye oh meedees fought.');
    expect(pronunciationPipeline(input, [{ canonical: 'Diomedes', spoken: 'my custom spelling' }]).spokenText).toBe('my custom spelling fought.');
    expect(pronunciationPipeline('Xanthos (pronounced "ZAN-thoss") spoke.').spokenText).toBe('zan thoss spoke.');
  });
  it('detects quoted syllabic guides and pron. labels for names', () => {
    expect(pronunciationPipeline('Aristophanes ("air-iss-TOFF-uh-neez") wrote.').spokenText).toBe('air iss toff uh neez wrote.');
    expect(pronunciationPipeline('René Descartes (pron. "ruh-NAY day-KART") wrote.').spokenText).toBe('ruh nay day cart wrote.');
  });
  it('preserves semantic parentheses and quoted explanations', () => { for (const text of ['A hero (the son of Tydeus) fought.', 'He called it ("a novel").', 'A name ("hero") follows.', 'Policy ("long-term") follows.', 'A slogan ("yes-we-can") appears.', 'The agency ("NASA") follows.', 'This character (also called the king) appears.']) expect(pronunciationPipeline(text).spokenText).toBe(text); });
  it('matches whole Unicode words, NFC accents and longest whole names without cascading', () => {
    const p = pronunciationPipeline('Goethe Johann Wolfgang von Goethe Goethex éGoethe Dvořák.', [{ canonical: 'Dvořák', spoken: 'Goethe' }]);
    expect(p.spokenText).toBe('gerta yo hahn volf gahng fon gerta Goethex éGoethe goethe.');
    expect(pronunciationPipeline('Dvor\u030ca\u0301k').spokenText).toBe('duh vor zhahk');
    expect(pronunciationPipeline('Euler euler', [{ canonical: 'Euler', spoken: 'test', caseSensitive: true }]).spokenText).toBe('test euler');
  });
  it('normalizes notation and keeps the marker silent while preserving source tokens', () => {
    const text = 'Dr. Gauss ("gows") saw Henry VIII. (*) H<sub>2</sub>O: 2+3 = 5; 4^2; 50%.';
    const p = pronunciationPipeline(text); expect(p.spokenText).toBe('Doctor gows saw Henry the eighth. H two O: 2 plus 3 equals 5; 4 squared; 50 percent.'); expect(p.canonicalDisplayText).toContain('(*)');
    expect(p.segments.at(-1)?.end).toBe(tokenize(text).tokens.length);
  });
  it('never splits substitutions, guides or words and avoids tiny final tails', () => {
    const html = `${'A familiar clue has sufficient context for natural reading. '.repeat(8)}Diomedes ("dye-oh-MEE-deez") fought. For 10 points, name him.`;
    const t = tokenize(html), p = pronunciationPipeline(t); expect(p.segments.length).toBeGreaterThan(1);
    for (let i = 0; i < p.segments.length; i++) { const s = p.segments[i]; expect(s.start).toBe(i ? p.segments[i - 1].end : 0); expect(s.text.split(/\s+/).length).toBeGreaterThanOrEqual(8); }
    expect(p.segments.at(-1)?.end).toBe(t.tokens.length); expect(p.segments.filter(s => s.text.includes('mee'))).toHaveLength(1); expect(p.segments.some(s => s.text.includes('For 10 points, name him.'))).toBe(true);
  });
});
