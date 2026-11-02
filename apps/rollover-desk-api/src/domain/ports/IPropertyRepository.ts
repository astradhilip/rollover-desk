import type { Property } from '../entities/Lease';

export type NewProperty = Omit<Property, 'id'>;

export interface IPropertyRepository {
  list(organizationId: string): Promise<Property[]>;
  /** Null for another organization's property, the same as for one that doesn't exist. */
  findById(organizationId: string, id: string): Promise<Property | null>;
  create(organizationId: string, property: NewProperty): Promise<Property>;
}
