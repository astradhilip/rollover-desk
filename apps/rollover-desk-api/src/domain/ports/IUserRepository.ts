import type { User } from '../entities/User';

export interface IUserRepository {
  /** The only lookup with no organization: at login, the organization isn't known yet. */
  findCredentialsByEmail(email: string): Promise<{ user: User; passwordHash: string } | null>;
  findById(organizationId: string, id: string): Promise<User | null>;
}
