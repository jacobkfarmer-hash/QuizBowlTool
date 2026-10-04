import type { Config, Difficulty, Draw, Group, Mode } from './types';
import { normalized, weightedChoice } from './probability';
export const MAPPING: Record<Group, string[]> = { 'Science & Math': ['Science'], History: ['History'], Literature: ['Literature'], Geography: ['Geography'], 'Fine Arts': ['Fine Arts'], 'Pop Culture & Sports': ['Pop Culture'], 'Social Science': ['Social Science'], Mythology: ['Mythology'], 'Philosophy & Theology': ['Philosophy', 'Religion'] };
export const GROUPS = Object.keys(MAPPING) as Group[];
export const DIFFICULTIES: Difficulty[] = [2, 3, 4];
export const IS_A = Object.fromEntries(GROUPS.map((g, i) => [g, [83, 46, 36, 19, 19, 16, 4, 5, 6][i]])) as Record<Group, number>;
export const DEFAULT_CONFIG: Config = { mode: 'practice', count: 20, bonuses: false, scoring: true, powers: true, interrupts: true, negs: true, resume: true, rebuzz: false, avoidSeen: true, presentation: 'both', engine: 'auto', voice: 'af_heart', speed: 1, wpm: 180, categories: IS_A, difficulties: { 2: 0, 3: 100, 4: 0 }, scores: { power: 15, ten: 10, neg: -5, endWrong: 0, bonus: 10 } };
export const modePreset = (c: Config, mode: Mode): Config => ({ ...c, mode, bonuses: mode === 'match', scoring: true, powers: true, interrupts: true, negs: true, resume: true, rebuzz: false });
export function validateConfig(c: Config): string[] {
  const errors: string[] = [];
  if (!Number.isInteger(c.count) || c.count < 1 || c.count > 500) errors.push('Choose 1–500 tossups.');
  for (const [name, weights] of [['Category', c.categories], ['Difficulty', c.difficulties]] as const) {
    try { normalized(Object.values(weights).map(weight => ({ value: '', weight }))); } catch { errors.push(`${name} weights must be nonnegative, with at least one enabled.`); }
  }
  if (Object.values(c.scores).some(n => !Number.isFinite(n) || Math.abs(n) > 1000) || c.scores.power < 0 || c.scores.ten < 0 || c.scores.bonus < 0 || c.scores.neg > 0) errors.push('Use finite score values; rewards must be nonnegative and negs nonpositive.');
  if (!Number.isFinite(c.speed) || c.speed < .75 || c.speed > 1.5 || !Number.isFinite(c.wpm) || c.wpm < 60 || c.wpm > 450) errors.push('Reader speed is out of range.');
  return errors;
}
export function drawQuestion(c: Config, random = Math.random): Draw {
  const group = weightedChoice(GROUPS.map(value => ({ value, weight: c.categories[value] })), random);
  const category = weightedChoice(MAPPING[group].map(value => ({ value, weight: 1 })), random);
  const difficulty = drawDifficulty(c, random);
  return { group, category, difficulty };
}
export const drawDifficulty = (c: Config, random = Math.random) => weightedChoice(DIFFICULTIES.map(value => ({ value, weight: c.difficulties[value] })), random);
export const BUILTINS: Record<string, Config> = { 'IS-A Academic': DEFAULT_CONFIG, 'Regular HS Match': modePreset(DEFAULT_CONFIG, 'match'), 'Mixed HS Practice': { ...DEFAULT_CONFIG, difficulties: { 2: 25, 3: 50, 4: 25 } }, 'Equal Categories': { ...DEFAULT_CONFIG, categories: Object.fromEntries(GROUPS.map(g => [g, 1])) as Record<Group, number> } };
