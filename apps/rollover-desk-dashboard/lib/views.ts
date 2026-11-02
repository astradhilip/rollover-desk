// Pure shaping of API results for the screens. Nothing here calculates a financial figure.
import type { CriticalDatesView, LeaseView, RenewalStage, RolloverView } from '@rollover-desk/contracts';

export type Basis = 'rent' | 'area';

export interface Bar {
  key: string;
  label: string;
  short: string;
  share: number | null;
  cumulative: number | null;
  leases: number;
  annualRentCents: number;
  areaSf: number;
  missingRent: number;
  missingArea: number;
}

export function rolloverBars(schedule: RolloverView['schedule'], basis: Basis): Bar[] {
  type Bucket = RolloverView['schedule']['mtmOrExpired'];
  const bar = (key: string, label: string, short: string, b: Bucket): Bar => ({
    key,
    label,
    short,
    share: basis === 'rent' ? b.rentShare : b.areaShare,
    cumulative: basis === 'rent' ? b.cumulativeRentShare : b.cumulativeAreaShare,
    leases: b.leases,
    annualRentCents: b.annualRentCents,
    areaSf: b.areaSf,
    missingRent: b.leasesMissingRent,
    missingArea: b.leasesMissingArea,
  });
  return [
    bar('mtm', 'Month-to-month or expired', 'MTM', schedule.mtmOrExpired),
    ...schedule.years.map((y) => bar(String(y.year), String(y.year), `’${String(y.year).slice(2)}`, y)),
    bar('later', 'After the schedule', 'Later', schedule.beyondHorizon),
  ];
}

export const STAGE_LABEL: Record<RenewalStage, string> = {
  identified: 'Identified',
  contacted: 'Contacted',
  proposal: 'Proposal',
  negotiating: 'Negotiating',
  renewed: 'Renewed',
  backfilled: 'Backfilled',
  vacating: 'Vacating',
};

export type MarkState = 'passed' | 'soon' | 'upcoming';

const SOON_DAYS = 90;
export const markState = (daysAway: number): MarkState =>
  daysAway < 0 ? 'passed' : daysAway <= SOON_DAYS ? 'soon' : 'upcoming';

export interface CalendarItem {
  date: string;
  daysAway: number;
  label: string;
  kind: string;
  suite: string;
  tenantName: string | null;
  leaseId: string;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

type Who = Pick<CalendarItem, 'suite' | 'tenantName' | 'leaseId'>;

/** Twelve months from today, with everything else kept visible rather than dropped. */
export function calendar(view: CriticalDatesView, kind: string | null) {
  const all: CalendarItem[] = [];
  const passed: CalendarItem[] = [];
  const absent: { leaseId: string; suite: string; tenantName: string | null; missing: string[] }[] = [];
  let loanListed = false;
  let loanMissing = false;
  // Loan maturity belongs to the property, so it appears once rather than once per lease.
  const add = (
    list: CalendarItem[],
    d: CriticalDatesView['leases'][number]['upcoming'][number],
    who: Who,
  ) => {
    if (d.kind !== 'loan_maturity') list.push({ ...d, ...who });
    else if (!loanListed) {
      loanListed = true;
      list.push({ ...d, suite: '', tenantName: null, leaseId: '' });
    }
  };
  for (const l of view.leases) {
    const who = { suite: l.suite, tenantName: l.tenantName, leaseId: l.leaseId };
    for (const d of l.upcoming) if (!kind || d.kind === kind) add(all, d, who);
    for (const d of l.passed) if (!kind || d.kind === kind) add(passed, d, who);
    const missing = l.absent.filter((a) => a !== 'loan_maturity');
    if (l.absent.includes('loan_maturity')) loanMissing = true;
    if (missing.length) absent.push({ ...who, missing });
  }
  const year = Number(view.asOf.slice(0, 4));
  const month = Number(view.asOf.slice(5, 7)) - 1;
  const months = Array.from({ length: 12 }, (_, i) => {
    const m = (month + i) % 12;
    const y = year + Math.floor((month + i) / 12);
    return {
      key: `${y}-${String(m + 1).padStart(2, '0')}`,
      label: `${MONTHS[m]} ${y}`,
      items: [] as CalendarItem[],
    };
  });
  const later: CalendarItem[] = [];
  const byDate = (a: CalendarItem, b: CalendarItem) =>
    a.date.localeCompare(b.date) || a.suite.localeCompare(b.suite);
  for (const item of all.sort(byDate)) {
    const cell = months.find((m) => m.key === item.date.slice(0, 7));
    if (cell) cell.items.push(item);
    else later.push(item);
  }
  return { months, later, passed: passed.sort(byDate).reverse(), absent, loanMissing };
}

export type LeaseSort = 'expiration' | 'risk' | 'rent';

/** Missing values always sort last, whichever the column. */
export function sortLeases(leases: LeaseView[], sort: LeaseSort): LeaseView[] {
  const score = (l: LeaseView) => (l.risk.scored ? l.risk.score : null);
  return [...leases].sort((a, b) => {
    if (sort === 'expiration') {
      // Month-to-month can leave soonest, then dated leases, then unknown dates, then vacant suites.
      const rank = (l: LeaseView) =>
        l.status === 'vacant' ? 3 : l.isMonthToMonth ? 0 : l.expirationDate ? 1 : 2;
      return rank(a) - rank(b) || (a.expirationDate ?? '').localeCompare(b.expirationDate ?? '');
    }
    const [x, y] = sort === 'risk' ? [score(a), score(b)] : [a.annualRentCents, b.annualRentCents];
    if (x === null || y === null) return Number(x === null) - Number(y === null);
    return y - x;
  });
}

export function filterLeases(leases: LeaseView[], text: string): LeaseView[] {
  const q = text.trim().toLowerCase();
  if (!q) return leases;
  return leases.filter(
    (l) => l.suite.toLowerCase().includes(q) || (l.tenantName ?? '').toLowerCase().includes(q),
  );
}

/** A typed percentage to basis points, or null if it isn't one. A blank is missing, not zero. */
export function percentToBps(text: string): number | null {
  if (!/^\d+(\.\d{1,2})?$/.test(text.trim())) return null;
  const bps = Math.round(Number(text) * 100);
  return bps <= 10_000 ? bps : null;
}
