export interface Weighted<T> { value: T; weight: number }
export function normalized<T>(options: Weighted<T>[]): Weighted<T>[] {
  if (options.some(o => !Number.isFinite(o.weight) || o.weight < 0)) throw new Error('Weights must be finite, nonnegative numbers.');
  const max = Math.max(0, ...options.map(o => o.weight));
  if (!max) throw new Error('At least one weight must be greater than zero.');
  const sum = options.reduce((s, o) => s + o.weight / max, 0);
  return options.map(o => ({ value: o.value, weight: (o.weight / max) / sum }));
}
export function weightedChoice<T>(options: Weighted<T>[], random = Math.random): T {
  const positive = normalized(options).filter(o => o.weight > 0);
  const r = random();
  if (!Number.isFinite(r) || r < 0 || r >= 1) throw new Error('Random sample must be in [0,1).');
  let cumulative = 0;
  for (const o of positive) { cumulative += o.weight; if (r < cumulative) return o.value; }
  return positive[positive.length - 1].value;
}
export function percent(weights: Record<string, number>, key: string): number {
  try { return 100 * (normalized(Object.entries(weights).map(([value, weight]) => ({ value, weight }))).find(o => o.value === key)?.weight ?? 0); } catch { return 0; }
}
