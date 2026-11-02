'use client';

import {
  Badge,
  EmptyState,
  ErrorState,
  KpiTile,
  Loading,
  PageHead,
  Panel,
  Td,
  TableWrap,
  Th,
} from '@rollover-desk/ui-web';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { AttentionQueue } from '@/components/AttentionQueue';
import { DownloadWorkbook } from '@/components/DownloadWorkbook';
import { RolloverChart } from '@/components/RolloverChart';
import { api, errorMessage } from '@/lib/api';
import { area, leaseCount, money, partialTotal, percent, years } from '@/lib/format';
import { useCanEdit } from '@/lib/hooks';

const tile = ({ value, detail }: { value: string; detail: string | undefined }) => ({
  value,
  ...(detail ? { detail } : {}),
});

export default function DeskPage() {
  const { id } = useParams<{ id: string }>();
  const canEdit = useCanEdit();
  const property = useQuery({ queryKey: ['property', id], queryFn: () => api.property(id) });
  const roll = useQuery({ queryKey: ['rollover', id], queryFn: () => api.rollover(id) });
  const attention = useQuery({ queryKey: ['attention', id], queryFn: () => api.attention(id) });
  const failed = property.error ?? roll.error;
  const r = roll.data;
  return (
    <>
      <PageHead
        title={property.data?.name ?? 'Property'}
        note={r ? `As of ${r.asOf}` : undefined}
        actions={canEdit && r && r.schedule.totals.leases > 0 ? <DownloadWorkbook id={id} /> : undefined}
      />
      {failed ? (
        <Panel>
          <ErrorState
            title="This property didn’t load"
            message={errorMessage(failed)}
            onRetry={() => {
              void property.refetch();
              void roll.refetch();
            }}
          />
        </Panel>
      ) : null}
      {!failed && !r ? (
        <Panel>
          <Loading label="Loading rollover" />
        </Panel>
      ) : null}
      {r && r.schedule.totals.leases === 0 ? (
        <Panel>
          <EmptyState
            title="No rent roll yet"
            action={
              canEdit ? (
                <Link
                  href={`/p/${id}/rent-rolls`}
                  className="inline-flex min-h-11 items-center rounded-md bg-accent px-3 text-base font-medium text-accent-ink lg:min-h-9"
                >
                  Upload a rent roll
                </Link>
              ) : undefined
            }
          >
            {canEdit
              ? 'Upload one to see rollover and critical dates.'
              : 'An analyst needs to upload and confirm one.'}
          </EmptyState>
        </Panel>
      ) : null}
      {r && r.schedule.totals.leases > 0 ? (
        <>
          <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
            <KpiTile
              label="Leased area"
              {...tile(
                partialTotal(
                  r.schedule.totals.leases,
                  r.schedule.leasesMissingArea,
                  'area',
                  area,
                  r.schedule.totals.areaSf,
                ),
              )}
            />
            <KpiTile
              label="Annual rent"
              {...tile(
                partialTotal(
                  r.schedule.totals.leases,
                  r.schedule.leasesMissingRent,
                  'rent',
                  money,
                  r.schedule.totals.annualRentCents,
                ),
              )}
            />
            <KpiTile
              label="WALT by area"
              value={years(r.walt.byArea.years)}
              detail={`${leaseCount(r.walt.byArea.excludedLeases)} left out`}
            />
            <KpiTile
              label="Month-to-month or expired"
              value={percent(r.schedule.mtmOrExpired.rentShare)}
              detail="Share of rent"
            />
          </div>
          <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
            <Panel title="Needs attention">
              {attention.isPending ? <Loading label="Loading attention queue" /> : null}
              {attention.isError ? (
                <ErrorState
                  title="The queue didn’t load"
                  message={errorMessage(attention.error)}
                  onRetry={() => attention.refetch()}
                />
              ) : null}
              {attention.data ? <AttentionQueue id={id} view={attention.data} /> : null}
            </Panel>
            <div className="flex min-w-0 flex-col gap-4">
              <Panel title="Rollover by year">
                <RolloverChart schedule={r.schedule} />
              </Panel>
              <Panel title="Loan and vacating">
                <dl className="m-0 flex flex-col gap-2 p-4 text-base">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <dt className="text-muted">Largest tenant against loan maturity</dt>
                    <dd className="m-0">
                      {r.largestTenant === null || r.largestTenant.expiresFirst === null ? (
                        <Badge>Not recorded</Badge>
                      ) : r.largestTenant.expiresFirst ? (
                        <Badge tone="bad">{r.largestTenant.tenant} expires first</Badge>
                      ) : (
                        <Badge tone="good">{r.largestTenant.tenant} stays past it</Badge>
                      )}
                    </dd>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <dt className="text-muted">Projected vacating</dt>
                    <dd className="m-0 text-ink tabular-nums">
                      {leaseCount(r.projectedVacating.leases)},{' '}
                      {
                        partialTotal(
                          r.projectedVacating.leases,
                          r.projectedVacating.leasesMissingArea,
                          'area',
                          area,
                          r.projectedVacating.areaSf,
                        ).value
                      }
                      ,{' '}
                      {
                        partialTotal(
                          r.projectedVacating.leases,
                          r.projectedVacating.leasesMissingRent,
                          'rent',
                          money,
                          r.projectedVacating.annualRentCents,
                        ).value
                      }
                      {r.projectedVacating.leasesMissingArea + r.projectedVacating.leasesMissingRent > 0
                        ? ' (some not recorded)'
                        : ''}
                    </dd>
                  </div>
                </dl>
              </Panel>
              <Panel title="Largest tenants">
                <TableWrap label="Largest tenants by rent">
                  <thead>
                    <tr>
                      <Th>Tenant</Th>
                      <Th numeric>Rent</Th>
                      <Th numeric>Share</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.concentration.tenants.slice(0, 5).map((t) => (
                      <tr key={t.key}>
                        <Td>{t.tenant}</Td>
                        <Td numeric>{money(t.annualRentCents)}</Td>
                        <Td numeric>{percent(t.share)}</Td>
                      </tr>
                    ))}
                  </tbody>
                </TableWrap>
                {r.concentration.leasesMissingRent + r.concentration.leasesMissingName > 0 ? (
                  <p className="m-0 px-4 py-2 text-xs text-muted">
                    Leaves out {r.concentration.leasesMissingRent} leases with no rent and{' '}
                    {r.concentration.leasesMissingName} with no tenant name.
                  </p>
                ) : null}
              </Panel>
            </div>
          </div>
        </>
      ) : null}
    </>
  );
}
