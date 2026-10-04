import type { AnswerEvent, Bonus, BonusAttempt, Buzz, Config, Difficulty, Draw, GameState, Ruling, Session, Tossup } from './types';
import { tossupScore, bonusScore } from './scoring';
import { tokenize } from '../reader/text';
export type Action =
 | { type: 'LOAD'; question: Tossup; draw: Draw; generation: number }
 | { type: 'PROGRESS'; tokens: number; elapsedMs: number; ended: boolean }
 | { type: 'PAUSE' }
 | { type: 'BUZZ'; tokens: number; elapsedMs: number; durationMs?: number }
 | { type: 'CHECK' }
 | { type: 'RULING'; ruling: Ruling; answer: string }
 | { type: 'GIVE_UP' }
 | { type: 'RESUME_NEG' }
 | { type: 'OVERRIDE'; accepted: boolean }
 | { type: 'UNDO' }
 | { type: 'NEXT' }
 | { type: 'REQUEST_BONUS' }
 | { type: 'BONUS_LOAD'; question: Bonus; difficulty: Difficulty; generation: number }
 | { type: 'BONUS_NEXT' }
 | { type: 'BONUS_CHECK' }
 | { type: 'BONUS_RULING'; ruling: Ruling; answer: string }
 | { type: 'BONUS_OVERRIDE'; correct: boolean }
 | { type: 'ERROR'; message: string }
 | { type: 'RETRY' }
 | { type: 'READER_SYSTEM' };
export function newGame(config: Config): GameState { const session: Session = { id: crypto.randomUUID(), createdAt: new Date().toISOString(), config: structuredClone(config), attempts: [], bonuses: [] }; return { phase: 'LOADING_TOSSUP', session, number: 1, tokens: 0, elapsedMs: 0, ended: false, locked: false, paused: false, currentEvents: [], part: 0, bonusParts: [], generation: 1 }; }
export const lastEvent = (s: GameState) => s.currentEvents.at(-1);
export const converted = (s: GameState) => s.currentEvents.some(e => e.accepted);
export const canResume = (s: GameState) => s.phase === 'TOSSUP_RESOLVED' && !converted(s) && !!lastEvent(s) && !lastEvent(s)!.buzz.ended && s.session.config.resume && !s.ended;
function persistAttempt(s: GameState, noBuzz = false): GameState {
  if (!s.question || !s.draw) return s;
  const attempt = { id: `${s.session.id}/${s.number}`, sessionId: s.session.id, questionId: s.question._id, mode: s.session.config.mode, number: s.number, totalTossups: s.session.config.count, draw: s.draw, question: s.question, events: s.currentEvents, noBuzz, createdAt: new Date().toISOString() };
  return { ...s, session: { ...s.session, attempts: [...s.session.attempts.filter(a => a.number !== s.number), attempt] } };
}
function persistBonus(s: GameState): GameState { if (!s.bonus || !s.bonusDifficulty) return s; const b: BonusAttempt = { id: `${s.session.id}/bonus/${s.number}`, sessionId: s.session.id, tossupNumber: s.number, difficulty: s.bonusDifficulty, question: s.bonus, parts: s.bonusParts }; return { ...s, session: { ...s.session, bonuses: [...s.session.bonuses.filter(b => b.tossupNumber !== s.number), b] } }; }
export function gameReducer(s: GameState, a: Action): GameState {
  switch (a.type) {
    case 'LOAD': return s.phase === 'LOADING_TOSSUP' && a.generation === s.generation ? { ...s, phase: 'READING_TOSSUP', question: a.question, draw: a.draw } : s;
    case 'PROGRESS': {
      if (s.phase !== 'READING_TOSSUP' || s.paused) return s;
      if (s.tokens === a.tokens && s.ended === a.ended && Math.abs(a.elapsedMs - s.elapsedMs) < 250) return s;
      const next = { ...s, tokens: Math.max(s.tokens, a.tokens), elapsedMs: a.elapsedMs, ended: a.ended };
      return a.ended && s.locked ? persistAttempt({ ...next, phase: 'TOSSUP_RESOLVED' }) : next;
    }
    case 'PAUSE': return s.phase === 'READING_TOSSUP' ? { ...s, paused: !s.paused } : s;
    case 'BUZZ': {
      if (s.phase !== 'READING_TOSSUP' || s.locked || (!s.session.config.interrupts && !s.ended) || !s.question) return s;
      const t = tokenize(s.question.question); const buzz: Buzz = { words: a.tokens, total: t.tokens.length, elapsedMs: a.elapsedMs, durationMs: a.durationMs, inPower: t.powerBoundary !== null && a.tokens <= t.powerBoundary, ended: s.ended || a.tokens >= t.tokens.length };
      return { ...s, phase: 'BUZZED', buzz, tokens: a.tokens, elapsedMs: a.elapsedMs, paused: false, prompt: undefined, pendingAnswers: [] };
    }
    case 'CHECK': return ['BUZZED', 'PROMPTED'].includes(s.phase) ? { ...s, phase: 'CHECKING' } : s;
    case 'RULING': {
      if (s.phase !== 'CHECKING' || !s.buzz) return s;
      if (a.ruling.directive === 'prompt') return { ...s, phase: 'PROMPTED', prompt: a.ruling.directedPrompt || 'Please be more specific.', pendingAnswers: [...(s.pendingAnswers ?? []), a.answer] };
      const accepted = a.ruling.directive === 'accept';
      const event: AnswerEvent = { id: crypto.randomUUID(), userAnswer: a.answer, accepted, ...tossupScore(accepted, s.buzz, s.session.config), buzz: s.buzz, overridden: false, at: new Date().toISOString() };
      return persistAttempt({ ...s, phase: 'TOSSUP_RESOLVED', currentEvents: [...s.currentEvents, event], prompt: undefined, pendingAnswers: [] });
    }
    case 'GIVE_UP': if (!['READING_TOSSUP', 'BUZZED', 'PROMPTED'].includes(s.phase)) return s; return persistAttempt({ ...s, phase: 'TOSSUP_RESOLVED', ended: true }, s.currentEvents.length === 0);
    case 'RESUME_NEG': return canResume(s) ? { ...s, phase: 'READING_TOSSUP', locked: !s.session.config.rebuzz, paused: false } : s;
    case 'OVERRIDE': {
      if (s.phase !== 'TOSSUP_RESOLVED' || !lastEvent(s)) return s;
      const old = lastEvent(s)!; const event = { ...old, accepted: a.accepted, ...tossupScore(a.accepted, old.buzz, s.session.config), overridden: true };
      return persistAttempt({ ...s, currentEvents: [...s.currentEvents.slice(0, -1), event] });
    }
    case 'UNDO': {
      if (s.phase !== 'TOSSUP_RESOLVED' || !lastEvent(s)) return s;
      const events = s.currentEvents.slice(0, -1);
      const session = { ...s.session, attempts: s.session.attempts.filter(at => at.number !== s.number) };
      const next: GameState = { ...s, session, currentEvents: events, phase: 'BUZZED', buzz: lastEvent(s)!.buzz, tokens: lastEvent(s)!.buzz.words, ended: lastEvent(s)!.buzz.ended, locked: false };
      return events.length ? persistAttempt(next) : next;
    }
    case 'NEXT': {
      if (!['TOSSUP_RESOLVED', 'BONUS_RESOLVED'].includes(s.phase) || canResume(s) || (s.phase === 'TOSSUP_RESOLVED' && converted(s) && s.session.config.bonuses)) return s;
      if (s.number >= s.session.config.count) return { ...s, phase: 'SESSION_COMPLETE', session: { ...s.session, completedAt: new Date().toISOString() } };
      return { ...s, phase: 'LOADING_TOSSUP', number: s.number + 1, tokens: 0, elapsedMs: 0, ended: false, locked: false, paused: false, question: undefined, draw: undefined, buzz: undefined, currentEvents: [], bonus: undefined, bonusParts: [], part: 0, generation: s.generation + 1 };
    }
    case 'REQUEST_BONUS': return s.phase === 'TOSSUP_RESOLVED' && converted(s) && s.session.config.bonuses ? { ...s, phase: 'LOADING_BONUS', generation: s.generation + 1 } : s;
    case 'BONUS_LOAD': return s.phase === 'LOADING_BONUS' && s.generation === a.generation ? persistBonus({ ...s, phase: 'BONUS_LEADIN', bonus: a.question, bonusDifficulty: a.difficulty, part: 0, bonusParts: [] }) : s;
    case 'BONUS_NEXT': {
      if (!s.bonus) return s;
      if (s.phase === 'BONUS_LEADIN') return { ...s, phase: 'BONUS_PART', generation: s.generation + 1 };
      if (s.phase !== 'BONUS_PART_RESOLVED') return s;
      return s.part + 1 >= s.bonus.parts.length ? persistBonus({ ...s, phase: 'BONUS_RESOLVED' }) : { ...s, phase: 'BONUS_PART', part: s.part + 1, prompt: undefined, pendingAnswers: [], generation: s.generation + 1 };
    }
    case 'BONUS_CHECK': return ['BONUS_PART', 'BONUS_PROMPTED'].includes(s.phase) ? { ...s, phase: 'BONUS_CHECKING' } : s;
    case 'BONUS_RULING': {
      if (s.phase !== 'BONUS_CHECKING' || !s.bonus) return s;
      if (a.ruling.directive === 'prompt') return { ...s, phase: 'BONUS_PROMPTED', prompt: a.ruling.directedPrompt || 'Please be more specific.', pendingAnswers: [...(s.pendingAnswers ?? []), a.answer] };
      const correct = a.ruling.directive === 'accept'; const part = { part: s.part, userAnswer: a.answer, correct, points: bonusScore(correct, s.session.config, s.bonus.values?.[s.part]), overridden: false };
      return persistBonus({ ...s, phase: 'BONUS_PART_RESOLVED', bonusParts: [...s.bonusParts, part], prompt: undefined, pendingAnswers: [] });
    }
    case 'BONUS_OVERRIDE': {
      if (s.phase !== 'BONUS_PART_RESOLVED' || !s.bonus) return s;
      return persistBonus({ ...s, bonusParts: s.bonusParts.map(p => p.part === s.part ? { ...p, correct: a.correct, points: bonusScore(a.correct, s.session.config, s.bonus!.values?.[s.part]), overridden: true } : p) });
    }
    case 'ERROR': return { ...s, phase: 'ERROR', recoverPhase: s.phase, error: a.message };
    case 'RETRY': return s.phase === 'ERROR' ? { ...s, phase: s.recoverPhase === 'CHECKING' ? 'BUZZED' : s.recoverPhase === 'BONUS_CHECKING' ? 'BONUS_PART' : s.recoverPhase ?? 'LOADING_TOSSUP', error: undefined, generation: s.generation + 1 } : s;
    case 'READER_SYSTEM': return { ...s, session: { ...s.session, config: { ...s.session.config, engine: 'system', presentation: 'both' } }, generation: s.generation + 1 };
  }
}
