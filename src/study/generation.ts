import { db } from '../data/db';
import { answerAliases, normalizeAnswer } from './answers';
import { clusterClues, dominantMetadata, formatClue, inferAnswerType, rankClues, segmentClues } from './clues';
import { searchSources } from './sources';
import type { Deck, Flashcard, ImportedTerm, SourceItem } from './types';

export function generateCard(term: ImportedTerm, sources: SourceItem[], existing: Flashcard): Flashcard {
  const concepts = rankClues(clusterClues(sources.flatMap(segmentClues), term.answer));
  const answerType = inferAnswerType(term, sources), metadata = dominantMetadata(sources, term.category);
  const usableIds = new Set(sources.filter(s => segmentClues(s).some(segment => clusterClues([segment], term.answer).length)).map(s => s.id));
  // Related bonus facts can enrich a card, but only direct answer evidence establishes trust.
  const sourceCount = sources.filter(s => !s.related && usableIds.has(s.id)).length;
  const aliases = [...new Set(sources.filter(s => !s.related).flatMap(s => answerAliases(s.answerline)))]
    .filter(a => normalizeAnswer(a) !== normalizeAnswer(term.answer));
  return { ...existing, answer: term.answer, normalizedAnswer: normalizeAnswer(term.answer), answerType, aliases,
    ...metadata, sources, sourceCount, hardClues: concepts.filter(c => c.pool === 'hard'), commonClues: concepts.filter(c => c.pool === 'common'),
    clueText: formatClue(answerType, concepts), generationStatus: !sources.length ? 'no-matches' : sourceCount <= 10 || concepts.length < 5 ? 'insufficient' : 'ready',
    error: undefined, updatedAt: new Date().toISOString() };
}
export function emptyCard(term: ImportedTerm, deckId: string): Flashcard {
  const now = new Date().toISOString();
  return { id: crypto.randomUUID(), deckId, sourceTerm: term.answer, answer: term.answer, normalizedAnswer: normalizeAnswer(term.answer), aliases: [],
    answerType: term.type || 'Answer', clueText: '', hardClues: [], commonClues: [], category: term.category || 'Other', subcategory: '',
    sources: [], sourceCount: 0, generationStatus: 'pending', createdAt: now, updatedAt: now };
}
export async function createDraft(name: string, terms: ImportedTerm[], difficulties: number[], setSize: number): Promise<Deck> {
  if (!name.trim() || !terms.length || !difficulties.length) throw new Error('Add a deck name, terms, and at least one difficulty.');
  const now = new Date().toISOString(), id = crypto.randomUUID();
  const cards = terms.map(term => emptyCard(term, id));
  const deck: Deck = { id, name: name.trim(), sourceTerms: terms, difficulties, setSize, cardOrder: cards.map(c => c.id), status: 'draft', createdAt: now, updatedAt: now };
  await db.transaction('rw', db.decks, db.flashcards, async () => { await db.decks.add(deck); await db.flashcards.bulkAdd(cards); });
  return deck;
}
export interface GenerationProgress { completed: number; total: number; failed: number; answer: string }
export async function generateDeck(deck: Deck, cards: Flashcard[], signal: AbortSignal, onProgress: (p: GenerationProgress) => void, fresh = false) {
  let cursor = 0, completed = 0, failed = 0;
  onProgress({ completed, total: cards.length, failed, answer: '' });
  // Two workers bound queued work. The existing API gate serializes requests at 400ms intervals.
  const worker = async () => {
    while (cursor < cards.length && !signal.aborted) {
      const card = cards[cursor++];
      onProgress({ completed, total: cards.length, failed, answer: card.sourceTerm });
      const term = deck.sourceTerms.find(t => normalizeAnswer(t.answer) === normalizeAnswer(card.sourceTerm)) || { answer: card.sourceTerm };
      try {
        const sources = await searchSources(term.answer, deck.difficulties, signal, fresh);
        signal.throwIfAborted();
        await db.flashcards.put(generateCard(term, sources, card));
      } catch (error) {
        if (signal.aborted) return;
        failed++;
        // A failed regeneration must preserve a usable old card and its historical ID.
        await db.flashcards.put({ ...card, generationStatus: card.clueText ? card.generationStatus : 'error', error: error instanceof Error ? error.message : String(error), updatedAt: new Date().toISOString() });
      }
      completed++;
      onProgress({ completed, total: cards.length, failed, answer: card.sourceTerm });
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  };
  await Promise.all([worker(), worker()]);
  await db.decks.update(deck.id, { updatedAt: new Date().toISOString() });
}
