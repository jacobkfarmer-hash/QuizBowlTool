export interface ImportedTerm { answer: string; category?: string; type?: string }
export type GenerationStatus = 'pending' | 'ready' | 'insufficient' | 'no-matches' | 'error';
export interface Deck {
  id: string; name: string; createdAt: string; updatedAt: string;
  sourceTerms: ImportedTerm[]; difficulties: number[]; setSize: number; cardOrder: string[];
  status: 'draft' | 'saved';
}
export interface SourceItem {
  id: string; questionId: string; kind: 'tossup' | 'bonus'; text: string;
  answerline: string; category: string; subcategory: string; difficulty: number;
  setName: string; packetName: string; part?: number; related?: boolean; powerWords?: number;
}
export interface ClueConcept {
  text: string; pool: 'hard' | 'common'; sourceIds: string[];
  frequency: number; powerFrequency: number; score: number;
}
export interface Flashcard {
  id: string; deckId: string; sourceTerm: string; answer: string; normalizedAnswer: string;
  aliases: string[]; answerType: string; clueText: string; hardClues: ClueConcept[]; commonClues: ClueConcept[];
  category: string; subcategory: string; sources: SourceItem[]; sourceCount: number;
  generationStatus: GenerationStatus; error?: string; createdAt: string; updatedAt: string;
}
export interface SourceCache { key: string; fetchedAt: string; items: SourceItem[] }
export interface CardAttempt {
  id: string; sessionId: string; cardId: string; deckId: string;
  category: string; subcategory: string; answerType: string; answer: string; givenAnswer: string;
  appearance: number; correct: boolean; at: string;
}
export interface StudyAppearance { cardId: string; attempts: number; correct: boolean }
export interface StudySession {
  id: string; label: string; deckId?: string; cardIds: string[]; createdAt: string; completedAt?: string;
  appearances: StudyAppearance[]; position: number; abandonedAt?: string;
}
export interface PracticeSpec {
  label: string; cards: Flashcard[]; deckId?: string; next?: PracticeSpec;
  random?: { count: number; filters: StudyFilters };
}
export interface StudyFilters { deckId?: string; category?: string; subcategory?: string; answerType?: string }
