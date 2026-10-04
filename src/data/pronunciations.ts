export interface Pronunciation { canonical: string; spoken: string; caseSensitive?: boolean; notes?: string }
export interface PersonalPronunciation extends Pronunciation { id: string; updatedAt: string }
// English moderator respellings, not claims about the only valid native pronunciation.
export const PRONUNCIATIONS: Pronunciation[] = [
  { canonical: 'Diomedes', spoken: 'dye oh meedees', notes: 'Measured four-syllable English approximation; avoids spelled-out MEE initials.' },
  { canonical: 'Thucydides', spoken: 'thoo siddy deez', notes: 'Measured output retains four syllables; isolated ih was incorrectly read as eye.' },
  { canonical: 'René Descartes', spoken: 'ruh nay day cart', notes: 'English moderator approximation; avoids sounding the final s in Descartes.' },
  { canonical: 'Johann Wolfgang von Goethe', spoken: 'yo hahn volf gahng fon gerta' },
  { canonical: 'Goethe', spoken: 'gerta', notes: 'Measured English approximation replaces the incorrect goath output.' },
  { canonical: 'Dvořák', spoken: 'duh vor zhahk', notes: 'Retains the zh consonant and long ah vowel.' },
  { canonical: 'Bodhisattva', spoken: 'boh dee saht vah' },
];
// eSpeak can spell ALL-CAPS syllables as initials. Stress is left to context.
export const spokenSpelling = (text: string) => text.normalize('NFC').toLocaleLowerCase('en-US').replace(/(?<=[\p{L}\p{M}])-(?=[\p{L}\p{M}])/gu, ' ').replace(/\s+/g, ' ').trim();
export const pronunciationId = (canonical: string, caseSensitive = false) => `${caseSensitive ? 'exact' : 'fold'}:${caseSensitive ? canonical.normalize('NFC').trim() : canonical.normalize('NFC').trim().toLocaleLowerCase('en-US')}`;
export function validatePronunciation(value: Pronunciation): void {
  for (const text of [value.canonical, value.spoken]) if (typeof text !== 'string' || !text.trim() || text.length > 160 || (/[<>]/u.test(text) || Array.from(text).some(c => c.charCodeAt(0) < 32))) throw new Error('Enter a word/name and a plain-text spoken spelling, each under 160 characters.');
  if (value.caseSensitive !== undefined && typeof value.caseSensitive !== 'boolean') throw new Error('Invalid case-sensitivity setting.');
  if (value.notes !== undefined && (typeof value.notes !== 'string' || value.notes.length > 500)) throw new Error('Notes must be under 500 characters.');
}
