'use client';

import {
  Button,
  EmptyState,
  ErrorState,
  Loading,
  PageHead,
  Panel,
  TableWrap,
  Td,
  TextField,
  Th,
} from '@rollover-desk/ui-web';
import type { CreatePropertyRequest } from '@rollover-desk/contracts';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { api, errorMessage } from '@/lib/api';
import { moneyPsf } from '@/lib/format';
import { useAction, useCanEdit } from '@/lib/hooks';

function AddProperty() {
  const [problem, setProblem] = useState<string | null>(null);
  const create = useAction(
    (input: CreatePropertyRequest) => api.createProperty(input),
    () => setProblem(null),
  );
  return (
    <Panel title="Add a property">
      <form
        className="grid gap-3 p-4 sm:grid-cols-3 sm:items-start"
        onSubmit={(e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const data = new FormData(form);
          const rent = String(data.get('rent')).trim();
          const cents = rent ? Math.round(Number(rent) * 100) : null;
          if (cents !== null && (!Number.isFinite(cents) || cents <= 0)) {
            setProblem('Enter market rent as dollars per SF, or leave it blank.');
            return;
          }
          setProblem(null);
          create.mutate(
            {
              name: String(data.get('name')),
              loanMaturityDate: String(data.get('loan')) || null,
              marketRentPsfCents: cents,
            },
            { onSuccess: () => form.reset() },
          );
        }}
      >
        <TextField label="Name" name="name" required maxLength={200} />
        <TextField
          label="Loan maturity"
          name="loan"
          placeholder="YYYY-MM-DD"
          pattern="\d{4}-\d{2}-\d{2}"
          hint="Optional, as YYYY-MM-DD"
        />
        <TextField label="Market rent per SF, in dollars" name="rent" inputMode="decimal" hint="Optional" />
        <div className="sm:col-span-3">
          <Button type="submit" disabled={create.isPending}>
            Add property
          </Button>
        </div>
        {problem || create.isError ? (
          <p role="alert" className="m-0 text-sm text-bad sm:col-span-3">
            {problem ?? errorMessage(create.error)}
          </p>
        ) : null}
      </form>
    </Panel>
  );
}

export default function PropertiesPage() {
  const canEdit = useCanEdit();
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
          <EmptyState title="No properties yet">
            {canEdit ? 'Add the first one below.' : 'An analyst needs to add the first one.'}
          </EmptyState>
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
      {canEdit ? <AddProperty /> : null}
    </>
  );
}
