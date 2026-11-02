import { randomBytes } from 'node:crypto';

export interface Config {
  jwtSecret: string;
  databaseUrl: string | undefined;
  corsOrigins: string[];
  port: number;
  trustProxyHops: number;
  production: boolean;
}

/** Refuses to start in production without a real secret. Elsewhere a random one lasts until restart. */
export function loadConfig(env: NodeJS.ProcessEnv): Config {
  const production = env.NODE_ENV === 'production';
  const jwtSecret = env.JWT_SECRET || null;
  if (production && !jwtSecret) throw new Error('JWT_SECRET is required in production.');
  const port = Number(env.PORT || 4000);
  if (!Number.isInteger(port) || port < 0 || port > 65_535) throw new Error('PORT is not a valid port.');
  const trustProxyHops = Number(env.TRUST_PROXY_HOPS || 0);
  if (!Number.isInteger(trustProxyHops) || trustProxyHops < 0)
    throw new Error('TRUST_PROXY_HOPS is not valid.');
  return {
    trustProxyHops,
    jwtSecret: jwtSecret ?? randomBytes(32).toString('hex'),
    databaseUrl: env.DATABASE_URL || undefined,
    corsOrigins: (env.CORS_ORIGINS ?? '')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean),
    port,
    production,
  };
}
