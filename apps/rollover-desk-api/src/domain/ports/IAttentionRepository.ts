export type AttentionStatus = 'done' | 'dismissed';

export interface IAttentionRepository {
  list(organizationId: string, propertyId: string): Promise<Map<string, AttentionStatus>>;
  set(
    organizationId: string,
    propertyId: string,
    key: string,
    status: AttentionStatus,
    userId: string,
  ): Promise<void>;
  /** Undo. False when there was nothing to undo. */
  clear(organizationId: string, propertyId: string, key: string): Promise<boolean>;
}
