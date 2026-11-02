import { InvalidCredentialsError } from '../../domain/entities/errors';
import type { User } from '../../domain/entities/User';
import type { IPasswordHasher } from '../../domain/ports/IPasswordHasher';
import type { ITokenService } from '../../domain/ports/ITokenService';
import type { IUserRepository } from '../../domain/ports/IUserRepository';

export class Login {
  private decoy: Promise<string> | null = null;

  constructor(
    private readonly users: IUserRepository,
    private readonly hasher: IPasswordHasher,
    private readonly tokens: ITokenService,
  ) {}

  async execute(
    email: string,
    password: string,
  ): Promise<{ token: string; expiresInSeconds: number; user: User }> {
    const found = await this.users.findCredentialsByEmail(email.trim().toLowerCase());
    // An unknown email costs the same as a wrong password, so timing doesn't reveal who has an account.
    this.decoy ??= this.hasher.hash('decoy');
    const stored = found?.passwordHash ?? (await this.decoy);
    const valid = await this.hasher.verify(password, stored);
    if (!found || !valid) throw new InvalidCredentialsError();
    const { user } = found;
    const token = await this.tokens.issue({
      userId: user.id,
      organizationId: user.organizationId,
      role: user.role,
    });
    return { token, expiresInSeconds: this.tokens.expiresInSeconds, user };
  }
}
