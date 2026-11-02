// The composition root: the only file that knows which adapters are in use.
import { pino } from 'pino';
import { loadConfig } from './config';
import { createDatabase } from './infrastructure/db/connection';
import { migrateToLatest } from './infrastructure/db/migrations';
import { JwtTokenService } from './infrastructure/security/JwtTokenService';
import { SystemClock } from './infrastructure/SystemClock';
import { createApp } from './interfaces/http/app';
import { LoginRateLimiter } from './interfaces/http/LoginRateLimiter';
import { buildRoutes } from './interfaces/http/routes';
import { buildUseCases } from './wiring';

const config = loadConfig(process.env);
const logger = pino();
const db = createDatabase(config.databaseUrl, (err) => logger.error({ err }, 'database pool error'));
await migrateToLatest(db);

const tokens = new JwtTokenService(config.jwtSecret);
const routes = buildRoutes(buildUseCases(db, tokens, new SystemClock()), new LoginRateLimiter());

createApp({
  routes,
  tokens,
  logger,
  corsOrigins: config.corsOrigins,
  trustProxyHops: config.trustProxyHops,
}).listen(config.port, () => logger.info({ port: config.port }, 'rollover-desk-api listening'));
