'use client';

import type { RolloverView } from '@rollover-desk/contracts';
import { Button, Segmented, Td, TableWrap, Th } from '@rollover-desk/ui-web';
import { useState } from 'react';
import { area, leaseCount, money, NOT_RECORDED, percent } from '@/lib/format';
import { type Bar, type Basis, rolloverBars } from '@/lib/views';

function missingNote(b: Bar): string {
  const parts = [
    b.missingRent ? `${b.missingRent} with no rent` : '',
    b.missingArea ? `${b.missingArea} with no area` : '',
  ].filter(Boolean);
  return parts.length ? ` Sums leave out ${parts.join(' and ')}.` : '';
}

/** A zero that only exists because nothing was recorded is not shown as a figure. */
const cell = (leases: number, missing: number, text: string) =>
  leases > 0 && missing >= leases ? NOT_RECORDED : text;

/** One series, so no legend: the title names it. Hover, focus or tap reads a bar; every value is also in the table. */
export function RolloverChart({ schedule }: { schedule: RolloverView['schedule'] }) {
  const [basis, setBasis] = useState<Basis>('rent');
  const [table, setTable] = useState(false);
  const bars = rolloverBars(schedule, basis);
  const peak = Math.max(...bars.map((b) => b.share ?? 0));
  const peakKey = peak > 0 ? bars.find((b) => b.share === peak)?.key : undefined;
  const [selected, setSelected] = useState<string | undefined>();
  const shown = bars.find((b) => b.key === (selected ?? peakKey));
  const noData = peak === 0;

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Segmented
          label="Measure rollover by"
          value={basis}
          onChange={setBasis}
          options={[
            { value: 'rent', label: 'Rent' },
            { value: 'area', label: 'Area' },
          ]}
        />
        <Button variant="ghost" aria-pressed={table} onClick={() => setTable(!table)}>
          {table ? 'Show chart' : 'Show table'}
        </Button>
      </div>
      {noData && !table ? (
        <p className="text-base text-muted">
          No {basis} is recorded on leases with an expiration, so there is nothing to chart.
        </p>
      ) : null}
      {!noData && !table ? (
        <>
          <p aria-live="polite" className="min-h-10 text-sm text-muted">
            {shown ? (
              <>
                <span className="font-medium text-ink">{shown.label}:</span> {percent(shown.share)} of {basis}
                , {cell(shown.leases, shown.missingRent, money(shown.annualRentCents))},{' '}
                {cell(shown.leases, shown.missingArea, area(shown.areaSf))}, {leaseCount(shown.leases)}.
                {missingNote(shown)} Cumulative {percent(shown.cumulative)}.
              </>
            ) : null}
          </p>
          <ul
            className="m-0 flex h-48 list-none items-end gap-0.5 border-b border-line p-0"
            onMouseLeave={() => setSelected(undefined)}
          >
            {bars.map((b) => (
              <li key={b.key} className="flex h-full min-w-0 flex-1">
                <button
                  type="button"
                  aria-label={`${b.label}: ${percent(b.share)} of ${basis}, ${leaseCount(b.leases)}`}
                  onMouseEnter={() => setSelected(b.key)}
                  onFocus={() => setSelected(b.key)}
                  onClick={() => setSelected(b.key)}
                  className="flex h-full w-full items-end"
                >
                  <span
                    className={`block w-full rounded-t-sm ${b.key === shown?.key ? 'bg-accent' : 'bg-accent opacity-60'}`}
                    style={{ height: `${((b.share ?? 0) / peak) * 100}%` }}
                  />
                </button>
              </li>
            ))}
          </ul>
          <div aria-hidden className="-mt-2 flex gap-0.5 text-xs text-muted tabular-nums">
            {bars.map((b) => (
              <span key={b.key} className="min-w-0 flex-1 overflow-hidden text-center whitespace-nowrap">
                {b.short}
              </span>
            ))}
          </div>
        </>
      ) : null}
      {table ? (
        <TableWrap label="Rollover by year">
          <thead>
            <tr>
              <Th>Period</Th>
              <Th numeric>Leases</Th>
              <Th numeric>Area</Th>
              <Th numeric>Rent</Th>
              <Th numeric>Share</Th>
              <Th numeric>Cumulative</Th>
            </tr>
          </thead>
          <tbody>
            {bars.map((b) => (
              <tr key={b.key}>
                <Td>{b.label}</Td>
                <Td numeric>{b.leases}</Td>
                <Td numeric>{cell(b.leases, b.missingArea, area(b.areaSf))}</Td>
                <Td numeric>{cell(b.leases, b.missingRent, money(b.annualRentCents))}</Td>
                <Td numeric>{percent(b.share)}</Td>
                <Td numeric>{percent(b.cumulative)}</Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      ) : null}
      {schedule.unknownExpiration.leases > 0 ? (
        <p className="text-xs text-muted">
          {leaseCount(schedule.unknownExpiration.leases)} with no expiration recorded not in this chart.
        </p>
      ) : null}
    </div>
  );
}
