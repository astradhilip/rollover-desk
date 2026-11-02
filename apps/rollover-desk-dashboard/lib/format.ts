// Display rules. A missing value is always named, never shown as zero.

export const NOT_RECORDED = 'Not recorded';

export function money(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return NOT_RECORDED;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

/** Rates keep their cents: $42.50 per SF is not $43. */
export function moneyPsf(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return NOT_RECORDED;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

export function area(sf: number | null | undefined): string {
  if (sf === null || sf === undefined) return NOT_RECORDED;
  return `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(sf)} SF`;
}

export function years(value: number | null | undefined): string {
  if (value === null || value === undefined) return NOT_RECORDED;
  return `${value.toFixed(1)} yrs`;
}

export const rowCount = (n: number) => `${n} ${n === 1 ? 'row' : 'rows'}`;

export const leaseCount = (n: number) => `${n} ${n === 1 ? 'lease' : 'leases'}`;

export function percent(share: number | null | undefined): string {
  if (share === null || share === undefined) return NOT_RECORDED;
  return `${(share * 100).toFixed(1)}%`;
}

/** A total over partial data says so, and a total with nothing behind it isn't a zero. */
export function partialTotal(
  leases: number,
  missing: number,
  noun: string,
  format: (v: number) => string,
  total: number,
): { value: string; detail: string | undefined } {
  if (leases > 0 && missing >= leases)
    return { value: NOT_RECORDED, detail: `No lease has ${noun} recorded` };
  return {
    value: format(total),
    detail: missing > 0 ? `${missing} of ${leases} leases have no ${noun} recorded` : undefined,
  };
}
