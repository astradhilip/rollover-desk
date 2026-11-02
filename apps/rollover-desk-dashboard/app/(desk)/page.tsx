'use client';

import { EmptyState, ErrorState, Loading, PageHead, Panel, Td, TableWrap, Th } from '@rollover-desk/ui-web';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { api, errorMessage } from '@/lib/api';
import { moneyPsf } from '@/lib/format';

export default function PropertiesPage() {
  const q = useQuery({ queryKey: ['properties'], queryFn: api.properties });
  return (
    <>
      <PageHead title="Properties" note="Open a property to see its rollover and critical dates." />
      <Panel>
        {q.isPending ? <Loading label="Loading properties" /> : null}
        {q.isError ? (
          <ErrorState
            title="Properties didn’t load"
            message={errorMessage(q.error)}
            onRetry={() => q.refetch()}
          />
        ) : null}
        {q.data?.properties.length === 0 ? (
          <EmptyState title="No properties yet">Ask an analyst to add the first one.</EmptyState>
        ) : null}
        {q.data?.properties.length ? (
          <TableWrap label="Properties">
            <thead>
              <tr>
                <Th>Property</Th>
                <Th>Loan maturity</Th>
                <Th numeric>Market rent per SF</Th>
              </tr>
            </thead>
            <tbody>
              {q.data.properties.map((p) => (
                <tr key={p.id}>
                  <Td>
                    <Link href={`/p/${p.id}`} className="font-medium text-accent-text underline">
                      {p.name}
                    </Link>
                  </Td>
                  <Td>{p.loanMaturityDate ?? 'Not recorded'}</Td>
                  <Td numeric>{moneyPsf(p.marketRentPsfCents)}</Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        ) : null}
      </Panel>
    </>
  );
}
