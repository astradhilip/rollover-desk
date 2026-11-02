import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import type { IPasswordHasher } from '../../domain/ports/IPasswordHasher';

const N = 2 ** 15;
const R = 8;
const P = 1;
const KEY_LENGTH = 32;
const MAX_MEMORY = 128 * N * R * 2;

function derive(
  password: string,
  salt: Buffer,
  n: number,
  r: number,
  p: number,
  length: number,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, length, { N: n, r, p, maxmem: MAX_MEMORY }, (error, key) =>
      error ? reject(error) : resolve(key),
    );
  });
}

export class ScryptPasswordHasher implements IPasswordHasher {
  async hash(password: string): Promise<string> {
    const salt = randomBytes(16);
    const key = await derive(password, salt, N, R, P, KEY_LENGTH);
    return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${key.toString('base64')}`;
  }

  async verify(password: string, stored: string): Promise<boolean> {
    const [scheme, n, r, p, salt, key] = stored.split('$');
    if (scheme !== 'scrypt' || !salt || !key) return false;
    const expected = Buffer.from(key, 'base64');
    // An empty key would compare equal to an empty result, so a damaged row must fail closed.
    if (expected.length !== KEY_LENGTH) return false;
    try {
      const actual = await derive(
        password,
        Buffer.from(salt, 'base64'),
        Number(n),
        Number(r),
        Number(p),
        KEY_LENGTH,
      );
      return timingSafeEqual(actual, expected);
    } catch {
      return false;
    }
  }
}
