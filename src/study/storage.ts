import { db } from '../data/db';
import { normalizeAnswer } from './answers';
import { recordAppearance } from './practice';
import type { CardAttempt, Deck, Flashcard, PracticeSpec, StudySession } from './types';
export async function deckCards(deck: Deck): Promise<Flashcard[]> {
  const cards = await db.flashcards.bulkGet(deck.cardOrder); return cards.filter((c): c is Flashcard => !!c);
}
export async function saveDeck(deck: Deck) { await db.decks.put({ ...deck, status: 'saved', updatedAt: new Date().toISOString() }); }
export async function editCard(card: Flashcard) {
  if (!card.answer.trim() || !card.answerType.trim() || !card.clueText.trim()) throw new Error('Answer, answer type, and clue text are required.');
  const body = card.clueText.replace(/^[^:]{1,60}:\s*/, '');
  await db.flashcards.put({ ...card, answer: card.answer.trim(), normalizedAnswer: normalizeAnswer(card.answer), clueText: `${card.answerType.trim().replace(/:$/, '')}: ${body}`, updatedAt: new Date().toISOString(), error: undefined, generationStatus: card.sourceCount > 10 ? 'ready' : 'insufficient' });
}
export async function removeCard(deck: Deck, id: string): Promise<Deck> {
  const next = { ...deck, cardOrder: deck.cardOrder.filter(c => c !== id), updatedAt: new Date().toISOString() };
  await db.transaction('rw', db.decks, db.flashcards, async () => { await db.flashcards.delete(id); await db.decks.put(next); }); return next;
}
export async function deleteDeck(id: string) {
  // Historical attempts contain category/type/answer snapshots and survive deletion.
  await db.transaction('rw', db.decks, db.flashcards, async () => { await db.flashcards.where('deckId').equals(id).delete(); await db.decks.delete(id); });
}
export function newStudySession(spec: PracticeSpec): StudySession {
  return { id: crypto.randomUUID(), label: spec.label, deckId: spec.deckId, cardIds: spec.cards.map(c => c.id), createdAt: new Date().toISOString(), appearances: spec.cards.map(c => ({ cardId: c.id, attempts: 0, correct: false })), position: 0 };
}
export async function submitAttempt(session: StudySession, card: Flashcard, givenAnswer: string, correct: boolean): Promise<StudySession> {
  const current = session.appearances[session.position];
  if (!current || current.correct || current.cardId !== card.id) throw new Error('This card has already been completed.');
  const appearance = recordAppearance(current, correct), now = new Date().toISOString();
  const next: StudySession = { ...session, appearances: session.appearances.map((a, i) => i === session.position ? appearance : a) };
  const attempt: CardAttempt = { id: crypto.randomUUID(), sessionId: session.id, cardId: card.id, deckId: card.deckId,
    category: card.category, subcategory: card.subcategory, answerType: card.answerType, answer: card.answer, givenAnswer,
    appearance: session.position, correct, at: now };
  await db.transaction('rw', db.studySessions, db.cardAttempts, async () => { await db.cardAttempts.add(attempt); await db.studySessions.put(next); });
  return next;
}
export async function advanceStudy(session: StudySession): Promise<StudySession> {
  if (!session.appearances[session.position]?.correct) return session;
  const position = session.position + 1;
  const next = { ...session, position, completedAt: position === session.cardIds.length ? new Date().toISOString() : undefined };
  await db.studySessions.put(next); return next;
}
