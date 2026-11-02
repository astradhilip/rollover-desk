import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import type { Property } from '../../src/domain/entities/Lease';
import type { ParsedLease } from '../../src/domain/entities/rentRollIntake';
import { buildWorkbookModel, type WorkbookModel } from '../../src/domain/entities/workbook';
import { dateStatus, WorkbookWriter } from '../../src/infrastructure/excel/WorkbookWriter';

const HAS_SOFFICE = spawnSync('soffice', ['--version']).status === 0;
// CI installs LibreOffice, so there a missing binary fails rather than quietly skipping the proof.
const recalcIt = HAS_SOFFICE || process.env.CI ? it : it.skip;

const lease = (over: Partial<ParsedLease>): ParsedLease => ({
  id: over.suite ?? 'x',
  suite: 'x',
  tenantName: 'Tenant',
  status: 'occupied',
  areaSf: 1000,
  annualRentCents: 3_000_000,
  expirationDate: '2030-01-31',
  isMonthToMonth: false,
  noticeMonths: 12,
  rentSteps: [],
  sourceRow: 2,
  commencementDate: '2020-01-01',
  ...over,
});

const EVIL = '=HYPERLINK("http://evil.example","x")';
const LEASES = [
  lease({ suite: '100', tenantName: 'Acme', expirationDate: '2027-03-31', noticeMonths: 1 }),
  lease({
    suite: '110',
    tenantName: EVIL,
    expirationDate: '2032-02-29',
    noticeMonths: 12,
    areaSf: 2500,
    annualRentCents: 5_012_345,
  }),
  lease({ suite: '120', tenantName: '+1+1', isMonthToMonth: true, expirationDate: null, noticeMonths: null }),
  lease({ suite: '130', tenantName: '-2', expirationDate: '2025-06-30' }),
  lease({ suite: '140', tenantName: '@SUM(A1)', annualRentCents: null }),
  lease({ suite: '150', areaSf: null, expirationDate: '2028-12-31' }),
  lease({ suite: '160', expirationDate: null, noticeMonths: null }),
  lease({ suite: '170', expirationDate: '2070-01-01' }),
  lease({ suite: '180', noticeMonths: 1.5, rentSteps: [{ date: '2027-01-01', annualRentCents: 3_100_000 }] }),
  lease({
    suite: '190',
    tenantName: null,
    status: 'vacant',
    annualRentCents: null,
    expirationDate: null,
    noticeMonths: null,
    commencementDate: null,
  }),
];
const PROPERTY: Property = {
  id: 'p',
  name: '=1+1 Tower',
  loanMaturityDate: '2028-06-30',
  marketRentPsfCents: 3500,
};

const model = (over: { property?: Property; asOf?: string; leases?: ParsedLease[] } = {}) =>
  buildWorkbookModel({
    property: over.property ?? PROPERTY,
    leases: over.leases ?? LEASES,
    asOf: over.asOf ?? '2026-01-15',
    sourceFile: '=cmd|calc.xlsx',
    issues: [{ code: 'x', severity: 'warning', message: '-bad row', row: 3 }],
    skippedRows: [{ row: 9, reason: 'note', text: '@note' }],
  });

/** ExcelJS drops a stored 0 and a stored blank alike on reading, so these come from the file's XML. */
const stored = new WeakMap<ExcelJS.Worksheet, Map<string, string>>();
const read = async (bytes: Buffer) => {
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(bytes as never);
  const zip = await JSZip.loadAsync(bytes);
  for (const [i, ws] of book.worksheets.entries()) {
    const xml = await zip.file(`xl/worksheets/sheet${i + 1}.xml`)!.async('string');
    const cells = new Map<string, string>();
    for (const m of xml.matchAll(/<c r="([A-Z]+\d+)"[^>]*?(?<!\/)>(.*?)<\/c>/g)) {
      cells.set(m[1]!, /<v>(.*?)<\/v>/.exec(m[2]!)?.[1] ?? '');
    }
    stored.set(ws, cells);
  }
  return book;
};

/** Removes every stored value, so anything read back afterwards was calculated from the formula. */
async function stripped(bytes: Buffer, edit?: (book: ExcelJS.Workbook) => void) {
  const book = await read(bytes);
  book.eachSheet((ws) =>
    ws.eachRow((row) =>
      row.eachCell((cell) => {
        const v = cell.value as { formula?: string } | null;
        if (v && typeof v === 'object' && v.formula)
          cell.value = { formula: v.formula } as ExcelJS.CellFormulaValue;
      }),
    ),
  );
  edit?.(book);
  return Buffer.from(await book.xlsx.writeBuffer());
}

function recalculate(bytes: Buffer): Buffer {
  const dir = mkdtempSync(path.join(tmpdir(), 'recalc-'));
  try {
    const out = path.join(dir, 'out');
    writeFileSync(path.join(dir, 'in.xlsx'), bytes);
    execFileSync(
      'soffice',
      [
        `-env:UserInstallation=file://${dir}/profile`,
        '--headless',
        '--convert-to',
        'xlsx',
        '--outdir',
        out,
        path.join(dir, 'in.xlsx'),
      ],
      { stdio: 'ignore', timeout: 120_000 },
    );
    return readFileSync(path.join(out, 'in.xlsx'));
  } finally {
    setTimeout(() => rmSync(dir, { recursive: true, force: true }), 0);
  }
}

const SERIAL_EPOCH = Date.UTC(1899, 11, 30);
/** A cell's value or calculated result, with blanks, dates and serial dates made comparable. */
function val(ws: ExcelJS.Worksheet, row: number, col: number): string | number | null {
  const cell = ws.getRow(row).getCell(col);
  const raw = cell.value as unknown;
  const isFormula = raw && typeof raw === 'object' && 'formula' in raw;
  const dropped = isFormula && (raw as { result?: unknown }).result === undefined;
  if (dropped) return stored.get(ws)!.get(cell.address) === '0' ? 0 : null;
  const v = isFormula ? (raw as { result?: unknown }).result : raw;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (v === undefined || v === null || v === '') return null;
  if (typeof v === 'object' && 'error' in v)
    throw new Error(`${ws.name} ${row}:${col} is ${String((v as { error: unknown }).error)}`);
  return v as string | number;
}
const iso = (v: string | number | null) =>
  typeof v === 'number' ? new Date(SERIAL_EPOCH + v * 86_400_000).toISOString().slice(0, 10) : v;
const close = (actual: string | number | null, expected: number | null) => {
  if (expected === null) expect(actual).toBeNull();
  else expect(actual as number).toBeCloseTo(expected, 6);
};

/** The workbook against the domain's own answer, sheet by sheet. */
function expectMatches(book: ExcelJS.Workbook, m: WorkbookModel) {
  const roll = book.getWorksheet('Rent Roll')!;
  m.leases.forEach((l, i) => {
    const r = i + 2;
    close(val(roll, r, 6) as number | null, l.rentPsfCents === null ? null : l.rentPsfCents / 100);
    expect(iso(val(roll, r, 11)), `notice ${l.lease.suite}`).toBe(l.noticeDate);
    close(val(roll, r, 12), l.remainingYears);
    expect(val(roll, r, 13), `loan ${l.lease.suite}`).toBe(
      l.expiresBeforeLoan === null ? null : l.expiresBeforeLoan ? 'Yes' : 'No',
    );
    close(val(roll, r, 14), l.markToMarketPct);
    expect(val(roll, r, 15), `bucket ${l.lease.suite}`).toBe(l.bucket);
  });

  expectSchedule(book, m);

  const walt = book.getWorksheet('WALT')!;
  [m.walt.byArea, m.walt.byRent].forEach((w, i) => {
    close(val(walt, i + 2, 2), w.years);
    expect(val(walt, i + 2, 3)).toBe(w.includedLeases);
    expect(val(walt, i + 2, 4)).toBe(w.excludedLeases);
  });

  const dates = book.getWorksheet('Critical Dates')!;
  m.dates.forEach((d, i) => {
    const r = i + 2;
    expect(iso(val(dates, r, 4)), `${d.label} ${r}`).toBe(d.date);
    expect(val(dates, r, 5)).toBe(d.daysAway);
    expect(val(dates, r, 6)).toBe(dateStatus(d.daysAway));
  });
}

/** The Rollover Schedule sheet against the domain, row by row. */
function expectSchedule(book: ExcelJS.Workbook, m: WorkbookModel) {
  const sched = book.getWorksheet('Rollover Schedule')!;
  const rows = new Map<string | number, number>();
  sched.eachRow((_, r) => rows.set(val(sched, r, 1)!, r));
  const bucket = (
    key: string | number,
    b: {
      leases: number;
      areaSf: number;
      annualRentCents: number;
      areaShare?: number | null;
      rentShare?: number | null;
    },
  ) => {
    const r = rows.get(key)!;
    expect(val(sched, r, 2), `${key} leases`).toBe(b.leases);
    close(val(sched, r, 3), b.areaSf);
    close(val(sched, r, 4), b.annualRentCents / 100);
    if (b.rentShare !== undefined) {
      close(val(sched, r, 5), b.areaShare ?? null);
      close(val(sched, r, 6), b.rentShare);
    }
  };
  bucket('Month-to-month or expired', m.schedule.mtmOrExpired);
  bucket('After the schedule', m.schedule.beyondHorizon);
  bucket('No expiration recorded', m.schedule.unknownExpiration);
  bucket('Total leased', m.schedule.totals);
  for (const y of m.scheduleYears) {
    bucket(y.year, y);
    close(val(sched, rows.get(y.year)!, 7), y.cumulativeAreaShare);
    close(val(sched, rows.get(y.year)!, 8), y.cumulativeRentShare);
  }
  const later = rows.get('After the schedule')!;
  close(val(sched, later, 7), m.schedule.beyondHorizon.cumulativeAreaShare);
  close(val(sched, later, 8), m.schedule.beyondHorizon.cumulativeRentShare);
  const missing = (key: string | number, area: number, rent: number) => {
    expect(val(sched, rows.get(key)!, 9), `${key} missing area`).toBe(area);
    expect(val(sched, rows.get(key)!, 10), `${key} missing rent`).toBe(rent);
  };
  missing(
    'Month-to-month or expired',
    m.schedule.mtmOrExpired.leasesMissingArea,
    m.schedule.mtmOrExpired.leasesMissingRent,
  );
  for (const y of m.scheduleYears) missing(y.year, y.leasesMissingArea, y.leasesMissingRent);
  missing(
    'After the schedule',
    m.schedule.beyondHorizon.leasesMissingArea,
    m.schedule.beyondHorizon.leasesMissingRent,
  );
  missing('No expiration recorded', m.unknownMissing.area, m.unknownMissing.rent);
  missing('Total leased', m.schedule.leasesMissingArea, m.schedule.leasesMissingRent);
}

describe('WorkbookWriter', () => {
  it('has the agreed sheets, and stored values matching the domain', async () => {
    const m = model();
    const book = await read(await new WorkbookWriter().write(m));
    expect(book.worksheets.map((w) => w.name)).toEqual([
      'Assumptions',
      'Rent Roll',
      'Rollover Schedule',
      'WALT',
      'Critical Dates',
      'Data Issues',
    ]);
    expectMatches(book, m);
  });

  it('writes figures as formulas, leaving only inputs as values', async () => {
    const book = await read(await new WorkbookWriter().write(model()));
    const formula = (ws: string, cell: string) =>
      (book.getWorksheet(ws)!.getCell(cell).value as { formula?: string })?.formula;
    expect(formula('Rent Roll', 'K2')).toContain('EDATE');
    expect(formula('Rollover Schedule', 'D2')).toContain('SUMIF');
    expect(formula('WALT', 'B2')).toContain('SUMPRODUCT');
    expect(formula('Critical Dates', 'E2')).toContain('AsOf');
  });

  it('keeps a missing value blank, never zero', async () => {
    const book = await read(await new WorkbookWriter().write(model()));
    const roll = book.getWorksheet('Rent Roll')!;
    const row = LEASES.findIndex((l) => l.suite === '140') + 2;
    expect(val(roll, row, 5)).toBeNull();
    expect(val(roll, row, 6)).toBeNull();
    expect(val(roll, row, 14)).toBeNull();
  });

  it('counts leases summed without area or rent on every schedule row', async () => {
    const m = model({
      leases: [
        lease({ suite: 'miss', areaSf: null, annualRentCents: null, expirationDate: '2027-06-30' }),
        lease({ suite: 'ok', expirationDate: '2028-06-30' }),
      ],
    });
    const sched = (await read(await new WorkbookWriter().write(m))).getWorksheet('Rollover Schedule')!;
    let row = 0;
    sched.eachRow((_, r) => {
      if (val(sched, r, 1) === 2027) row = r;
    });
    expect([val(sched, row, 9), val(sched, row, 10)]).toEqual([1, 1]);
  });

  it('cuts text too long for one cell, and says so on Data Issues', async () => {
    const long = 'x'.repeat(40_000);
    const m = model({ leases: [lease({ suite: 'A', tenantName: long })] });
    const book = await read(await new WorkbookWriter().write(m));
    const tenant = book.getWorksheet('Rent Roll')!.getCell('B2').value as string;
    expect(tenant.length).toBe(32_767);
    expect(tenant).toMatch(/\[cut: too long for one cell\]$/);
    const issues: unknown[] = [];
    book.getWorksheet('Data Issues')!.eachRow((row) => issues.push(row.getCell(3).value));
    expect(issues).toContain('Rent Roll row 2 tenant: text of 40,000 characters was cut to fit one cell.');
  });

  it('writes file text starting = + - @ as literal text', async () => {
    const book = await read(await new WorkbookWriter().write(model()));
    const literal = (ws: string, cell: string, text: string) => {
      const c = book.getWorksheet(ws)!.getCell(cell);
      expect(c.type).toBe(ExcelJS.ValueType.String);
      expect(c.value).toBe(text);
    };
    literal('Assumptions', 'B2', PROPERTY.name);
    literal('Assumptions', 'B6', '=cmd|calc.xlsx');
    literal('Rent Roll', 'B3', EVIL);
    literal('Rent Roll', 'B4', '+1+1');
    literal('Rent Roll', 'B5', '-2');
    literal('Rent Roll', 'B6', '@SUM(A1)');
    literal('Data Issues', 'C2', '-bad row');
    literal('Data Issues', 'C3', '@note');
  });

  recalcIt(
    'recalculates in LibreOffice to the domain numbers, with stored values removed',
    { timeout: 180_000 },
    async () => {
      const m = model();
      const book = await read(recalculate(await stripped(await new WorkbookWriter().write(m))));
      expectMatches(book, m);
      expect(book.getWorksheet('Rent Roll')!.getCell('B3').type).toBe(ExcelJS.ValueType.String);
      expect(book.getWorksheet('Rent Roll')!.getCell('B3').value).toBe(EVIL);
    },
  );

  recalcIt('follows a changed as-of date, loan maturity and market rent', { timeout: 180_000 }, async () => {
    const bytes = await stripped(await new WorkbookWriter().write(model()), (book) => {
      const a = book.getWorksheet('Assumptions')!;
      a.getCell('B3').value = new Date('2028-07-15T00:00:00Z');
      a.getCell('B4').value = new Date('2031-01-01T00:00:00Z');
      a.getCell('B5').value = 50;
    });
    const changed = model({
      asOf: '2028-07-15',
      property: { ...PROPERTY, loanMaturityDate: '2031-01-01', marketRentPsfCents: 5000 },
    });
    const book = await read(recalculate(bytes));
    const roll = book.getWorksheet('Rent Roll')!;
    changed.leases.forEach((l, i) => {
      close(val(roll, i + 2, 12), l.remainingYears);
      close(val(roll, i + 2, 14), l.markToMarketPct);
      expect(val(roll, i + 2, 15)).toBe(l.bucket);
      expect(val(roll, i + 2, 13)).toBe(
        l.expiresBeforeLoan === null ? null : l.expiresBeforeLoan ? 'Yes' : 'No',
      );
    });
    const walt = book.getWorksheet('WALT')!;
    close(val(walt, 2, 2), changed.walt.byArea.years);
    close(val(walt, 3, 2), changed.walt.byRent.years);
    // The year rows move with the as-of date, so the whole schedule matches the domain's at the new date.
    expectSchedule(book, changed);
  });

  recalcIt(
    'keeps shares whole when the as-of date moves earlier, and blanks dated figures without one',
    { timeout: 180_000 },
    async () => {
      const leases = [
        lease({ suite: 'old', areaSf: 1000, annualRentCents: 1_000_000, expirationDate: '2025-06-30' }),
        lease({ suite: 'new', areaSf: 3000, annualRentCents: 3_000_000, expirationDate: '2027-06-30' }),
      ];
      const withUndated = [
        ...leases,
        lease({ suite: 'mtm', isMonthToMonth: true, expirationDate: null }),
        lease({ suite: 'none', areaSf: null, expirationDate: null, annualRentCents: 1_000_000 }),
      ];
      const earlier = await stripped(await new WorkbookWriter().write(model({ leases })), (book) => {
        book.getWorksheet('Assumptions')!.getCell('B3').value = new Date('2025-01-01T00:00:00Z');
      });
      const moved = model({ leases, asOf: '2025-01-01' });
      const book = await read(recalculate(earlier));
      expectSchedule(book, moved);
      expect(moved.scheduleYears.find((y) => y.year === 2025)!.cumulativeAreaShare).toBe(0.25);

      const blank = await stripped(
        await new WorkbookWriter().write(model({ leases: withUndated })),
        (book) => {
          book.getWorksheet('Assumptions')!.getCell('B3').value = null;
        },
      );
      const none = await read(recalculate(blank));
      const roll = none.getWorksheet('Rent Roll')!;
      for (const r of [2, 3]) {
        expect(val(roll, r, 12)).toBeNull();
        expect(val(roll, r, 15)).toBeNull();
      }
      expect(val(roll, 5, 15)).toBe('Unknown');
      expect(val(none.getWorksheet('WALT')!, 2, 2)).toBeNull();
      // Without an as-of date no period can be placed, so period rows are blank rather than 0 or 0%.
      const sched = none.getWorksheet('Rollover Schedule')!;
      sched.eachRow((_, r) => {
        const label = val(sched, r, 1);
        if (r === 1) return;
        if (label === 'No expiration recorded') {
          expect([val(sched, r, 2), val(sched, r, 4), val(sched, r, 9)]).toEqual([1, 10_000, 1]);
        } else if (label === 'Total leased') {
          expect([val(sched, r, 2), val(sched, r, 9)]).toEqual([4, 1]);
        } else {
          for (let c = 2; c <= 10; c += 1) expect(val(sched, r, c), `${label} column ${c}`).toBeNull();
        }
      });
      const dates = none.getWorksheet('Critical Dates')!;
      dates.eachRow((_, r) => {
        if (r === 1) return;
        expect(val(dates, r, 5)).toBeNull();
        expect(val(dates, r, 6)).not.toBe('Upcoming');
      });
    },
  );

  recalcIt('reads an expiration on the as-of date as today', { timeout: 180_000 }, async () => {
    const m = model({ leases: [lease({ suite: 'A', expirationDate: '2026-01-15', noticeMonths: 0 })] });
    expect(m.dates.map((d) => dateStatus(d.daysAway))).toContain('Today');
    expectMatches(await read(recalculate(await stripped(await new WorkbookWriter().write(m)))), m);
  });

  recalcIt('reproduces the hand-worked WALT and a month-end notice date', { timeout: 180_000 }, async () => {
    const m = model({
      asOf: '2026-01-01',
      leases: [
        lease({
          suite: 'A',
          areaSf: 10_000,
          annualRentCents: 30_000_000,
          expirationDate: '2029-01-01',
          noticeMonths: 1,
        }),
        lease({
          suite: 'B',
          areaSf: 30_000,
          annualRentCents: 60_000_000,
          expirationDate: '2027-03-31',
          noticeMonths: 1,
        }),
      ],
    });
    const book = await read(recalculate(await stripped(await new WorkbookWriter().write(m))));
    expect(iso(val(book.getWorksheet('Rent Roll')!, 3, 11))).toBe('2027-02-28');
    const only = model({
      asOf: '2026-01-01',
      leases: [
        lease({ suite: 'A', areaSf: 10_000, annualRentCents: 30_000_000, expirationDate: '2029-01-01' }),
        lease({ suite: 'B', areaSf: 30_000, annualRentCents: 60_000_000, expirationDate: '2027-01-01' }),
      ],
    });
    const worked = await read(recalculate(await stripped(await new WorkbookWriter().write(only))));
    expect(val(worked.getWorksheet('WALT')!, 2, 2) as number).toBeCloseTo(1.4997, 3);
    expect(val(worked.getWorksheet('WALT')!, 3, 2) as number).toBeCloseTo(1.6664, 3);
  });
});
