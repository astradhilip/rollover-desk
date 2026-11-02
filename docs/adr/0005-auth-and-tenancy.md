# 0005: Password login and application tenancy now; SSO and RLS later

**Status:** accepted, M3a. This reversed an earlier "no auth" plan.

## Context

Rent rolls are confidential tenant and income data. A firm keeps each client's data apart. An open demo API would be the first thing a reviewer questions, but a real identity provider can't be set up for a take-home.

## Decision

- **Login:**
  - Email and password, hashed with scrypt.
  - A signed JWT lasting 8 hours, with issuer and audience checked.
  - The API refuses to start in production without `JWT_SECRET`.
  - Login is rate-limited per address.
- **Session:** the dashboard keeps the token in an httpOnly, `sameSite: strict` cookie and calls the API through a same-origin proxy. The browser never sees the token.
- **Revocation:** a token carries the user, organization and a session version, not the role. Each request re-reads the user, so a role change applies at once. Signing out moves the version on and ends every token the user holds. That means signing out in one browser signs out every device too, a deliberate tradeoff for one sign-out that always works. This costs one indexed read per request.
- **Tenancy:** every business table has `organization_id`.
  - The organization comes only from the verified token, never from a request.
  - Every repository method requires it.
  - Another organization's record returns 404, not 403, so its existence isn't revealed.
- **Roles:** `analyst` can change things and `viewer` can only read. Every route declares its access, and a test checks each one.

## Consequences

- Isolation can be shown live with the two seeded organizations.
- Known gaps are listed in [STATUS.md](../STATUS.md):
  - There is no screen for changing a role, though the API applies one on the next request.
  - There is no way to deactivate a user. Deleting one who has uploaded or edited anything is refused by foreign keys, so removal needs a deactivation flag checked in `Authenticate`.
  - The login limiter lives in memory, per process.
- SQLite has no row-level security, so isolation rests on the application alone.

## What would change it

A pilot with real data needs all of these:

- SSO (for example Microsoft Entra) behind `ITokenService`.
- Shorter-lived tokens with refresh, once SSO issues them.
- PostgreSQL row-level security as a second layer.
- Possibly per-deal access walls.

See [PRODUCTION-PATH.md](../PRODUCTION-PATH.md).
