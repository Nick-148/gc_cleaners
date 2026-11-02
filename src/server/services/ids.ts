/** Unambiguous alphabet: no 0/O, 1/I/L or U, so references are easy to read aloud and type. */
export const REFERENCE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';
const REFERENCE_LENGTH = 6;
// Largest multiple of the alphabet size that fits in a byte; bytes at or above it are rejected
// so every character is uniformly likely (no modulo bias).
const UNBIASED_LIMIT = 256 - (256 % REFERENCE_ALPHABET.length);

export function newId(): string {
  return crypto.randomUUID();
}

/** A short human-friendly reference such as "SF-7K2Q9M" (~729 million combinations). */
export function newReference(prefix: string): string {
  let out = '';
  while (out.length < REFERENCE_LENGTH) {
    for (const byte of crypto.getRandomValues(new Uint8Array(16))) {
      if (byte >= UNBIASED_LIMIT) continue;
      out += REFERENCE_ALPHABET.charAt(byte % REFERENCE_ALPHABET.length);
      if (out.length === REFERENCE_LENGTH) break;
    }
  }
  return `${prefix}-${out}`;
}
