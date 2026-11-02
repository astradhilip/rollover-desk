# 0001: Ports and adapters in the API

**Status:** accepted, M3a.

## Context

The value of this product is its calculations: rollover, WALT, notice dates and risk. They must be testable without a database or HTTP. They must also survive a change of database, spreadsheet library or identity provider.

## Decision

The API has four layers:

- `domain/entities`: pure functions and types.
- `domain/ports`: the interfaces the domain needs, such as `IRentRollRepository`, `ISpreadsheetReader`, `IWorkbookWriter` and `IClock`.
- `application/use-cases`: use-case classes. The read-only dashboard queries share one `Portfolio` class.
- `interfaces/http` and `infrastructure`: the adapters.

Rules:

- `domain` imports nothing outside itself.
- `application` imports only `domain`.
- Only `server.ts` and `wiring.ts` choose concrete adapters.
- Lint rejects an import that breaks a rule, and a planted violation was proven to fail.

## Consequences

- Every formula is unit-tested with hand-worked numbers, and none of those tests touch I/O.
- Replacing ExcelJS, Kysely or the JWT library touches one adapter.
- `now` is injected through `IClock`, so date tests never depend on the day they run.
- There are more files and more indirection than a single Express app would have. For a small API that is overhead, and I accepted it for the testability.

## What would change it

Nothing likely at this size. If the API split into services, each would keep the same shape.
