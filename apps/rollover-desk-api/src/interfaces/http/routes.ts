import {
  AttentionView,
  CommissionQuery,
  CommissionView,
  ConfirmImportRequest,
  CreatePropertyRequest,
  CriticalDatesView,
  CurrentUser,
  Empty,
  Health,
  ImportList,
  ImportReview,
  LeaseDetail,
  LeaseField as LeaseFieldSchema,
  LeaseList,
  LoginRequest,
  LoginResponse,
  MoveRenewalsRequest,
  MoveRenewalsResponse,
  PipelineView,
  Property,
  PropertyList,
  RiskWeights,
  RolloverView,
  SetAttentionRequest,
  SetMappingRequest,
} from '@rollover-desk/contracts';
import type { Request, Response } from 'express';
import { z } from 'zod';
import type { ExportWorkbook } from '../../application/use-cases/RentRollImports';
import type { GetCurrentUser } from '../../application/use-cases/GetCurrentUser';
import type { Login } from '../../application/use-cases/Login';
import type { Portfolio } from '../../application/use-cases/Portfolio';
import type { CreateProperty, GetProperty, ListProperties } from '../../application/use-cases/Properties';
import type {
  ImportHistory,
  ReviewImport,
  UploadRentRoll,
} from '../../application/use-cases/RentRollImports';
import type { Principal } from '../../domain/entities/User';
import { InvalidCredentialsError } from '../../domain/entities/errors';
import { HttpError } from './errors';
import type { LoginRateLimiter } from './LoginRateLimiter';

export interface UseCases {
  login: Login;
  getCurrentUser: GetCurrentUser;
  listProperties: ListProperties;
  getProperty: GetProperty;
  createProperty: CreateProperty;
  uploadRentRoll: UploadRentRoll;
  importHistory: ImportHistory;
  reviewImport: ReviewImport;
  portfolio: Portfolio;
  exportWorkbook: ExportWorkbook;
}

type LeaseField = z.infer<typeof LeaseFieldSchema>;

export type Access = 'public' | 'viewer' | 'analyst';

export interface RouteContext {
  req: Request;
  res: Response;
  principal: Principal;
  body: unknown;
  query: unknown;
  file?: { originalname: string; buffer: Buffer };
}

export interface Route {
  method: 'get' | 'post' | 'put' | 'delete';
  path: string;
  access: Access;
  summary: string;
  request?: z.ZodType;
  query?: z.ZodType;
  /** Multipart with one `file` field, read only after access is checked. */
  upload?: boolean;
  /** Answers with a file: `handle` returns `{ filename, bytes }`, and `response` isn't used. */
  download?: boolean;
  response: z.ZodType;
  status?: number;
  handle: (context: RouteContext) => Promise<unknown>;
}

/** Ids are UUIDs. Anything else can't exist, and some values, such as NUL, would fail in the database. */
const param = (req: Request, name: string, pattern = /^[\w-]{1,64}$/) => {
  const value = String(req.params[name]);
  if (!pattern.test(value)) throw new HttpError(404, 'not_found', 'Not found.');
  return value;
};
const pathId = (req: Request) => param(req, 'id');
const MAX_FAILURES_PER_EMAIL = 25;
const ATTENTION_KEY = /^[\w.-]{1,512}$/;

/**
 * One table drives routing, access control, validation and the OpenAPI document,
 * so a route can't exist without declaring who may call it.
 */
export function buildRoutes(useCases: UseCases, limiter: LoginRateLimiter): Route[] {
  return [
    {
      method: 'get',
      path: '/health',
      access: 'public',
      summary: 'Liveness check',
      response: Health,
      handle: async () => ({ status: 'ok' }),
    },
    {
      method: 'post',
      path: '/auth/login',
      access: 'public',
      summary: 'Sign in',
      request: LoginRequest,
      response: LoginResponse,
      handle: async ({ req, body }) => {
        const { email, password } = body as LoginRequest;
        const normalized = email.trim().toLowerCase();
        const key = `${req.ip}|${normalized}`;
        // A second limit on the email alone, so rotating client addresses doesn't buy unlimited guesses.
        // It is higher, so one person can't easily lock another out.
        const emailKey = `email|${normalized}`;
        let wait = limiter.reserve(key);
        if (wait === 0) {
          wait = limiter.reserve(emailKey, MAX_FAILURES_PER_EMAIL);
          if (wait > 0) limiter.release(key);
        }
        if (wait > 0) {
          throw new HttpError(429, 'rate_limited', 'Too many failed attempts. Try again later.', {
            'Retry-After': String(wait),
          });
        }
        try {
          const result = await useCases.login.execute(email, password);
          limiter.clear(key);
          limiter.clear(emailKey);
          return result;
        } catch (error) {
          if (!(error instanceof InvalidCredentialsError)) {
            limiter.release(key);
            limiter.release(emailKey);
          }
          throw error;
        }
      },
    },
    {
      method: 'get',
      path: '/auth/me',
      access: 'viewer',
      summary: 'The signed-in user',
      response: CurrentUser,
      handle: ({ principal }) => useCases.getCurrentUser.execute(principal),
    },
    {
      method: 'get',
      path: '/properties',
      access: 'viewer',
      summary: "List your organization's properties",
      response: PropertyList,
      handle: async ({ principal }) => ({ properties: await useCases.listProperties.execute(principal) }),
    },
    {
      method: 'get',
      path: '/properties/:id',
      access: 'viewer',
      summary: 'One property',
      response: Property,
      handle: ({ principal, req }) => useCases.getProperty.execute(principal, pathId(req)),
    },
    {
      method: 'post',
      path: '/properties',
      access: 'analyst',
      summary: 'Add a property',
      request: CreatePropertyRequest,
      response: Property,
      status: 201,
      handle: ({ principal, body }) =>
        useCases.createProperty.execute(principal, body as CreatePropertyRequest),
    },
    {
      method: 'post',
      path: '/properties/:id/imports',
      access: 'analyst',
      summary: 'Upload a rent roll for review',
      upload: true,
      response: ImportReview,
      status: 201,
      handle: ({ principal, req, file }) => {
        if (!file)
          throw new HttpError(400, 'validation_error', 'Attach the rent roll as a file field named "file".');
        return useCases.uploadRentRoll.execute(principal, pathId(req), file.originalname, file.buffer);
      },
    },
    {
      method: 'get',
      path: '/properties/:id/imports',
      access: 'viewer',
      summary: 'Import history',
      response: ImportList,
      handle: async ({ principal, req }) => ({
        imports: await useCases.importHistory.list(principal, pathId(req)),
      }),
    },
    {
      method: 'get',
      path: '/properties/:id/imports/:importId',
      access: 'viewer',
      summary: 'One import with its mapping and issues',
      response: ImportReview,
      handle: ({ principal, req }) =>
        useCases.importHistory.get(principal, pathId(req), param(req, 'importId')),
    },
    {
      method: 'put',
      path: '/properties/:id/imports/:importId/mapping',
      access: 'analyst',
      summary: 'Correct the column mapping and re-check',
      request: SetMappingRequest,
      response: ImportReview,
      handle: ({ principal, req, body }) => {
        const { overrides } = body as { overrides: { column: number; field: LeaseField | null }[] };
        return useCases.reviewImport.setMapping(
          principal,
          pathId(req),
          param(req, 'importId'),
          Object.fromEntries(overrides.map((o) => [o.column, o.field])),
        );
      },
    },
    {
      method: 'post',
      path: '/properties/:id/imports/:importId/confirm',
      access: 'analyst',
      summary: 'Confirm an import, making it the current rent roll',
      request: ConfirmImportRequest,
      response: ImportReview,
      handle: ({ principal, req, body }) =>
        useCases.reviewImport.confirm(
          principal,
          pathId(req),
          param(req, 'importId'),
          (body as { acknowledgeWarnings: boolean }).acknowledgeWarnings,
        ),
    },
    {
      method: 'post',
      path: '/properties/:id/imports/:importId/revert',
      access: 'analyst',
      summary: 'Revert the current rent roll to the one before it',
      response: Empty,
      handle: async ({ principal, req }) => {
        await useCases.reviewImport.revert(principal, pathId(req), param(req, 'importId'));
        return {};
      },
    },
    {
      method: 'get',
      path: '/properties/:id/rollover',
      access: 'viewer',
      summary: 'WALT, rollover by year and concentration',
      response: RolloverView,
      handle: ({ principal, req }) => useCases.portfolio.rollover(principal, pathId(req)),
    },
    {
      method: 'get',
      path: '/properties/:id/export',
      access: 'analyst',
      summary: 'Live-formula Excel workbook of the current rent roll',
      download: true,
      response: z.unknown(),
      handle: async ({ principal, req }) => useCases.exportWorkbook.execute(principal, pathId(req)),
    },
    {
      method: 'get',
      path: '/properties/:id/leases',
      access: 'viewer',
      summary: 'Leases with their risk',
      response: LeaseList,
      handle: async ({ principal, req }) => ({
        leases: await useCases.portfolio.leases(principal, pathId(req)),
      }),
    },
    {
      method: 'get',
      path: '/properties/:id/leases/:leaseId',
      access: 'viewer',
      summary: 'One lease with risk explanation and critical dates',
      response: LeaseDetail,
      handle: ({ principal, req }) => useCases.portfolio.lease(principal, pathId(req), param(req, 'leaseId')),
    },
    {
      method: 'get',
      path: '/properties/:id/leases/:leaseId/commission',
      access: 'viewer',
      summary: 'Commission estimate, renewal against replacement, from rates you supply',
      response: CommissionView,
      query: CommissionQuery,
      handle: ({ principal, req, query }) => {
        const q = query as z.output<typeof CommissionQuery>;
        return useCases.portfolio.commission(principal, pathId(req), param(req, 'leaseId'), q.termYears, {
          renewal: { landlordRepBps: q.renewalLandlordBps, tenantRepBps: q.renewalTenantBps },
          replacement: { landlordRepBps: q.newLandlordBps, tenantRepBps: q.newTenantBps },
        });
      },
    },
    {
      method: 'get',
      path: '/properties/:id/critical-dates',
      access: 'viewer',
      summary: 'Passed, upcoming and absent dates by lease',
      response: CriticalDatesView,
      handle: ({ principal, req }) => useCases.portfolio.criticalDates(principal, pathId(req)),
    },
    {
      method: 'get',
      path: '/properties/:id/attention',
      access: 'viewer',
      summary: 'What needs attention, including the cracks check',
      response: AttentionView,
      handle: ({ principal, req }) => useCases.portfolio.attention(principal, pathId(req)),
    },
    {
      method: 'put',
      path: '/properties/:id/attention/:key',
      access: 'analyst',
      summary: 'Mark an item done or dismissed',
      request: SetAttentionRequest,
      response: Empty,
      handle: async ({ principal, req, body }) => {
        const { status } = body as { status: 'done' | 'dismissed' };
        await useCases.portfolio.setAttention(
          principal,
          pathId(req),
          param(req, 'key', ATTENTION_KEY),
          status,
        );
        return {};
      },
    },
    {
      method: 'delete',
      path: '/properties/:id/attention/:key',
      access: 'analyst',
      summary: 'Undo done or dismissed',
      response: Empty,
      handle: async ({ principal, req }) => {
        await useCases.portfolio.undoAttention(principal, pathId(req), param(req, 'key', ATTENTION_KEY));
        return {};
      },
    },
    {
      method: 'get',
      path: '/properties/:id/renewals',
      access: 'viewer',
      summary: 'Renewal and backfill pipeline',
      response: PipelineView,
      handle: async ({ principal, req }) => ({
        entries: await useCases.portfolio.pipeline(principal, pathId(req)),
      }),
    },
    {
      method: 'post',
      path: '/properties/:id/renewals/moves',
      access: 'analyst',
      summary: 'Move suites between stages; each reports its own outcome',
      request: MoveRenewalsRequest,
      response: MoveRenewalsResponse,
      handle: async ({ principal, req, body }) => ({
        results: await useCases.portfolio.moveRenewals(
          principal,
          pathId(req),
          (body as MoveRenewalsRequest).moves,
        ),
      }),
    },
    {
      method: 'put',
      path: '/properties/:id/risk-weights',
      access: 'analyst',
      summary: 'Set risk weights, which must total 100',
      request: RiskWeights,
      response: RiskWeights,
      handle: ({ principal, req, body }) =>
        useCases.portfolio.setRiskWeights(principal, pathId(req), body as RiskWeights),
    },
  ];
}
