# 0006: A live-formula workbook with stored values

**Status:** accepted, M5.

## Context

Analysts finish their work in Excel. A workbook of pasted numbers can't be checked or changed: moving the as-of date or the market rent means asking the tool again. Live formulas fix that, but Excel opens downloads in Protected View, where formulas haven't been calculated yet.

## Decision

- **Inputs:** the Assumptions sheet holds the three inputs (as-of date, loan maturity, market rent per SF) in blue, as defined names.
- **Formulas:** every derived figure on Rent Roll, Rollover Schedule, WALT and Critical Dates is a formula over those inputs and the rent roll.
- **Stored values:** each formula cell also stores the domain's own result, so Protected View shows correct numbers. The workbook is set to fully recalculate on load.
- **Year rows:** the Rollover Schedule's year rows are labelled from the as-of date across the full 30-year horizon. Moving the as-of date shifts the rows, and no expiration loses its row.
- **Text:** file text only ever reaches a cell as a string value, and formulas are built only from cell references. Text starting `= + - @` stays literal, and text over Excel's 32,767-character limit is cut visibly and listed.

## Consequences

- **Tests:** the writer tests remove every stored value, recalculate in headless LibreOffice and compare each sheet with the domain. They cover the base case, changed inputs, an earlier as-of date, a blank as-of date and the hand-worked WALT example. CI installs LibreOffice to run them.
- **Two implementations:** the formulas re-implement the domain in Excel, so the two can drift. The recalculation tests are what keep them together, and a formula review in M5 found four drifts that are now fixed and tested.
- **Fixed at export:** Critical Dates rows are generated at export, so flipping a lease to month-to-month in the sheet doesn't add or remove its notice row.
- **Not verified in Excel:** real Excel hasn't been tested, only LibreOffice. Dates before 1900-03-01 would differ there.

## What would change it

- Opening the file in real Excel and finding differences.
- Analysts asking for scenarios the three inputs can't express, which would call for a proper assumptions table or the Office add-in.
