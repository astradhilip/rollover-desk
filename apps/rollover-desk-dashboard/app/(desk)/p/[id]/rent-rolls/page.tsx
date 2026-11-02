'use client';

import {
  Badge,
  ConfirmButton,
  EmptyState,
  ErrorState,
  Loading,
  PageHead,
  Panel,
  Td,
  TableWrap,
  Th,
  type Tone,
} from '@rollover-desk/ui-web';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useRef } from 'react';
import { api, errorMessage } from '@/lib/api';
import { useAction, useCanEdit } from '@/lib/hooks';

const STATUS: Record<string, { tone: Tone; word: string }> = {
  pending: { tone: 'warn', word: 'Waiting for review' },
  confirmed: { tone: 'good', word: 'Current' },
  replaced: { tone: 'neutral', word: 'Replaced' },
  reverted: { tone: 'neutral', word: 'Reverted' },
};

export default function RentRollsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const canEdit = useCanEdit();
  const input = useRef<HTMLInputElement>(null);
  const q = useQuery({ queryKey: ['imports', id], queryFn: () => api.imports(id) });
  const upload = useAction(
    (file: File) => api.uploadRentRoll(id, file),
    (r) => router.push(`/p/${id}/rent-rolls/${r.import.id}`),
  );
  const revert = useAction((importId: string) => api.revertImport(id, importId));
  return (
    <>
      <PageHead title="Rent rolls" note="Nothing goes live until you’ve reviewed and confirmed it." />
      {canEdit ? (
        <Panel title="Upload a rent roll">
          <div className="flex flex-col items-start gap-2 p-4">
            <label htmlFor="rent-roll-file" className="text-sm font-medium text-ink">
              Excel or CSV file, up to 10 MB
            </label>
            <input
              ref={input}
              id="rent-roll-file"
              type="file"
              accept=".xlsx,.csv"
              disabled={upload.isPending}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) upload.mutate(file);
                e.target.value = '';
              }}
              className="max-w-full text-base text-ink file:mr-3 file:min-h-11 file:cursor-pointer file:rounded-md file:border file:border-line file:bg-surface file:px-3 file:text-base file:font-medium file:text-ink lg:file:min-h-9"
            />
            {upload.isPending ? (
              <p role="status" className="m-0 text-sm text-muted">
                Reading the file
              </p>
            ) : null}
            {upload.isError ? (
              <p role="alert" className="m-0 text-sm text-bad">
                {errorMessage(upload.error)}
              </p>
            ) : null}
          </div>
        </Panel>
      ) : null}
      <Panel title="History">
        {q.isPending ? <Loading label="Loading history" /> : null}
        {q.isError ? (
          <ErrorState
            title="History didn’t load"
            message={errorMessage(q.error)}
            onRetry={() => q.refetch()}
          />
        ) : null}
        {q.data?.imports.length === 0 ? (
          <EmptyState title="No rent rolls yet">
            {canEdit ? 'Upload the first one above.' : 'An analyst needs to upload one.'}
          </EmptyState>
        ) : null}
        {revert.isError ? (
          <p role="alert" className="m-0 px-4 py-2 text-sm text-bad">
            {errorMessage(revert.error)}
          </p>
        ) : null}
        {q.data?.imports.length ? (
          <TableWrap label="Rent roll history">
            <thead>
              <tr>
                <Th>File</Th>
                <Th>Uploaded</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {q.data.imports.map((i) => (
                <tr key={i.id}>
                  <Td>
                    <Link
                      href={`/p/${id}/rent-rolls/${i.id}`}
                      className="font-medium text-accent-text underline"
                    >
                      {i.filename}
                    </Link>
                  </Td>
                  <Td>
                    <span className="whitespace-nowrap">{i.createdAt.slice(0, 10)}</span>
                  </Td>
                  <Td>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={STATUS[i.status]!.tone}>{STATUS[i.status]!.word}</Badge>
                      {canEdit && i.status === 'confirmed' ? (
                        <ConfirmButton
                          label="Revert"
                          question="Go back to the previous rent roll?"
                          confirmLabel="Revert rent roll"
                          disabled={revert.isPending}
                          onConfirm={() => revert.mutate(i.id)}
                        />
                      ) : null}
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        ) : null}
      </Panel>
    </>
  );
}
