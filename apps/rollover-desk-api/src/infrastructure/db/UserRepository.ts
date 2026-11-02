import type { Kysely } from 'kysely';
import type { User } from '../../domain/entities/User';
import type { IUserRepository } from '../../domain/ports/IUserRepository';
import type { Database } from './schema';

export class UserRepository implements IUserRepository {
  constructor(private readonly db: Kysely<Database>) {}

  private select() {
    return this.db
      .selectFrom('users')
      .innerJoin('organizations', 'organizations.id', 'users.organization_id')
      .select([
        'users.id',
        'users.email',
        'users.role',
        'users.organization_id',
        'users.password_hash',
        'organizations.name as organization_name',
      ]);
  }

  async findCredentialsByEmail(email: string) {
    const row = await this.select().where('users.email', '=', email).executeTakeFirst();
    return row ? { user: toUser(row), passwordHash: row.password_hash } : null;
  }

  async findById(organizationId: string, id: string) {
    const row = await this.select()
      .where('users.organization_id', '=', organizationId)
      .where('users.id', '=', id)
      .executeTakeFirst();
    return row ? toUser(row) : null;
  }
}

function toUser(row: {
  id: string;
  email: string;
  role: User['role'];
  organization_id: string;
  organization_name: string;
}): User {
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    organizationId: row.organization_id,
    organizationName: row.organization_name,
  };
}
