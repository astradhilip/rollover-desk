# Status

Update at every milestone, so a fresh session can resume from here.

| Milestone              | Branch                                | State     |
| ---------------------- | ------------------------------------- | --------- |
| M0 Repo and harness    | `feature/m0-repo-harness`             | Merged    |
| M1 Domain engine       | `feature/m1-domain-engine`            | In review |
| M2 Rent-roll intake    | `feature/m2-rent-roll-intake`         | Next      |
| M3a API, auth, tenancy | `feature/m3a-api-auth-tenancy`        |           |
| M3b API features       | `feature/m3b-api-rollover-features`   |           |
| M4a Design system      | `feature/m4a-dashboard-design-system` |           |
| M4b Screens            | `feature/m4b-dashboard-screens`       |           |
| M5 Excel export        | `feature/m5-excel-export`             |           |
| M6 Submission docs     | `feature/m6-submission-docs`          |           |
| Cut line               |                                       |           |
| M7 MCP server          | `feature/m7-mcp-server`               |           |
| M8 Office add-in       | `feature/m8-excel-addin`              |           |

## Verified

- The hooks are live in the working session: the guard blocked a harmless `git add -A` probe, and the prompt log hook appended entries.

- Domain calculations were recalculated independently against `cre-formulas`, and lint rejects planted outside imports in `domain`.

## Unverified

- The Stop hook has not yet been seen to fail on a real test failure in a working session.

## Carried into M2

- A malformed date throws `RangeError` in the domain, so intake must reject or flag it before a lease reaches the domain.
- `Property` holds one market rent per property, not per property type.
