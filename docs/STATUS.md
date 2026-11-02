# Status

Update at every milestone, so a fresh session can resume from here.

| Milestone              | Branch                                | State  |
| ---------------------- | ------------------------------------- | ------ |
| M0 Repo and harness    | `feature/m0-repo-harness`             | Merged |
| M1 Domain engine       | `feature/m1-domain-engine`            | Merged |
| M2 Rent-roll intake    | `feature/m2-rent-roll-intake`         | Merged |
| M3a API, auth, tenancy | `feature/m3a-api-auth-tenancy`        | Merged |
| M3b API features       | `feature/m3b-api-rollover-features`   | Merged |
| M4a Design system      | `feature/m4a-dashboard-design-system` | Merged |
| M4b Screens            | `feature/m4b-dashboard-screens`       | Merged |
| M5 Excel export        | `feature/m5-excel-export`             | Merged |
| M6 Submission docs     | `feature/m6-submission-docs`          | Merged |
| Cut line               |                                       |        |
| M7 MCP server          | `feature/m7-mcp-server`               | Merged |
| M8 Office add-in       | `feature/m8-excel-addin`              | Cut    |
| M9 Close gaps          | `feature/m9-close-gaps`               | Merged |

The plan is complete. M8 was cut by decision, because it couldn't be run or verified on this machine. Its design is in [EXCEL-ADDIN.md](EXCEL-ADDIN.md).

## Verified

- The hooks are live in the working session: the guard blocked a harmless `git add -A` probe, and the prompt log hook appended entries.

- Domain calculations were recalculated independently against `cre-formulas`, and lint rejects planted outside imports in `domain`.

- The Stop hook caught a real typecheck failure during M3a.
- Repository contract tests pass on PostgreSQL 16 in Docker as well as SQLite.
- CI runs the workbook's LibreOffice recalculation tests rather than skipping them. The log of run 41431622735 (commit `4713a18`) shows all 11 `WorkbookWriter` tests passing, the recalculation cases taking 3 to 5 seconds each.
- M7: the MCP server's protocol tests drive it through an MCP client over the SDK's in-memory transport. They use API responses captured from a real confirmed rent roll. A smoke run started it over stdio against a live API. A headless Claude Code run started it from `.mcp.json` and called two tools, getting the answer key's total rent.
- M6: a fresh clone of `main` at the M5 merge installed, seeded and ran from the README steps alone. The dashboard e2e happy path then passed against it, from sign-in to workbook download, revert and viewer limits.
- M5 workbook: every figure is a live formula with the domain's value stored beside it. Tests strip the stored values, recalculate in LibreOffice and compare cell by cell with the domain, including after changing the as-of date, loan maturity and market rent, and with the as-of date blank.

- M9 sessions: a token now carries only the user, organization and a session version. Every request re-reads the role from the user record, so a role change takes effect on the next request, and a deleted user's token is refused. Signing out moves the session version on, which ends every token the user has. Tests cover each case, and turning off the version check fails two of them.
- M9 stored findings: confirm stores the issues and skipped rows the analyst accepted, and the export's Data Issues sheet reads them. A test changes the stored rows after confirm and the sheet stays as confirmed; turning off the stored read fails it.
- M9: the browser e2e now keeps the session token before signing out and checks the API refuses it afterwards. It passed on a freshly seeded database.
- M9 dashboard sign-out calls the API first. If the API can't end the session, the cookie stays and the page says the person is still signed in.

## Unverified

- M4b finish review used impeccable's degraded path, because the shipped reviewer agents aren't available here. It ran twice, its eight fixes were applied, and they were checked by eye rather than by a third review. The code review also predates those eight fixes.

- The dashboard's e2e script and render proof need a running stack, so they ran locally and not in CI.

- The demo uses the real clock while samples are dated 2026-01-15, so some sample dates show as passed.

- Trend lines on KPI tiles are left out: no history exists to plot.

- The M5 workbook has been recalculated only in LibreOffice, not opened in real Excel. Not checked: Protected View's stored values, `SUMPRODUCT` and defined names in Excel, and dates before 1900-03-01, where Excel's fictitious 1900-02-29 shifts dates and `EDATE` returns `#NUM!`. Intake already blocks dates with years before 1900.
- Firefox and Safari downloads.

## Carried forward

- Production must keep the API port private and put a proxy in front of the dashboard that appends the client address, with `TRUSTED_PROXY=1` and `TRUST_PROXY_HOPS=1`. Without it, all clients share one login limit per address.
- The render proof (`pnpm --filter rollover-desk-dashboard proof`) needs a running stack, so it runs locally and not in CI.
- The login limiter is per process, in memory.

- `Property` holds one market rent per property, not per property type.
- Imports confirmed before migration 0003 have no stored findings, so their Data Issues sheet is still rebuilt from the stored rows.
- There is no screen for changing a role, though the API applies one on the next request. There is no deactivation either: deleting a user who has uploaded or edited anything is refused by foreign keys, so removal needs a flag checked in `Authenticate`.
- Signing out ends the user's sessions on every device. That is deliberate, but a per-device sign-out would need a token id stored per session.
- Workbook text cells carry no quote prefix (ExcelJS can't set one), so editing a cell that holds `=...` text in Excel and pressing Enter would turn it into a formula. Opening and recalculating keeps it literal.
- Critical Dates rows are generated at export, so flipping Month-to-month on the Rent Roll sheet doesn't add or remove notice rows.
