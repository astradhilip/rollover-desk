import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config';
import { JwtTokenService } from '../../src/infrastructure/security/JwtTokenService';
import { ScryptPasswordHasher } from '../../src/infrastructure/security/ScryptPasswordHasher';
import { LoginRateLimiter } from '../../src/interfaces/http/LoginRateLimiter';

describe('loadConfig', () => {
  it('refuses to start in production without a secret', () => {
    expect(() => loadConfig({ NODE_ENV: 'production' })).toThrow(/JWT_SECRET/);
    expect(loadConfig({ NODE_ENV: 'production', JWT_SECRET: 'x'.repeat(32) }).jwtSecret).toBe('x'.repeat(32));
  });
  it('uses a random secret per start elsewhere, never a fixed one', () => {
    expect(loadConfig({}).jwtSecret).not.toBe(loadConfig({}).jwtSecret);
  });
  it('rejects a bad port and parses origins', () => {
    expect(() => loadConfig({ PORT: 'abc' })).toThrow(/PORT/);
    expect(loadConfig({ CORS_ORIGINS: 'https://a, https://b,' }).corsOrigins).toEqual([
      'https://a',
      'https://b',
    ]);
  });
});

describe('JwtTokenService', () => {
  it('refuses a short secret', () => {
    expect(() => new JwtTokenService('short')).toThrow(/32/);
  });
  it('round-trips the claims, and carries no role', async () => {
    const s = new JwtTokenService('k'.repeat(32));
    const claims = { userId: 'u', organizationId: 'o', sessionVersion: 3 };
    const token = await s.issue(claims);
    expect(await s.verify(token)).toEqual(claims);
    const payload = JSON.parse(Buffer.from(token.split('.')[1]!, 'base64url').toString('utf8'));
    expect(payload).not.toHaveProperty('role');
  });
});

describe('ScryptPasswordHasher', () => {
  const h = new ScryptPasswordHasher();
  it('verifies only the right password, with a fresh salt each time', async () => {
    const a = await h.hash('secret');
    expect(await h.verify('secret', a)).toBe(true);
    expect(await h.verify('wrong', a)).toBe(false);
    expect(a).not.toBe(await h.hash('secret'));
  });
  it('treats a malformed stored value as no match', async () => {
    expect(await h.verify('x', 'plaintext')).toBe(false);
    const key = Buffer.alloc(32).toString('base64');
    expect(await h.verify('x', `scrypt$abc$8$1$AAAA$${key}`)).toBe(false);
  });
  it('fails closed on an empty stored key, which would otherwise match anything', async () => {
    expect(await h.verify('anything', 'scrypt$16384$8$1$AAAA$!!!!')).toBe(false);
  });
});

describe('LoginRateLimiter', () => {
  it('refuses the sixth attempt in a window, then resets', () => {
    let now = 0;
    const l = new LoginRateLimiter(() => now);
    for (let i = 0; i < 5; i += 1) expect(l.reserve('k')).toBe(0);
    expect(l.reserve('k')).toBe(900);
    expect(l.reserve('other')).toBe(0);
    now = 900_000;
    expect(l.reserve('k')).toBe(0);
  });
  it('clears on success, and releases an attempt that failed for another reason', () => {
    const l = new LoginRateLimiter(() => 0);
    for (let i = 0; i < 5; i += 1) l.reserve('k');
    l.release('k');
    expect(l.reserve('k')).toBe(0);
    expect(l.reserve('k')).toBe(900);
    l.clear('k');
    expect(l.reserve('k')).toBe(0);
  });
  it('stays bounded under many keys', () => {
    const l = new LoginRateLimiter(() => 0);
    for (let i = 0; i < 10_050; i += 1) l.reserve(`k${i}`);
    expect((l as unknown as { failures: Map<string, unknown> }).failures.size).toBeLessThanOrEqual(10_000);
  });
});
