import type { Principal } from '../../domain/entities/User';
import type { ITokenService } from '../../domain/ports/ITokenService';
import type { IUserRepository } from '../../domain/ports/IUserRepository';

/**
 * Turns a bearer token into who is asking. The signature proves the token is ours; the user record decides the
 * rest. A deleted user, a role change or a sign-out takes effect on the next request, not when the token expires.
 */
export class Authenticate {
  constructor(
    private readonly tokens: ITokenService,
    private readonly users: IUserRepository,
  ) {}

  async execute(token: string): Promise<Principal | null> {
    const claims = await this.tokens.verify(token);
    if (!claims) return null;
    const found = await this.users.findSession(claims.organizationId, claims.userId);
    if (!found || found.sessionVersion !== claims.sessionVersion) return null;
    return { userId: found.user.id, organizationId: found.user.organizationId, role: found.user.role };
  }
}

/** Ends every session the user has, on every device, so a token copied elsewhere stops working too. */
export class SignOut {
  constructor(private readonly users: IUserRepository) {}

  execute(principal: Principal): Promise<void> {
    return this.users.endSessions(principal.organizationId, principal.userId);
  }
}
