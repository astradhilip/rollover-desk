# 0003: Deterministic column mapping, not an LLM

**Status:** accepted, M2.

## Context

Rent roll headers vary: "RSF", "Sq Ft", "Ann. Base Rent", "Lease Exp", and a bare "Rent" that could be monthly or annual. Mapping them is the first step, and a wrong mapping corrupts every number after it.

## Decision

- **Matching:** a synonym table in `columnMapping.ts` maps headers to lease fields. An exact synonym is certain. A partial match is flagged for review with lower confidence.
- **Ambiguous headers:** a header that can't say its period, such as a bare "Rent", maps to `rentUnknownBasis`, which blocks confirmation until the analyst chooses.
- **Correction:** the analyst can correct any column, and the review re-runs at once.
- **No model:** there is no LLM in the path.

## Consequences

- It runs with no API key or network access. The same file always gives the same mapping, and every mapping can be explained and tested.
- A format with headers outside the table needs manual mapping, or a new synonym. [NEW-FORMAT.md](../NEW-FORMAT.md) shows how.
- How much it covers on real files is unknown. That is assumption 3 in [ASSUMPTIONS.md](../ASSUMPTIONS.md).

## What would change it

Measuring the auto-map rate on twenty real exports. If many columns need manual mapping, add an LLM only as a suggester for unmapped headers. It would propose, and the analyst would still confirm, so nothing it says becomes data unseen.
