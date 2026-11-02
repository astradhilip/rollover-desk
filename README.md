# rollover-desk

[![CI](https://github.com/astradhilip/rollover-desk/actions/workflows/ci.yml/badge.svg)](https://github.com/astradhilip/rollover-desk/actions/workflows/ci.yml)

**Messy commercial real estate rent roll in. Explainable lease rollover and critical-date risk out. A live-formula Excel workbook back.**

An analyst receives a rent roll in whatever shape the seller's or property manager's system exports. Before anyone can answer the questions that matter, someone cleans it by hand:

- How much income rolls, and when?
- Which renewal notice dates are coming up?
- Does a major tenant leave before the loan comes due?

rollover-desk reads the file, shows every doubt instead of guessing, and answers those questions with numbers you can open up. It then hands back an Excel workbook whose formulas stay live.

> All data in this repository is synthetic. Every property, tenant and figure is invented.
>
> **Reviewing this as a take-home?** [docs/WALKTHROUGH.md](docs/WALKTHROUGH.md) follows the seven discussion topics: why this problem, research, what was worth building, assumptions and tradeoffs, architecture, what was built, and what's next.

## Contents

- [Features](#features)
- [Tech stack](#tech-stack)
- [Quick start](#quick-start)
- [Configuration](#configuration)
- [How it works](#how-it-works)
- [Architecture](#architecture)
- [Project structure](#project-structure)
- [API](#api)
- [Ask an agent (MCP)](#ask-an-agent-mcp)
- [Scripts](#scripts)
- [Testing](#testing)
- [Extending the project](#extending-the-project)
- [Scope and tradeoffs](#scope-and-tradeoffs)
- [Documentation](#documentation)
- [How it was built](#how-it-was-built)

## Features

### Rent-roll intake that never guesses

- Reads `.xlsx` and `.csv` files up to 10 MB, and finds the header row under title rows.
- Maps columns by synonym, with a confidence for each. The analyst can correct any mapping and the review re-runs at once.
- Tells monthly, annual and per-square-foot rent apart. A bare "Rent" header that doesn't say its period **blocks** rather than guessing a factor of twelve.
- Catches impossible and ambiguous dates, mixed day/month order, duplicate suites, formula errors, subtotal rows and totals that don't match the rows.
- Each problem is a **warning** (acknowledge to continue) or a **blocker** (fix to continue). Skipped rows are listed, never silently dropped.
- An upload is held as pending until an analyst confirms it. Confirming replaces the current rent roll in one transaction, and **revert** restores the previous one.

### Analysis you can open up

- **Rollover by year:** expiring area and rent per year, with shares, running totals, and counts of leases missing area or rent.
- **WALT** (weighted average remaining lease term), by area and by rent, with the leases left out and why.
- **Critical dates:** renewal notice dates derived from notice terms, rent steps, expirations and loan maturity, split into passed, upcoming and missing.
- **Lease before loan:** flags leases, and the largest tenant, that expire before the loan matures.
- **Tenant concentration** and **mark-to-market** against an analyst-entered market rent.
- **Leasing commission estimates** for renewal against replacement, itemised by lease year, with no fallback rate.
- **Explainable risk score:** four weighted components (time to expiry, notice urgency, concentration, loan mismatch). Every score shows its inputs, weights and points. Weights are adjustable per property and must total 100. A lease missing inputs is **not scored**, with reasons, never given a default.

### Dashboard

- **Desk:** KPIs, the attention queue (done, dismiss, undo), a rollover chart with a table view, and the loan and vacating panel.
- **Leases:** each lease's detail shows its critical dates on a line drawn to scale and its risk score opened up.
- **Critical dates:** across the property, with missing dates called out.
- **Renewal and backfill pipeline:** stages from Identified to Renewed, Backfilled or Vacating. A vacating lease records why, and feeds the projected vacating total.
- **Rent rolls:** upload, column-mapping review, issues, history and revert.
- **Also:** risk weights per property, light and dark themes, and layouts checked at 390, 1024 and 1440 pixels wide.

### Live-formula Excel export

Six sheets: Assumptions, Rent Roll, Rollover Schedule, WALT, Critical Dates and Data Issues.

- **Live formulas:** every figure is a formula over the rent roll and three blue inputs: as-of date, loan maturity and market rent. Change one, and every sheet follows.
- **Stored values:** each formula also stores its result, so Excel's Protected View shows the right numbers before it recalculates.
- **Safe text:** tenant text starting `= + - @` is written as literal text, never as a formula.

### Agent access

- A read-only MCP server lets Claude Code, or any MCP client, ask about rollover, critical dates, leases, attention and risk, and get the API's own numbers. See [Ask an agent](#ask-an-agent-mcp).

### Security and multi-tenancy

- **Login:** email and password (scrypt), with signed, expiring tokens and a rate limit on login.
- **Session:** the dashboard keeps the token in an httpOnly cookie, behind a same-origin proxy. Every request re-reads the user's role, and signing out ends the user's tokens everywhere.
- **Organizations:** each user belongs to one. The organization comes only from the verified token, and another organization's records return 404.
- **Roles:** `analyst` can change things and `viewer` can only read. Every route declares its access, and a test checks each one.

## Tech stack

| Layer           | Technology                                                                                                                  |
| --------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Monorepo        | pnpm 10 workspaces, Turborepo, TypeScript 5.9, Node 22                                                                      |
| API             | Express 5, Kysely (SQLite through better-sqlite3, or PostgreSQL), zod 4, multer, helmet, pino, jose (JWT), ExcelJS, OpenAPI |
| Dashboard       | Next.js 15, React 19, Tailwind CSS v4, TanStack Query                                                                       |
| Shared packages | zod contracts, a typed API client, design tokens, UI components                                                             |
| MCP server      | `@modelcontextprotocol/sdk` over stdio                                                                                      |
| Testing         | Vitest, Supertest, Playwright, headless LibreOffice for workbook recalculation                                              |
| CI              | GitHub Actions: lint, typecheck, test, build and a credential scan                                                          |

## Quick start

**Prerequisites:** Node 22.12 or later. Corepack (bundled with Node) provides pnpm, and the database is a local SQLite file, so there's nothing else to install.

```bash
git clone https://github.com/astradhilip/rollover-desk.git
cd rollover-desk
corepack enable
pnpm install
pnpm --filter rollover-desk-api seed   # demo users in two organizations, and one property
pnpm dev                               # API on http://localhost:4000, dashboard on http://localhost:3000
```

Open http://localhost:3000 and sign in:

| Email                           | Password                | Role and purpose                                           |
| ------------------------------- | ----------------------- | ---------------------------------------------------------- |
| `analyst@prairie-ridge.example` | `demo-prairie-analyst`  | Analyst: upload, confirm, revert, move, export             |
| `viewer@prairie-ridge.example`  | `demo-prairie-viewer`   | Viewer: read only                                          |
| `analyst@lone-oak.example`      | `demo-lone-oak-analyst` | A second organization, which sees none of the first's data |

These passwords are for the demo only.

**Try it in five minutes:**

1. Open **Trinity Commerce Center**, go to **Rent rolls** and upload `data/synthetic/samples/property-manager-export.xlsx`. It is refused, with each problem listed.
2. Upload `data/synthetic/samples/clean.xlsx` and confirm it.
3. Explore the Desk, a lease's risk explanation and the critical dates.
4. Choose **Download workbook** and change the as-of date on its Assumptions sheet.

[docs/DEMO.md](docs/DEMO.md) is the full ten-minute walkthrough.

**Start over:** stop `pnpm dev`, delete `apps/rollover-desk-api/rollover-desk.sqlite*`, and seed again.

## Configuration

Everything has a working default for local use. [`.env.example`](.env.example) lists every name; values never go in git.

| Variable                                                                 | Used by    | Purpose                                                                                   |
| ------------------------------------------------------------------------ | ---------- | ----------------------------------------------------------------------------------------- |
| `JWT_SECRET`                                                             | API        | Token signing key. **Required in production**; otherwise a random one lasts until restart |
| `DATABASE_URL`                                                           | API        | SQLite file path (default `rollover-desk.sqlite`) or a `postgres://` URL                  |
| `PORT`, `NODE_ENV`                                                       | API        | Port (default 4000), and production or development                                        |
| `CORS_ORIGINS`                                                           | API        | Comma-separated browser origins allowed to call the API                                   |
| `TRUST_PROXY_HOPS`                                                       | API        | Proxies in front of the API, so login limits see the real client address                  |
| `API_URL`                                                                | Dashboard  | Where the dashboard's server reaches the API (default `http://localhost:4000`)            |
| `PUBLIC_ORIGIN`                                                          | Dashboard  | The site's public origin, when a proxy rewrites Host                                      |
| `TRUSTED_PROXY`                                                          | Dashboard  | `1` only when a proxy in front appends the client address to `X-Forwarded-For`            |
| `ROLLOVER_DESK_API_URL`, `ROLLOVER_DESK_EMAIL`, `ROLLOVER_DESK_PASSWORD` | MCP server | The API to read and the account to sign in as. A viewer account is enough                 |
| `TEST_POSTGRES_URL`                                                      | Tests      | Also runs the repository contract tests against PostgreSQL                                |

## How it works

```
 upload (.xlsx / .csv)
        │
        ▼
 intake: find header → map columns → parse values → issues (warning / blocking)
        │                      ▲
        ▼                      │ analyst corrects the mapping
 pending import ── review ─────┘
        │ confirm (warnings acknowledged, no blockers)
        ▼
 confirmed rent roll ──► rollover · WALT · critical dates · risk · attention · pipeline
        │                                      │
        ▼                                      ▼
 live-formula workbook                  dashboard and MCP tools
```

Four rules shape every feature:

1. **Never impute.** Missing rent, area or dates stay "not recorded". Calculations say what they left out, and nothing is filled with a default. See [ADR 0004](docs/adr/0004-never-impute.md).
2. **Doubt is visible.** Uncertain data is flagged or blocks confirmation. It is never guessed or dropped silently.
3. **Every number explains itself.** Formulas live in pure, tested domain functions, and the risk score lists its parts.
4. **Exact arithmetic.** Dates are `YYYY-MM-DD` strings computed in UTC, and money is integer cents. See [ADR 0007](docs/adr/0007-dates-and-money.md).

## Architecture

### The system

```
 browser ──► dashboard (Next.js) ──► same-origin proxy ──┐
                                                          │  HTTP + bearer token
 Claude Code / MCP client ──► MCP server (stdio) ─────────┤
                                                          ▼
                                                 rollover-desk API ──► SQLite or PostgreSQL
                                                          │
                                                          └──► .xlsx workbook
```

- **The API owns every rule and every number.** The dashboard and the MCP server are clients. Neither calculates rollover, dates or risk, so a figure can't differ between the screen, the agent and the workbook.
- **One contract for everyone:** `packages/contracts` holds a zod schema for every request, response and error. The API validates against it, and `packages/api-client` validates every response against it, for both the dashboard and the MCP server.

### Hexagonal architecture in the API

The API follows hexagonal architecture, also called ports and adapters. The business logic sits in the middle and knows nothing about HTTP, databases, Excel or JWTs. It states what it needs as **ports** (TypeScript interfaces), and **adapters** at the edge implement them.

```
               driving adapters                                  driven adapters
             (call into the app)                               (the app calls out)

  HTTP routes, auth, OpenAPI ─┐                            ┌─► Kysely repositories ─► SQLite / PostgreSQL
  (src/interfaces/http)       │   ┌────────────────────┐   ├─► ExcelJS reader (.xlsx, .csv)
                              ├──►│ application        │   ├─► ExcelJS workbook writer
                              │   │   use cases        │   ├─► jose JWT token service
                              │   │ ┌────────────────┐ │   ├─► scrypt password hasher
                              │   │ │ domain         │ ├──►┤
                              │   │ │ pure functions │ │   └─► system clock
                              │   │ │ + ports        │ │
                              │   │ └────────────────┘ │
                              │   └────────────────────┘
                              │           ▲
  server.ts + wiring.ts ──────┴───────────┘  the composition root: the only code that picks adapters
```

| Layer            | Folder                           | Holds                                                                                                          | May import                                   |
| ---------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| Domain           | `src/domain/entities`            | Pure functions and types: intake, rollover, WALT, critical dates, risk, commissions, the workbook model        | Nothing outside it                           |
| Ports            | `src/domain/ports`               | Interfaces the core needs from the outside world                                                               | Domain types only                            |
| Application      | `src/application/use-cases`      | Use cases: upload, review, confirm, revert, export, sign in, authenticate, sign out, and the portfolio queries | Domain and ports only                        |
| Driving adapters | `src/interfaces/http`            | Express routes, validation against the contracts, auth middleware, error mapping                               | Application and domain, never infrastructure |
| Driven adapters  | `src/infrastructure`             | Database, spreadsheets, security, clock                                                                        | Domain, ports and libraries                  |
| Composition root | `src/server.ts`, `src/wiring.ts` | Builds the adapters and hands them to the use cases                                                            | Everything                                   |

Every port and the adapter behind it:

| Port                                                                                                          | Adapter                                    | What swapping it would take                                    |
| ------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | -------------------------------------------------------------- |
| `IPropertyRepository`, `IRentRollRepository`, `IUserRepository`, `IAttentionRepository`, `IRenewalRepository` | Kysely repositories in `infrastructure/db` | Already runs on SQLite or PostgreSQL by `DATABASE_URL`         |
| `ISpreadsheetReader`                                                                                          | `SpreadsheetReader` (ExcelJS, plus CSV)    | A new reader, for example a property-management system feed    |
| `IWorkbookWriter`                                                                                             | `WorkbookWriter` (ExcelJS)                 | Another spreadsheet library; the domain's workbook model stays |
| `ITokenService`                                                                                               | `JwtTokenService` (jose)                   | SSO, for example Microsoft Entra                               |
| `IPasswordHasher`                                                                                             | `ScryptPasswordHasher`                     | Argon2, or none once SSO replaces passwords                    |
| `IClock`                                                                                                      | `SystemClock`                              | Tests pass a fixed date instead                                |

**One request, end to end:** `POST /properties/:id/imports/:importId/confirm`

1. **HTTP adapter:** the route authenticates the bearer token and checks the analyst role. It validates the body against the shared contract, then calls the `ReviewImport` use case.
2. **Use case:** `ReviewImport.confirm` loads the property and import through `IPropertyRepository` and `IRentRollRepository`, always scoped by the caller's organization. It re-runs the domain's `parseRentRoll`, refuses on blocking issues or unacknowledged warnings, and asks the repository to confirm.
3. **Domain:** `parseRentRoll` is a pure function: rows in, leases and issues out. It has no I/O and no clock.
4. **Driven adapter:** `RentRollRepository` stores the leases and the accepted issues, and switches the current rent roll, in one database transaction.

Export works the same way. The domain builds a `WorkbookModel` (every sheet, formula and stored value as plain data), and only the ExcelJS adapter knows how to turn that into an `.xlsx` file.

**What it buys**

- **Formulas tested without I/O:** every calculation is unit-tested with hand-worked numbers, and none of those tests touch a database, HTTP or the clock.
- **One contract suite, two databases:** the same repository tests run on SQLite and on PostgreSQL, so both adapters keep the port's promises, including organization isolation.
- **Small changes stay small:** replacing the database, the spreadsheet library or the identity provider touches one adapter and one line of wiring.
- **Deterministic dates:** `now` comes in through `IClock`, so no test depends on the day it runs.
- **Enforced, not just described:** ESLint rejects an import that crosses a layer the wrong way. A planted violation was shown to fail.

The cost is more files and more indirection than a single Express app, which I accepted for the testability. See [ADR 0001](docs/adr/0001-ports-and-adapters.md).

### Outside the API

- **MCP server:** it acts as a driving adapter at the system level. It turns MCP tool calls into calls to the API, through the same typed client, and adds no logic of its own. Its tests swap the network for recorded API answers.
- **Dashboard:** this is a thin client, not a hexagon. Screens render what the API returns. The view logic that is there (formatting, "not recorded" labels) is in plain functions with their own tests, and the session rules sit in `lib/session.ts`.
- **Design system:** `packages/design-tokens` is the single source of visual values, and `packages/ui-web` builds components only from them. Lint rejects raw colours and sizes.

## Project structure

```
apps/
  rollover-desk-api/          Express 5 API, ports and adapters
    src/domain/entities/      pure functions: intake, rollover, WALT, critical dates, risk, commission, workbook model
    src/domain/ports/         interfaces the domain needs: repositories, spreadsheet reader and writer, clock, tokens
    src/application/use-cases/  orchestration, importing only the domain
    src/interfaces/http/      routes, auth middleware, OpenAPI
    src/infrastructure/       Kysely repositories and migrations, ExcelJS reader and writer, JWT and scrypt
  rollover-desk-dashboard/    Next.js 15 app, with a same-origin API proxy and session cookie
  rollover-desk-mcp/          read-only MCP server over the API
packages/
  contracts/                  zod schemas for every request, response and error
  api-client/                 typed fetch that validates every response against the contracts
  design-tokens/              the only source of visual values (light and dark)
  ui-web/                     components built from tokens
  config/                     shared tsconfig and ESLint, including layer and token rules
data/synthetic/               seeded generator, four sample rent rolls and their answer key
docs/                         problem, research, ADRs, production path, guides, status
```

## API

Interactive OpenAPI docs are at http://localhost:4000/docs when the API is running. Every route except `health` and `login` needs a bearer token. **Viewer** routes are open to both roles, and **analyst** routes need the analyst role.

| Method           | Path                                         | Access           | Purpose                                           |
| ---------------- | -------------------------------------------- | ---------------- | ------------------------------------------------- |
| `GET`            | `/health`                                    | public           | Liveness                                          |
| `POST`           | `/auth/login`                                | public           | Sign in, receive a token                          |
| `POST`           | `/auth/logout`                               | viewer           | Sign out: every token issued so far stops working |
| `GET`            | `/auth/me`                                   | viewer           | The signed-in user and organization               |
| `GET` / `POST`   | `/properties`                                | viewer / analyst | List properties / create one                      |
| `GET`            | `/properties/:id`                            | viewer           | One property                                      |
| `POST` / `GET`   | `/properties/:id/imports`                    | analyst / viewer | Upload a rent roll / import history               |
| `GET`            | `/properties/:id/imports/:importId`          | viewer           | One import with its mapping and issues            |
| `PUT`            | `/properties/:id/imports/:importId/mapping`  | analyst          | Correct the column mapping                        |
| `POST`           | `/properties/:id/imports/:importId/confirm`  | analyst          | Make it the current rent roll                     |
| `POST`           | `/properties/:id/imports/:importId/revert`   | analyst          | Retire it and restore the previous one            |
| `GET`            | `/properties/:id/rollover`                   | viewer           | Rollover, WALT, concentration, loan and vacating  |
| `GET`            | `/properties/:id/leases`                     | viewer           | Leases with risk                                  |
| `GET`            | `/properties/:id/leases/:leaseId`            | viewer           | One lease: risk explained, dates, pipeline        |
| `GET`            | `/properties/:id/leases/:leaseId/commission` | viewer           | Commission estimate for given rates               |
| `GET`            | `/properties/:id/critical-dates`             | viewer           | Critical dates for every lease                    |
| `GET`            | `/properties/:id/attention`                  | viewer           | The attention queue                               |
| `PUT` / `DELETE` | `/properties/:id/attention/:key`             | analyst          | Mark done or dismissed / undo                     |
| `GET`            | `/properties/:id/renewals`                   | viewer           | Renewal and backfill pipeline                     |
| `POST`           | `/properties/:id/renewals/moves`             | analyst          | Move leases between stages                        |
| `PUT`            | `/properties/:id/risk-weights`               | analyst          | Save risk weights (must total 100)                |
| `GET`            | `/properties/:id/export`                     | analyst          | Download the live-formula workbook                |

Errors share one shape, `{ "error": { "code", "message", "details" } }`, defined in `packages/contracts`.

## Ask an agent (MCP)

`apps/rollover-desk-mcp` is a read-only MCP server with six tools:

| Tool                 | Answers                                                           |
| -------------------- | ----------------------------------------------------------------- |
| `list_properties`    | Which properties can I see?                                       |
| `get_rollover`       | What rolls when, WALT, concentration, the largest tenant vs loan  |
| `get_critical_dates` | Notice, step, expiry and loan dates: passed, upcoming and missing |
| `list_leases`        | Every lease with its risk score or why it isn't scored            |
| `explain_lease_risk` | One lease's score, component by component                         |
| `get_attention`      | What needs attention now                                          |

With the stack running, Claude Code in this repository picks the server up from [`.mcp.json`](.mcp.json). Ask it, for example, "Which leases at Trinity Commerce Center have notice dates in the next six months, and why is the riskiest one scored that way?"

- **Sign-in:** it signs in as the demo **viewer** by default (override with `ROLLOVER_DESK_EMAIL` and `ROLLOVER_DESK_PASSWORD`). The API's role and organization checks apply exactly as for the dashboard.
- **Answers:** each one is validated against the shared contracts. Every result notes that tenant text comes from uploaded files and is data, not instructions.
- **Failed sign-ins:** sign-in is shared between concurrent calls, and a wrong password is tried once, so tool calls can't trip the API's login lockout.
- **Credentials:** the demo viewer password in `.mcp.json` is a deliberate exception to "secrets by name only". It is synthetic and listed above.

`pnpm --filter rollover-desk-mcp smoke` starts the server over stdio and calls every tool against a running API. It needs a confirmed rent roll, so confirm `clean.xlsx` first.

## Scripts

| Command                                           | What it does                                                             |
| ------------------------------------------------- | ------------------------------------------------------------------------ |
| `pnpm dev`                                        | API and dashboard with reload                                            |
| `pnpm check`                                      | Lint, typecheck, test and build across the workspace: what CI runs       |
| `pnpm test`                                       | All unit, integration and protocol tests                                 |
| `pnpm --filter rollover-desk-api seed`            | Demo organizations, users and property                                   |
| `pnpm --filter @rollover-desk/synthetic generate` | Regenerate the sample rent rolls and answer key                          |
| `pnpm --filter rollover-desk-dashboard e2e`       | Browser happy path against a running stack and fresh database            |
| `pnpm --filter rollover-desk-dashboard proof`     | Screenshots and accessibility checks at three widths, both themes        |
| `pnpm --filter rollover-desk-mcp smoke`           | The MCP server over stdio against a running API                          |
| `pnpm test:hooks`                                 | Tests for the Claude Code hooks and scanners                             |
| `pnpm leak-scan [--history]`                      | Scan files, or the full git history, for credentials and forbidden terms |
| `pnpm format`                                     | Prettier over the repository                                             |

## Testing

- **Domain formulas:** unit tests with hand-calculated examples and boundaries: leap years, month ends, expired and month-to-month leases, vacant suites and missing data.
- **Intake:** golden tests run all four synthetic files through intake. The clean file must reproduce the answer key exactly, and every planted defect in the other three must be found.
- **API:** route tests through the real HTTP stack and a temporary database:
  - every route is checked for a missing token and a viewer write;
  - cross-organization reads return 404;
  - parallel confirms leave one current rent roll.
- **Repositories:** one contract suite runs on SQLite always, and on PostgreSQL when `TEST_POSTGRES_URL` is set.
- **Workbook:** tests strip every stored value, recalculate the file in headless LibreOffice and compare each cell with the domain, including after the inputs change. CI installs LibreOffice for this. Locally, the tests skip if `soffice` is missing.
- **MCP:** protocol tests drive the server through a real MCP client over an in-memory transport.
- **Dashboard:** unit tests for view logic and the session, plus a Playwright happy path and an axe-checked render proof, both of which need a running stack.

## Extending the project

Ideas that build on what's here, with where each one plugs in:

### Product

| Idea                          | Value                                                                                        | Where it plugs in                                                                                     |
| ----------------------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| **New rent-roll formats**     | Fewer manual mappings on real exports                                                        | Synonyms in `columnMapping.ts`, plus a synthetic sample. See [docs/NEW-FORMAT.md](docs/NEW-FORMAT.md) |
| **Lease reconciliation**      | A rent roll is a summary and can disagree with the lease; flag the disagreements             | A lease-abstract source behind a new port, compared in the domain                                     |
| **Portfolio view**            | Rollover and risk across all properties, not one at a time                                   | New read use cases over the existing domain functions                                                 |
| **Scenarios**                 | Renewal probability and downtime per lease, giving expected rather than contractual rollover | Domain functions next to `rollover.ts`; Assumptions inputs in the workbook                            |
| **Critical-date reminders**   | Email, Teams or calendar (`.ics`) alerts before notice dates                                 | A scheduler use case over `criticalDates`, plus a notifier port                                       |
| **Market rent by space type** | Mark-to-market per office, retail or industrial space                                        | Extend `Property` and `markToMarketPct`                                                               |
| **Office add-in**             | Check a rent roll without leaving Excel                                                      | Designed in [docs/EXCEL-ADDIN.md](docs/EXCEL-ADDIN.md)                                                |

### Intelligence

| Idea                                     | Value                                                            | Where it plugs in                                                                                           |
| ---------------------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| **LLM suggestions for unmapped headers** | Faster mapping of unfamiliar formats; the analyst still confirms | A suggester called only for unmapped columns. See [ADR 0003](docs/adr/0003-deterministic-column-mapping.md) |
| **Agent write tools**                    | "Mark these notices as handled" from chat                        | New MCP tools, signing in as an analyst, with confirmation in the client                                    |
| **Narrative summaries**                  | A plain-English rollover story for an offering memo              | An MCP prompt or tool over `get_rollover`                                                                   |

### Platform

| Idea                                   | Value                                         | Where it plugs in                                                                             |
| -------------------------------------- | --------------------------------------------- | --------------------------------------------------------------------------------------------- |
| **SSO** (for example Microsoft Entra)  | No passwords; leavers lose access at once     | A new `ITokenService` adapter. See [ADR 0005](docs/adr/0005-auth-and-tenancy.md)              |
| **PostgreSQL with row-level security** | Concurrent users; a second tenancy layer      | `DATABASE_URL`, plus RLS policies. See [ADR 0002](docs/adr/0002-sqlite-now-postgres-ready.md) |
| **Audit log**                          | Who confirmed, reverted or exported, and when | An append-only table written by the use cases                                                 |
| **Property-management integrations**   | No manual upload for managed properties       | A scheduled reader behind `ISpreadsheetReader`                                                |

[docs/PRODUCTION-PATH.md](docs/PRODUCTION-PATH.md) orders the production work, and [docs/ASSUMPTIONS.md](docs/ASSUMPTIONS.md) lists what to validate with analysts before building more.

## Scope and tradeoffs

Choices made on purpose for a single-team demo, each with what would change it:

- **Login limiter in memory:** right for one API process. More than one instance needs a shared store such as Redis, and production needs a proxy that appends the client address. See [docs/PRODUCTION-PATH.md](docs/PRODUCTION-PATH.md).
- **One market rent per property:** enough for single-use buildings. Mixed-use properties would need one per space type; see [Extending the project](#extending-the-project).
- **Real clock, fixed sample dates:** the samples are dated 2026-01-15 and the app uses today's date, so some sample notice dates already show as passed. Analysis is never back-dated to make a demo look busier.

[docs/STATUS.md](docs/STATUS.md) keeps the full list of what is verified, unverified and carried forward.

## Documentation

| Document                                            | Contents                                                          |
| --------------------------------------------------- | ----------------------------------------------------------------- |
| [WALKTHROUGH.md](docs/WALKTHROUGH.md)               | The reasoning, by the assignment's seven discussion topics        |
| [PROBLEM.md](docs/PROBLEM.md)                       | Users, options compared, non-goals and success metrics            |
| [RESEARCH.md](docs/RESEARCH.md)                     | Sources, what each supports, and their limits                     |
| [ASSUMPTIONS.md](docs/ASSUMPTIONS.md)               | What is unvalidated, and how to test it                           |
| [adr/](docs/adr)                                    | Seven architecture decisions, each with what would change it      |
| [PRODUCTION-PATH.md](docs/PRODUCTION-PATH.md)       | From demo to a pilot with one team                                |
| [NEW-FORMAT.md](docs/NEW-FORMAT.md)                 | Adding a rent-roll format                                         |
| [EXCEL-ADDIN.md](docs/EXCEL-ADDIN.md)               | Design for the Office add-in that was cut                         |
| [DEMO.md](docs/DEMO.md)                             | Ten-minute demo script                                            |
| [STATUS.md](docs/STATUS.md)                         | Milestones, verified and unverified, carried forward              |
| [HARNESS.md](docs/HARNESS.md)                       | The Claude Code setup: hooks, skills, review agents and incidents |
| [PRODUCT.md](PRODUCT.md) and [DESIGN.md](DESIGN.md) | Product and design rules for the dashboard                        |

## How it was built

Built with [Claude Code](https://claude.com/claude-code), one reviewed pull request per milestone:

- **Gate:** each milestone passed tests, code review (plus security review for auth, tenancy, upload and export), a formula review where calculations changed, and a leak scan before merging.
- **Harness:** [docs/HARNESS.md](docs/HARNESS.md) explains the hooks, skills and review agents, and what the reviews caught.
- **Record:** the prompts are kept in [docs/harness/prompt-log.md](docs/harness/prompt-log.md), and the commit history is the other half of the record.
