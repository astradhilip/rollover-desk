'use client';

import { LeaseField } from '@rollover-desk/contracts';
import {
  Badge,
  Button,
  ErrorState,
  Loading,
  PageHead,
  Panel,
  Td,
  TableWrap,
  Th,
} from '@rollover-desk/ui-web';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { api, errorMessage } from '@/lib/api';
import { area, money, NOT_RECORDED, rowCount } from '@/lib/format';
import { useAction, useCanEdit } from '@/lib/hooks';

const FIELD: Record<string, string> = {
  suite: 'Suite',
  tenant: 'Tenant',
  area: 'Area (SF)',
  annualRent: 'Annual rent',
  monthlyRent: 'Monthly rent',
  annualRentPsf: 'Annual rent per SF',
  monthlyRentPsf: 'Monthly rent per SF',
  commencement: 'Commencement',
  expiration: 'Expiration',
  noticeMonths: 'Notice months',
  stepDate: 'Rent step date',
  stepRent: 'Rent step amount',
  rentUnknownBasis: 'Rent, basis unclear',
};

function ColumnSelect({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  disabled: boolean;
  onChange: (v: string) => void;
}) {
  const id = useId();
  return (
    <>
      <label htmlFor={id} className="sr-only">
        Field for column {label}
      </label>
      <select
        id={id}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-11 rounded-md border border-line bg-surface px-2 text-base text-ink lg:min-h-8"
      >
        <option value="">Not used</option>
        {LeaseField.options.map((f) => (
          <option key={f} value={f}>
            {FIELD[f] ?? f}
          </option>
        ))}
      </select>
    </>
  );
}

export default function ImportReviewPage() {
  const { id, importId } = useParams<{ id: string; importId: string }>();
  const router = useRouter();
  const canEdit = useCanEdit();
  const [acknowledged, setAcknowledged] = useState(false);
  const q = useQuery({ queryKey: ['import', id, importId], queryFn: () => api.import(id, importId) });
  const mapping = useAction((overrides: { column: number; field: string | null }[]) =>
    api.setMapping(id, importId, overrides),
  );
  const confirm = useAction(
    (ack: boolean) => api.confirmImport(id, importId, ack),
    () => router.push(`/p/${id}`),
  );
  if (q.isPending)
    return (
      <Panel>
        <Loading label="Loading review" rows={6} />
      </Panel>
    );
  if (!q.data)
    return (
      <Panel>
        <ErrorState
          title="This rent roll didn’t load"
          message={errorMessage(q.error)}
          onRetry={() => q.refetch()}
        />
      </Panel>
    );
  const { import: record, review } = q.data;
  const pending = record.status === 'pending';
  const editable = canEdit && pending;
  const blocking = review.issues.filter((i) => i.severity === 'blocking');
  const warnings = review.issues.filter((i) => i.severity === 'warning');
  const needsAck = warnings.length > 0;
  // A flagged row is marked where it is read, and comes first.
  const flags = new Map<number, 'blocking' | 'warning'>();
  for (const i of review.issues) {
    if (i.row && flags.get(i.row) !== 'blocking') flags.set(i.row, i.severity);
  }
  const rank = (row: number) => (flags.get(row) === 'blocking' ? 0 : flags.has(row) ? 1 : 2);
  const rows = [...review.leases].sort(
    (a, b) => rank(a.sourceRow) - rank(b.sourceRow) || a.sourceRow - b.sourceRow,
  );

  function setField(column: number, field: string) {
    const kept = review.columns
      .filter((c) => c.overridden && c.index !== column)
      .map((c) => ({ column: c.index, field: c.field }));
    mapping.mutate([...kept, { column, field: field || null }]);
    setAcknowledged(false);
  }

  return (
    <>
      <PageHead
        title={record.filename}
        note={
          <Link href={`/p/${id}/rent-rolls`} className="text-accent-text underline">
            All rent rolls
          </Link>
        }
        actions={
          pending ? (
            <Badge tone="warn">Waiting for review</Badge>
          ) : (
            <Badge tone={record.status === 'confirmed' ? 'good' : 'neutral'}>
              {record.status === 'confirmed'
                ? 'Current'
                : record.status === 'replaced'
                  ? 'Replaced'
                  : 'Reverted'}
            </Badge>
          )
        }
      />
      {editable ? (
        <Panel title="Confirm">
          <div className="flex flex-col items-start gap-3 p-4">
            {blocking.length ? (
              <p className="m-0 text-base text-bad">
                {blocking.length} {blocking.length === 1 ? 'issue blocks' : 'issues block'} this rent roll.
                Fix the column mapping or correct the file and upload it again.
              </p>
            ) : (
              <p className="m-0 text-base text-ink">
                {rowCount(review.leases.length)} ready. Confirming makes this the current rent roll, and you
                can revert it later.
              </p>
            )}
            {needsAck && !blocking.length ? (
              <label className="flex min-h-11 items-center gap-2 text-base text-ink lg:min-h-9">
                <input
                  type="checkbox"
                  checked={acknowledged}
                  onChange={(e) => setAcknowledged(e.target.checked)}
                  className="size-4 accent-accent"
                />
                I’ve read the {warnings.length} {warnings.length === 1 ? 'warning' : 'warnings'} below
              </label>
            ) : null}
            <Button
              variant="primary"
              disabled={
                !review.canConfirm || (needsAck && !acknowledged) || confirm.isPending || mapping.isPending
              }
              onClick={() => confirm.mutate(needsAck)}
            >
              Confirm rent roll
            </Button>
            {confirm.isError ? (
              <p role="alert" className="m-0 text-sm text-bad">
                {errorMessage(confirm.error)}
              </p>
            ) : null}
          </div>
        </Panel>
      ) : null}
      {review.issues.length ? (
        <Panel title={`Issues (${review.issues.length})`}>
          <ul className="m-0 list-none divide-y divide-line-2 p-0">
            {[...blocking, ...warnings].map((i, n) => (
              <li key={n} className="flex flex-wrap items-baseline gap-2 px-4 py-2 text-base">
                <Badge tone={i.severity === 'blocking' ? 'bad' : 'warn'}>
                  {i.severity === 'blocking' ? 'Blocks' : 'Warning'}
                </Badge>
                {i.row ? <span className="text-sm text-muted tabular-nums">Row {i.row}</span> : null}
                <span className="min-w-0 text-ink">{i.message}</span>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}
      <Panel title="Column mapping">
        {mapping.isError ? (
          <p role="alert" className="m-0 px-4 py-2 text-sm text-bad">
            {errorMessage(mapping.error)}
          </p>
        ) : null}
        <TableWrap label="Column mapping">
          <thead>
            <tr>
              <Th>Column in the file</Th>
              <Th>Read as</Th>
              <Th numeric>Match</Th>
            </tr>
          </thead>
          <tbody>
            {review.columns.map((c) => (
              <tr key={c.index}>
                <Td>{c.header || `Column ${c.index + 1}`}</Td>
                <Td>
                  {editable ? (
                    <ColumnSelect
                      label={c.header}
                      value={c.field ?? ''}
                      disabled={mapping.isPending}
                      onChange={(v) => setField(c.index, v)}
                    />
                  ) : c.field ? (
                    FIELD[c.field]
                  ) : (
                    'Not used'
                  )}
                </Td>
                <Td numeric>{c.overridden ? 'Set by you' : `${Math.round(c.confidence * 100)}%`}</Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      </Panel>
      <Panel title={`Rows read (${review.leases.length})`}>
        <TableWrap label="Rows read">
          <thead>
            <tr>
              <Th numeric>Row</Th>
              <Th>Check</Th>
              <Th>Suite</Th>
              <Th>Tenant</Th>
              <Th numeric>Area</Th>
              <Th numeric>Annual rent</Th>
              <Th>Expiration</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((l) => (
              <tr key={l.id}>
                <Td numeric>{l.sourceRow}</Td>
                <Td>
                  {flags.get(l.sourceRow) === 'blocking' ? <Badge tone="bad">Blocks</Badge> : null}
                  {flags.get(l.sourceRow) === 'warning' ? <Badge tone="warn">Warning</Badge> : null}
                </Td>
                <Td>{l.suite}</Td>
                <Td>{l.status === 'vacant' ? <Badge>Vacant</Badge> : (l.tenantName ?? NOT_RECORDED)}</Td>
                <Td numeric>{area(l.areaSf)}</Td>
                <Td numeric>{l.status === 'vacant' ? '' : money(l.annualRentCents)}</Td>
                <Td>
                  {l.isMonthToMonth
                    ? 'Month-to-month'
                    : l.status === 'vacant'
                      ? ''
                      : (l.expirationDate ?? NOT_RECORDED)}
                </Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      </Panel>
      {review.skippedRows.length ? (
        <Panel title={`Rows skipped (${review.skippedRows.length})`}>
          <ul className="m-0 list-none divide-y divide-line-2 p-0">
            {review.skippedRows.map((s) => (
              <li key={s.row} className="flex flex-wrap gap-2 px-4 py-2 text-sm">
                <span className="text-muted tabular-nums">Row {s.row}</span>
                <span className="text-ink">{s.reason}</span>
                <span className="min-w-0 break-words text-muted">{s.text}</span>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}
    </>
  );
}
