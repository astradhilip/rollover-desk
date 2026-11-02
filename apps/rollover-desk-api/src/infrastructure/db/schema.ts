import type { Generated } from 'kysely';

export interface Database {
  organizations: { id: string; name: string };
  users: {
    id: string;
    organization_id: string;
    email: string;
    password_hash: string;
    role: 'analyst' | 'viewer';
    session_version: Generated<number>;
  };
  properties: {
    id: string;
    organization_id: string;
    name: string;
    loan_maturity_date: string | null;
    market_rent_psf_cents: number | null;
    risk_weights_json: string | null;
    created_at: Generated<string>;
  };
  rent_roll_imports: {
    id: string;
    organization_id: string;
    property_id: string;
    filename: string;
    status: 'pending' | 'confirmed' | 'replaced' | 'reverted';
    as_of: string;
    created_by: string;
    created_at: Generated<string>;
    sheet_notes_json: string;
    overrides_json: string;
    rows_json: string;
    confirmed_seq: number | null;
    /** Issues and skipped rows as confirmed; null before confirm and for imports confirmed before 0003. */
    confirmed_issues_json: string | null;
  };
  leases: {
    id: string;
    organization_id: string;
    property_id: string;
    import_id: string;
    source_row: number;
    suite: string;
    tenant_name: string | null;
    status: 'occupied' | 'vacant';
    area_sf: number | null;
    annual_rent_cents: number | string | null;
    commencement_date: string | null;
    expiration_date: string | null;
    is_month_to_month: number;
    notice_months: number | null;
    rent_steps_json: string;
  };
  attention_states: {
    organization_id: string;
    property_id: string;
    item_key: string;
    status: 'done' | 'dismissed';
    updated_by: string;
  };
  renewal_deals: {
    organization_id: string;
    property_id: string;
    suite: string;
    tenant_key: string;
    stage: string;
    vacating_reason: string | null;
    note: string | null;
  };
}
