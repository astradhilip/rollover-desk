'use client';

import type { PipelineView } from '@rollover-desk/contracts';
import { RenewalStage } from '@rollover-desk/contracts';
import {
  Button,
  Disclosure,
  EmptyState,
  ErrorState,
  Loading,
  PageHead,
  Panel,
  SelectField,
  TextField,
} from '@rollover-desk/ui-web';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { api, errorMessage } from '@/lib/api';
import { money, NOT_RECORDED, partialTotal } from '@/lib/format';
import { useAction, useCanEdit } from '@/lib/hooks';
import { STAGE_LABEL } from '@/lib/views';

type Entry = PipelineView['entries'][number];

function Card({ id, entry, canEdit }: { id: string; entry: Entry; canEdit: boolean }) {
  const { lease } = entry;
  const [vacating, setVacating] = useState(false);
  const [reason, setReason] = useState('');
  const [note, setNote] = useState(entry.note ?? '');
  const [problem, setProblem] = useState<string | null>(null);
  const move = useAction(
    (m: { stage: RenewalStage; vacatingReason?: string; note?: string | null }) =>
      api.moveRenewals(id, [{ suite: lease.suite, ...m }]),
    (r) => {
      setProblem(r.results[0]?.error ?? null);
      if (r.results[0]?.ok) setVacating(false);
    },
  );
  const error = problem ?? (move.error ? errorMessage(move.error) : null);
  return (
    <article className="flex flex-col gap-2 rounded-md border border-line bg-surface p-3 shadow-tile">
      <div className="min-w-0">
        <Link href={`/p/${id}/leases/${lease.id}`} className="font-medium text-accent-text underline">
          Suite {lease.suite}
        </Link>
        <div className="truncate text-base text-ink">{lease.tenantName ?? NOT_RECORDED}</div>
        <div className="text-xs text-muted tabular-nums">
          {lease.isMonthToMonth ? 'Month-to-month' : `Expires ${lease.expirationDate ?? 'not recorded'}`},{' '}
          {money(lease.annualRentCents)}
        </div>
      </div>
      {entry.vacatingReason ? <p className="m-0 text-sm text-ink">Vacating: {entry.vacatingReason}</p> : null}
      {canEdit ? (
        <>
          <SelectField
            label="Stage"
            value={vacating ? 'vacating' : entry.stage}
            disabled={move.isPending}
            onChange={(e) => {
              const stage = e.target.value as RenewalStage;
              setProblem(null);
              // Going back to where the card already is only cancels the form: nothing to save.
              if (stage === entry.stage && stage !== 'vacating') {
                setVacating(false);
                return;
              }
              if (stage === 'vacating') setVacating(entry.stage !== 'vacating');
              else {
                setVacating(false);
                move.mutate({ stage });
              }
            }}
          >
            {RenewalStage.options.map((s) => (
              <option key={s} value={s}>
                {STAGE_LABEL[s]}
              </option>
            ))}
          </SelectField>
          {vacating ? (
            <form
              className="flex flex-col gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                move.mutate({ stage: 'vacating', vacatingReason: reason });
              }}
            >
              <TextField
                label="Why are they vacating?"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                required
                maxLength={2000}
              />
              <Button type="submit" disabled={move.isPending}>
                Mark vacating
              </Button>
            </form>
          ) : null}
          <Disclosure label={entry.note ? 'Edit note' : 'Add note'}>
            <form
              className="flex flex-col gap-2 pt-1"
              onSubmit={(e) => {
                e.preventDefault();
                move.mutate({
                  stage: entry.stage,
                  note: note.trim() || null,
                  ...(entry.vacatingReason ? { vacatingReason: entry.vacatingReason } : {}),
                });
              }}
            >
              <TextField
                label="Note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={2000}
              />
              <Button type="submit" disabled={move.isPending}>
                Save note
              </Button>
            </form>
          </Disclosure>
        </>
      ) : null}
      {entry.note ? <p className="m-0 text-sm text-muted">{entry.note}</p> : null}
      {error ? (
        <p role="alert" className="m-0 text-sm text-bad">
          {error}
        </p>
      ) : null}
    </article>
  );
}

export default function PipelinePage() {
  const { id } = useParams<{ id: string }>();
  const canEdit = useCanEdit();
  const q = useQuery({ queryKey: ['renewals', id], queryFn: () => api.renewals(id) });
  return (
    <>
      <PageHead
        title="Renewal pipeline"
        note="Leases expiring within two years or month-to-month, plus any with a deal under way."
      />
      {q.isPending ? (
        <Panel>
          <Loading label="Loading pipeline" rows={6} />
        </Panel>
      ) : null}
      {q.isError ? (
        <Panel>
          <ErrorState
            title="The pipeline didn’t load"
            message={errorMessage(q.error)}
            onRetry={() => q.refetch()}
          />
        </Panel>
      ) : null}
      {q.data?.entries.length === 0 ? (
        <Panel>
          <EmptyState title="Nothing in the pipeline">No lease expires within two years.</EmptyState>
        </Panel>
      ) : null}
      {q.data?.entries.length ? (
        <>
          <p className="m-0 text-xs text-muted">
            Seven stages, from Identified to Vacating. Scroll sideways for the rest.
          </p>
          <div
            tabIndex={0}
            role="region"
            aria-label="Pipeline stages"
            className="grid auto-cols-[84%] grid-flow-col gap-3 overflow-x-auto pb-2 sm:auto-cols-[var(--board-column)]"
          >
            {RenewalStage.options.map((stage) => {
              const entries = q.data.entries.filter((e) => e.stage === stage);
              const missing = entries.filter((e) => e.lease.annualRentCents === null).length;
              const rent = entries.reduce((n, e) => n + (e.lease.annualRentCents ?? 0), 0);
              return (
                <section key={stage} className="flex min-w-0 flex-col gap-2 rounded-lg bg-sunken p-2.5">
                  <header className="flex items-baseline gap-2 px-1">
                    <h2 className="text-base font-semibold text-ink">{STAGE_LABEL[stage]}</h2>
                    <span className="text-xs text-muted tabular-nums">{entries.length}</span>
                    <span className="ml-auto text-xs text-muted tabular-nums">
                      {entries.length ? partialTotal(entries.length, missing, 'rent', money, rent).value : ''}
                      {missing > 0 && missing < entries.length ? ', some not recorded' : ''}
                    </span>
                  </header>
                  {entries.length === 0 ? <p className="m-0 px-1 text-sm text-muted">None</p> : null}
                  {entries.map((e) => (
                    <Card key={e.lease.id} id={id} entry={e} canEdit={canEdit} />
                  ))}
                </section>
              );
            })}
          </div>
        </>
      ) : null}
    </>
  );
}
