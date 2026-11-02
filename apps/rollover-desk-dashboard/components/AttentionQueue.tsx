'use client';

import type { AttentionView } from '@rollover-desk/contracts';
import { Badge, Button, Disclosure, EmptyState, type Tone } from '@rollover-desk/ui-web';
import Link from 'next/link';
import { api, errorMessage } from '@/lib/api';
import { useAction, useCanEdit } from '@/lib/hooks';

const SEVERITY: Record<string, { tone: Tone; word: string }> = {
  high: { tone: 'bad', word: 'High' },
  medium: { tone: 'warn', word: 'Medium' },
  low: { tone: 'neutral', word: 'Low' },
};

type Item = AttentionView['items'][number];

function Who({ id, item }: { id: string; item: Item }) {
  const name = [item.suite && `Suite ${item.suite}`, item.tenantName].filter(Boolean).join(', ');
  if (!name) return null;
  return item.leaseId ? (
    <Link href={`/p/${id}/leases/${item.leaseId}`} className="font-medium text-accent-text underline">
      {name}
    </Link>
  ) : (
    <span className="font-medium text-ink">{name}</span>
  );
}

export function AttentionQueue({ id, view }: { id: string; view: AttentionView }) {
  const canEdit = useCanEdit();
  const set = useAction((v: { key: string; status: 'done' | 'dismissed' }) =>
    api.setAttention(id, v.key, v.status),
  );
  const undo = useAction((key: string) => api.undoAttention(id, key));
  const error = set.error ?? undo.error;
  return (
    <div>
      {error ? (
        <p role="alert" className="border-b border-line-2 px-4 py-2 text-sm text-bad">
          {errorMessage(error)}
        </p>
      ) : null}
      {view.items.length === 0 ? (
        <EmptyState title="Nothing needs attention">Items you’ve handled are listed below.</EmptyState>
      ) : null}
      <ul className="m-0 list-none p-0">
        {view.items.map((item) => (
          <li key={item.key} className="flex flex-col gap-1 border-b border-line-2 px-4 py-3 last:border-b-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={SEVERITY[item.severity]!.tone}>{SEVERITY[item.severity]!.word}</Badge>
              <Who id={id} item={item} />
            </div>
            <p className="m-0 text-base text-ink">{item.message}</p>
            {canEdit ? (
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  disabled={set.isPending}
                  onClick={() => set.mutate({ key: item.key, status: 'done' })}
                >
                  Done
                </Button>
                <Button
                  variant="ghost"
                  disabled={set.isPending}
                  onClick={() => set.mutate({ key: item.key, status: 'dismissed' })}
                >
                  Dismiss
                </Button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      {view.handled.length ? (
        <div className="border-t border-line px-4 py-2">
          <Disclosure label={`Handled (${view.handled.length})`}>
            <ul className="m-0 list-none p-0">
              {view.handled.map((item) => (
                <li key={item.key} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span className="text-sm text-muted">
                    {item.status === 'done' ? 'Done' : 'Dismissed'}: {item.message}
                  </span>
                  {canEdit ? (
                    <Button variant="ghost" disabled={undo.isPending} onClick={() => undo.mutate(item.key)}>
                      Undo
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          </Disclosure>
        </div>
      ) : null}
    </div>
  );
}
