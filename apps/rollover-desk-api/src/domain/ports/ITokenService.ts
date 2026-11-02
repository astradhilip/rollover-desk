import type { TokenClaims } from '../entities/User';

export interface ITokenService {
  readonly expiresInSeconds: number;
  issue(claims: TokenClaims): Promise<string>;
  /** Null when the token is missing its claims, expired, or not signed by us. */
  verify(token: string): Promise<TokenClaims | null>;
}
