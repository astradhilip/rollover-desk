import { ApiClientError, createApiClient } from '@rollover-desk/api-client';

export const api = createApiClient({ baseUrl: '/api/proxy' });

export function errorMessage(error: unknown): string {
  return error instanceof ApiClientError ? error.message : 'Something went wrong. Try again.';
}
