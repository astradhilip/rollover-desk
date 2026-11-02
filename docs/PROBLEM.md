# The problem

Written before any product code, so that the decision comes first. Updated as things change.

## Problem

An analyst receives a rent roll in Excel from a seller or property manager, in whatever shape that system exports. Before anyone can answer the questions that matter, the analyst cleans it by hand:

- How much income rolls, and when?
- Which notice dates are coming up? They arrive well before expiry.
- Does a major tenant leave before the loan comes due?

## Who it serves

| User                      | Job                                                                     |
| ------------------------- | ----------------------------------------------------------------------- |
| Capital markets analyst   | Clean rent roll and a defensible rollover story for a sale or financing |
| Agency leasing broker     | Know which tenants to call, and when, and what each renewal is worth    |
| Asset or property manager | Never miss a critical date                                              |

## Why now

- Yardi Matrix counts [$289.2B of office loans](https://allwork.space/2026/09/office-loan-delinquencies-hit-12-as-289-billion-in-debt-nears-maturity) matured or maturing by the end of 2028, 33.5% of the volume it tracks.
- Trepp data shows [46% of LA suburban office loan balances](https://www.credaily.com/?p=222291) sit on properties whose largest tenant's lease expires before loan maturity.
- Renewal notice is [commonly due 9 to 12 months before expiry](https://rets.ai/blog/lease-renewal-options-notice-windows), so tracking only the expiry date misses the date that matters. This source is a vendor.

## Why it fits a full-service firm

Newmark reports on [management and servicing, leasing, and capital markets](https://www.marketbeat.com/instant-alerts/newmark-group-q2-earnings-call-highlights-2026-07-29/), and [sells those services together](https://nmrk.com/services/capital-markets/office-capital-markets). One validated rent roll is an input to all of them. I found nothing public about its internal tools, so this makes no claim about what it already has.

## Options considered

| Option                                   | Why not chosen                                                                         |
| ---------------------------------------- | -------------------------------------------------------------------------------------- |
| **Rollover desk**                        | Chosen: broad fit, Excel in and out, and correctness can be proven with synthetic data |
| Lease proposal comparison                | Best runner-up: narrow and finance-heavy, but serves one team                          |
| Leasing pipeline and commission forecast | A generic CRM; firms already have these                                                |
| CAM reconciliation                       | Real money and disputes, but the rules need more domain depth than the time allows     |
| AI lease abstraction                     | Accuracy can't be proven on synthetic data, and it needs an API key to demo            |
| Buyer matching                           | Synthetic buyer data would make results meaningless                                    |

## "Why not buy a parser?"

Vendors [already parse rent rolls](https://www.blooma.ai/blog/convert-rent-roll-pdf-to-excel). Parsing alone is not the value here. The differentiators are:

1. Every doubt is visible: nothing is guessed or dropped silently.
2. Every risk score can be opened up and explained.
3. The output is a workbook with live formulas, so the analyst keeps modelling in their own tool.

If a firm already licenses a good parser, its output could feed the same pipeline through the `ISpreadsheetReader` port.

## Non-goals

- Lease PDFs and abstraction. A rent roll is a summary and can disagree with the lease; reconciliation is a next step.
- Replacing Excel, Argus or a property management system.
- Valuation or a full underwriting model.
- Real data, live integrations, or SSO.
- Legal advice: critical dates are computed from recorded terms, and the lease governs.

## Success metrics

Measured in a pilot, not by this demo:

| Metric                                                 | Target to test                                            |
| ------------------------------------------------------ | --------------------------------------------------------- |
| Time from received file to validated rent roll         | A large reduction against each analyst's current baseline |
| Planted-defect detection on test files                 | 100% in tests; real-file rate measured in the pilot       |
| Share of analyst corrections needed after confirmation | Falling over time                                         |
| Critical dates missed on tracked leases                | Zero                                                      |

See [ASSUMPTIONS.md](ASSUMPTIONS.md) for what has not been validated.
