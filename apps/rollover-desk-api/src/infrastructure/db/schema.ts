import type { Generated } from 'kysely';

export interface Database {
  organizations: { id: string; name: string };
  users: {
    id: string;
    organization_id: string;
    email: string;
    password_hash: string;
    role: 'analyst' | 'viewer';
  };
  properties: {
    id: string;
    organization_id: string;
    name: string;
    loan_maturity_date: string | null;
    market_rent_psf_cents: number | null;
    created_at: Generated<string>;
  };
}
