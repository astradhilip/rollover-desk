'use client';

import { Button, ErrorState, Loading, PageHead, Panel, TextField } from '@rollover-desk/ui-web';
import type { RiskWeights } from '@rollover-desk/contracts';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { api, errorMessage } from '@/lib/api';
import { useAction, useCanEdit } from '@/lib/hooks';

const FIELDS: { key: keyof RiskWeights; label: string; hint: string }[] = [
  { key: 'time_to_expiry', label: 'Time to expiry', hint: 'How close the lease is to ending' },
  { key: 'notice_urgency', label: 'Notice urgency', hint: 'How close the renewal notice date is' },
  { key: 'concentration', label: 'Tenant concentration', hint: 'The tenant’s share of total rent' },
  { key: 'loan_mismatch', label: 'Loan maturity', hint: 'Whether the lease ends before the loan comes due' },
];

function Form({ id, initial }: { id: string; initial: RiskWeights }) {
  const canEdit = useCanEdit();
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(FIELDS.map((f) => [f.key, String(initial[f.key])])),
  );
  const [saved, setSaved] = useState(false);
  const save = useAction(
    (w: RiskWeights) => api.setRiskWeights(id, w),
    () => setSaved(true),
  );
  const numbers = FIELDS.map((f) =>
    /^\d+(\.\d+)?$/.test(values[f.key] ?? '') ? Number(values[f.key]) : null,
  );
  const valid = numbers.every((n) => n !== null);
  const total = numbers.reduce<number>((sum, n) => sum + (n ?? 0), 0);
  const ready = valid && Math.abs(total - 100) < 1e-9;
  return (
    <form
      className="flex max-w-xl flex-col gap-4 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (ready) save.mutate(Object.fromEntries(FIELDS.map((f, i) => [f.key, numbers[i]])) as RiskWeights);
      }}
    >
      {FIELDS.map((f) => (
        <TextField
          key={f.key}
          label={f.label}
          hint={f.hint}
          inputMode="decimal"
          disabled={!canEdit}
          value={values[f.key]}
          onChange={(e) => {
            setSaved(false);
            setValues({ ...values, [f.key]: e.target.value });
          }}
        />
      ))}
      <p aria-live="polite" className={`m-0 text-base tabular-nums ${ready ? 'text-ink' : 'text-bad'}`}>
        {valid
          ? `Total ${total}. ${ready ? '' : 'Weights must total 100.'}`
          : 'Enter a number for each weight.'}
      </p>
      {canEdit ? (
        <div className="flex items-center gap-3">
          <Button type="submit" variant="primary" disabled={!ready || save.isPending}>
            Save weights
          </Button>
          {saved ? (
            <span role="status" className="text-sm text-good">
              Saved. Scores are updated.
            </span>
          ) : null}
        </div>
      ) : null}
      {save.isError ? (
        <p role="alert" className="m-0 text-sm text-bad">
          {errorMessage(save.error)}
        </p>
      ) : null}
    </form>
  );
}

export default function WeightsPage() {
  const { id } = useParams<{ id: string }>();
  const q = useQuery({ queryKey: ['rollover', id], queryFn: () => api.rollover(id) });
  return (
    <>
      <PageHead
        title="Risk weights"
        note="These are judgment calls, so they’re yours to set. Each lease shows how its score was built."
      />
      <Panel>
        {q.isPending ? <Loading label="Loading weights" /> : null}
        {q.isError ? (
          <ErrorState
            title="Weights didn’t load"
            message={errorMessage(q.error)}
            onRetry={() => q.refetch()}
          />
        ) : null}
        {q.data ? <Form id={id} initial={q.data.weights} /> : null}
      </Panel>
    </>
  );
}
