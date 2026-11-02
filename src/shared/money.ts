import { commissionRate } from '../config/site';

/** "$30" for whole dollars, "$22.50" otherwise. Input is integer cents. */
export function formatUsd(cents: number): string {
  if (!Number.isInteger(cents)) throw new RangeError('Money must be integer cents');
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100);
  const rest = abs % 100;
  return rest === 0 ? `${sign}$${dollars}` : `${sign}$${dollars}.${String(rest).padStart(2, '0')}`;
}

/** The cleaner's share of a job, rounded to the nearest cent. */
export function cleanerPayoutCents(priceCents: number, rate: number = commissionRate): number {
  return Math.round(priceCents * rate);
}
