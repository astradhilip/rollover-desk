import SqliteDriver from 'better-sqlite3';
import { Kysely, PostgresDialect, SqliteDialect } from 'kysely';
import pg from 'pg';
import type { Database } from './schema';

const DEFAULT_SQLITE_FILE = 'rollover-desk.sqlite';

/** SQLite unless DATABASE_URL is a PostgreSQL URL. Repositories don't know which one they have. */
export function createDatabase(
  url = DEFAULT_SQLITE_FILE,
  onPoolError?: (error: Error) => void,
): Kysely<Database> {
  if (/^postgres(ql)?:\/\//.test(url)) {
    const pool = new pg.Pool({ connectionString: url });
    // Without a listener, a dropped idle connection would end the process instead of reconnecting.
    pool.on('error', (error) => onPoolError?.(error));
    return new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });
  }
  const database = new SqliteDriver(url);
  database.pragma('foreign_keys = ON');
  database.pragma('journal_mode = WAL');
  return new Kysely<Database>({ dialect: new SqliteDialect({ database }) });
}
