# Assumption register

Nothing here has been validated with a practising analyst yet. The first row is the biggest risk.

| #   | Assumption                                               | Evidence so far                                                         | Risk if wrong                      | How to validate                                               |
| --- | -------------------------------------------------------- | ----------------------------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------- |
| 1   | Cleaning rent rolls costs analysts meaningful time       | Workflow descriptions, mostly from vendors. **No measured hours found** | The tool solves a minor annoyance  | Time 3 analysts on 3 real files                               |
| 2   | Analysts want the result in Excel with live formulas     | Excel's central role in the workflow                                    | The export goes unused             | Watch whether they keep working in the export                 |
| 3   | Deterministic column mapping covers common formats       | Synthetic formats only                                                  | Heavy manual mapping on real files | Run on 20 real exports, measure auto-map rate                 |
| 4   | The default risk weights are a useful start              | My judgment; not an industry standard                                   | Misleading rankings                | Compare rankings with broker judgment; weights are adjustable |
| 5   | Notice dates can be derived from rent roll fields        | Many rent rolls may omit notice terms                                   | Many dates shown as absent         | Measure the field fill rate on real files                     |
| 6   | One validated rent roll serves several teams             | Public service descriptions only                                        | Teams need different shapes        | Interview one person per team                                 |
| 7   | Organization-level isolation is the right first boundary | Common practice; a firm may need per-deal walls                         | Need a finer access model          | Ask a security or compliance lead                             |
| 8   | Synthetic data reflects real messiness                   | Modelled from public descriptions                                       | Real files break the parser        | First pilot task is a parser run on real files                |
