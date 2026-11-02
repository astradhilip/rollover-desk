'use client';

import { Button } from '@rollover-desk/ui-web';
import { useMutation } from '@tanstack/react-query';
import { api, errorMessage } from '@/lib/api';

export function DownloadWorkbook({ id }: { id: string }) {
  const download = useMutation({
    mutationFn: () => api.exportWorkbook(id),
    onSuccess: ({ blob, filename }) => {
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename ?? 'rollover-desk.xlsx';
      link.click();
      // Some browsers start the download after click() returns, so the URL outlives this tick.
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    },
  });
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      {download.isError ? (
        <span role="alert" className="text-sm text-bad">
          {errorMessage(download.error)}
        </span>
      ) : null}
      <Button disabled={download.isPending} onClick={() => download.mutate()}>
        {download.isPending ? 'Preparing workbook' : 'Download workbook'}
      </Button>
    </span>
  );
}
