# 0004: Never impute

**Status:** accepted, M1.

## Context

A missing rent, area or date is common in real rent rolls. Filling it with a default, such as zero rent, a market rent or a 12-month notice, produces a confident number nobody measured. In rollover and risk, that number can hide the very lease that matters.

## Decision

- **Missing values:** a missing value stays unrecorded, as `null` in the domain, "Not recorded" on screen and a blank cell in the workbook.
- **Partial inputs:** a calculation that needs a missing input says so:
  - WALT counts the leases it left out.
  - The rollover schedule counts leases summed without area or rent.
  - A lease with no expiration, rent or tenant name is "not scored", with the reasons listed.
  - With no notice term or loan date, only that component is left out. The remaining weights are rescaled, and the reason is shown.
- **Uncertain data:** a warning must be acknowledged before confirming, and a blocker must be fixed. A row the parser can't place is listed as skipped, never dropped silently.
- **Commissions:** no fallback rate. Without a stated rate, the commission is "not recorded".

## Consequences

- Totals can look smaller than the property really is, but they are labelled with what's missing.
- More states for the UI to show: "not scored", "not recorded", "missing dates". Each has its own wording.
- Review checked this rule, and found the export breaking it twice in M5: missing values summed as $0 with no count, and a blank as-of date reading as 0%. Both were fixed with tests.

## What would change it

Nothing in this product. An analyst who wants an assumption types it in as an input, such as market rent, where it is shown as an assumption.
