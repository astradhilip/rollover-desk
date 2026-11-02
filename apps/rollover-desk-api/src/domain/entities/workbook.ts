import { criticalDates } from './criticalDates';
import { yearOf } from './dates';
import {
  expiresBeforeLoanMaturity,
  markToMarketPct,
  noticeDate,
  type Property,
  remainingYears,
} from './Lease';
import type { IntakeIssue, ParsedLease, SkippedRow } from './rentRollIntake';
import { type RolloverBucket, type RolloverSchedule, rolloverSchedule, type Walt, walt } from './rollover';

/** Years after the as-of year that the schedule still lists individually. Matches `rolloverSchedule`. */
export const SCHEDULE_HORIZON_YEARS = 30;

export type RolloverBucketKey = 'MTM' | 'Later' | 'Unknown' | number | null;

export interface WorkbookLease {
  lease: ParsedLease;
  rentPsfCents: number | null;
  noticeDate: string | null;
  remainingYears: number | null;
  expiresBeforeLoan: boolean | null;
  markToMarketPct: number | null;
  bucket: RolloverBucketKey;
}

export interface WorkbookDate {
  /** Index into `leases`; null for the property's loan maturity. */
  leaseIndex: number | null;
  kind: 'notice' | 'expiration' | 'rent_step' | 'loan_maturity';
  label: string;
  /** Null when the date isn't recorded: the row stays, so silence isn't read as safety. */
  date: string | null;
  daysAway: number | null;
}

/** Every figure the workbook shows, from the domain, stored beside each formula as its calculated value. */
export interface WorkbookModel {
  property: Property;
  asOf: string;
  sourceFile: string;
  leases: WorkbookLease[];
  schedule: RolloverSchedule;
  /**
   * One row per year from the as-of year to the horizon, empty years included. The sheet labels these rows
   * from the as-of date, so a changed as-of date shifts the years and every expiration still has a row.
   */
  scheduleYears: ({ year: number } & RolloverBucket)[];
  /** Missing-data counts for occupied leases with no expiration, which the domain schedule doesn't split out. */
  unknownMissing: { area: number; rent: number };
  walt: Walt;
  dates: WorkbookDate[];
  issues: IntakeIssue[];
  skippedRows: SkippedRow[];
}

function bucketOf(lease: ParsedLease, asOf: string): RolloverBucketKey {
  if (lease.status !== 'occupied') return null;
  if (lease.isMonthToMonth) return 'MTM';
  if (!lease.expirationDate) return 'Unknown';
  if (!(remainingYears(lease, asOf)! > 0)) return 'MTM';
  const year = yearOf(lease.expirationDate);
  return year > yearOf(asOf) + SCHEDULE_HORIZON_YEARS ? 'Later' : year;
}

export function buildWorkbookModel(input: {
  property: Property;
  leases: ParsedLease[];
  asOf: string;
  sourceFile: string;
  issues: IntakeIssue[];
  skippedRows: SkippedRow[];
}): WorkbookModel {
  const { property, leases, asOf } = input;
  const schedule = rolloverSchedule(leases, asOf);
  const scheduleYears: WorkbookModel['scheduleYears'] = [];
  let previous: RolloverBucket = schedule.mtmOrExpired;
  for (let i = 0; i <= SCHEDULE_HORIZON_YEARS; i += 1) {
    const year = yearOf(asOf) + i;
    const listed = schedule.years.find((y) => y.year === year);
    const empty = {
      ...previous,
      leases: 0,
      areaSf: 0,
      annualRentCents: 0,
      leasesMissingArea: 0,
      leasesMissingRent: 0,
    };
    const row = listed ?? {
      ...empty,
      year,
      areaShare: schedule.totals.areaSf > 0 ? 0 : null,
      rentShare: schedule.totals.annualRentCents > 0 ? 0 : null,
    };
    scheduleYears.push(row);
    previous = row;
  }
  const noExpiry = leases.filter((l) => l.status === 'occupied' && !l.isMonthToMonth && !l.expirationDate);
  const dates: WorkbookDate[] = [];
  const absentLabel = { notice: 'Renewal notice due', expiration: 'Lease expiration' } as const;
  leases.forEach((lease, leaseIndex) => {
    const part = criticalDates(lease, property, asOf);
    for (const d of [...part.passed, ...part.upcoming]) {
      if (d.kind !== 'loan_maturity') {
        dates.push({ leaseIndex, kind: d.kind, label: d.label, date: d.date, daysAway: d.daysAway });
      }
    }
    for (const kind of part.absent) {
      if (kind !== 'loan_maturity') {
        dates.push({ leaseIndex, kind, label: absentLabel[kind], date: null, daysAway: null });
      }
    }
  });
  const maturity = criticalDates({ ...leases[0]!, status: 'vacant', rentSteps: [] }, property, asOf);
  const loan = [...maturity.passed, ...maturity.upcoming][0];
  dates.push({
    leaseIndex: null,
    kind: 'loan_maturity',
    label: 'Loan maturity',
    date: loan?.date ?? null,
    daysAway: loan?.daysAway ?? null,
  });
  // Soonest first with unrecorded dates last, so the sheet reads as a to-do list.
  dates.sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999'));

  return {
    property,
    asOf,
    sourceFile: input.sourceFile,
    issues: input.issues,
    skippedRows: input.skippedRows,
    schedule,
    scheduleYears,
    unknownMissing: {
      area: noExpiry.filter((l) => l.areaSf === null).length,
      rent: noExpiry.filter((l) => l.annualRentCents === null).length,
    },
    walt: walt(leases, asOf),
    dates,
    leases: leases.map((lease) => ({
      lease,
      rentPsfCents: lease.annualRentCents && lease.areaSf ? lease.annualRentCents / lease.areaSf : null,
      noticeDate: noticeDate(lease),
      remainingYears: remainingYears(lease, asOf),
      expiresBeforeLoan: expiresBeforeLoanMaturity(lease, property),
      markToMarketPct: markToMarketPct(lease, property.marketRentPsfCents),
      bucket: bucketOf(lease, asOf),
    })),
  };
}
