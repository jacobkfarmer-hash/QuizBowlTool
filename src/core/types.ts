export type Difficulty = 2 | 3 | 4;
export type Mode = 'practice' | 'match';
export type Group = 'Science & Math' | 'History' | 'Literature' | 'Geography' | 'Fine Arts' | 'Pop Culture & Sports' | 'Social Science' | 'Mythology' | 'Philosophy & Theology';
export interface Question { _id: string; category: string; subcategory: string; alternate_subcategory?: string; difficulty: number; number: number; packet: { _id: string; name: string; number: number }; set: { _id: string; name: string; year: number; standard: boolean }; updatedAt: string }
export interface Tossup extends Question { question: string; question_sanitized: string; answer: string; answer_sanitized: string }
export interface Bonus extends Question { leadin: string; leadin_sanitized: string; parts: string[]; parts_sanitized: string[]; answers: string[]; answers_sanitized: string[]; values?: number[] }
export interface Ruling { directive: 'accept' | 'reject' | 'prompt'; directedPrompt?: string | null }
export interface Scores { power: number; ten: number; neg: number; endWrong: number; bonus: number }
export interface Config { mode: Mode; count: number; bonuses: boolean; scoring: boolean; powers: boolean; interrupts: boolean; negs: boolean; resume: boolean; rebuzz: boolean; avoidSeen: boolean; presentation: 'text' | 'audio' | 'both'; engine: 'auto' | 'kokoro' | 'system'; voice: string; speed: number; wpm: number; categories: Record<Group, number>; difficulties: Record<Difficulty, number>; scores: Scores }
export interface Draw { group: Group; category: string; difficulty: Difficulty }
export type Outcome = 'power' | 'ten' | 'neg' | 'incorrect_no_penalty' | 'no_buzz';
export interface Buzz { words: number; total: number; elapsedMs: number; durationMs?: number; inPower: boolean; ended: boolean }
export interface AnswerEvent { id: string; userAnswer: string; accepted: boolean; result: Outcome; points: number; buzz: Buzz; overridden: boolean; at: string }
export interface Attempt { id: string; sessionId: string; questionId: string; mode: Mode; number: number; totalTossups: number; draw: Draw; question: Tossup; events: AnswerEvent[]; noBuzz: boolean; createdAt: string }
export interface BonusPartAttempt { part: number; userAnswer: string; correct: boolean; points: number; overridden: boolean }
export interface BonusAttempt { id: string; sessionId: string; tossupNumber: number; difficulty: Difficulty; question: Bonus; parts: BonusPartAttempt[] }
export interface Session { id: string; createdAt: string; completedAt?: string; config: Config; attempts: Attempt[]; bonuses: BonusAttempt[] }
export type Phase = 'LOADING_TOSSUP' | 'READING_TOSSUP' | 'BUZZED' | 'CHECKING' | 'PROMPTED' | 'TOSSUP_RESOLVED' | 'LOADING_BONUS' | 'BONUS_LEADIN' | 'BONUS_PART' | 'BONUS_CHECKING' | 'BONUS_PROMPTED' | 'BONUS_PART_RESOLVED' | 'BONUS_RESOLVED' | 'SESSION_COMPLETE' | 'ERROR';
export interface GameState { phase: Phase; session: Session; number: number; question?: Tossup; draw?: Draw; tokens: number; elapsedMs: number; ended: boolean; locked: boolean; paused: boolean; buzz?: Buzz; currentEvents: AnswerEvent[]; bonus?: Bonus; bonusDifficulty?: Difficulty; part: number; bonusParts: BonusPartAttempt[]; prompt?: string; pendingAnswers?: string[]; error?: string; recoverPhase?: Phase; generation: number }
