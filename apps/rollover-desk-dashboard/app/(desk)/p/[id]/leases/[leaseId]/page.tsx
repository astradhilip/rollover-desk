'use client';

import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  Loading,
  PageHead,
  Panel,
  SurveyLine,
  Td,
  TableWrap,
  TextField,
  Th,
} from '@rollover-desk/ui-web';
import { useMutation, useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { api, errorMessage } from '@/lib/api';
import { area, money, NOT_RECORDED, percent, years } from '@/lib/format';
import { markState, percentToBps, STAGE_LABEL } from '@/lib/views';

const ABSENT: Record<string, string> = {
  notice: 'No notice date recorded',
  expiration: 'No expiration recorded',
  loan_maturity: 'No loan maturity recorded for this property',
};

const RATES = [
  ['renewalLandlordBps', 'Renewal, landlord rep %'],
  ['renewalTenantBps', 'Renewal, tenant rep %'],
  ['newLandlordBps', 'New lease, landlord rep %'],
  ['newTenantBps', 'New lease, tenant rep %'],
] as const;

function Commission({ id, leaseId }: { id: string; leaseId: string }) {
  const [invalid, setInvalid] = useState<string | null>(null);
  const estimate = useMutation({
    mutationFn: (rates: Parameters<typeof api.commission>[2]) => api.commission(id, leaseId, rates),
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const termYears = Number(data.get('termYears'));
    const [a, b, c, d] = RATES.map(([key]) => percentToBps(String(data.get(key))));
    if (
      !Number.isInteger(termYears) ||
      termYears < 1 ||
      termYears > 50 ||
      a == null ||
      b == null ||
      c == null ||
      d == null
    ) {
      // The old figures no longer match the form.
      estimate.reset();
      setInvalid('Enter a term from 1 to 50 years and all four rates, as percentages from 0 to 100.');
      return;
    }
    setInvalid(null);
    estimate.mutate({
      termYears,
      renewalLandlordBps: a,
      renewalTenantBps: b,
      newLandlordBps: c,
      newTenantBps: d,
    });
  }

  const e = estimate.data?.estimate;
  return (
    <div className="flex flex-col gap-3 p-4">
      <p className="m-0 max-w-prose text-base text-muted">
        Rates vary by deal, so none are assumed. Enter yours.
      </p>
      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
        <TextField label="Term in years" name="termYears" inputMode="numeric" required />
        {RATES.map(([key, label]) => (
          <TextField key={key} label={label} name={key} inputMode="decimal" required />
        ))}
        <div className="flex items-end">
          <Button type="submit" disabled={estimate.isPending}>
            Estimate commission
          </Button>
        </div>
      </form>
      {invalid ? (
        <p role="alert" className="m-0 text-sm text-bad">
          {invalid}
        </p>
      ) : null}
      {estimate.isError ? (
        <p role="alert" className="m-0 text-sm text-bad">
          {errorMessage(estimate.error)}
        </p>
      ) : null}
      {estimate.data?.reason ? <p className="m-0 text-base text-ink">{estimate.data.reason}</p> : null}
      {e ? (
        <TableWrap label="Commission estimate">
          <thead>
            <tr>
              <Th>Outcome</Th>
              <Th numeric>Landlord rep</Th>
              <Th numeric>Tenant rep</Th>
              <Th numeric>Total</Th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <Td>Renewal</Td>
              <Td numeric>{money(e.renewal.landlordRep.totalCommissionCents)}</Td>
              <Td numeric>{money(e.renewal.tenantRep.totalCommissionCents)}</Td>
              <Td numeric>{money(e.renewal.totalCommissionCents)}</Td>
            </tr>
            <tr>
              <Td>Replacement</Td>
              <Td numeric>{money(e.replacement.landlordRep.totalCommissionCents)}</Td>
              <Td numeric>{money(e.replacement.tenantRep.totalCommissionCents)}</Td>
              <Td numeric>{money(e.replacement.totalCommissionCents)}</Td>
            </tr>
          </tbody>
        </TableWrap>
      ) : null}
    </div>
  );
}

export default function LeaseDetailPage() {
  const { id, leaseId } = useParams<{ id: string; leaseId: string }>();
  const q = useQuery({ queryKey: ['lease', id, leaseId], queryFn: () => api.lease(id, leaseId) });
  const l = q.data;
  if (q.isPending)
    return (
      <Panel>
        <Loading label="Loading lease" rows={6} />
      </Panel>
    );
  if (!l)
    return (
      <Panel>
        <ErrorState
          title="This lease didn’t load"
          message={errorMessage(q.error)}
          onRetry={() => q.refetch()}
        />
      </Panel>
    );
  const dates = [...l.criticalDates.passed, ...l.criticalDates.upcoming];
  const facts: [string, string][] = [
    ['Area', area(l.areaSf)],
    ['Annual rent', l.status === 'vacant' ? 'Vacant' : money(l.annualRentCents)],
    ['Commencement', l.commencementDate ?? NOT_RECORDED],
    ['Remaining term', years(l.remainingYears)],
    ['Mark-to-market', percent(l.markToMarketPct === null ? null : l.markToMarketPct)],
    [
      'Expires before loan maturity',
      l.expiresBeforeLoanMaturity === null ? NOT_RECORDED : l.expiresBeforeLoanMaturity ? 'Yes' : 'No',
    ],
  ];
  return (
    <>
      <PageHead
        title={`Suite ${l.suite}${l.tenantName ? `, ${l.tenantName}` : ''}`}
        note={
          <Link href={`/p/${id}/leases`} className="text-accent-text underline">
            All leases
          </Link>
        }
        actions={
          l.deal ? (
            <Badge tone="accent">{STAGE_LABEL[l.deal.stage]}</Badge>
          ) : (
            <Link href={`/p/${id}/pipeline`} className="text-sm text-accent-text underline">
              Renewal pipeline
            </Link>
          )
        }
      />
      <Panel title="Critical dates">
        <div className="p-4">
          {l.isMonthToMonth ? (
            <p className="mt-0 mb-3 text-base text-ink">Month-to-month: no fixed expiration.</p>
          ) : null}
          {dates.length ? (
            <SurveyLine
              asOf={l.asOf}
              marks={[
                ...(l.commencementDate
                  ? [{ date: l.commencementDate, label: 'Commencement', state: 'start' as const }]
                  : []),
                ...dates.map((d) => ({ date: d.date, label: d.label, state: markState(d.daysAway) })),
              ]}
            />
          ) : null}
          {!dates.length ? <EmptyState title="No dates recorded" /> : null}
          {l.criticalDates.absent.length ? (
            <ul className="mt-3 mb-0 flex list-none flex-wrap gap-2 p-0">
              {l.criticalDates.absent.map((a) => (
                <li key={a}>
                  <Badge tone="warn">{ABSENT[a]}</Badge>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </Panel>
      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        <Panel title="Why this risk score">
          {l.risk.scored ? (
            <>
              <p className="m-0 px-4 pt-3 text-kpi leading-none font-semibold text-ink tabular-nums">
                {l.risk.score.toFixed(0)} <span className="text-base font-normal text-muted">out of 100</span>
              </p>
              <div className="mt-3">
                <TableWrap label="Risk score parts">
                  <thead>
                    <tr>
                      <Th>Part</Th>
                      <Th numeric>Set</Th>
                      <Th numeric>Applied</Th>
                      <Th numeric>Points</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {l.risk.components.map((c) => (
                      <tr key={c.key}>
                        <Td>
                          <div className="font-medium">{c.label}</div>
                          <div className="text-xs text-muted">{c.detail}</div>
                        </Td>
                        <Td numeric>{c.weight}</Td>
                        <Td numeric>{c.appliedWeight.toFixed(1)}</Td>
                        <Td numeric>{c.points.toFixed(1)}</Td>
                      </tr>
                    ))}
                  </tbody>
                </TableWrap>
              </div>
              {l.risk.leftOut.length ? (
                <ul className="m-0 list-none px-4 py-3 text-sm text-muted">
                  <li>
                    Parts left out had no data, so the others were rescaled to total 100. Applied weights are
                    rounded.
                  </li>
                  {l.risk.leftOut.map((o) => (
                    <li key={o.key}>
                      Left out, {o.label}: {o.reason}
                    </li>
                  ))}
                </ul>
              ) : null}
            </>
          ) : (
            <div className="flex flex-col gap-2 p-4">
              <div>
                <Badge>Not scored</Badge>
              </div>
              <ul className="m-0 list-none p-0 text-base text-ink">
                {l.risk.reasons.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </div>
          )}
        </Panel>
        <Panel title="Lease facts">
          <dl className="m-0 grid grid-cols-2 gap-3 p-4">
            {facts.map(([k, v]) => (
              <div key={k}>
                <dt className="text-sm text-muted">{k}</dt>
                <dd className="m-0 text-base text-ink tabular-nums">{v}</dd>
              </div>
            ))}
          </dl>
        </Panel>
      </div>
      {l.status === 'occupied' ? (
        <Panel title="Commission, renewal against replacement">
          <Commission id={id} leaseId={leaseId} />
        </Panel>
      ) : null}
    </>
  );
}
