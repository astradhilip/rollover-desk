import type { User } from '../entities/User';

export interface IUserRepository {
  /** The only lookup with no organization: at login, the organization isn't known yet. */
  findCredentialsByEmail(
    email: string,
  ): Promise<{ user: User; passwordHash: string; sessionVersion: number } | null>;
  findById(organizationId: string, id: string): Promise<User | null>;
  /** The user with their current session version, to check a token against. */
  findSession(organizationId: string, id: string): Promise<{ user: User; sessionVersion: number } | null>;
  /** Ends every session the user has, by moving their session version on. */
  endSessions(organizationId: string, id: string): Promise<void>;
}
