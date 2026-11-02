# rollover-desk

Messy commercial real estate rent roll in, explainable rollover and critical-date risk out, live-formula Excel workbook back. Why: `docs/PROBLEM.md`. Progress: `docs/STATUS.md`. Read both when resuming.

## Commands

```
corepack enable && pnpm install  # pnpm 10 via corepack; turbo needs pnpm on PATH
pnpm dev                    # API and dashboard
pnpm check                  # turbo lint typecheck test build: what CI runs
pnpm test:hooks             # hook and scanner tests
pnpm leak-scan [--history]  # credentials and forbidden terms
pnpm pr open|wait|merge     # pull requests through the GitHub API
```

## Layout

```
apps/rollover-desk-api        Express 5, ports and adapters, SQLite now, PostgreSQL ready
apps/rollover-desk-dashboard  Next.js 15, React 19, Tailwind v4, Blueprint light and dark
packages/contracts            zod schemas for every request, response and error
packages/api-client           typed fetch over contracts
packages/design-tokens        the only source of visual values
packages/ui-web               components built from tokens
packages/config               tsconfig and ESLint bases
data/synthetic                seeded generator and sample rent rolls
```

API layers: `src/domain/{entities,ports}` → `src/application/use-cases` → `src/interfaces/http` and `src/infrastructure`. Only `src/server.ts` and its `src/wiring.ts` wire concrete adapters. `domain` imports nothing outside itself; `application` imports only `domain`.

## Domain rules

- Formulas and worked examples: skill `cre-formulas`. Change a formula only with a hand-calculated test.
- Never impute. Missing rent, area or dates stay unrecorded, and missing inputs produce "not scored", never a default.
- Uncertain parsed data is flagged or blocks confirmation. It is never guessed or silently dropped.
- Dates are `YYYY-MM-DD` strings computed in UTC. Money is integer cents. `now` is injected through `IClock`.
- All data is synthetic.

## Security rules

- The organization comes only from the verified token, never from a request. Repository methods require `organizationId`. Other organizations' records return 404.
- Spreadsheet text starting with `= + - @` is written as literal text.
- Secrets by name only. `.env.example` lists names.

## Git

- One `feature/mN-...` branch per milestone, one PR against `main`. Skill `milestone-gate` is the loop.
- Stage files by name. No force-push, no direct push to `main`.
- Never name the private reference material listed in `.claude/forbidden-terms.local`. Write concepts fresh.

## Design

Use `impeccable`, `ui-ux-pro-max` and `frontend-design` unmodified before UI work. Skill files in those three folders are never edited. Rules live in `DESIGN.md` once it exists.
