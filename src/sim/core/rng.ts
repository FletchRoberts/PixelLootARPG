// Seeded PRNG (mulberry32). All sim randomness must go through an Rng so runs
// are reproducible from a seed and can be replayed or run on a host.
export class Rng {
  private state_: number;

  constructor(seed: number) {
    this.state_ = seed >>> 0;
  }

  /** Current internal state; pass back to the constructor to resume the sequence. */
  get state(): number {
    return this.state_;
  }

  /** Float in [0, 1). */
  next(): number {
    let t = (this.state_ = (this.state_ + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Integer in [min, max] inclusive. */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** Float in [min, max). */
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** Pick one entry by weight. Returns undefined for an empty or zero-weight list. */
  weighted<T extends { weight: number }>(entries: readonly T[]): T | undefined {
    const total = entries.reduce((sum, e) => sum + e.weight, 0);
    if (total <= 0) return undefined;
    let roll = this.next() * total;
    for (const e of entries) {
      roll -= e.weight;
      if (roll < 0) return e;
    }
    return entries[entries.length - 1];
  }
}
