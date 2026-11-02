import { z } from 'zod';

export const ApiErrorCode = z.enum([
  'validation_error',
  'unauthorized',
  'forbidden',
  'not_found',
  'conflict',
  'rate_limited',
  'internal_error',
]);

export const ApiError = z.object({
  error: z.object({
    code: ApiErrorCode,
    message: z.string(),
    details: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
  }),
});
export type ApiError = z.infer<typeof ApiError>;

const IsoDate = z.string().refine((value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
}, 'Use a real date as YYYY-MM-DD');

const MAX_INT_32 = 2_147_483_647;

export const Role = z.enum(['analyst', 'viewer']);
export type Role = z.infer<typeof Role>;

export const LoginRequest = z.object({
  email: z.email().max(254),
  password: z.string().min(1).max(200),
});
export type LoginRequest = z.infer<typeof LoginRequest>;

export const CurrentUser = z.object({
  id: z.string(),
  email: z.email(),
  role: Role,
  organizationId: z.string(),
  organizationName: z.string(),
});
export type CurrentUser = z.infer<typeof CurrentUser>;

export const LoginResponse = z.object({
  /** The dashboard stores this in an httpOnly cookie; browser code never sees it. */
  token: z.string(),
  expiresInSeconds: z.number().int().positive(),
  user: CurrentUser,
});
export type LoginResponse = z.infer<typeof LoginResponse>;

export const Health = z.object({ status: z.literal('ok') });

export const CreatePropertyRequest = z.object({
  name: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .refine((v) => !v.includes('\0'), 'Name has an invalid character'),
  loanMaturityDate: IsoDate.nullable(),
  marketRentPsfCents: z.number().int().positive().max(MAX_INT_32).nullable(),
});
export type CreatePropertyRequest = z.infer<typeof CreatePropertyRequest>;

export const Property = z.object({
  id: z.string(),
  name: z.string(),
  loanMaturityDate: IsoDate.nullable(),
  marketRentPsfCents: z.number().int().nullable(),
});
export type Property = z.infer<typeof Property>;

export const PropertyList = z.object({ properties: z.array(Property) });

// Rent rolls

const Severity = z.enum(['blocking', 'warning']);

export const LeaseField = z.enum([
  'suite',
  'tenant',
  'area',
  'annualRent',
  'monthlyRent',
  'annualRentPsf',
  'monthlyRentPsf',
  'commencement',
  'expiration',
  'noticeMonths',
  'stepDate',
  'stepRent',
  'rentUnknownBasis',
]);

export const RentStep = z.object({ date: IsoDate, annualRentCents: z.number().int() });

export const ParsedLease = z.object({
  id: z.string(),
  sourceRow: z.number().int(),
  suite: z.string(),
  tenantName: z.string().nullable(),
  status: z.enum(['occupied', 'vacant']),
  areaSf: z.number().nullable(),
  annualRentCents: z.number().int().nullable(),
  commencementDate: IsoDate.nullable(),
  expirationDate: IsoDate.nullable(),
  isMonthToMonth: z.boolean(),
  noticeMonths: z.number().int().nullable(),
  rentSteps: z.array(RentStep),
});

export const IntakeIssue = z.object({
  code: z.string(),
  severity: Severity,
  message: z.string(),
  row: z.number().int().optional(),
  column: z.string().optional(),
  suite: z.string().optional(),
});

export const ImportSummary = z.object({
  id: z.string(),
  propertyId: z.string(),
  filename: z.string(),
  status: z.enum(['pending', 'confirmed', 'replaced', 'reverted']),
  asOf: IsoDate,
  createdAt: z.string(),
});

export const ImportReview = z.object({
  import: ImportSummary,
  review: z.object({
    columns: z.array(
      z.object({
        index: z.number().int(),
        header: z.string(),
        field: LeaseField.nullable(),
        confidence: z.number(),
        overridden: z.boolean(),
      }),
    ),
    headerRow: z.number().int().nullable(),
    leases: z.array(ParsedLease),
    skippedRows: z.array(z.object({ row: z.number().int(), reason: z.string(), text: z.string() })),
    issues: z.array(IntakeIssue),
    canConfirm: z.boolean(),
  }),
});
export type ImportReview = z.infer<typeof ImportReview>;

export const ImportList = z.object({ imports: z.array(ImportSummary) });

export const SetMappingRequest = z.object({
  overrides: z
    .array(z.object({ column: z.number().int().min(0).max(1000), field: LeaseField.nullable() }))
    .max(200),
});

export const ConfirmImportRequest = z.object({ acknowledgeWarnings: z.boolean() });

// Rollover and risk

const WeightedTerm = z.object({
  years: z.number().nullable(),
  includedLeases: z.number().int(),
  excludedLeases: z.number().int(),
});

const Bucket = z.object({
  leases: z.number().int(),
  areaSf: z.number(),
  annualRentCents: z.number().int(),
  areaShare: z.number().nullable(),
  rentShare: z.number().nullable(),
  cumulativeAreaShare: z.number().nullable(),
  cumulativeRentShare: z.number().nullable(),
});

const Tally = z.object({ leases: z.number().int(), areaSf: z.number(), annualRentCents: z.number().int() });

export const RiskWeights = z.object({
  time_to_expiry: z.number(),
  notice_urgency: z.number(),
  concentration: z.number(),
  loan_mismatch: z.number(),
});
export type RiskWeights = z.infer<typeof RiskWeights>;

export const RolloverView = z.object({
  asOf: IsoDate,
  weights: RiskWeights,
  walt: z.object({ byArea: WeightedTerm, byRent: WeightedTerm }),
  schedule: z.object({
    mtmOrExpired: Bucket,
    years: z.array(Bucket.extend({ year: z.number().int() })),
    beyondHorizon: Bucket,
    unknownExpiration: Tally,
    totals: Tally,
    leasesMissingArea: z.number().int(),
    leasesMissingRent: z.number().int(),
  }),
  concentration: z.object({
    tenants: z.array(
      z.object({
        key: z.string(),
        tenant: z.string(),
        annualRentCents: z.number().int(),
        share: z.number(),
        suites: z.number().int(),
      }),
    ),
    leasesMissingRent: z.number().int(),
    leasesMissingName: z.number().int(),
  }),
  largestTenant: z.object({ tenant: z.string(), expiresFirst: z.boolean().nullable() }).nullable(),
  projectedVacating: Tally,
});
export type RolloverView = z.infer<typeof RolloverView>;

const RiskKey = z.enum(['time_to_expiry', 'notice_urgency', 'concentration', 'loan_mismatch']);

export const RiskResult = z.discriminatedUnion('scored', [
  z.object({
    scored: z.literal(true),
    score: z.number(),
    components: z.array(
      z.object({
        key: RiskKey,
        label: z.string(),
        weight: z.number(),
        appliedWeight: z.number(),
        raw: z.number(),
        points: z.number(),
        detail: z.string(),
      }),
    ),
    leftOut: z.array(z.object({ key: RiskKey, label: z.string(), reason: z.string() })),
  }),
  z.object({ scored: z.literal(false), reasons: z.array(z.string()) }),
]);

export const LeaseView = ParsedLease.extend({
  remainingYears: z.number().nullable(),
  noticeDate: IsoDate.nullable(),
  expiresBeforeLoanMaturity: z.boolean().nullable(),
  markToMarketPct: z.number().nullable(),
  risk: RiskResult,
});
export type LeaseView = z.infer<typeof LeaseView>;

export const LeaseList = z.object({ leases: z.array(LeaseView) });

const CriticalDate = z.object({
  kind: z.enum(['notice', 'rent_step', 'expiration', 'loan_maturity']),
  label: z.string(),
  date: IsoDate,
  daysAway: z.number().int(),
});

const CriticalDatePartition = z.object({
  passed: z.array(CriticalDate),
  upcoming: z.array(CriticalDate),
  absent: z.array(z.enum(['notice', 'expiration', 'loan_maturity'])),
  next: CriticalDate.nullable(),
});

export const RenewalStage = z.enum([
  'identified',
  'contacted',
  'proposal',
  'negotiating',
  'renewed',
  'backfilled',
  'vacating',
]);
export type RenewalStage = z.infer<typeof RenewalStage>;

export const LeaseDetail = LeaseView.extend({
  criticalDates: CriticalDatePartition,
  deal: z
    .object({ stage: RenewalStage, vacatingReason: z.string().nullable(), note: z.string().nullable() })
    .nullable(),
});
export type LeaseDetail = z.infer<typeof LeaseDetail>;

export const CriticalDatesView = z.object({
  asOf: IsoDate,
  leases: z.array(
    CriticalDatePartition.extend({
      leaseId: z.string(),
      suite: z.string(),
      tenantName: z.string().nullable(),
    }),
  ),
});
export type CriticalDatesView = z.infer<typeof CriticalDatesView>;

const Digits = z
  .string()
  .regex(/^\d{1,6}$/, 'Use a whole number')
  .transform(Number);
const Bps = Digits.pipe(z.number().max(10_000));

/** Query strings, so numbers arrive as text. Rates have no defaults: a missing or blank rate is a 400. */
export const CommissionQuery = z.object({
  termYears: Digits.pipe(z.number().min(1).max(50)),
  renewalLandlordBps: Bps,
  renewalTenantBps: Bps,
  newLandlordBps: Bps,
  newTenantBps: Bps,
});

const Commission = z.object({
  rateBps: z.number(),
  byYear: z.array(
    z.object({ year: z.number().int(), rentCents: z.number().int(), commissionCents: z.number().int() }),
  ),
  totalRentCents: z.number().int(),
  totalCommissionCents: z.number().int(),
});
const Deal = z.object({
  landlordRep: Commission,
  tenantRep: Commission,
  totalCommissionCents: z.number().int(),
});

export const CommissionView = z.object({
  estimate: z.object({ renewal: Deal, replacement: Deal }).nullable(),
  reason: z.string().nullable(),
});

// Attention

const AttentionItem = z.object({
  key: z.string(),
  kind: z.string(),
  severity: z.enum(['high', 'medium', 'low']),
  suite: z.string().nullable(),
  leaseId: z.string().nullable(),
  tenantName: z.string().nullable(),
  message: z.string(),
  daysAway: z.number().int().nullable(),
});

export const AttentionStatus = z.enum(['done', 'dismissed']);

export const AttentionView = z.object({
  asOf: IsoDate,
  items: z.array(AttentionItem),
  handled: z.array(AttentionItem.extend({ status: AttentionStatus })),
});
export type AttentionView = z.infer<typeof AttentionView>;

export const SetAttentionRequest = z.object({ status: AttentionStatus });

// Renewals

export const PipelineView = z.object({
  entries: z.array(
    z.object({
      lease: ParsedLease,
      stage: RenewalStage,
      vacatingReason: z.string().nullable(),
      note: z.string().nullable(),
    }),
  ),
});
export type PipelineView = z.infer<typeof PipelineView>;

const ShortText = z
  .string()
  .trim()
  .max(2000)
  .refine((v) => !v.includes('\0'), 'Text has an invalid character');

export const MoveRenewalsRequest = z.object({
  moves: z
    .array(
      z.object({
        suite: z.string().min(1).max(200),
        stage: RenewalStage,
        vacatingReason: ShortText.nullable().optional(),
        note: ShortText.nullable().optional(),
      }),
    )
    .min(1)
    .max(200),
});
export type MoveRenewalsRequest = z.infer<typeof MoveRenewalsRequest>;

export const MoveRenewalsResponse = z.object({
  results: z.array(z.object({ suite: z.string(), ok: z.boolean(), error: z.string().nullable() })),
});

export const Empty = z.object({});
