import { describe, expect, it } from 'vitest';
import { area, money, moneyPsf, NOT_RECORDED, partialTotal, percent, years } from '../lib/format';
import {
  clientAddress,
  cookieOptions,
  forwardPath,
  isBlockedPath,
  isSameOrigin,
  readLimited,
} from '../lib/session';

describe('session rules', () => {
  it('sets an httpOnly, strict cookie, secure in production', () => {
    expect(cookieOptions(60, true)).toMatchObject({
      httpOnly: true,
      sameSite: 'strict',
      secure: true,
      maxAge: 60,
    });
    expect(cookieOptions(60, false).secure).toBe(false);
  });
  it('accepts only a matching origin', () => {
    expect(isSameOrigin('http://localhost:3000', 'localhost:3000')).toBe(true);
    expect(isSameOrigin('https://evil.example', 'localhost:3000')).toBe(false);
    expect(isSameOrigin('https://localhost:3000.evil.example', 'localhost:3000')).toBe(false);
    expect(isSameOrigin(null, 'localhost:3000')).toBe(false);
    expect(isSameOrigin('not a url', 'localhost:3000')).toBe(false);
  });
  it('refuses paths that could leave the API root, and encodes the rest', () => {
    expect(forwardPath(['properties', 'a b'])).toBe('/properties/a%20b');
    for (const bad of [['..', 'x'], ['.'], ['a/b'], ['a\\b'], ['a\0'], ['']])
      expect(forwardPath(bad)).toBeNull();
  });
  it('uses only the nearest forwarded address', () => {
    expect(clientAddress('1.1.1.1, 2.2.2.2', true)).toBe('2.2.2.2');
    expect(clientAddress(null, true)).toBeNull();
    expect(clientAddress(' ', true)).toBeNull();
  });
  it('drops the address unless a trusted proxy set it', () => {
    expect(clientAddress('6.6.6.6', false)).toBeNull();
  });
  it('compares to the configured public origin when there is one', () => {
    expect(isSameOrigin('https://desk.example', 'dashboard:3000', 'https://desk.example')).toBe(true);
    expect(isSameOrigin('http://dashboard:3000', 'dashboard:3000', 'https://desk.example')).toBe(false);
  });
  it('counts real bytes and stops at the limit, with or without a length header', async () => {
    const stream = (n: number) => new Blob([new Uint8Array(n)]).stream();
    expect((await readLimited(stream(10), 10))?.length).toBe(10);
    expect(await readLimited(stream(11), 10)).toBeNull();
    expect((await readLimited(null, 10))?.length).toBe(0);
  });
  it('keeps the login route out of the proxy', () => {
    expect(isBlockedPath('/auth/login')).toBe(true);
    // Express matches routes case-insensitively.
    expect(isBlockedPath('/AUTH/Login')).toBe(true);
    expect(isBlockedPath('/auth/login/')).toBe(true);
    expect(isBlockedPath('/auth/me')).toBe(false);
  });
});

describe('format', () => {
  it('names a missing value instead of showing zero', () => {
    for (const f of [money, area, years, percent]) expect(f(null)).toBe(NOT_RECORDED);
  });
  it('shows a real zero as zero', () => {
    expect(money(0)).toBe('$0');
    expect(percent(0)).toBe('0.0%');
  });
  it('formats values', () => {
    expect(money(123_456_700)).toBe('$1,234,567');
    expect(area(12500)).toBe('12,500 SF');
    expect(years(4.26)).toBe('4.3 yrs');
    expect(percent(0.125)).toBe('12.5%');
  });
  it('keeps cents on a rate', () => {
    expect(moneyPsf(4250)).toBe('$42.50');
    expect(moneyPsf(null)).toBe(NOT_RECORDED);
  });
  it('says when a total is partial, or has nothing behind it', () => {
    expect(partialTotal(10, 0, 'rent', money, 100)).toEqual({ value: '$1', detail: undefined });
    expect(partialTotal(10, 4, 'rent', money, 100)).toEqual({
      value: '$1',
      detail: '4 of 10 leases have no rent recorded',
    });
    expect(partialTotal(10, 10, 'rent', money, 0)).toEqual({
      value: NOT_RECORDED,
      detail: 'No lease has rent recorded',
    });
  });
});
