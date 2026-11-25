// Seat availability behind an interface, so a real ticketing API can replace the mock without touching the scene.

export interface SeatKey { section: string; row: string; seat: number }
export const keyOf = (k: SeatKey) => `${k.section}:${k.row}:${k.seat}`;

export interface AvailabilityApi {
  /** Seats in a section that cannot be bought, keyed by `${row}:${seat}`. */
  getAvailability(sectionId: string, rows: { label: string; seats: number[] }[]): Promise<Set<string>>;
  /** Reserve a seat for this visitor. Resolves false if someone else has it. */
  holdSeat(seat: SeatKey): Promise<boolean>;
  releaseSeat(seat: SeatKey): Promise<void>;
}

// Small deterministic hash and PRNG, so the same seats are sold on every reload.
function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function mulberry32(seed: number): number {
  let t = (seed + 0x6d2b79f5) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** About 25% of seats sold, seeded per seat. Holds live in memory. */
export class MockAvailability implements AvailabilityApi {
  private held = new Set<string>();
  constructor(private soldRatio = 0.25, private seed = 'bayfront-2026') {}

  async getAvailability(sectionId: string, rows: { label: string; seats: number[] }[]): Promise<Set<string>> {
    const sold = new Set<string>();
    for (const r of rows) for (const s of r.seats) {
      if (mulberry32(hash(`${this.seed}:${sectionId}:${r.label}:${s}`)) < this.soldRatio) sold.add(`${r.label}:${s}`);
    }
    return sold;
  }
  async holdSeat(seat: SeatKey): Promise<boolean> { this.held.add(keyOf(seat)); return true; }
  async releaseSeat(seat: SeatKey): Promise<void> { this.held.delete(keyOf(seat)); }
}
