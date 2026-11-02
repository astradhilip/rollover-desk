import {
  CreatePropertyRequest,
  CurrentUser,
  Health,
  LoginRequest,
  LoginResponse,
  Property,
  PropertyList,
} from '@rollover-desk/contracts';
import type { Request, Response } from 'express';
import type { z } from 'zod';
import type { GetCurrentUser } from '../../application/use-cases/GetCurrentUser';
import type { Login } from '../../application/use-cases/Login';
import type { CreateProperty, GetProperty, ListProperties } from '../../application/use-cases/Properties';
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
}

export type Access = 'public' | 'viewer' | 'analyst';

export interface RouteContext {
  req: Request;
  res: Response;
  principal: Principal;
  body: unknown;
}

export interface Route {
  method: 'get' | 'post';
  path: string;
  access: Access;
  summary: string;
  request?: z.ZodType;
  response: z.ZodType;
  status?: number;
  handle: (context: RouteContext) => Promise<unknown>;
}

/** Ids are UUIDs. Anything else can't exist, and some values, such as NUL, would fail in the database. */
const pathId = (req: Request) => {
  const id = String(req.params.id);
  if (!/^[\w-]{1,64}$/.test(id)) throw new HttpError(404, 'not_found', 'Property not found.');
  return id;
};

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
        const key = `${req.ip}|${email.trim().toLowerCase()}`;
        const wait = limiter.reserve(key);
        if (wait > 0) {
          throw new HttpError(429, 'rate_limited', 'Too many failed attempts. Try again later.', {
            'Retry-After': String(wait),
          });
        }
        try {
          const result = await useCases.login.execute(email, password);
          limiter.clear(key);
          return result;
        } catch (error) {
          if (!(error instanceof InvalidCredentialsError)) limiter.release(key);
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
  ];
}
