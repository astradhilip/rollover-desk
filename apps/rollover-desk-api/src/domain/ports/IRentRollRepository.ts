import type { LeaseField } from '../entities/columnMapping';
import type { IntakeIssue, ParsedLease, SkippedRow } from '../entities/rentRollIntake';
import type { Cell } from '../entities/spreadsheetCells';

export type ImportStatus = 'pending' | 'confirmed' | 'replaced' | 'reverted';

export interface RentRollImport {
  id: string;
  propertyId: string;
  filename: string;
  status: ImportStatus;
  asOf: string;
  createdBy: string;
  createdAt: string;
  sheetNotes: string[];
  overrides: Record<number, LeaseField | null>;
  rows: Cell[][];
}

/** What the analyst saw and accepted when confirming: the record behind the export's Data Issues sheet. */
export interface ConfirmedFindings {
  issues: IntakeIssue[];
  skippedRows: SkippedRow[];
}

export type NewImport = Omit<RentRollImport, 'id' | 'status' | 'createdAt' | 'overrides'>;

export interface IRentRollRepository {
  createImport(organizationId: string, input: NewImport): Promise<RentRollImport>;
  findImport(organizationId: string, propertyId: string, id: string): Promise<RentRollImport | null>;
  listImports(organizationId: string, propertyId: string): Promise<Omit<RentRollImport, 'rows'>[]>;
  setOverrides(
    organizationId: string,
    propertyId: string,
    id: string,
    overrides: RentRollImport['overrides'],
  ): Promise<boolean>;
  /**
   * Atomically stores the leases and the findings the analyst accepted, and makes this the active import.
   * False if it is no longer pending.
   */
  confirm(
    organizationId: string,
    propertyId: string,
    id: string,
    leases: ParsedLease[],
    findings: ConfirmedFindings,
  ): Promise<boolean>;
  /** The findings stored at confirm. Null if not confirmed, or confirmed before findings were stored. */
  confirmedFindings(
    organizationId: string,
    propertyId: string,
    id: string,
  ): Promise<ConfirmedFindings | null>;
  /** Atomically retires the active import and restores the one before it. False if this isn't the active one. */
  revert(organizationId: string, propertyId: string, id: string): Promise<boolean>;
  activeLeases(organizationId: string, propertyId: string): Promise<ParsedLease[]>;
  /** The leases one import stored at confirm, whatever its status now. */
  importLeases(organizationId: string, propertyId: string, importId: string): Promise<ParsedLease[]>;
}
