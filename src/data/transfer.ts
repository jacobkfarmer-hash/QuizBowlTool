import type { Attempt, BonusAttempt, Config, Session } from '../core/types';
import { GROUPS, DIFFICULTIES, validateConfig } from '../core/config';
import { parseBonuses, parseTossups } from '../api/parser';
import { db, flushWrites, type Preset } from './db';
import { pronunciationId, validatePronunciation, type PersonalPronunciation } from './pronunciations';

export interface Backup { format: 'cadence-data'; version: 1; exportedAt: string; sessions: Session[]; presets: Preset[]; pronunciations: PersonalPronunciation[]; settings: { key: 'config' | 'theme'; value: unknown }[]; seen: { id: string; kind: 'tossup' | 'bonus'; at: string }[] }
const fail = (): never => { throw new Error('Invalid Cadence backup. Nothing was imported.'); };
const obj = (x: unknown): Record<string, unknown> => x !== null && typeof x === 'object' && !Array.isArray(x) ? x as Record<string, unknown> : fail();
const str = (x: unknown, max = 20000): string => typeof x === 'string' && x.length <= max ? x : fail();
const id = (x: unknown) => { const s = str(x, 250); return s.length ? s : fail(); };
const date = (x: unknown): string => { const s = str(x, 40); return /^\d{4}-\d\d-\d\dT/.test(s) && Number.isFinite(Date.parse(s)) ? s : fail(); };
const num = (x: unknown, min = -1000, max = 1000): number => typeof x === 'number' && Number.isFinite(x) && x >= min && x <= max ? x : fail();
const integer = (x: unknown, min = 0, max = 500): number => { const n = num(x, min, max); return Number.isInteger(n) ? n : fail(); };
const bool = (x: unknown): boolean => typeof x === 'boolean' ? x : fail();
const one = <T extends string | number>(x: unknown, choices: readonly T[]): T => choices.includes(x as T) ? x as T : fail();
const list = <T>(x: unknown, parse: (v: unknown) => T, max = 10000): T[] => Array.isArray(x) && x.length <= max ? x.map(parse) : fail();
function config(x: unknown): Config {
  const c = obj(x), categories = obj(c.categories), difficulties = obj(c.difficulties), scores = obj(c.scores);
  const result: Config = {
    mode: one(c.mode, ['practice', 'match']), count: integer(c.count, 1), presentation: one(c.presentation, ['text', 'audio', 'both']), engine: one(c.engine, ['auto', 'kokoro', 'system']), voice: id(c.voice), speed: num(c.speed, .75, 1.5), wpm: num(c.wpm, 60, 450),
    bonuses: bool(c.bonuses), scoring: bool(c.scoring), powers: bool(c.powers), interrupts: bool(c.interrupts), negs: bool(c.negs), resume: bool(c.resume), rebuzz: bool(c.rebuzz), avoidSeen: bool(c.avoidSeen),
    categories: Object.fromEntries(GROUPS.map(g => [g, num(categories[g], 0, Number.MAX_VALUE)])) as Config['categories'], difficulties: Object.fromEntries(DIFFICULTIES.map(d => [d, num(difficulties[d], 0, Number.MAX_VALUE)])) as Config['difficulties'], scores: { power: num(scores.power), ten: num(scores.ten), neg: num(scores.neg), endWrong: num(scores.endWrong), bonus: num(scores.bonus) },
  }; if (validateConfig(result).length) fail(); return result;
}
function attempt(x: unknown): Attempt {
  const a = obj(x), d = obj(a.draw); const question = parseTossups({ tossups: [a.question] })[0];
  return { id: id(a.id), sessionId: id(a.sessionId), questionId: id(a.questionId), mode: one(a.mode, ['practice', 'match']), number: integer(a.number, 1), totalTossups: integer(a.totalTossups, 1), draw: { group: one(d.group, GROUPS), category: str(d.category), difficulty: one(d.difficulty, DIFFICULTIES) }, question, noBuzz: bool(a.noBuzz), createdAt: date(a.createdAt), events: list(a.events, value => { const e = obj(value), b = obj(e.buzz); const words = integer(b.words, 0, 10000), total = integer(b.total, 0, 10000); if (words > total) fail(); return { id: id(e.id), userAnswer: str(e.userAnswer, 2000), accepted: bool(e.accepted), result: one(e.result, ['power', 'ten', 'neg', 'incorrect_no_penalty', 'no_buzz']), points: num(e.points), overridden: bool(e.overridden), at: date(e.at), buzz: { words, total, elapsedMs: num(b.elapsedMs, 0, 1e9), durationMs: b.durationMs === undefined ? undefined : num(b.durationMs, 0, 1e9), inPower: bool(b.inPower), ended: bool(b.ended) } }; }, 1000) };
}
function bonus(x: unknown): BonusAttempt {
  const b = obj(x), question = parseBonuses({ bonuses: [b.question] })[0];
  return { id: id(b.id), sessionId: id(b.sessionId), tossupNumber: integer(b.tossupNumber, 1), difficulty: one(b.difficulty, DIFFICULTIES), question, parts: list(b.parts, x => { const p = obj(x); return { part: integer(p.part, 0, question.parts.length - 1), userAnswer: str(p.userAnswer, 2000), correct: bool(p.correct), points: num(p.points), overridden: bool(p.overridden) }; }, question.parts.length) };
}
function session(x: unknown): Session {
  const s = obj(x); const result: Session = { id: id(s.id), createdAt: date(s.createdAt), completedAt: s.completedAt === undefined ? undefined : date(s.completedAt), config: config(s.config), attempts: list(s.attempts, attempt, 500), bonuses: list(s.bonuses, bonus, 500) };
  if ([...result.attempts, ...result.bonuses].some(a => a.sessionId !== result.id) || result.attempts.some(a => a.number > result.config.count || a.totalTossups !== result.config.count || a.questionId !== a.question._id)) fail();
  return result;
}
function unique<T extends { id: string }>(items: T[]): T[] { if (new Set(items.map(i => i.id)).size !== items.length) fail(); return items; }
export function parseBackup(text: string): Backup {
  if (text.length > 40 * 1024 * 1024) throw new Error('Backup is larger than 40 MB.');
  const x = obj(JSON.parse(text, (key, value: unknown) => { if (['__proto__', 'prototype', 'constructor'].includes(key)) fail(); return value; }));
  if (x.format !== 'cadence-data' || x.version !== 1) throw new Error('Unsupported backup format or version. Nothing was imported.');
  return { format: 'cadence-data', version: 1, exportedAt: date(x.exportedAt), sessions: unique(list(x.sessions, session)), presets: unique(list(x.presets, v => { const p = obj(v); return { id: id(p.id), name: str(p.name, 160), config: config(p.config) }; }, 1000)), pronunciations: unique(list(x.pronunciations, v => { const p = obj(v); const entry: PersonalPronunciation = { canonical: str(p.canonical, 160), spoken: str(p.spoken, 160), caseSensitive: p.caseSensitive === undefined ? undefined : bool(p.caseSensitive), notes: p.notes === undefined ? undefined : str(p.notes, 500), id: id(p.id), updatedAt: date(p.updatedAt) }; validatePronunciation(entry); if (entry.id !== pronunciationId(entry.canonical, entry.caseSensitive)) fail(); return entry; }, 5000)), settings: list(x.settings, v => { const s = obj(v); const key = one(s.key, ['config', 'theme']); return { key, value: key === 'config' ? config(s.value) : one(s.value, ['light', 'dark', 'system']) }; }, 2), seen: unique(list(x.seen, v => { const s = obj(v); return { id: id(s.id), kind: one(s.kind, ['tossup', 'bonus']), at: date(s.at) }; }, 100000)) };
}
export async function exportData(): Promise<string> {
  await flushWrites();
  const [sessions, presets, pronunciations, settings, seen] = await Promise.all([db.sessions.toArray(), db.presets.toArray(), db.pronunciations.toArray(), db.settings.toArray(), db.seen.toArray()]);
  return JSON.stringify({ format: 'cadence-data', version: 1, exportedAt: new Date().toISOString(), sessions, presets, pronunciations, settings: settings.filter(s => s.key === 'config' || s.key === 'theme'), seen }, null, 2);
}
export async function importData(text: string): Promise<Backup> {
  const backup = parseBackup(text); await flushWrites();
  await db.transaction('rw', [db.sessions, db.presets, db.pronunciations, db.settings, db.seen], async () => {
    for (const s of backup.sessions) if (!await db.sessions.get(s.id)) await db.sessions.add(s);
    for (const p of backup.presets) if (!await db.presets.get(p.id)) await db.presets.add(p);
    await db.pronunciations.bulkPut(backup.pronunciations); await db.settings.bulkPut(backup.settings); await db.seen.bulkPut(backup.seen);
  }); return backup;
}
