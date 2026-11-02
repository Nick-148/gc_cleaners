/** Injectable time source. Business logic must use this rather than `Date.now()` (AGENTS.md). */
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };

export function fixedClock(iso: string): Clock {
  const instant = new Date(iso);
  return { now: () => new Date(instant.getTime()) };
}
