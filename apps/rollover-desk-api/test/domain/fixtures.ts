import type { Lease, Property } from '../../src/domain/entities/Lease';

export const lease = (over: Partial<Lease> = {}): Lease => ({
  id: 'l1',
  suite: '100',
  tenantName: 'Tenant A',
  status: 'occupied',
  areaSf: 10_000,
  annualRentCents: 30_000_000,
  expirationDate: '2029-01-01',
  isMonthToMonth: false,
  noticeMonths: 12,
  rentSteps: [],
  ...over,
});

export const property = (over: Partial<Property> = {}): Property => ({
  id: 'p1',
  name: 'Test Tower',
  loanMaturityDate: '2028-01-01',
  marketRentPsfCents: 3_500,
  ...over,
});
