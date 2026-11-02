import {
  ApiError,
  AttentionView,
  CommissionView,
  CriticalDatesView,
  CurrentUser,
  Empty,
  ImportList,
  ImportReview,
  LeaseDetail,
  LeaseList,
  MoveRenewalsResponse,
  PipelineView,
  Property,
  PropertyList,
  RiskWeights,
  RolloverView,
  type CreatePropertyRequest,
  type MoveRenewalsRequest,
} from '@rollover-desk/contracts';
import type { z } from 'zod';

export type ClientErrorCode = z.infer<typeof ApiError>['error']['code'] | 'network' | 'bad_response';

export class ApiClientError extends Error {
  constructor(
    readonly status: number,
    readonly code: ClientErrorCode,
    message: string,
    readonly details: { path: string; message: string }[] = [],
  ) {
    super(message);
  }
}

export interface CommissionRates {
  termYears: number;
  renewalLandlordBps: number;
  renewalTenantBps: number;
  newLandlordBps: number;
  newTenantBps: number;
}

interface Options {
  baseUrl: string;
  fetch?: typeof fetch;
}

const seg = encodeURIComponent;

/** Every response is checked against its contract, so a mismatch is an error and never a wrong number on screen. */
export function createApiClient({ baseUrl, fetch: doFetch = (...a) => fetch(...a) }: Options) {
  async function request<T extends z.ZodType>(
    schema: T,
    method: string,
    path: string,
    init: { json?: unknown; form?: FormData } = {},
  ): Promise<z.output<T>> {
    let response: Response;
    try {
      response = await doFetch(`${baseUrl}${path}`, {
        method,
        ...(init.json !== undefined
          ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(init.json) }
          : {}),
        ...(init.form ? { body: init.form } : {}),
      });
    } catch {
      throw new ApiClientError(
        0,
        'network',
        'The server could not be reached. Check your connection and try again.',
      );
    }
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const parsed = ApiError.safeParse(body);
      if (parsed.success) {
        const { code, message, details } = parsed.data.error;
        throw new ApiClientError(response.status, code, message, details);
      }
      throw new ApiClientError(
        response.status,
        'bad_response',
        `The server returned an error (${response.status}).`,
      );
    }
    const parsed = schema.safeParse(body);
    if (!parsed.success)
      throw new ApiClientError(response.status, 'bad_response', 'The server sent an unexpected response.');
    return parsed.data;
  }

  const prop = (id: string) => `/properties/${seg(id)}`;

  async function download(path: string): Promise<{ blob: Blob; filename: string | null }> {
    let response: Response;
    try {
      response = await doFetch(`${baseUrl}${path}`, { method: 'GET' });
    } catch {
      throw new ApiClientError(
        0,
        'network',
        'The server could not be reached. Check your connection and try again.',
      );
    }
    if (!response.ok) {
      const parsed = ApiError.safeParse(await response.json().catch(() => null));
      if (parsed.success) {
        const { code, message, details } = parsed.data.error;
        throw new ApiClientError(response.status, code, message, details);
      }
      throw new ApiClientError(
        response.status,
        'bad_response',
        `The server returned an error (${response.status}).`,
      );
    }
    const name = /filename="([^"]+)"/.exec(response.headers.get('content-disposition') ?? '');
    return { blob: await response.blob(), filename: name?.[1] ?? null };
  }

  return {
    exportWorkbook: (id: string) => download(`${prop(id)}/export`),
    me: () => request(CurrentUser, 'GET', '/auth/me'),
    properties: () => request(PropertyList, 'GET', '/properties'),
    property: (id: string) => request(Property, 'GET', prop(id)),
    createProperty: (input: CreatePropertyRequest) =>
      request(Property, 'POST', '/properties', { json: input }),
    uploadRentRoll: (id: string, file: File) => {
      const form = new FormData();
      form.append('file', file);
      return request(ImportReview, 'POST', `${prop(id)}/imports`, { form });
    },
    imports: (id: string) => request(ImportList, 'GET', `${prop(id)}/imports`),
    import: (id: string, importId: string) =>
      request(ImportReview, 'GET', `${prop(id)}/imports/${seg(importId)}`),
    setMapping: (id: string, importId: string, overrides: { column: number; field: string | null }[]) =>
      request(ImportReview, 'PUT', `${prop(id)}/imports/${seg(importId)}/mapping`, { json: { overrides } }),
    confirmImport: (id: string, importId: string, acknowledgeWarnings: boolean) =>
      request(ImportReview, 'POST', `${prop(id)}/imports/${seg(importId)}/confirm`, {
        json: { acknowledgeWarnings },
      }),
    revertImport: (id: string, importId: string) =>
      request(Empty, 'POST', `${prop(id)}/imports/${seg(importId)}/revert`),
    rollover: (id: string) => request(RolloverView, 'GET', `${prop(id)}/rollover`),
    leases: (id: string) => request(LeaseList, 'GET', `${prop(id)}/leases`),
    lease: (id: string, leaseId: string) => request(LeaseDetail, 'GET', `${prop(id)}/leases/${seg(leaseId)}`),
    commission: (id: string, leaseId: string, rates: CommissionRates) => {
      const query = new URLSearchParams(Object.entries(rates).map(([k, v]) => [k, String(v)]));
      return request(CommissionView, 'GET', `${prop(id)}/leases/${seg(leaseId)}/commission?${query}`);
    },
    criticalDates: (id: string) => request(CriticalDatesView, 'GET', `${prop(id)}/critical-dates`),
    attention: (id: string) => request(AttentionView, 'GET', `${prop(id)}/attention`),
    setAttention: (id: string, key: string, status: 'done' | 'dismissed') =>
      request(Empty, 'PUT', `${prop(id)}/attention/${seg(key)}`, { json: { status } }),
    undoAttention: (id: string, key: string) => request(Empty, 'DELETE', `${prop(id)}/attention/${seg(key)}`),
    renewals: (id: string) => request(PipelineView, 'GET', `${prop(id)}/renewals`),
    moveRenewals: (id: string, moves: MoveRenewalsRequest['moves']) =>
      request(MoveRenewalsResponse, 'POST', `${prop(id)}/renewals/moves`, { json: { moves } }),
    setRiskWeights: (id: string, weights: RiskWeights) =>
      request(RiskWeights, 'PUT', `${prop(id)}/risk-weights`, { json: weights }),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
