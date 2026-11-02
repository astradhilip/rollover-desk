import { jwtVerify, SignJWT } from 'jose';
import type { TokenClaims } from '../../domain/entities/User';
import type { ITokenService } from '../../domain/ports/ITokenService';

const ISSUER = 'rollover-desk-api';
const AUDIENCE = 'rollover-desk';
const ALGORITHM = 'HS256';
const MIN_SECRET_LENGTH = 32;

export class JwtTokenService implements ITokenService {
  private readonly key: Uint8Array;

  constructor(
    secret: string,
    readonly expiresInSeconds = 8 * 60 * 60,
  ) {
    if (secret.length < MIN_SECRET_LENGTH)
      throw new Error(`JWT_SECRET must be at least ${MIN_SECRET_LENGTH} characters.`);
    this.key = new TextEncoder().encode(secret);
  }

  issue({ userId, organizationId, sessionVersion }: TokenClaims): Promise<string> {
    return new SignJWT({ org: organizationId, ver: sessionVersion })
      .setProtectedHeader({ alg: ALGORITHM })
      .setSubject(userId)
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setIssuedAt()
      .setExpirationTime(`${this.expiresInSeconds}s`)
      .sign(this.key);
  }

  async verify(token: string): Promise<TokenClaims | null> {
    try {
      const { payload } = await jwtVerify(token, this.key, {
        issuer: ISSUER,
        audience: AUDIENCE,
        algorithms: [ALGORITHM],
      });
      const { sub, org, ver } = payload;
      if (typeof sub !== 'string' || typeof org !== 'string' || !Number.isInteger(ver)) return null;
      return { userId: sub, organizationId: org, sessionVersion: ver as number };
    } catch {
      return null;
    }
  }
}
