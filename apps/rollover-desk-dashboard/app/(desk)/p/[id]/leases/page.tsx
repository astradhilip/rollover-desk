'use client';

import {
  Badge,
  EmptyState,
  ErrorState,
  Loading,
  PageHead,
  Panel,
  SelectField,
  Td,
  TableWrap,
  TextField,
  Th,
} from '@rollover-desk/ui-web';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { api, errorMessage } from '@/lib/api';
import { area, money, NOT_RECORDED } from '@/lib/format';
import { filterLeases, type LeaseSort, sortLeases } from '@/lib/views';

export default function LeasesPage() {
  const { id } = useParams<{ id: string }>();
  const q = useQuery({ queryKey: ['leases', id], queryFn: () => api.leases(id) });
  const [text, setText] = useState('');
  const [sort, setSort] = useState<LeaseSort>('expiration');
  const rows = q.data ? sortLeases(filterLeases(q.data.leases, text), sort) : [];
  return (
    <>
      <PageHead title="Leases" note="Open a lease to see why it scored as it did." />
      <div className="grid gap-3 sm:grid-cols-2 lg:max-w-xl">
        <TextField
          label="Search"
          type="search"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Suite or tenant"
        />
        <SelectField label="Sort by" value={sort} onChange={(e) => setSort(e.target.value as LeaseSort)}>
          <option value="expiration">Soonest expiration</option>
          <option value="risk">Highest risk</option>
          <option value="rent">Highest rent</option>
        </SelectField>
      </div>
      <Panel>
        {q.isPending ? <Loading label="Loading leases" rows={6} /> : null}
        {q.isError ? (
          <ErrorState
            title="Leases didn’t load"
            message={errorMessage(q.error)}
            onRetry={() => q.refetch()}
          />
        ) : null}
        {q.data?.leases.length === 0 ? (
          <EmptyState title="No leases yet">Confirm a rent roll to see its leases here.</EmptyState>
        ) : null}
        {q.data?.leases.length && rows.length === 0 ? (
          <EmptyState title="No matches">Try a different suite or tenant.</EmptyState>
        ) : null}
        {rows.length ? (
          <>
            <p className="m-0 px-4 pt-2 text-xs text-muted lg:hidden">
              Scroll the table sideways for area and rent.
            </p>
            <TableWrap label="Leases">
              <thead>
                <tr>
                  <Th>Suite</Th>
                  <Th>Tenant</Th>
                  <Th numeric>Risk</Th>
                  <Th>Expiration</Th>
                  <Th>Notice</Th>
                  <Th numeric>Area</Th>
                  <Th numeric>Annual rent</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((l) => (
                  <tr key={l.id}>
                    <Td>
                      <Link
                        href={`/p/${id}/leases/${l.id}`}
                        className="font-medium text-accent-text underline"
                      >
                        {l.suite}
                      </Link>
                    </Td>
                    <Td>{l.status === 'vacant' ? <Badge>Vacant</Badge> : (l.tenantName ?? NOT_RECORDED)}</Td>

                    <Td numeric>{l.risk.scored ? l.risk.score.toFixed(0) : <Badge>Not scored</Badge>}</Td>
                    <Td>
                      <span className="whitespace-nowrap">
                        {l.isMonthToMonth
                          ? 'Month-to-month'
                          : l.status === 'vacant'
                            ? ''
                            : (l.expirationDate ?? NOT_RECORDED)}
                      </span>
                    </Td>
                    <Td>
                      <span className="whitespace-nowrap">
                        {l.status === 'vacant' ? '' : (l.noticeDate ?? NOT_RECORDED)}
                      </span>
                    </Td>

                    <Td numeric>{area(l.areaSf)}</Td>
                    <Td numeric>{l.status === 'vacant' ? '' : money(l.annualRentCents)}</Td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          </>
        ) : null}
      </Panel>
    </>
  );
}
