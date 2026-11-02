---
name: cre-formulas
description: Definitions and hand-worked examples for rollover-desk's commercial real estate calculations. Use when writing, changing, testing or reviewing WALT, rollover, notice dates, mark-to-market, leasing commissions or the risk score.
---

# CRE formulas

Conventions: dates are `YYYY-MM-DD`; money is integer cents; rent is in-place annual base rent. A vacant suite has no lease. A lease with a missing input is excluded from that metric and counted as excluded, never defaulted.

## Remaining term

`remainingYears = max(0, days(asOf → expiration) / 365.25)`. Expired or month-to-month (MTM) leases count 0.

## WALT (weighted average lease term)

`WALT = Σ(weight × remainingYears) / Σ(weight)`, over leases with a known weight and expiration, reported by rent and by area. The two differ when rent per SF differs across tenants, and rent-weighted is the income view.

**Example.** As of 2026-01-01. A: 10,000 SF, $300,000/yr, expires 2029-01-01. B: 30,000 SF, $600,000/yr, expires 2027-01-01.

- Remaining: A = 1096 / 365.25 = 3.0007; B = 365 / 365.25 = 0.9993
- By area: (10,000 × 3.0007 + 30,000 × 0.9993) / 40,000 = **1.4997**
- By rent: (300,000 × 3.0007 + 600,000 × 0.9993) / 900,000 = **1.6664**

## Time units

Throughout, a year is 365.25 days and a month is 365.25/12 days, including at the risk score's boundaries, so exactly 60 calendar months can score slightly above 0. A lease expiring on the as-of date is in the "MTM / expired" rollover bucket, and appears as "today" in critical dates.

## Rollover by year

For each calendar year: expiring area, expiring annual rent, each as a share of the property's leased totals, and a cumulative share. MTM and already-expired leases go in a separate "MTM / expired" bucket, ahead of the years. Expirations more than 30 years out go in a "beyond horizon" bucket, so one mistyped year can't produce thousands of rows.

## Notice date

`noticeDate = expiration − noticeMonths`, by calendar months, clamped to month-end: 2027-03-31 minus 1 month is 2027-02-28. No valid notice term recorded means the notice date is absent and reported as absent, not assumed. Month-to-month leases have no notice or expiry date by definition, so these aren't reported as absent.

## Lease before loan maturity

Flag when `expiration < loanMaturity`, for a property with a recorded maturity. The largest-tenant flag applies to the tenant with the highest in-place rent, and is true if any of its suites expires first. Month-to-month counts as expiring first: it has no committed term past maturity.

## Concentration

`share = tenantRent / totalInPlaceRent`. Multiple suites for one tenant combine after normalising the name.

## Mark-to-market

`mtmPct = (marketRentPsf − inPlaceRentPsf) / inPlaceRentPsf`. Positive means in-place rent is below market. The market rent is an analyst assumption per property, never inferred. Zero counts as not recorded.

## Leasing commission estimate

`commission = Σ(rent for lease year y × rate)`, rounded to a cent each year, with separate rates for new and renewal deals and for each broker side. Example: 5-year new lease at $100,000/yr at 4% landlord side + 2% tenant side = **$30,000**; renewal at 2% + 1% = **$15,000**. These rates are assumptions the analyst can change, and an estimate only: actual fees follow each listing agreement.

## Risk score

Weighted, explainable, 0 to 100, higher is riskier. Weights total 100 and each component shows its inputs.

| Component      | Default weight | Raw score                                                                           |
| -------------- | -------------- | ----------------------------------------------------------------------------------- |
| Time to expiry | 40             | 100 at ≤ 12 months, falling linearly to 0 at ≥ 60 months                            |
| Notice urgency | 20             | 100 when the window has passed or is ≤ 90 days, falling linearly to 0 at ≥ 365 days |
| Concentration  | 25             | `min(100, share / 25% × 100)`                                                       |
| Loan mismatch  | 15             | 100 if it expires before maturity, else 0                                           |

If time to expiry or concentration can't be computed, the lease is **not scored**. If only a notice term or maturity is missing, that component is left out and the remaining weights are rescaled, and the explanation says so.

These weights are judgment defaults to validate with users, not an industry standard.
