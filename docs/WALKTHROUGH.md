# Walkthrough

The project's reasoning, organised by the seven topics the assignment asks to discuss. The [README](../README.md) covers what the project is and how to run it. This page covers why it is shaped this way.

## 1. Why this problem

Before anyone can answer the three questions above, an analyst cleans the rent roll by hand. Three things make the work matter now:

- **Debt is coming due:** a large share of office debt matures by 2028.
- **The timing gap:** where the largest tenant's lease ends before the loan, refinancing risk follows.
- **Notice dates:** they fall months before expiry, so watching only the expiry date misses the date that counts.

One validated rent roll feeds capital markets, agency leasing and property management alike. That fits a firm that sells those services together. See [PROBLEM.md](PROBLEM.md) for the users, the options I compared and the non-goals.

## 2. Research

[RESEARCH.md](RESEARCH.md) lists every source and what it supports, with its limits stated. Two matter most:

- Much of the workflow evidence comes from vendors who sell a fix.
- I found **no measured figure** for analyst hours spent on cleanup.

Time savings are therefore an assumption to test, not a claim.

## 3. What was worth building

Vendors already parse rent rolls, so parsing alone isn't the value. This build bets on three things:

1. **Every doubt is visible.** Uncertain data is flagged or blocks confirmation. Nothing is guessed or dropped silently. A missing rent stays "not recorded", and a lease missing inputs is "not scored", never given a default.
2. **Every number can be opened up.** Each risk score shows its components, inputs and weights. The weights are adjustable and must total 100.
3. **The output is the analyst's own tool.** The workbook keeps formulas live. Change the as-of date or market rent, and every sheet follows.

**Not built:** lease PDFs, valuation, live integrations and SSO. A small thing that runs beats a large thing that doesn't.

## 4. Assumptions and tradeoffs

[ASSUMPTIONS.md](ASSUMPTIONS.md) lists what is unvalidated and how I'd test it. The biggest risk is that cleanup doesn't cost analysts enough time to matter.

Each tradeoff has an ADR in [adr](adr) that also says what would change the decision:

| Decision                                                    | ADR                                              |
| ----------------------------------------------------------- | ------------------------------------------------ |
| Ports and adapters, so the domain has no framework in it    | [0001](adr/0001-ports-and-adapters.md)           |
| SQLite now, PostgreSQL behind the same repositories         | [0002](adr/0002-sqlite-now-postgres-ready.md)    |
| Deterministic column mapping, not an LLM                    | [0003](adr/0003-deterministic-column-mapping.md) |
| Never impute; flag, block or leave unscored                 | [0004](adr/0004-never-impute.md)                 |
| Password login and app-level tenancy now, SSO and RLS later | [0005](adr/0005-auth-and-tenancy.md)             |
| Live-formula workbook with stored values                    | [0006](adr/0006-live-formula-workbook.md)        |
| Dates as UTC date strings, money as integer cents           | [0007](adr/0007-dates-and-money.md)              |

## 5. Architecture

```
apps/rollover-desk-api        Express 5: domain → application → http and infrastructure
apps/rollover-desk-dashboard  Next.js 15, React 19, Tailwind v4, light and dark
packages/contracts            zod schemas for every request, response and error
packages/api-client           typed fetch over the contracts
packages/design-tokens        the only source of visual values
packages/ui-web               components built from tokens
apps/rollover-desk-mcp        read-only MCP server over the API, for Claude Code and other agents
data/synthetic                seeded generator, sample files and answer key
```

- **API layers:** pure functions in `domain/entities` hold every formula, and `domain/ports` declares what the domain needs. `application/use-cases` coordinates, and `interfaces/http` and `infrastructure` are the adapters. Lint rejects an import that crosses a layer the wrong way, and only `server.ts` and `wiring.ts` choose concrete adapters.
- **Tenancy:** the organization comes only from the verified token. Every repository method requires it, and another organization's record returns 404.
- **Upload flow:** the dashboard calls the API through a same-origin proxy, which keeps the token in an httpOnly cookie. An upload is held as pending, reviewed, then confirmed, and confirming replaces the property's current rent roll in one transaction. Reverting restores the previous one.

[PRODUCTION-PATH.md](PRODUCTION-PATH.md) says what changes to run this for real.

## 6. What was built

- **Intake:** reads `.xlsx` and `.csv` and finds the header row under title rows. It maps columns by synonym and shows its confidence, and the analyst can correct the mapping. It detects monthly vs annual vs PSF rent, mixed date formats, subtotal rows, duplicates and formula errors. Each problem is a warning or a blocker. All four synthetic files reproduce the answer key, and every planted defect is caught.
- **Analysis:**
  - Rollover by year, with each year's share and the running total.
  - Weighted average remaining lease term (WALT), by area and by rent.
  - Notice dates and a critical-date list.
  - Lease-before-loan flag.
  - Tenant concentration and mark-to-market.
  - Leasing commission estimates for renewal vs replacement.
  - An explainable risk score.

  Every formula is defined in the `cre-formulas` skill, with hand-worked examples for WALT, notice dates and commissions. Each formula has a test.

- **Dashboard:**
  - The Desk: KPIs, an attention queue and a rollover chart.
  - Leases, and each lease's detail with its dates on a scaled line and its risk opened up.
  - Critical dates.
  - A renewal and backfill pipeline. Marking a lease "Vacating" records why and adds it to the Desk's projected vacating total.
  - Rent-roll import, review and history, with revert.
  - Risk weights.

  The dashboard works in light and dark, at 390, 1024 and 1440 pixels wide.

- **Workbook:** six sheets (Assumptions, Rent Roll, Rollover Schedule, WALT, Critical Dates, Data Issues).
  - Every figure is a formula over the rent roll and three blue inputs.
  - Tests remove the stored values, recalculate in LibreOffice and compare each cell with the domain's numbers, including after the inputs change.
  - Tenant text starting `= + - @` stays literal text.
- **Security:**
  - Login with a rate limit.
  - Analyst and viewer roles.
  - Every route is tested for a missing token and for a viewer attempting a write.
  - Cross-organization tests return 404 for each kind of record.
  - Upload size and type limits.

  The milestone gate requires a security review for auth, tenancy, upload and export work.

What is verified, unverified and carried forward is kept in [STATUS.md](STATUS.md). The biggest gap: the workbook has been recalculated in LibreOffice but never opened in real Excel.

### How it was built

Built with Claude Code, one reviewed pull request per milestone. [HARNESS.md](HARNESS.md) explains the hooks, skills and review agents, including what I declined and one incident. The prompts are in [harness/prompt-log.md](harness/prompt-log.md).

## 7. What's next

In the order I'd do them:

1. **Validate before building more.** Time three analysts on three real rent rolls each, then run the parser on twenty real exports and measure how many columns map automatically. These test assumptions 1 and 3.
2. **Excel itself:** open the workbook in real Excel. Then build the Office add-in so the analyst never leaves Excel. It was cut from this build and is designed in [EXCEL-ADDIN.md](EXCEL-ADDIN.md).
3. **Reconcile against leases.** A rent roll is a summary and can disagree with the lease. Abstracting lease PDFs and flagging disagreements is the next real value.
4. **An LLM fallback for unmapped headers only.** It would suggest a mapping, which the analyst still confirms.
5. **Production:** SSO, PostgreSQL with row-level security, audit and the rest of [PRODUCTION-PATH.md](PRODUCTION-PATH.md).

To support a new export format, see [NEW-FORMAT.md](NEW-FORMAT.md).
