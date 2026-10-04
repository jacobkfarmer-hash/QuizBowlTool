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
  year?: number; setId?: string; updatedAt?: string;
}
export interface ClueOccurrence {
  sourceId: string; questionId: string; kind: 'tossup' | 'bonus'; tournament: string;
  year?: number; relativePosition?: number; sentencePosition?: number;
  inPower: boolean; anchor: string; context: string; position: number; sentenceId: string;
  associatedTitle?: string;
}
export interface ClueDiagnostics {
  independentQuestionCount: number; rawOccurrenceCount: number; powerOccurrenceCount: number;
  powerRate: number; weightedPowerOccurrences: number; recentOccurrenceCount: number;
  recentEarlyOccurrenceCount: number; recentEarlyPowerOccurrenceCount: number;
  averageRelativePosition?: number; weightedAverageRelativePosition?: number; averageSentencePosition?: number;
  newestAppearanceYear?: number; oldestAppearanceYear?: number; numberOfDistinctYears: number;
  numberOfDistinctTournaments: number; distinctivenessScore: number; genericnessPenalty: number;
  staleCluePenalty: number; finalHardScore: number; finalCommonScore: number;
}
export interface ClueConcept {
  text: string; pool: 'hard' | 'common'; sourceIds: string[];
  frequency: number; powerFrequency: number; score: number;
  anchor?: string; occurrences?: ClueOccurrence[]; diagnostics?: ClueDiagnostics;
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
