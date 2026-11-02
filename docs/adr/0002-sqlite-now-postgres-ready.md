# 0002: SQLite now, PostgreSQL ready

**Status:** accepted, M3a.

## Context

A reviewer should run the project with one command and no Docker. A real deployment needs concurrent writers and, later, row-level security.

## Decision

- **Queries:** Kysely, with SQLite (better-sqlite3) by default. A `postgres://` `DATABASE_URL` selects the PostgreSQL dialect.
- **Schema:** portable only: ISO date strings, money as integer cents, and Kysely migrations with no dialect-specific SQL.
- **Contract tests:** one suite runs against SQLite always, and against PostgreSQL when `TEST_POSTGRES_URL` is set. It passed on PostgreSQL 16 in Docker during M3a.
- **One active rent roll:** a partial unique index allows only one confirmed import per property. Confirm runs in a transaction, so parallel confirms can't leave two.

## Consequences

- `corepack enable`, `pnpm install`, a seed command and `pnpm dev` are the whole setup: no Docker or database server.
- Some type differences remain, such as `bigint` coming back as text from PostgreSQL. The repositories normalise them, and the contract tests check this.
- PostgreSQL in CI isn't wired, so it is checked by hand, not on every change.

## What would change it

Any of these means switching to PostgreSQL:

- More than one API process.
- Concurrent analysts on one property.
- Row-level security as a second tenancy layer.

The switch is configuration plus running the contract tests in CI against a PostgreSQL service.
