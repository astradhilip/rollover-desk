import { z } from 'zod';

export const ApiErrorCode = z.enum([
  'validation_error',
  'unauthorized',
  'forbidden',
  'not_found',
  'conflict',
  'rate_limited',
  'internal_error',
]);

export const ApiError = z.object({
  error: z.object({
    code: ApiErrorCode,
    message: z.string(),
    details: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
  }),
});
export type ApiError = z.infer<typeof ApiError>;

const IsoDate = z.string().refine((value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
}, 'Use a real date as YYYY-MM-DD');

const MAX_INT_32 = 2_147_483_647;

export const Role = z.enum(['analyst', 'viewer']);
export type Role = z.infer<typeof Role>;

export const LoginRequest = z.object({
  email: z.email().max(254),
  password: z.string().min(1).max(200),
});
export type LoginRequest = z.infer<typeof LoginRequest>;

export const CurrentUser = z.object({
  id: z.string(),
  email: z.email(),
  role: Role,
  organizationId: z.string(),
  organizationName: z.string(),
});
export type CurrentUser = z.infer<typeof CurrentUser>;

export const LoginResponse = z.object({
  /** The dashboard stores this in an httpOnly cookie; browser code never sees it. */
  token: z.string(),
  expiresInSeconds: z.number().int().positive(),
  user: CurrentUser,
});
export type LoginResponse = z.infer<typeof LoginResponse>;

export const Health = z.object({ status: z.literal('ok') });

export const CreatePropertyRequest = z.object({
  name: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .refine((v) => !v.includes('\0'), 'Name has an invalid character'),
  loanMaturityDate: IsoDate.nullable(),
  marketRentPsfCents: z.number().int().positive().max(MAX_INT_32).nullable(),
});
export type CreatePropertyRequest = z.infer<typeof CreatePropertyRequest>;

export const Property = z.object({
  id: z.string(),
  name: z.string(),
  loanMaturityDate: IsoDate.nullable(),
  marketRentPsfCents: z.number().int().nullable(),
});
export type Property = z.infer<typeof Property>;

export const PropertyList = z.object({ properties: z.array(Property) });
