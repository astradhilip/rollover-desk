import { NotFoundError } from '../../domain/entities/errors';
import type { Property } from '../../domain/entities/Lease';
import type { Principal } from '../../domain/entities/User';
import type { IPropertyRepository, NewProperty } from '../../domain/ports/IPropertyRepository';

export class ListProperties {
  constructor(private readonly properties: IPropertyRepository) {}

  execute(principal: Principal): Promise<Property[]> {
    return this.properties.list(principal.organizationId);
  }
}

export class GetProperty {
  constructor(private readonly properties: IPropertyRepository) {}

  async execute(principal: Principal, id: string): Promise<Property> {
    const property = await this.properties.findById(principal.organizationId, id);
    if (!property) throw new NotFoundError('Property');
    return property;
  }
}

export class CreateProperty {
  constructor(private readonly properties: IPropertyRepository) {}

  execute(principal: Principal, input: NewProperty): Promise<Property> {
    return this.properties.create(principal.organizationId, input);
  }
}
