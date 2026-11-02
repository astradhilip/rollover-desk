# Adding a rent-roll format

A new export format usually needs no code: open it, and correct any unmapped column in the review screen. Work through this guide when a format will recur, so the next analyst gets it mapped automatically, and so the format is proven against a known answer.

## 1. See what intake makes of it

Upload a real or representative file, then open the review screen. For each column, it shows:

- the field the column maps to,
- its confidence as a percentage: 100% for an exact synonym, lower and flagged for a partial match,
- and every issue as a warning or a blocker.

Note which headers were unmapped, flagged or mapped wrongly. That list is your work.

## 2. Add synonyms

Headers are matched in `apps/rollover-desk-api/src/domain/entities/columnMapping.ts`, in the `SYNONYMS` table:

- Headers are normalised before matching:
  - lower case;
  - `$/SF`, `/RSF` and "per sq ft" become `psf`;
  - `#` becomes `no`;
  - all other punctuation becomes a space.

  Don't add a variant that differs only in those.

- Words in `OTHER_MEANING`, such as "market", "CAM" or "option", stop a partial match. "Market Rent" therefore never becomes the lease's rent.
- An exact synonym gives a certain match. Prefer adding the whole header over relying on a partial match.
- **Never** add a header that doesn't state its period, such as a bare "Rent", to an annual or monthly field. It belongs in `rentUnknownBasis`, which blocks until the analyst chooses. Guessing the period would silently scale rent by twelve.
- Add a test in `apps/rollover-desk-api/test/domain/columnMapping.test.ts` for each new synonym, and one for a near-miss that must **not** match.

## 3. If the values need new parsing

Cell values are read in `spreadsheetCells.ts` (numbers and dates), and rows become leases in `rentRollIntake.ts`. Examples are a new date style, a rent written as "$12.50/SF/yr", or a status word meaning vacant.

- A value that can be read two ways is an issue, never a guess. Two models:
  - "Mar 2029" has no day, so it gives `ambiguous_date` rather than assuming the 1st.
  - A file with both day-first dates (`25/03/2029`) and dates that read either way (`03/04/2029`) gives `mixed_date_order`, which blocks.
- A value that can't be read becomes `null` with an issue. It must never be silently dropped or defaulted (ADR [0004](adr/0004-never-impute.md)).
- Regression cases go in `test/domain/intakeRegressions.test.ts`.

## 4. Prove it with a synthetic file

Every format the repo claims to support has a generated sample with a known answer.

1. In `data/synthetic/src/index.ts`, add a function shaped like `propertyManager`. It writes the shared answer key in the new layout: its headers, title rows, subtotals and units.
2. Plant the defects this format is known for. List each one in `defects` with its issue code and the value the parser must produce.
3. List the fields the format lacks by design in `omits`, such as a format with no notice column.
4. Add it to `generateSamples`, and regenerate the committed samples with `pnpm --filter @rollover-desk/synthetic generate`.
5. Add the filename to the `describe.each` list in `apps/rollover-desk-api/test/infrastructure/goldenRentRolls.test.ts`. That test then checks three things for it:

- every planted defect is found,
- every other value matches the answer key,
- and nothing is raised beyond what was planted or flagged by design.

## 5. Before merging

- `pnpm check` passes.
- Run the milestone gate (`.claude/skills/milestone-gate`), including `pnpm leak-scan --history`. Use invented tenant names only: all data in this repo is synthetic.
- In the PR, say which real-world source the format represents and which defects you planted, and why.

## When a format can't be supported this way

Some layouts don't fit a synonym table:

- one lease spread over several rows,
- tenants as columns,
- or a PDF.

Don't bend the parser. Add a format-specific reader behind the `ISpreadsheetReader` port that reshapes the file into one row per lease, then let the same intake review it.
