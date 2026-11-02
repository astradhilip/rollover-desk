'use client';

import { ApiClientError } from '@rollover-desk/api-client';
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import { type ReactNode, useState } from 'react';

function onError(error: unknown) {
  // The session ended, so the current screen can't show anything true.
  if (error instanceof ApiClientError && error.status === 401) window.location.assign('/sign-in');
}

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        queryCache: new QueryCache({ onError }),
        mutationCache: new MutationCache({ onError }),
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: (count, error) =>
              !(error instanceof ApiClientError && error.status >= 400 && error.status < 500) && count < 1,
          },
        },
      }),
  );
  return (
    <ThemeProvider attribute="data-theme" defaultTheme="system" enableSystem disableTransitionOnChange>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </ThemeProvider>
  );
}
