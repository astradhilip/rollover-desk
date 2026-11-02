# Status

Update at every milestone, so a fresh session can resume from here.

| Milestone              | Branch                                | State     |
| ---------------------- | ------------------------------------- | --------- |
| M0 Repo and harness    | `feature/m0-repo-harness`             | In review |
| M1 Domain engine       | `feature/m1-domain-engine`            | Next      |
| M2 Rent-roll intake    | `feature/m2-rent-roll-intake`         |           |
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

## Unverified

- The Stop hook has not yet run against product code, because M0 has no packages with tests.
