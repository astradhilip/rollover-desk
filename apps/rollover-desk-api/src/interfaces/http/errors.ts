import type { ApiError } from '@rollover-desk/contracts';
import { ConflictError, InvalidCredentialsError, NotFoundError } from '../../domain/entities/errors';

type Code = ApiError['error']['code'];

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: Code,
    message: string,
    readonly headers: Record<string, string> = {},
    readonly details?: { path: string; message: string }[],
  ) {
    super(message);
  }
}

/** Unknown errors become a bare 500, so internals never reach a client. */
export function toHttpError(error: unknown): HttpError | null {
  if (error instanceof HttpError) return error;
  if (error instanceof InvalidCredentialsError) return new HttpError(401, 'unauthorized', error.message);
  if (error instanceof NotFoundError) return new HttpError(404, 'not_found', error.message);
  if (error instanceof ConflictError) return new HttpError(409, 'conflict', error.message);
  const status = (error as { status?: unknown } | null)?.status;
  if (typeof status === 'number' && status >= 400 && status < 500) {
    return new HttpError(400, 'validation_error', 'The request could not be read.');
  }
  return null;
}
