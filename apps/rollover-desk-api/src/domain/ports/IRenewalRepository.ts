import type { RenewalDeal } from '../entities/renewal';

export interface IRenewalRepository {
  list(organizationId: string, propertyId: string): Promise<RenewalDeal[]>;
  upsert(organizationId: string, propertyId: string, deal: RenewalDeal): Promise<void>;
}
