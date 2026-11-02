import type { LeaseField } from '../../domain/entities/columnMapping';
import { ConflictError, NotFoundError, ValidationError } from '../../domain/entities/errors';
import {
  chooseSheet,
  type IntakeIssue,
  type IntakeResult,
  parseRentRoll,
} from '../../domain/entities/rentRollIntake';
import type { Principal } from '../../domain/entities/User';
import { buildWorkbookModel } from '../../domain/entities/workbook';
import type { IClock } from '../../domain/ports/IClock';
import type { IPropertyRepository } from '../../domain/ports/IPropertyRepository';
import type { IRentRollRepository, RentRollImport } from '../../domain/ports/IRentRollRepository';
import type { ISpreadsheetReader } from '../../domain/ports/ISpreadsheetReader';
import type { IWorkbookWriter } from '../../domain/ports/IWorkbookWriter';

export interface ImportReview {
  import: Omit<RentRollImport, 'rows'>;
  review: IntakeResult;
}

function review(record: RentRollImport): ImportReview {
  const { rows, ...summary } = record;
  const result = parseRentRoll(rows, record.asOf, record.overrides);
  const notes: IntakeIssue[] = record.sheetNotes.map((message) => ({
    code: 'other_sheets',
    severity: 'warning',
    message,
  }));
  return { import: summary, review: { ...result, issues: [...notes, ...result.issues] } };
}

/** Every operation starts here, so a property from another organization is a 404 before anything else runs. */
async function assertProperty(properties: IPropertyRepository, principal: Principal, propertyId: string) {
  const property = await properties.findById(principal.organizationId, propertyId);
  if (!property) throw new NotFoundError('Property');
  return property;
}

export class UploadRentRoll {
  constructor(
    private readonly properties: IPropertyRepository,
    private readonly imports: IRentRollRepository,
    private readonly reader: ISpreadsheetReader,
    private readonly clock: IClock,
  ) {}

  async execute(
    principal: Principal,
    propertyId: string,
    rawFilename: string,
    bytes: Buffer,
  ): Promise<ImportReview> {
    // eslint-disable-next-line no-control-regex -- the point is to remove control characters
    const filename = rawFilename.replace(/[\x00-\x1f\x7f]/g, '').slice(-255);
    await assertProperty(this.properties, principal, propertyId);
    const { sheet, others, tied } = chooseSheet(await this.reader.read(bytes, filename));
    const sheetNotes = others.length
      ? [
          `Read sheet "${sheet?.name}". ${others.length} other sheet(s) hold data and were not read: ${others.join(', ')}.${
            tied ? ' At least one looks equally like a rent roll, so check this is the right one.' : ''
          }`,
        ]
      : [];
    const record = await this.imports.createImport(principal.organizationId, {
      propertyId,
      filename,
      asOf: this.clock.today(),
      createdBy: principal.userId,
      sheetNotes,
      rows: sheet?.rows ?? [],
    });
    return review(record);
  }
}

export class ImportHistory {
  constructor(
    private readonly properties: IPropertyRepository,
    private readonly imports: IRentRollRepository,
  ) {}

  async list(principal: Principal, propertyId: string) {
    await assertProperty(this.properties, principal, propertyId);
    return this.imports.listImports(principal.organizationId, propertyId);
  }

  async get(principal: Principal, propertyId: string, id: string): Promise<ImportReview> {
    await assertProperty(this.properties, principal, propertyId);
    const record = await this.imports.findImport(principal.organizationId, propertyId, id);
    if (!record) throw new NotFoundError('Import');
    return review(record);
  }
}

export class ReviewImport {
  constructor(
    private readonly properties: IPropertyRepository,
    private readonly imports: IRentRollRepository,
  ) {}

  async setMapping(
    principal: Principal,
    propertyId: string,
    id: string,
    overrides: Record<number, LeaseField | null>,
  ): Promise<ImportReview> {
    await assertProperty(this.properties, principal, propertyId);
    const org = principal.organizationId;
    const record = await this.imports.findImport(org, propertyId, id);
    if (!record) throw new NotFoundError('Import');
    if (!(await this.imports.setOverrides(org, propertyId, id, overrides))) {
      throw new ConflictError('This import has already been confirmed.');
    }
    return review({ ...record, overrides });
  }

  /** Blocking issues always refuse. Warnings need the analyst to have seen them. */
  async confirm(
    principal: Principal,
    propertyId: string,
    id: string,
    acknowledgeWarnings: boolean,
  ): Promise<ImportReview> {
    await assertProperty(this.properties, principal, propertyId);
    const org = principal.organizationId;
    const record = await this.imports.findImport(org, propertyId, id);
    if (!record) throw new NotFoundError('Import');
    const current = review(record);
    if (!current.review.canConfirm) throw new ConflictError('Resolve the blocking issues before confirming.');
    if (current.review.issues.length > 0 && !acknowledgeWarnings) {
      throw new ConflictError('This import has warnings. Acknowledge them to confirm.');
    }
    if (!(await this.imports.confirm(org, propertyId, id, current.review.leases))) {
      throw new ConflictError('This import has already been confirmed.');
    }
    return { ...current, import: { ...current.import, status: 'confirmed' } };
  }

  async revert(principal: Principal, propertyId: string, id: string): Promise<void> {
    await assertProperty(this.properties, principal, propertyId);
    const org = principal.organizationId;
    if (!(await this.imports.findImport(org, propertyId, id))) throw new NotFoundError('Import');
    if (!(await this.imports.revert(org, propertyId, id))) {
      throw new ConflictError('Only the current rent roll can be reverted.');
    }
  }
}

export class ExportWorkbook {
  constructor(
    private readonly properties: IPropertyRepository,
    private readonly imports: IRentRollRepository,
    private readonly writer: IWorkbookWriter,
    private readonly clock: IClock,
  ) {}

  async execute(principal: Principal, propertyId: string) {
    const org = principal.organizationId;
    const property = await this.properties.findById(org, propertyId);
    if (!property) throw new NotFoundError('Property');
    const active = (await this.imports.listImports(org, propertyId)).find((i) => i.status === 'confirmed');
    // Everything below is keyed to this one import, so a revert landing mid-export can't mix two rolls.
    const record = active && (await this.imports.findImport(org, propertyId, active.id));
    const leases = record ? await this.imports.importLeases(org, propertyId, record.id) : [];
    if (!record || leases.length === 0) throw new ValidationError('Confirm a rent roll before exporting.');
    const asOf = this.clock.today();
    const { issues, skippedRows } = review(record).review;
    const model = buildWorkbookModel({
      property,
      leases,
      asOf,
      sourceFile: record.filename,
      issues,
      skippedRows,
    });
    // Property names are free text, so the file name keeps only what is safe in a header and on disk.
    const slug = property.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .slice(0, 60)
      .replace(/^-+|-+$/g, '');
    return {
      filename: `rollover-desk-${slug || 'property'}-${asOf}.xlsx`,
      bytes: await this.writer.write(model),
    };
  }
}
