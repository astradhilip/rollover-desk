# Production path

What changes between this demo and a pilot with one real team. I'd do it in order, and wouldn't build the later parts until the pilot shows they're needed.

## 1. Before real data touches it

| Area           | Now                                          | For a pilot                                                                                                                                                                       |
| -------------- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identity       | Email and password, 8-hour JWT               | SSO (for example Microsoft Entra) behind `ITokenService`. Sign-out and role change already take effect on the next request. Add a deactivation flag, and SSO for leaving the firm |
| Tenancy        | `organization_id` checked by the application | The same check, plus PostgreSQL row-level security as a second layer. Per-deal access walls, if compliance requires them                                                          |
| Database       | SQLite file                                  | Managed PostgreSQL with backups and point-in-time restore. The repository contract tests run in CI against it                                                                     |
| Secrets        | `.env`, names in `.env.example`              | A secrets manager. `JWT_SECRET` is already required in production                                                                                                                 |
| Network        | API and dashboard on localhost               | API on a private network. Only the dashboard is public, behind a proxy that appends the client address, with `TRUSTED_PROXY=1` and `TRUST_PROXY_HOPS=1`                           |
| Rate limits    | In memory, per process                       | A shared store such as Redis, so limits hold across instances                                                                                                                     |
| Uploaded files | Parsed rows kept in the database             | The original file kept in encrypted object storage, with a retention period agreed with the data owner                                                                            |

## 2. Trust and audit

- **Audit log:** who uploaded, confirmed, reverted, re-weighted, moved a renewal or exported, and when. Import history already records each upload and its status, but a pipeline move overwrites the deal's last state. An append-only audit table would cover both.
- **Confidential tenant data:** classify rent rolls as confidential, keep them out of logs (the API logs no request bodies today), and restrict exports further if needed. Today only analysts can export.

## 3. Running it

- **Observability:**
  - The API logs JSON with pino.
  - Add request IDs, traces and metrics: upload parse time, confirm failures, export time.
  - Alert on error rate.
- **Deploy:**
  - One container per app, built by CI from `main`, with migrations run before the new version takes traffic.
  - Kysely migrations only add columns or tables, so a rollback stays safe.
- **Cost:** small. One API instance, one dashboard instance and a small PostgreSQL serve a pilot team. Export and parsing run in-process. The only heavy dependency is LibreOffice, which CI needs for tests but production doesn't.

## 4. Source systems

- **Today:** files are uploaded by hand, which is how rent rolls arrive from sellers and other firms.
- **For a firm's own managed properties:** a scheduled pull from the property management system would replace the upload. It would arrive as another adapter behind `ISpreadsheetReader`, or as a new port feeding the same intake.
- **Commercial parser:** if the firm licenses one, its output enters the same way. The review and confirm step stays, because the doubt-showing is the value.

## 5. Rollout

1. **One pilot team**, such as one capital markets team in one office, on its own organization.
2. **Measure:**
   - Time from received file to confirmed rent roll, against their baseline.
   - How many columns are mapped automatically.
   - How often analysts correct after confirming.
   - Whether they keep working in the exported workbook.

   These test assumptions 1 to 3 in [ASSUMPTIONS.md](ASSUMPTIONS.md).

3. **Weekly feedback.** New synonyms and formats go in through [NEW-FORMAT.md](NEW-FORMAT.md), each with a test file.
4. **Widen** to agency leasing and asset management only if the pilot numbers hold, since that tests assumption 6.

## Not planned

- Replacing Argus, Excel or the property management system.
- Valuation or underwriting.
- Automatic decisions. The tool flags and explains, and people decide.
