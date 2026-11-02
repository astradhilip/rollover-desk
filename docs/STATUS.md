# Status

Update at every milestone, so a fresh session can resume from here.

| Milestone              | Branch                                | State     |
| ---------------------- | ------------------------------------- | --------- |
| M0 Repo and harness    | `feature/m0-repo-harness`             | Merged    |
| M1 Domain engine       | `feature/m1-domain-engine`            | Merged    |
| M2 Rent-roll intake    | `feature/m2-rent-roll-intake`         | Merged    |
| M3a API, auth, tenancy | `feature/m3a-api-auth-tenancy`        | Merged    |
| M3b API features       | `feature/m3b-api-rollover-features`   | In review |
| M4a Design system      | `feature/m4a-dashboard-design-system` | Next      |
| M4b Screens            | `feature/m4b-dashboard-screens`       |           |
| M5 Excel export        | `feature/m5-excel-export`             |           |
| M6 Submission docs     | `feature/m6-submission-docs`          |           |
| Cut line               |                                       |           |
| M7 MCP server          | `feature/m7-mcp-server`               |           |
| M8 Office add-in       | `feature/m8-excel-addin`              |           |

## Verified

- The hooks are live in the working session: the guard blocked a harmless `git add -A` probe, and the prompt log hook appended entries.

- Domain calculations were recalculated independently against `cre-formulas`, and lint rejects planted outside imports in `domain`.

- The Stop hook caught a real typecheck failure during M3a.
- Repository contract tests pass on PostgreSQL 16 in Docker as well as SQLite.

## Unverified

- The Office add-in can't be run in real Excel on this machine (M8).

## Carried forward

- Tokens carry the role and organization for 8 hours. There is no role change, deactivation or logout yet; when one exists, it must invalidate or re-check tokens.
- The dashboard's httpOnly cookie needs CSRF protection (`SameSite` and an origin check), because the API is safe from CSRF only through bearer headers. It must also set `TRUST_PROXY_HOPS` and forward the client address, or the login limiter sees one IP.
- The login limiter is per process, in memory.

- `Property` holds one market rent per property, not per property type.
