import { pino } from 'pino';
import { AS_OF } from '@rollover-desk/synthetic';
import { createDatabase } from '../../src/infrastructure/db/connection';
import { migrateToLatest } from '../../src/infrastructure/db/migrations';
import { seed } from '../../src/infrastructure/db/seed';
import { JwtTokenService } from '../../src/infrastructure/security/JwtTokenService';
import { createApp } from '../../src/interfaces/http/app';
import { LoginRateLimiter } from '../../src/interfaces/http/LoginRateLimiter';
import { buildRoutes } from '../../src/interfaces/http/routes';
import { buildUseCases } from '../../src/wiring';

export const SECRET = 'test-secret-test-secret-test-secret-1';

/** The real stack on a throwaway database. */
export async function buildTestApp() {
  const db = createDatabase(':memory:');
  await migrateToLatest(db);
  await seed(db);
  const tokens = new JwtTokenService(SECRET);
  const routes = buildRoutes(buildUseCases(db, tokens, { today: () => AS_OF }), new LoginRateLimiter());
  const app = createApp({
    routes,
    tokens,
    logger: pino({ level: 'silent' }),
    corsOrigins: ['https://desk.example'],
  });
  return { app, db, routes, tokens };
}
