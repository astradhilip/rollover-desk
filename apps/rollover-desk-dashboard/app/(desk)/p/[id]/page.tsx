'use client';

import { EmptyState, ErrorState, KpiTile, Loading, PageHead, Panel } from '@rollover-desk/ui-web';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { api, errorMessage } from '@/lib/api';
import { area, money, partialTotal, percent, years } from '@/lib/format';

const tile = ({ value, detail }: { value: string; detail: string | undefined }) => ({
  value,
  ...(detail ? { detail } : {}),
});

export default function DeskPage() {
  const { id } = useParams<{ id: string }>();
  const property = useQuery({ queryKey: ['property', id], queryFn: () => api.property(id) });
  const roll = useQuery({ queryKey: ['rollover', id], queryFn: () => api.rollover(id) });
  const failed = property.error ?? roll.error;
  const r = roll.data;
  return (
    <>
      <PageHead title={property.data?.name ?? 'Property'} note={r ? `As of ${r.asOf}` : undefined} />
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
          <EmptyState title="No rent roll yet">This property has no confirmed rent roll.</EmptyState>
        </Panel>
      ) : null}
      {r && r.schedule.totals.leases > 0 ? (
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
            detail={`${r.walt.byArea.excludedLeases} leases left out`}
          />
          <KpiTile
            label="Month-to-month or expired"
            value={percent(r.schedule.mtmOrExpired.rentShare)}
            detail="Share of rent"
          />
        </div>
      ) : null}
    </>
  );
}
