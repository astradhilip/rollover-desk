import { pino } from 'pino';
import { GetCurrentUser } from '../../src/application/use-cases/GetCurrentUser';
import { Login } from '../../src/application/use-cases/Login';
import { CreateProperty, GetProperty, ListProperties } from '../../src/application/use-cases/Properties';
import { createDatabase } from '../../src/infrastructure/db/connection';
import { migrateToLatest } from '../../src/infrastructure/db/migrations';
import { PropertyRepository } from '../../src/infrastructure/db/PropertyRepository';
import { seed } from '../../src/infrastructure/db/seed';
import { UserRepository } from '../../src/infrastructure/db/UserRepository';
import { JwtTokenService } from '../../src/infrastructure/security/JwtTokenService';
import { ScryptPasswordHasher } from '../../src/infrastructure/security/ScryptPasswordHasher';
import { createApp } from '../../src/interfaces/http/app';
import { LoginRateLimiter } from '../../src/interfaces/http/LoginRateLimiter';
import { buildRoutes } from '../../src/interfaces/http/routes';

export const SECRET = 'test-secret-test-secret-test-secret-1';

/** The real stack on a throwaway database. */
export async function buildTestApp() {
  const db = createDatabase(':memory:');
  await migrateToLatest(db);
  await seed(db);
  const users = new UserRepository(db);
  const properties = new PropertyRepository(db);
  const tokens = new JwtTokenService(SECRET);
  const routes = buildRoutes(
    {
      login: new Login(users, new ScryptPasswordHasher(), tokens),
      getCurrentUser: new GetCurrentUser(users),
      listProperties: new ListProperties(properties),
      getProperty: new GetProperty(properties),
      createProperty: new CreateProperty(properties),
    },
    new LoginRateLimiter(),
  );
  const app = createApp({
    routes,
    tokens,
    logger: pino({ level: 'silent' }),
    corsOrigins: ['https://desk.example'],
  });
  return { app, db, routes, tokens };
}
