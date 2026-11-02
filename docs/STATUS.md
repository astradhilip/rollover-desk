# Status

Update at every milestone, so a fresh session can resume from here.

| Milestone              | Branch                                | State     |
| ---------------------- | ------------------------------------- | --------- |
| M0 Repo and harness    | `feature/m0-repo-harness`             | Merged    |
| M1 Domain engine       | `feature/m1-domain-engine`            | Merged    |
| M2 Rent-roll intake    | `feature/m2-rent-roll-intake`         | Merged    |
| M3a API, auth, tenancy | `feature/m3a-api-auth-tenancy`        | Merged    |
| M3b API features       | `feature/m3b-api-rollover-features`   | Merged    |
| M4a Design system      | `feature/m4a-dashboard-design-system` | Merged    |
| M4b Screens            | `feature/m4b-dashboard-screens`       | In review |
| M5 Excel export        | `feature/m5-excel-export`             | Next      |
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

- M4b finish review used impeccable's degraded path, because the shipped reviewer agents aren't available here. It ran twice, its eight fixes were applied, and they were checked by eye rather than by a third review. The code review also predates those eight fixes.

- The dashboard's e2e script and render proof need a running stack, so they ran locally and not in CI.

- The demo uses the real clock while samples are dated 2026-01-15, so some sample dates show as passed.

- Trend lines on KPI tiles are left out: no history exists to plot.

- The Office add-in can't be run in real Excel on this machine (M8).

## Carried forward

- Tokens carry the role and organization for 8 hours. There is no role change, deactivation or logout yet; when one exists, it must invalidate or re-check tokens.
- Production must keep the API port private and put a proxy in front of the dashboard that appends the client address, with `TRUSTED_PROXY=1` and `TRUST_PROXY_HOPS=1`. Without it, all clients share one login limit per address.
- Sign-out clears the cookie but the token stays valid until it expires.
- The render proof (`pnpm --filter rollover-desk-dashboard proof`) needs a running stack, so it runs locally and not in CI.
- The login limiter is per process, in memory.

- `Property` holds one market rent per property, not per property type.
