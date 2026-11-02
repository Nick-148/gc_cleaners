import { describe, expect, it } from 'vitest';
import {
  buildings,
  commissionRate,
  getPackage,
  isPackageAllowedInBuilding,
  packages,
  rateLimits,
  site,
  uploadRules,
} from '../../src/config/site';
import { cleanerPayoutCents, formatUsd } from '../../src/shared/money';

describe('pricing invariants', () => {
  it('stores every price as positive integer cents', () => {
    for (const pkg of packages) {
      expect(Number.isInteger(pkg.priceCents)).toBe(true);
      expect(pkg.priceCents).toBeGreaterThan(0);
    }
  });

  it('matches the owner-approved launch prices', () => {
    expect(packages.map((p) => [p.id, p.priceCents])).toEqual([
      ['room', 3000],
      ['bathroom', 4000],
      ['bundle', 6000],
    ]);
  });

  it('makes the bundle cheaper than booking both separately', () => {
    expect(getPackage('bundle').priceCents).toBeLessThan(
      getPackage('room').priceCents + getPackage('bathroom').priceCents,
    );
  });

  it('pays cleaners 75% of each job', () => {
    expect(commissionRate).toBe(0.75);
    expect(packages.map((p) => formatUsd(cleanerPayoutCents(p.priceCents)))).toEqual([
      '$22.50',
      '$30',
      '$45',
    ]);
  });
});

describe('formatUsd', () => {
  it.each([
    [3000, '$30'],
    [2250, '$22.50'],
    [5, '$0.05'],
    [-1500, '-$15'],
  ])('formats %i cents as %s', (cents, expected) => {
    expect(formatUsd(cents)).toBe(expected);
  });

  it('rejects fractional cents', () => {
    expect(() => formatUsd(10.5)).toThrow(RangeError);
  });
});

describe('buildings', () => {
  it('have unique, URL-safe ids', () => {
    const ids = buildings.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9-]+$/);
  });

  it('only allow bathroom packages where the student has a private or suite bathroom', () => {
    expect(isPackageAllowedInBuilding('bathroom', 'evans')).toBe(false);
    expect(isPackageAllowedInBuilding('bundle', 'nyland')).toBe(false);
    expect(isPackageAllowedInBuilding('bathroom', 'chase')).toBe(true);
    expect(isPackageAllowedInBuilding('room', 'evans')).toBe(true);
    expect(isPackageAllowedInBuilding('room', 'unknown-hall')).toBe(false);
  });
});

describe('site config', () => {
  it('never claims affiliation with Gordon College', () => {
    expect(site.name.toLowerCase()).not.toContain('gordon');
    expect(site.disclaimer).toMatch(/not affiliated with/i);
  });

  it.skipIf(!site.contact.isPlaceholder)(
    'uses reserved placeholder contact details until launch (PLAN.md B1)',
    () => {
      expect(site.contact.email.endsWith('@example.com')).toBe(true);
      expect(site.contact.phoneE164.startsWith('+1555010')).toBe(true);
    },
  );

  it('keeps upload and rate limits sane', () => {
    expect(uploadRules.maxTotalBytes).toBeGreaterThanOrEqual(uploadRules.maxFileBytes);
    for (const { limit, windowSeconds } of Object.values(rateLimits)) {
      expect(limit).toBeGreaterThan(0);
      expect(windowSeconds).toBeGreaterThan(0);
    }
  });
});
