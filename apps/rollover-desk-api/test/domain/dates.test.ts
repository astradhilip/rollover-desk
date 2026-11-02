import { describe, expect, it } from 'vitest';
import { addMonths, daysBetween, isIsoDate } from '../../src/domain/entities/dates';

describe('isIsoDate', () => {
  it('accepts real dates only', () => {
    expect(isIsoDate('2028-02-29')).toBe(true);
    expect(isIsoDate('2027-02-29')).toBe(false);
    expect(isIsoDate('2027-13-01')).toBe(false);
    expect(isIsoDate('01/02/2027')).toBe(false);
  });
});

describe('daysBetween', () => {
  it('counts across a leap year', () => {
    expect(daysBetween('2026-01-01', '2029-01-01')).toBe(1096);
    expect(daysBetween('2028-02-28', '2028-03-01')).toBe(2);
  });
  it('is negative when the date has passed', () => {
    expect(daysBetween('2026-01-02', '2026-01-01')).toBe(-1);
  });
  it('rejects an invalid date instead of returning NaN', () => {
    expect(() => daysBetween('2026-02-30', '2026-03-01')).toThrow(RangeError);
  });
  it('does not depend on the server time zone across a daylight saving change', () => {
    expect(daysBetween('2026-03-07', '2026-03-09')).toBe(2);
  });
});

describe('addMonths', () => {
  it('clamps to month-end', () => {
    expect(addMonths('2027-03-31', -1)).toBe('2027-02-28');
    expect(addMonths('2028-03-31', -1)).toBe('2028-02-29');
    expect(addMonths('2026-12-31', 2)).toBe('2027-02-28');
  });
  it('crosses year boundaries', () => {
    expect(addMonths('2027-01-15', -12)).toBe('2026-01-15');
    expect(addMonths('2027-01-15', -13)).toBe('2025-12-15');
  });
});
