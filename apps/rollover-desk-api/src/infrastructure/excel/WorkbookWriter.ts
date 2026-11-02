import ExcelJS from 'exceljs';
import type { IWorkbookWriter } from '../../domain/ports/IWorkbookWriter';
import type { WorkbookModel } from '../../domain/entities/workbook';

const DATE = 'yyyy-mm-dd';
const WHOLE = '#,##0';
const USD = '$#,##0.00';
const SHARE = '0.0%';
const INPUT_BLUE = 'FF0000FF';

/** Excel holds at most 32,767 characters in a cell. Longer text is cut visibly, and listed on Data Issues. */
const MAX_CELL_TEXT = 32_767;
const CUT_MARK = ' [cut: too long for one cell]';

const toDate = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const dollars = (cents: number | null) => (cents === null ? null : cents / 100);
/** Days away as the Critical Dates sheet words it. */
export const dateStatus = (daysAway: number | null) =>
  daysAway === null ? 'Not recorded' : daysAway < 0 ? 'Passed' : daysAway === 0 ? 'Today' : 'Upcoming';
const yesNo = (v: boolean | null) => (v === null ? '' : v ? 'Yes' : 'No');
/** A formula's stored value. Excel shows this in Protected View, before it has recalculated anything. */
const calc = (formula: string, result: string | number | Date | null) => ({
  formula,
  result: result ?? '',
});

function sheet(book: ExcelJS.Workbook, name: string, columns: [string, number, string?][]) {
  const ws = book.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = columns.map(([header, width, numFmt]) => ({
    header,
    width,
    ...(numFmt ? { style: { numFmt } } : {}),
  }));
  ws.getRow(1).font = { bold: true };
  return ws;
}

/**
 * Tenant, suite and file text only ever reaches a cell as a string value, which a spreadsheet stores as text
 * whatever it starts with. Every formula below is built from this file's own cell references, never from data.
 */
export class WorkbookWriter implements IWorkbookWriter {
  private cut: string[] = [];

  /** File text for a cell: always a plain string value, and short enough for Excel to open. */
  private text(value: string | null, where: string): string | null {
    if (value === null || value.length <= MAX_CELL_TEXT) return value;
    this.cut.push(
      `${where}: text of ${value.length.toLocaleString('en-US')} characters was cut to fit one cell.`,
    );
    return value.slice(0, MAX_CELL_TEXT - CUT_MARK.length) + CUT_MARK;
  }

  async write(model: WorkbookModel): Promise<Buffer> {
    this.cut = [];
    const book = new ExcelJS.Workbook();
    book.creator = 'rollover-desk';
    book.calcProperties.fullCalcOnLoad = true;
    this.assumptions(book, model);
    this.rentRoll(book, model);
    this.schedule(book, model);
    this.walt(book, model);
    this.dates(book, model);
    this.issues(book, model);
    return Buffer.from(await book.xlsx.writeBuffer());
  }

  private assumptions(book: ExcelJS.Workbook, m: WorkbookModel) {
    const ws = sheet(book, 'Assumptions', [
      ['Assumption', 28],
      ['Value', 26],
      ['Note', 70],
    ]);
    const input = (label: string, value: Date | number | null, numFmt: string, note: string) => {
      const row = ws.addRow([label, value, note]);
      row.getCell(2).numFmt = numFmt;
      row.getCell(2).font = { color: { argb: INPUT_BLUE } };
      return row.number;
    };
    ws.addRow([
      'Property',
      this.text(m.property.name, 'Property name'),
      'Figures are synthetic in this demonstration.',
    ]);
    const asOf = input(
      'As-of date',
      toDate(m.asOf),
      DATE,
      'Change this and every sheet recalculates. Blank leaves dated figures blank.',
    );
    const loan = input(
      'Loan maturity',
      m.property.loanMaturityDate ? toDate(m.property.loanMaturityDate) : null,
      DATE,
      'Blank means not recorded. Lease-before-loan answers stay blank until it is entered.',
    );
    const market = input(
      'Market rent per SF',
      dollars(m.property.marketRentPsfCents),
      USD,
      'An analyst assumption. Blank leaves mark-to-market blank.',
    );
    ws.addRow([
      'Source file',
      this.text(m.sourceFile, 'Source file name'),
      'Blue values are inputs; black values are formulas.',
    ]);
    book.definedNames.add(`Assumptions!$B$${asOf}`, 'AsOf');
    book.definedNames.add(`Assumptions!$B$${loan}`, 'LoanMaturity');
    book.definedNames.add(`Assumptions!$B$${market}`, 'MarketRentPsf');
  }

  private rentRoll(book: ExcelJS.Workbook, m: WorkbookModel) {
    const ws = sheet(book, 'Rent Roll', [
      ['Suite', 10],
      ['Tenant', 32],
      ['Status', 10],
      ['Area SF', 10, WHOLE],
      ['Annual rent', 14, USD],
      ['Rent per SF', 11, USD],
      ['Commencement', 13, DATE],
      ['Expiration', 12, DATE],
      ['Month-to-month', 15],
      ['Notice months', 13],
      ['Notice date', 12, DATE],
      ['Remaining years', 15, '0.00'],
      ['Expires before loan', 18],
      ['Mark-to-market', 14, SHARE],
      ['Rollover period', 14],
    ]);
    m.leases.forEach((l, i) => {
      const r = i + 2;
      const lease = l.lease;
      ws.addRow([
        this.text(lease.suite, `Rent Roll row ${r} suite`),
        this.text(lease.tenantName, `Rent Roll row ${r} tenant`),
        lease.status === 'occupied' ? 'Occupied' : 'Vacant',
        lease.areaSf,
        dollars(lease.annualRentCents),
        calc(`IF(AND(N(E${r})>0,N(D${r})>0),E${r}/D${r},"")`, dollars(l.rentPsfCents)),
        lease.commencementDate ? toDate(lease.commencementDate) : null,
        lease.expirationDate ? toDate(lease.expirationDate) : null,
        lease.isMonthToMonth ? 'Yes' : 'No',
        lease.noticeMonths,
        calc(
          `IF(AND(C${r}="Occupied",I${r}<>"Yes",ISNUMBER(H${r}),ISNUMBER(J${r})),IF(AND(J${r}>=0,J${r}=INT(J${r})),EDATE(H${r},-J${r}),""),"")`,
          l.noticeDate ? toDate(l.noticeDate) : null,
        ),
        calc(
          `IF(OR(C${r}<>"Occupied",NOT(ISNUMBER(AsOf))),"",IF(I${r}="Yes",0,IF(ISNUMBER(H${r}),MAX(0,(H${r}-AsOf)/365.25),"")))`,
          l.remainingYears,
        ),
        calc(
          `IF(OR(C${r}<>"Occupied",NOT(ISNUMBER(LoanMaturity))),"",IF(I${r}="Yes","Yes",IF(ISNUMBER(H${r}),IF(H${r}<LoanMaturity,"Yes","No"),"")))`,
          yesNo(l.expiresBeforeLoan),
        ),
        calc(
          `IF(AND(C${r}="Occupied",N(MarketRentPsf)>0,N(E${r})>0,N(D${r})>0),(MarketRentPsf-E${r}/D${r})/(E${r}/D${r}),"")`,
          l.markToMarketPct,
        ),
        calc(
          `IF(C${r}<>"Occupied","",IF(AND(I${r}<>"Yes",NOT(ISNUMBER(H${r}))),"Unknown",IF(NOT(ISNUMBER(AsOf)),"",IF(OR(I${r}="Yes",H${r}<=AsOf),"MTM",IF(YEAR(H${r})>YEAR(AsOf)+30,"Later",YEAR(H${r}))))))`,
          l.bucket,
        ),
      ]);
    });
    ws.autoFilter = { from: 'A1', to: { row: m.leases.length + 1, column: 15 } };
  }

  private schedule(book: ExcelJS.Workbook, m: WorkbookModel) {
    const last = m.leases.length + 1;
    const col = (c: string) => `'Rent Roll'!$${c}$2:$${c}$${last}`;
    const ws = sheet(book, 'Rollover Schedule', [
      ['Period', 30],
      ['Leases', 8, WHOLE],
      ['Area SF', 11, WHOLE],
      ['Annual rent', 15, USD],
      ['Share of area', 13, SHARE],
      ['Share of rent', 13, SHARE],
      ['Cumulative area', 15, SHARE],
      ['Cumulative rent', 15, SHARE],
      ['Missing area', 13, WHOLE],
      ['Missing rent', 13, WHOLE],
    ]);
    const s = m.schedule;
    const first = 2;
    const years = first + 1;
    const end = years + m.scheduleYears.length;
    const unknown = end + 1;
    const total = end + 2;
    // A missing area or rent is summed as nothing, so each row says how many leases that hides.
    const missing = (match: string, c: string) =>
      `SUMPRODUCT(${match}*(${col('C')}="Occupied")*NOT(ISNUMBER(${col(c)})))`;
    const share = (r: number, c: string) =>
      `IF(AND(ISNUMBER(${c}${r}),$${c}$${total}>0),${c}${r}/$${c}$${total},"")`;
    const listed = [
      {
        label: 'Month-to-month or expired' as string | ReturnType<typeof calc>,
        key: '"MTM"',
        b: s.mtmOrExpired,
      },
      // Years count from the as-of date, so moving it moves the rows and no expiration is left without one.
      ...m.scheduleYears.map((y, i) => ({
        label: calc(`IF(ISNUMBER(AsOf),YEAR(AsOf)+${i},"")`, y.year),
        key: '',
        b: y,
      })),
      { label: 'After the schedule', key: '"Later"', b: s.beyondHorizon },
    ];
    listed.forEach(({ label, key, b }, i) => {
      const r = first + i;
      const match = key ? `(${col('O')}=${key})` : `(${col('O')}=$A${r})`;
      // Every period row needs an as-of date; without one it shows blank, never a 0 that reads as no exposure.
      const guard = (f: string) => `IF(ISNUMBER(${key ? 'AsOf' : `$A${r}`}),${f},"")`;
      const criterion = key || `$A${r}`;
      ws.addRow([
        label,
        calc(guard(`COUNTIF(${col('O')},${criterion})`), b.leases),
        calc(guard(`SUMIF(${col('O')},${criterion},${col('D')})`), b.areaSf),
        calc(guard(`SUMIF(${col('O')},${criterion},${col('E')})`), dollars(b.annualRentCents)),
        calc(share(r, 'C'), b.areaShare),
        calc(share(r, 'D'), b.rentShare),
        calc(guard(`IF($C$${total}>0,SUM(C$${first}:C${r})/$C$${total},"")`), b.cumulativeAreaShare),
        calc(guard(`IF($D$${total}>0,SUM(D$${first}:D${r})/$D$${total},"")`), b.cumulativeRentShare),
        calc(guard(missing(match, 'D')), b.leasesMissingArea),
        calc(guard(missing(match, 'E')), b.leasesMissingRent),
      ]);
    });
    const blankMatch = `(${col('O')}="Unknown")`;
    ws.addRow([
      'No expiration recorded',
      calc(`COUNTIF(${col('O')},"Unknown")`, s.unknownExpiration.leases),
      calc(`SUMIF(${col('O')},"Unknown",${col('D')})`, s.unknownExpiration.areaSf),
      calc(`SUMIF(${col('O')},"Unknown",${col('E')})`, dollars(s.unknownExpiration.annualRentCents)),
      null,
      null,
      null,
      null,
      calc(missing(blankMatch, 'D'), m.unknownMissing.area),
      calc(missing(blankMatch, 'E'), m.unknownMissing.rent),
    ]);
    const totals = ws.addRow([
      'Total leased',
      calc(`COUNTIF(${col('C')},"Occupied")`, s.totals.leases),
      calc(`SUMIF(${col('C')},"Occupied",${col('D')})`, s.totals.areaSf),
      calc(`SUMIF(${col('C')},"Occupied",${col('E')})`, dollars(s.totals.annualRentCents)),
      null,
      null,
      null,
      null,
      calc(missing('1', 'D'), s.leasesMissingArea),
      calc(missing('1', 'E'), s.leasesMissingRent),
    ]);
    totals.font = { bold: true };
    if (ws.rowCount !== total || unknown + 1 !== total) throw new Error('Schedule rows are out of step.');
  }

  private walt(book: ExcelJS.Workbook, m: WorkbookModel) {
    const last = m.leases.length + 1;
    const col = (c: string) => `'Rent Roll'!$${c}$2:$${c}$${last}`;
    const ws = sheet(book, 'WALT', [
      ['Weighted by', 14],
      ['Years', 8, '0.00'],
      ['Leases included', 16],
      ['Leases left out', 15],
    ]);
    const row = (label: string, c: string, w: WorkbookModel['walt']['byArea']) => {
      const known = `ISNUMBER(${col(c)})*ISNUMBER(${col('L')})*(${col('C')}="Occupied")`;
      const weight = `SUMPRODUCT(${known},${col(c)})`;
      ws.addRow([
        label,
        calc(`IF(${weight}>0,SUMPRODUCT(${known},${col(c)},${col('L')})/${weight},"")`, w.years),
        calc(`SUMPRODUCT(${known}*(${col(c)}>0))`, w.includedLeases),
        calc(`COUNTIF(${col('C')},"Occupied")-C${ws.rowCount + 1}`, w.excludedLeases),
      ]);
    };
    row('Area', 'D', m.walt.byArea);
    row('Rent', 'E', m.walt.byRent);
  }

  private dates(book: ExcelJS.Workbook, m: WorkbookModel) {
    const ws = sheet(book, 'Critical Dates', [
      ['Suite', 10],
      ['Tenant', 32],
      ['Date type', 20],
      ['Date', 12, DATE],
      ['Days away', 10, WHOLE],
      ['Status', 13],
    ]);
    m.dates.forEach((d, i) => {
      const r = i + 2;
      const owner = d.leaseIndex === null ? null : m.leases[d.leaseIndex]!.lease;
      const rollRow = d.leaseIndex === null ? 0 : d.leaseIndex + 2;
      const value = d.date ? toDate(d.date) : null;
      // Linked rather than copied, so a changed notice term or expiration carries through.
      const source =
        d.kind === 'notice'
          ? `'Rent Roll'!K${rollRow}`
          : d.kind === 'expiration'
            ? `'Rent Roll'!H${rollRow}`
            : d.kind === 'loan_maturity'
              ? 'LoanMaturity'
              : null;
      ws.addRow([
        owner ? this.text(owner.suite, `Critical Dates row ${r} suite`) : 'Property',
        this.text(owner?.tenantName ?? null, `Critical Dates row ${r} tenant`),
        d.label,
        source ? calc(`IF(ISNUMBER(${source}),${source},"")`, value) : value,
        calc(`IF(AND(ISNUMBER(D${r}),ISNUMBER(AsOf)),D${r}-AsOf,"")`, d.daysAway),
        calc(
          `IF(NOT(ISNUMBER(D${r})),"Not recorded",IF(NOT(ISNUMBER(E${r})),"",IF(E${r}<0,"Passed",IF(E${r}=0,"Today","Upcoming"))))`,
          dateStatus(d.daysAway),
        ),
      ]);
    });
    ws.autoFilter = { from: 'A1', to: { row: m.dates.length + 1, column: 6 } };
  }

  private issues(book: ExcelJS.Workbook, m: WorkbookModel) {
    const ws = sheet(book, 'Data Issues', [
      ['Type', 12],
      ['Source row', 11],
      ['Detail', 90],
    ]);
    for (const i of m.issues) {
      ws.addRow([
        i.severity === 'blocking' ? 'Blocking' : 'Warning',
        i.row ?? null,
        this.text(i.message, 'Issue'),
      ]);
    }
    for (const s of m.skippedRows) {
      ws.addRow([`Skipped ${s.reason}`, s.row, this.text(s.text, `Skipped row ${s.row}`)]);
    }
    for (const c of this.cut) ws.addRow(['Cut text', null, c]);
    if (ws.rowCount === 1) {
      ws.addRow(['None', null, 'The import raised no issues and skipped no rows.']);
    }
  }
}
