# Demo script

About ten minutes. Start from a freshly seeded database (see the README's "Run it"). Sample files are in `data/synthetic/samples`.

The samples are dated 2026-01-15, and the app uses today's date, so some critical dates already show as passed. That is correct behaviour, not a bug.

## 1. Sign in and the empty state (30 seconds)

1. Sign in as `analyst@prairie-ridge.example` / `demo-prairie-analyst`.
2. Open Trinity Commerce Center. It shows **No rent roll yet**: an empty state, not a dashboard of zeros.

## 2. A messy file is refused, with reasons (2 minutes)

1. Go to **Rent rolls** and upload `property-manager-export.xlsx`.
2. Show the three things intake did on its own:
   - **Header:** it found the header row under three title rows.
   - **Rent:** it read "Monthly Base Rent" as monthly and annualised it.
   - **Subtotals:** it skipped the floor subtotal rows and listed them as skipped, not dropped.
3. **Column mapping** shows each column's field and confidence.
4. Show the issues:
   - A missing rent, which is a warning.
   - An impossible date (30 February), which **blocks**.
   - A duplicated suite, which also **blocks**.
5. **Confirm rent roll** is disabled. The point to make: nothing is guessed, so the analyst fixes the file or the mapping.
6. If there's time, upload `broker-stacking-plan.xlsx`. It is a broker's stacking plan, laid out by wing, and intake catches four things:
   - **Mapping:** "Area (SF)", "Base Rent" and two "Lease Term" columns are flagged for review rather than trusted.
   - **Wing labels:** they're skipped as notes. An "Option term not exercised" line is reported as unattached, not merged into a lease.
   - **Grand total:** a total that disagrees with the rows is flagged.
   - **No notice column:** this is said outright, so every notice date reads as missing rather than assumed.

## 3. Confirm a clean roll (1 minute)

1. Upload `clean.xlsx`. It has no issues, so confirm it.
2. The Desk now shows the KPIs. Its annual rent, $2,752,332 across 16 leases, matches the separately computed answer key in `answer-key.json`.

## 4. The Desk: what needs attention (2 minutes)

- **Attention queue:** notice dates passed or coming up, expiries, month-to-month leases, the largest tenant leaving first, and leases that couldn't be scored. Mark one **Done**, then **Undo** it.
- **Rollover by year:** use **Show table** for the same figures as a table, with each year's share of rent (or area, with the toggle) and the running total.
- **WALT by area:** with how many leases were left out for missing data.

## 5. One lease, opened up (2 minutes)

1. Open **Leases** and pick a scored lease.
2. **Critical dates** are drawn on a line to scale: notice, rent steps, expiry and loan maturity.
3. **Why this risk score** shows each component, its input, its weight and its points, and they add up to the score.
4. Open a vacant suite. It reads **not scored**, with the reason, rather than getting a default. A lease with no expiry, rent or tenant name would read the same.
5. Optional: change the weights under **Risk weights**. They must total 100. The rankings change.

## 6. Pipeline (1 minute)

1. Go to **Pipeline** and mark a lease **Vacating** with the reason "Downsizing".
2. Back on the Desk, **Projected vacating** under **Loan and vacating** now includes it.

## 7. The workbook (2 minutes)

1. On the Desk, choose **Download workbook** and open it in Excel or LibreOffice.
2. **Assumptions:** the three blue inputs. Everything else is a formula.
3. **Rent Roll:** tenant text stays text, and missing rent is blank, never 0.
4. Change the **as-of date** on Assumptions, a year earlier. Every sheet follows: remaining years, WALT, the schedule's year rows and the critical dates' days away.
5. **Data Issues** lists what intake flagged.

## 8. Safety, if asked (1 minute)

- **Revert:** under **Rent rolls**, **Revert** takes a two-step confirm. It restores the previous confirmed roll, or, as here with only one confirmed, returns the property to **No rent roll yet**.
- **Viewer:** sign in as `viewer@prairie-ridge.example`. There's no upload, move or export, and the API refuses them too (403).
- **Second organization:** sign in as `analyst@lone-oak.example`. Trinity Commerce Center isn't there, and its URLs return not found.

## If something goes wrong

- **Login says too many attempts:** the limiter is per process. Restart `pnpm dev`.
- **Start over:** stop the stack, delete `apps/rollover-desk-api/rollover-desk.sqlite*`, then seed again.
