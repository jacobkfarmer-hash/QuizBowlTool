import Dexie, { type Table } from 'dexie';
import type { Config, GameState, Session } from '../core/types';
import type { CardAttempt, Deck, Flashcard, SourceCache, StudySession } from '../study/types';
import { pronunciationId, validatePronunciation, type PersonalPronunciation, type Pronunciation } from './pronunciations';
export interface Preset { id: string; name: string; config: Config }
class LocalDB extends Dexie {
  sessions!: Table<Session, string>;
  seen!: Table<{ id: string; kind: 'tossup' | 'bonus'; at: string }, string>;
  settings!: Table<{ key: string; value: unknown }, string>;
  presets!: Table<Preset, string>;
  pronunciations!: Table<PersonalPronunciation, string>;
  decks!: Table<Deck, string>;
  flashcards!: Table<Flashcard, string>;
  studySessions!: Table<StudySession, string>;
  cardAttempts!: Table<CardAttempt, string>;
  studySources!: Table<SourceCache, string>;
  constructor() { super('cadence-quizbowl'); this.version(1).stores({ sessions: 'id,createdAt,completedAt,config.mode', seen: 'id,kind,at', settings: 'key', presets: 'id,name' }); this.version(2).stores({ pronunciations: 'id,canonical,updatedAt' }); this.version(3).stores({ decks: 'id,name,status,updatedAt', flashcards: 'id,deckId,normalizedAnswer,category,subcategory,answerType,generationStatus', studySessions: 'id,deckId,createdAt,completedAt', cardAttempts: 'id,sessionId,cardId,deckId,category,subcategory,answerType,at', studySources: 'key,fetchedAt' }); }
}
export const db = new LocalDB();
export const saveSetting = (key: string, value: unknown) => db.settings.put({ key, value });
export async function readSetting<T>(key: string): Promise<T | undefined> { return (await db.settings.get(key))?.value as T | undefined; }
export async function markSeen(id: string, kind: 'tossup' | 'bonus') { await db.seen.put({ id, kind, at: new Date().toISOString() }); }
let writes = Promise.resolve();
export function saveGame(state: GameState): Promise<void> {
  const snapshot = structuredClone(state);
  writes = writes.catch(() => undefined).then(() => db.transaction('rw', db.settings, db.sessions, async () => { await saveSetting('recovery', snapshot.phase === 'SESSION_COMPLETE' ? null : snapshot); await db.sessions.put(snapshot.session); }));
  return writes;
}
export const flushWrites = () => writes.catch(() => undefined);
export async function savePronunciation(value: Pronunciation, previousId?: string) { validatePronunciation(value); const canonical = value.canonical.normalize('NFC').trim(); const entry = { ...value, canonical, spoken: value.spoken.trim(), id: pronunciationId(canonical, value.caseSensitive), updatedAt: new Date().toISOString() }; await db.transaction('rw', db.pronunciations, async () => { if (previousId && previousId !== entry.id) await db.pronunciations.delete(previousId); await db.pronunciations.put(entry); }); return entry; }
export async function clearAll() { await flushWrites(); const tables = [db.sessions, db.seen, db.settings, db.presets, db.pronunciations, db.decks, db.flashcards, db.studySessions, db.cardAttempts, db.studySources]; await db.transaction('rw', tables, () => Promise.all(tables.map(table => table.clear()))); }
