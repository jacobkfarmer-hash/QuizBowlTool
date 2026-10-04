import { api } from '../api/client';
import { drawDifficulty, drawQuestion, GROUPS, MAPPING, DIFFICULTIES } from '../core/config';
import { normalized, weightedChoice } from '../core/probability';
import type { Bonus, Config, Difficulty, Draw, Tossup } from '../core/types';
import { db, markSeen } from './db';
export class QuestionPools {
  private tossups = new Map<string, Tossup[]>(); private bonuses = new Map<Difficulty, Bonus[]>();
  private pending = new Map<string, Promise<void>>(); private unavailable = new Set<string>(); private claimed = new Set<string>();
  constructor(private config: Config) {}
  private key(d: Draw) { return `${d.category}/${d.difficulty}`; }
  private async eligible<T extends Tossup | Bonus>(items: T[]) { const ids = this.config.avoidSeen ? new Set((await db.seen.bulkGet(items.map(q => q._id))).filter(Boolean).map(q => q!.id)) : new Set<string>(); return items.filter(q => !this.claimed.has(q._id) && !ids.has(q._id)); }
  private refill(d: Draw): Promise<void> { const key = this.key(d); if (this.pending.has(key)) return this.pending.get(key)!; const work = (async () => { const items = await this.eligible(await api.tossups(d.category, d.difficulty)); const pool = this.tossups.get(key) ?? []; for (const q of items) if (q.category === d.category && q.difficulty === d.difficulty && q.set.standard && !pool.some(p => p._id === q._id)) pool.push(q); this.tossups.set(key, pool.slice(0, 4)); })().finally(() => this.pending.delete(key)); this.pending.set(key, work); return work; }
  private refillBonus(d: Difficulty): Promise<void> { const key = `bonus/${d}`; if (this.pending.has(key)) return this.pending.get(key)!; const work = (async () => { const items = await this.eligible(await api.bonuses(d)); const pool = this.bonuses.get(d) ?? []; for (const q of items) if (q.difficulty === d && q.set.standard && !pool.some(p => p._id === q._id)) pool.push(q); this.bonuses.set(d, pool.slice(0, 4)); })().finally(() => this.pending.delete(key)); this.pending.set(key, work); return work; }
  async reserveDraw(): Promise<{ question: Tossup; draw: Draw }> {
    let draw = drawQuestion(this.config);
    for (let iteration = 0; iteration < 100; iteration++) {
      if (!this.unavailable.has(this.key(draw))) {
        for (let retry = 0; retry < 3; retry++) {
          const pool = this.tossups.get(this.key(draw)) ?? []; const q = pool.shift();
          if (q && !this.claimed.has(q._id) && (!this.config.avoidSeen || !(await db.seen.get(q._id)))) { this.claimed.add(q._id); return { question: q, draw }; }
          await this.refill(draw);
        }
        const q = this.tossups.get(this.key(draw))?.shift();
        if (q) { this.claimed.add(q._id); return { question: q, draw }; }
        this.unavailable.add(this.key(draw));
      }
      const groups = normalized(GROUPS.map(value => ({ value, weight: this.config.categories[value] }))); const levels = normalized(DIFFICULTIES.map(value => ({ value, weight: this.config.difficulties[value] })));
      const choices = groups.flatMap(({ value: group, weight: groupWeight }) => MAPPING[group].flatMap(category => levels.map(({ value: difficulty, weight: difficultyWeight }) => ({ value: { group, category, difficulty }, weight: this.unavailable.has(`${category}/${difficulty}`) ? 0 : groupWeight * difficultyWeight / MAPPING[group].length }))));
      try { draw = weightedChoice(choices); } catch { throw new Error('No unseen questions remain in the enabled combinations. Reset question history or adjust your weights.'); }
    }
    throw new Error('Question selection exhausted its bounded retries.');
  }
  async reserveBonus(): Promise<{ question: Bonus; difficulty: Difficulty }> {
    if (!this.config.bonuses) throw new Error('Bonuses are disabled.');
    let choices = DIFFICULTIES.map(value => ({ value, weight: this.config.difficulties[value] }));
    while (choices.some(c => c.weight > 0)) { const d = weightedChoice(choices); for (let i = 0; i < 3; i++) { const q = this.bonuses.get(d)?.shift(); if (q && !this.claimed.has(q._id) && (!this.config.avoidSeen || !(await db.seen.get(q._id)))) { this.claimed.add(q._id); return { question: q, difficulty: d }; } await this.refillBonus(d); } const q = this.bonuses.get(d)?.shift(); if (q) { this.claimed.add(q._id); return { question: q, difficulty: d }; } choices = choices.map(c => c.value === d ? { ...c, weight: 0 } : c); }
    throw new Error('No unseen bonuses available for the enabled difficulties.');
  }
  async heard(id: string, kind: 'tossup' | 'bonus') { await markSeen(id, kind); }
  warmBonus() { if (this.config.bonuses) void this.refillBonus(drawDifficulty(this.config)).catch(() => undefined); }
}
