import type { Principal } from '../entities/User';

export interface ITokenService {
  readonly expiresInSeconds: number;
  issue(principal: Principal): Promise<string>;
  /** Null when the token is missing its claims, expired, or not signed by us. */
  verify(token: string): Promise<Principal | null>;
}
