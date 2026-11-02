import { activeBookingStatuses } from '../../config/site';

/**
 * SQL list literal of booking statuses that hold capacity, built from the config constant
 * (never from user input), e.g. `('pending', 'confirmed')`.
 */
export const ACTIVE_STATUSES_SQL = `(${activeBookingStatuses.map((s) => `'${s}'`).join(', ')})`;

export function isUniqueViolation(error: unknown, columnHint?: string): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message;
  return (
    message.includes('UNIQUE constraint failed') &&
    (columnHint === undefined || message.includes(columnHint))
  );
}

/** D1 rejects `undefined` bindings; normalize optional values to SQL NULL. */
export function orNull<T>(value: T | undefined): T | null {
  return value ?? null;
}
