# 0007: Dates as UTC date strings, money as integer cents

**Status:** accepted, M1.

## Context

Lease dates are calendar dates, not instants. Treating them as JavaScript `Date` values in local time shifts them by a day depending on the server's time zone. Floating-point dollars drift when summed across hundreds of leases.

## Decision

- **Dates:** every date is a `YYYY-MM-DD` string, and date arithmetic runs in UTC.
- **Month arithmetic** clamps to the month's end: 31 March minus one month is 28 February, or the 29th in a leap year.
- **Remaining years** use days divided by 365.25.
- **Today:** comes from an injected `IClock`, never `new Date()` in the domain.
- **Money:** integer cents everywhere in the domain and database. Dollars appear only at the edges: input parsing, display and the workbook.

## Consequences

- Leap-day and month-end cases have their own tests, and the workbook's `EDATE` was cross-checked against the domain on 913 month-end cases.
- Ratios such as rent per SF are fractional cents. They are kept unrounded and rounded only for display.

## What would change it

Nothing expected. Multi-currency would add a currency code beside the cents.
