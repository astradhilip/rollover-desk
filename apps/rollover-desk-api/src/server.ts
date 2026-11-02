// The composition root: the only file that knows which adapters are in use.
import { pino } from 'pino';
import { GetCurrentUser } from './application/use-cases/GetCurrentUser';
import { Login } from './application/use-cases/Login';
import { CreateProperty, GetProperty, ListProperties } from './application/use-cases/Properties';
import { loadConfig } from './config';
import { createDatabase } from './infrastructure/db/connection';
import { migrateToLatest } from './infrastructure/db/migrations';
import { PropertyRepository } from './infrastructure/db/PropertyRepository';
import { UserRepository } from './infrastructure/db/UserRepository';
import { JwtTokenService } from './infrastructure/security/JwtTokenService';
import { ScryptPasswordHasher } from './infrastructure/security/ScryptPasswordHasher';
import { createApp } from './interfaces/http/app';
import { LoginRateLimiter } from './interfaces/http/LoginRateLimiter';
import { buildRoutes } from './interfaces/http/routes';

const config = loadConfig(process.env);
const logger = pino();
const db = createDatabase(config.databaseUrl, (err) => logger.error({ err }, 'database pool error'));
await migrateToLatest(db);

const users = new UserRepository(db);
const properties = new PropertyRepository(db);
const tokens = new JwtTokenService(config.jwtSecret);

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

createApp({
  routes,
  tokens,
  logger,
  corsOrigins: config.corsOrigins,
  trustProxyHops: config.trustProxyHops,
}).listen(config.port, () => logger.info({ port: config.port }, 'rollover-desk-api listening'));
