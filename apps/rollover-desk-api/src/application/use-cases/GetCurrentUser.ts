import { NotFoundError } from '../../domain/entities/errors';
import type { Principal, User } from '../../domain/entities/User';
import type { IUserRepository } from '../../domain/ports/IUserRepository';

export class GetCurrentUser {
  constructor(private readonly users: IUserRepository) {}

  async execute(principal: Principal): Promise<User> {
    const user = await this.users.findById(principal.organizationId, principal.userId);
    if (!user) throw new NotFoundError('User');
    return user;
  }
}
