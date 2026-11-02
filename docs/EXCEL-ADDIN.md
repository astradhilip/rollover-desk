# Excel add-in: design, not built

The plan's last milestone was an Office add-in, so the analyst never leaves Excel. It was cut, for two reasons:

- **Cut order:** the plan cuts it first.
- **Can't be verified here:** Excel can't run on this Linux machine, so the add-in would ship unverified, and a narrow thing that runs beats an ambitious thing that doesn't.

This is the design I'd build next.

## What it does

1. The analyst opens a seller's rent roll in Excel and clicks **Check with rollover-desk** in the task pane.
2. The task pane reads the active sheet's used range and sends it to the same intake the upload uses.
3. The review comes back to a new sheet, **rollover-desk review**:
   - the column mapping with confidence;
   - each issue as a warning or a blocker, linked to the cell it came from;
   - the skipped rows.
4. Confirming stays where the review is richest, in the dashboard. A link opens that import's review screen.
5. After confirming, **Insert workbook** adds the live-formula sheets from the export into the open workbook.

## Design choices

- **Read what the analyst sees:** use the range's displayed text, not its raw values. Intake already handles text dates and amounts. Raw values would turn dates into serial numbers and lose the sheet's own formatting cues, such as "$/SF".
- **Send rows, not a file:** add `POST /properties/:id/imports/rows` taking the grid as JSON. It runs the same `parseRentRoll`, with size limits matching the upload's. Building a CSV or `.xlsx` in the browser would add an encoding step that could disagree with the sheet.
- **Write text as text:** in the Excel JavaScript API, a string starting with `=` written into a cell can become a formula. Set the target range's number format to text (`@`) before writing any file text. The export's rule, that `= + - @` stays literal, holds here too, and a test covers it.
- **Keep logic out of Office.js:** these are pure functions with tests:
  - grid to request;
  - review to rows for the sheet;
  - the cell address for a source row.

  A thin adapter calls `Excel.run`. Tests run against a mocked `Excel` object, and `office-addin-manifest validate` checks the manifest in CI.

## Auth: the open question

The session cookie can't be reused. Excel on the web hosts the task pane in a cross-site iframe, where the dashboard's `sameSite: strict` cookie isn't sent, and browsers increasingly block third-party cookies.

| Option                                                                                    | For                                                              | Against                                                                                                                        |
| ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Office SSO (`getAccessToken`) exchanged for an API token, once the API trusts Entra       | No password in the pane; matches the production path in ADR 0005 | Needs an Entra app registration and the SSO work that isn't built                                                              |
| The pane signs in and keeps the bearer token in memory, called through a narrow API route | Works in Excel on the web today                                  | A new token-bearing surface. It needs CORS limited to the add-in origin, and the same login lockout care the MCP server needed |
| Reuse the dashboard cookie                                                                | No new surface                                                   | Fails in Excel on the web, the only Excel available for testing here                                                           |

I'd build the second for a pilot, limited to the viewer and analyst roles that already exist, and move to the first with SSO.

## Done when

- The logic tests pass against a mocked `Excel` object, including formula-looking tenant text staying literal.
- The manifest validates in CI.
- Someone sideloads it into Excel on the web and Excel desktop, runs it on the four synthetic samples, and gets the same issues the upload screen shows.
