import { describe, expect, it } from 'vitest';
import { parseDate, parseNoticeMonths, parseNumber } from '../../src/domain/entities/spreadsheetCells';

const value = (v: unknown) => expect.objectContaining({ kind: 'value', value: v });
const invalid = (code: string) => expect.objectContaining({ kind: 'invalid', code });

describe('parseNumber', () => {
  it('reads messy numbers', () => {
    expect(parseNumber(1234.5)).toEqual(value(1234.5));
    expect(parseNumber('$12,345.00')).toEqual(value(12345));
    expect(parseNumber('10,000 SF')).toEqual(value(10000));
    expect(parseNumber('$31.50/SF')).toEqual(value(31.5));
    expect(parseNumber('(1,234.00)')).toEqual(value(-1234));
  });
  it('treats placeholders as missing', () => {
    for (const c of [null, '', '-', 'N/A', 'none']) expect(parseNumber(c).kind).toBe('missing');
    expect(parseNumber('TBD')).toEqual({ kind: 'missing', note: 'Recorded as "TBD"' });
  });
  it('refuses what it cannot read', () => {
    for (const c of ['see plan', '12,34', '1.2.3', '12 34'])
      expect(parseNumber(c)).toEqual(invalid('invalid_number'));
  });
});

describe('parseDate', () => {
  it('reads each format to the same date', () => {
    for (const c of [
      { date: '2029-01-31' },
      '2029-01-31',
      '1/31/2029',
      '01-31-2029',
      '1/31/29',
      '31-Jan-2029',
      '31 January 2029',
      'Jan 31, 2029',
      47149,
      '47149',
    ]) {
      expect(parseDate(c)).toEqual(value('2029-01-31'));
    }
  });
  it('handles the leap day, by calendar and by serial', () => {
    expect(parseDate('2/29/2028')).toEqual(value('2028-02-29'));
    expect(parseDate('2/29/2027')).toEqual(invalid('invalid_date'));
    expect(parseDate(46812)).toEqual(value('2028-02-29'));
  });
  it('flags a day-first date instead of silently accepting it', () => {
    const r = parseDate('13/02/2032');
    expect(r).toEqual(value('2032-02-13'));
    expect(r.kind === 'value' && r.unusual).toMatch(/day-first/);
  });
  it('never assumes a day', () => {
    for (const c of ['Mar 2028', 'Mar-28', '3/2028', '2028'])
      expect(parseDate(c)).toEqual(invalid('ambiguous_date'));
  });
  it('refuses impossible dates and numbers that are not dates', () => {
    for (const c of ['02/30/2029', '13/13/2029', 'soon', 12, 1.5, 99999])
      expect(parseDate(c)).toEqual(invalid('invalid_date'));
    expect(parseDate(46812.5)).toEqual(invalid('invalid_date'));
  });
  it('treats placeholders as missing', () => {
    expect(parseDate('TBD').kind).toBe('missing');
    expect(parseDate(null).kind).toBe('missing');
  });
});

describe('parseNoticeMonths', () => {
  it('reads whole months only', () => {
    expect(parseNoticeMonths(12)).toEqual(value(12));
    expect(parseNoticeMonths('9 months')).toEqual(value(9));
    expect(parseNoticeMonths('6 mos')).toEqual(value(6));
    expect(parseNoticeMonths('180 days').kind).toBe('invalid');
    expect(parseNoticeMonths(1.5).kind).toBe('invalid');
  });
});
