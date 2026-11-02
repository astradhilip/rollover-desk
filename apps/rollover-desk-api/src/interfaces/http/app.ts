import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import multer from 'multer';
import type { Logger } from 'pino';
import swaggerUi from 'swagger-ui-express';
import type { z } from 'zod';
import type { Principal } from '../../domain/entities/User';
import type { ITokenService } from '../../domain/ports/ITokenService';
import { HttpError, toHttpError } from './errors';
import { buildOpenApi } from './openapi';
import type { Route } from './routes';

const BODY_LIMIT = '100kb';

export interface AppOptions {
  routes: Route[];
  tokens: ITokenService;
  logger: Logger;
  corsOrigins: string[];
  /** Proxies in front of this API, so the login limiter sees the real client address. */
  trustProxyHops?: number;
}

const bearer = (req: Request) => /^Bearer (\S+)$/.exec(req.headers.authorization ?? '')?.[1] ?? null;

export function createApp({ routes, tokens, logger, corsOrigins, trustProxyHops = 0 }: AppOptions) {
  const app = express();
  app.set('trust proxy', trustProxyHops);
  app.disable('x-powered-by');
  // Method, route and status only. Bodies and auth headers hold credentials and tenant data.
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () =>
      logger.info(
        { method: req.method, path: req.path, status: res.statusCode, ms: Date.now() - start },
        'request',
      ),
    );
    next();
  });

  const document = buildOpenApi(routes);
  // Swagger UI needs inline scripts, so it gets its own policy, mounted ahead of the strict one.
  app.use('/docs', helmet({ contentSecurityPolicy: false }), swaggerUi.serve, swaggerUi.setup(document));
  app.use(helmet());
  app.use(cors({ origin: corsOrigins }));
  app.use(express.json({ limit: BODY_LIMIT }));

  app.get('/openapi.json', (_req, res) => void res.json(document));

  for (const route of routes) {
    app[route.method](route.path, async (req: Request, res: Response) => {
      const principal = await authorize(route, req, tokens);
      const file = route.upload ? await receiveFile(req, res) : undefined;
      const body = parseBody(route, req);
      const query = route.query ? validate(route.query, req.query) : undefined;
      const result = await route.handle({ req, res, principal, body, query, ...(file ? { file } : {}) });
      res.status(route.status ?? 200).json(route.response.parse(result));
    });
  }

  app.use((_req, _res, next) => next(new HttpError(404, 'not_found', 'Not found.')));

  app.use((error: unknown, req: Request, res: Response, _next: NextFunction) => {
    const known = toHttpError(error);
    if (!known) logger.error({ err: error, method: req.method, path: req.path }, 'unhandled error');
    const http = known ?? new HttpError(500, 'internal_error', 'Something went wrong.');
    res
      .status(http.status)
      .set(http.headers)
      .json({
        error: { code: http.code, message: http.message, ...(http.details ? { details: http.details } : {}) },
      });
  });
  return app;
}

const UPLOAD_LIMIT_BYTES = 10 * 1024 * 1024;
const receiver = multer({
  storage: multer.memoryStorage(),
  defParamCharset: 'utf8',
  limits: { fileSize: UPLOAD_LIMIT_BYTES, files: 1, fields: 0 },
}).single('file');

function receiveFile(req: Request, res: Response) {
  return new Promise<{ originalname: string; buffer: Buffer } | undefined>((resolve, reject) => {
    receiver(req, res, (error: unknown) => {
      if (error instanceof multer.MulterError) {
        const message =
          error.code === 'LIMIT_FILE_SIZE'
            ? 'The file is over the 10 MB limit.'
            : 'The upload could not be read.';
        reject(new HttpError(400, 'validation_error', message));
      } else if (error) {
        reject(new HttpError(400, 'validation_error', 'The upload could not be read.'));
      } else {
        resolve(req.file);
      }
    });
  });
}

async function authorize(route: Route, req: Request, tokens: ITokenService): Promise<Principal> {
  // A public route never reads this; the value makes that mistake fail closed in a repository query.
  if (route.access === 'public') return { userId: '', organizationId: '', role: 'viewer' };
  const token = bearer(req);
  const principal = token ? await tokens.verify(token) : null;
  if (!principal) throw new HttpError(401, 'unauthorized', 'Sign in to continue.');
  if (route.access === 'analyst' && principal.role !== 'analyst') {
    throw new HttpError(403, 'forbidden', 'Your role can view but not change this.');
  }
  return principal;
}

function parseBody(route: Route, req: Request): unknown {
  return route.request ? validate(route.request, req.body) : undefined;
}

function validate(schema: z.ZodType, value: unknown): unknown {
  const parsed = schema.safeParse(value);
  if (parsed.success) return parsed.data;
  throw new HttpError(
    400,
    'validation_error',
    'The request is not valid.',
    {},
    parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
  );
}
