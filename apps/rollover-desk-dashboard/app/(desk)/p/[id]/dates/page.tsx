'use client';

import {
  Badge,
  EmptyState,
  ErrorState,
  Loading,
  PageHead,
  Panel,
  Segmented,
  SurveyLine,
  type Tone,
} from '@rollover-desk/ui-web';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { api, errorMessage } from '@/lib/api';
import { calendar, type CalendarItem, markState } from '@/lib/views';

const STATE: Record<ReturnType<typeof markState>, { tone: Tone; word: string }> = {
  passed: { tone: 'bad', word: 'Passed' },
  soon: { tone: 'warn', word: 'Soon' },
  upcoming: { tone: 'neutral', word: 'Upcoming' },
};
const MISSING: Record<string, string> = {
  notice: 'notice date',
  expiration: 'expiration',
  loan_maturity: 'loan maturity',
};

function Row({ id, item, full }: { id: string; item: CalendarItem; full?: boolean }) {
  const state = STATE[markState(item.daysAway)];
  return (
    <li className="flex flex-col gap-0.5 py-1.5 text-sm">
      <span className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-ink tabular-nums">{full ? item.date : item.date.slice(8)}</span>
        {item.leaseId ? (
          <Link href={`/p/${id}/leases/${item.leaseId}`} className="text-accent-text underline">
            {item.suite}
          </Link>
        ) : (
          <span className="text-ink">Property</span>
        )}
        <Badge tone={state.tone}>{state.word}</Badge>
      </span>
      <span className="text-muted">
        {item.label}
        {item.tenantName ? `, ${item.tenantName}` : ''}
      </span>
    </li>
  );
}

export default function DatesPage() {
  const { id } = useParams<{ id: string }>();
  const q = useQuery({ queryKey: ['dates', id], queryFn: () => api.criticalDates(id) });
  const [kind, setKind] = useState('all');
  const c = q.data ? calendar(q.data, kind === 'all' ? null : kind) : null;
  return (
    <>
      <PageHead
        title="Critical dates"
        note={q.data ? `Twelve months from ${q.data.asOf}. Missing dates are listed, not hidden.` : undefined}
        actions={
          <Segmented
            label="Show dates of type"
            value={kind}
            onChange={setKind}
            options={[
              { value: 'all', label: 'All' },
              { value: 'notice', label: 'Notice' },
              { value: 'expiration', label: 'Expiration' },
              { value: 'rent_step', label: 'Rent steps' },
            ]}
          />
        }
      />
      {q.isPending ? (
        <Panel>
          <Loading label="Loading critical dates" rows={6} />
        </Panel>
      ) : null}
      {q.isError ? (
        <Panel>
          <ErrorState title="Dates didn’t load" message={errorMessage(q.error)} onRetry={() => q.refetch()} />
        </Panel>
      ) : null}
      {q.data?.leases.length === 0 ? (
        <Panel>
          <EmptyState title="No dates yet">Confirm a rent roll to see its dates here.</EmptyState>
        </Panel>
      ) : null}
      {c && q.data?.leases.length ? (
        <>
          <Panel title="Every expiration, measured from today">
            <div className="p-4">
              <SurveyLine
                asOf={q.data.asOf}
                list={false}
                marks={q.data.leases.flatMap((l) =>
                  [...l.passed, ...l.upcoming]
                    .filter((d) => d.kind === 'expiration')
                    .map((d) => ({
                      date: d.date,
                      label: `${l.suite} ${d.label}`,
                      state: markState(d.daysAway),
                    })),
                )}
                caption={`Heavy tick marks today, ${q.data.asOf}. Each point is a lease expiration; they are listed by month below.`}
              />
            </div>
          </Panel>
          <div className="grid gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {c.months.map((m) => (
              <section key={m.key} className="min-w-0 bg-surface p-3">
                <h2 className="text-base font-semibold text-ink">{m.label}</h2>
                {m.items.length ? (
                  <ul className="m-0 list-none divide-y divide-line-2 p-0">
                    {m.items.map((i) => (
                      <Row key={`${i.leaseId}${i.kind}${i.date}`} id={id} item={i} />
                    ))}
                  </ul>
                ) : (
                  <p className="m-0 pt-1 text-sm text-muted">Nothing due</p>
                )}
              </section>
            ))}
          </div>
          <div className="grid gap-4 lg:grid-cols-3 lg:items-start">
            <Panel title={`Passed (${c.passed.length})`}>
              <ul className="m-0 list-none divide-y divide-line-2 px-4 py-1">
                {c.passed.map((i) => (
                  <Row key={`${i.leaseId}${i.kind}${i.date}`} id={id} item={i} full />
                ))}
              </ul>
            </Panel>
            <Panel title={`Later (${c.later.length})`}>
              <ul className="m-0 list-none divide-y divide-line-2 px-4 py-1">
                {c.later.map((i) => (
                  <Row key={`${i.leaseId}${i.kind}${i.date}`} id={id} item={i} full />
                ))}
              </ul>
            </Panel>
            <Panel title={`Missing dates (${c.absent.length + (c.loanMissing ? 1 : 0)})`}>
              <ul className="m-0 list-none divide-y divide-line-2 px-4 py-1 text-sm">
                {c.loanMissing ? (
                  <li className="py-1.5 text-muted">The property has no loan maturity</li>
                ) : null}
                {c.absent.map((a) => (
                  <li key={a.leaseId} className="py-1.5 text-muted">
                    <Link href={`/p/${id}/leases/${a.leaseId}`} className="text-accent-text underline">
                      {a.suite}
                    </Link>{' '}
                    has no {a.missing.map((m) => MISSING[m] ?? m).join(' or ')}
                  </li>
                ))}
              </ul>
            </Panel>
          </div>
        </>
      ) : null}
    </>
  );
}
