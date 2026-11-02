// Everything here is invented: no real tenant, property or lease.
import ExcelJS from 'exceljs';

export interface KeyLease {
  suite: string;
  tenantName: string | null;
  status: 'occupied' | 'vacant';
  areaSf: number | null;
  annualRentCents: number | null;
  commencementDate: string | null;
  expirationDate: string | null;
  isMonthToMonth: boolean;
  noticeMonths: number | null;
  rentSteps: { date: string; annualRentCents: number }[];
}

export const AS_OF = '2026-01-15';

export const PROPERTY = {
  name: 'Trinity Commerce Center',
  loanMaturityDate: '2028-06-30',
  marketRentPsfCents: 3_600,
};

const TENANTS = [
  'Mesquite Logistics LLC',
  'Cedar Elm Partners',
  'Ferris Wheel Studios Inc.',
  'Greenville Avenue Dental',
  'Harwood Data Systems',
  'Katy Trail Advisors',
  'Lakewood Title Co.',
  'Mockingbird Software LLC',
  'Northpark Staffing Group',
  'Oak Lawn Architects',
  'Pecan Valley Foods',
  'Riverfront Engineering',
  'Stemmons Freight Inc.',
  'Turtle Creek Capital',
  'Uptown Legal Services',
  'White Rock Insurance',
];

/** Small seeded generator (mulberry32), so a seed always gives the same rent roll. */
function prng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The true rent roll. Rent is a whole number of cents per SF, in multiples of 12 cents, so annual, monthly
 * and per-SF renderings of a rent all convert back to exactly the same integer.
 */
export function generateAnswerKey(seed = 20261): KeyLease[] {
  const random = prng(seed);
  const pick = (low: number, high: number) => low + Math.floor(random() * (high - low + 1));
  const leases: KeyLease[] = [];
  let tenant = 0;
  for (let floor = 1; floor <= 3; floor += 1) {
    for (let unit = 1; unit <= 6; unit += 1) {
      const suite = `${floor}${String(unit * 10).padStart(2, '0')}`;
      const areaSf = pick(12, 90) * 100;
      if ((floor === 2 && unit === 6) || (floor === 3 && unit === 6)) {
        leases.push({
          suite,
          tenantName: null,
          status: 'vacant',
          areaSf,
          annualRentCents: null,
          commencementDate: null,
          expirationDate: null,
          isMonthToMonth: false,
          noticeMonths: null,
          rentSteps: [],
        });
        continue;
      }
      const annualRentCents = pick(200, 340) * 12 * areaSf;
      const isMonthToMonth = (floor === 1 && unit === 6) || (floor === 3 && unit === 5);
      const endYear = pick(2026, 2033);
      const endMonth = String(pick(1, 12)).padStart(2, '0');
      // A last-of-month expiry on months where every format renders the same day.
      const endDay = ['04', '06', '09', '11'].includes(endMonth) ? '30' : endMonth === '02' ? '28' : '31';
      const expirationDate = isMonthToMonth ? null : `${endYear}-${endMonth}-${endDay}`;
      const stepped = !isMonthToMonth && unit % 3 === 0;
      leases.push({
        suite,
        tenantName: TENANTS[tenant % TENANTS.length]!,
        status: 'occupied',
        areaSf,
        annualRentCents,
        commencementDate: `${pick(2017, 2023)}-${String(pick(1, 12)).padStart(2, '0')}-01`,
        expirationDate,
        isMonthToMonth,
        noticeMonths: isMonthToMonth || unit === 4 ? null : [6, 9, 12][pick(0, 2)]!,
        rentSteps: stepped
          ? [{ date: '2026-07-01', annualRentCents: Math.round(annualRentCents * 1.03) }]
          : [],
      });
      tenant += 1;
    }
  }
  // One tenant in two suites, for concentration.
  const twoSuites = leases.find((l) => l.suite === '220')!;
  twoSuites.tenantName = leases.find((l) => l.suite === '110')!.tenantName;
  return leases;
}

/** Worked out here without the domain engine, so a test comparing the two is an independent check. */
export function answerKeyTotals(leases: KeyLease[]) {
  const live = leases.filter((l) => l.status === 'occupied');
  return {
    occupiedLeases: live.length,
    vacantSuites: leases.length - live.length,
    leasedAreaSf: live.reduce((n, l) => n + l.areaSf!, 0),
    annualRentCents: live.reduce((n, l) => n + l.annualRentCents!, 0),
    monthToMonth: live.filter((l) => l.isMonthToMonth).length,
  };
}

export interface PlantedDefect {
  /** Suite the issue must name, or null when it concerns a row with no suite. */
  suite: string | null;
  code: string;
  /** What the parsed value must then be. Everything not listed must match the answer key. */
  expected?: Partial<KeyLease>;
}

export interface SampleFile {
  filename: string;
  /** How this format differs from the key by design, such as having no notice column. */
  omits: (keyof KeyLease)[];
  defects: PlantedDefect[];
  bytes: Buffer;
}

type Cell = string | number | Date | null;

const utc = (iso: string) => new Date(`${iso}T00:00:00Z`);
const usDate = (iso: string) => `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}/${iso.slice(0, 4)}`;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const textDate = (iso: string) =>
  `${Number(iso.slice(8, 10))}-${MONTHS[Number(iso.slice(5, 7)) - 1]}-${iso.slice(0, 4)}`;
const serial = (iso: string) =>
  Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.UTC(1899, 11, 30)) / 86_400_000);
const dollars = (cents: number) =>
  `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

async function xlsx(fill: (sheet: ExcelJS.Worksheet) => void): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.created = new Date('2026-01-15T00:00:00Z');
  workbook.modified = workbook.created;
  fill(workbook.addWorksheet('Rent Roll'));
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

/** Tidy: one header row, annual dollars, real date cells. Reproduces the answer key exactly. */
async function clean(key: KeyLease[]): Promise<SampleFile> {
  const bytes = await xlsx((sheet) => {
    sheet.addRow([
      'Suite',
      'Tenant',
      'SF',
      'Annual Rent',
      'Commencement',
      'Expiration',
      'Notice Months',
      'Next Step Date',
      'Next Step Annual Rent',
    ]);
    for (const l of key) {
      const step = l.rentSteps[0];
      sheet.addRow([
        l.suite,
        l.status === 'vacant' ? 'Vacant' : l.tenantName,
        l.areaSf,
        l.annualRentCents === null ? null : l.annualRentCents / 100,
        l.commencementDate && utc(l.commencementDate),
        l.isMonthToMonth ? 'MTM' : l.expirationDate && utc(l.expirationDate),
        l.noticeMonths,
        step ? utc(step.date) : null,
        step ? step.annualRentCents / 100 : null,
      ] as Cell[]);
    }
  });
  return { filename: 'clean.xlsx', omits: [], defects: [], bytes };
}

/** Property manager export: title rows, monthly rent as text, US date text, floor subtotals. */
async function propertyManager(key: KeyLease[]): Promise<SampleFile> {
  const defects: PlantedDefect[] = [
    { suite: '120', code: 'missing_value', expected: { annualRentCents: null } },
    { suite: '130', code: 'invalid_date', expected: { expirationDate: null } },
    { suite: '210', code: 'duplicate_suite' },
  ];
  const bytes = await xlsx((sheet) => {
    sheet.addRow([PROPERTY.name]);
    sheet.addRow(['Rent Roll Report']);
    sheet.addRow([`As of ${usDate(AS_OF)}`]);
    sheet.addRow([]);
    sheet.addRow([
      'Unit',
      'Tenant Name',
      'Sq Ft',
      'Monthly Base Rent',
      'Lease Start',
      'Lease End',
      'Notice (Months)',
    ]);
    for (const floor of ['1', '2', '3']) {
      const rows = key.filter((l) => l.suite.startsWith(floor));
      for (const l of rows) {
        const row: Cell[] = [
          l.suite,
          l.status === 'vacant' ? 'VACANT' : l.tenantName,
          l.areaSf?.toLocaleString('en-US') ?? null,
          l.annualRentCents === null ? null : dollars(l.annualRentCents / 12),
          l.commencementDate && usDate(l.commencementDate),
          l.isMonthToMonth ? 'MTM' : l.expirationDate && usDate(l.expirationDate),
          l.noticeMonths,
        ];
        if (l.suite === '120') row[3] = null;
        if (l.suite === '130') row[5] = '02/30/2029';
        sheet.addRow(row);
        if (l.suite === '210') sheet.addRow(row);
      }
      const area = rows.reduce((n, l) => n + (l.areaSf ?? 0), 0);
      sheet.addRow([`Floor ${floor} Subtotal`, null, area.toLocaleString('en-US')]);
    }
    sheet.addRow([]);
    sheet.addRow(['Prepared by property management. Unaudited.']);
  });
  return { filename: 'property-manager-export.xlsx', omits: ['rentSteps'], defects, bytes };
}

/** Broker stacking sheet: two-row merged header, rent per SF, merged tenant cells, section rows, text dates. */
async function brokerStack(key: KeyLease[]): Promise<SampleFile> {
  const defects: PlantedDefect[] = [
    {
      suite: '140',
      code: 'date_order',
      expected: { commencementDate: '2031-01-01', expirationDate: '2030-12-31' },
    },
    { suite: '230', code: 'invalid_number', expected: { areaSf: null, annualRentCents: null } },
    { suite: '310', code: 'unusual_date_format', expected: { expirationDate: '2032-02-13' } },
    { suite: null, code: 'unattached_row' },
    { suite: null, code: 'total_mismatch' },
  ];
  const twoSuite = key.find((l) => l.suite === '110')!.tenantName;
  const bytes = await xlsx((sheet) => {
    sheet.addRow([`${PROPERTY.name}: stacking plan`]);
    sheet.addRow(['Suite', 'Tenant', 'Area (SF)', 'Base Rent', 'Lease Term', null]);
    sheet.addRow([null, null, null, 'Annual $/SF', 'Commencement', 'Expiration']);
    sheet.mergeCells('E2:F2');
    let section = '';
    for (const l of key) {
      const name = l.suite.startsWith('3') ? 'East Wing' : 'West Wing';
      if (name !== section) sheet.addRow([name]);
      section = name;
      const row: Cell[] = [
        l.suite,
        l.status === 'vacant' ? '-- Available --' : l.tenantName,
        l.areaSf,
        l.annualRentCents === null ? null : l.annualRentCents / l.areaSf! / 100,
        l.commencementDate && textDate(l.commencementDate),
        l.isMonthToMonth ? 'Month to Month' : l.expirationDate && textDate(l.expirationDate),
      ];
      if (l.suite === '140') row[4] = '1-Jan-2031';
      if (l.suite === '140') row[5] = '31-Dec-2030';
      if (l.suite === '230') row[2] = 'see plan';
      if (l.suite === '310') row[5] = '13/02/2032';
      sheet.addRow(row);
      if (l.suite === '140') sheet.addRow([null, null, null, 31, 'Option term not exercised', null]);
    }
    const total = key.reduce((n, l) => n + (l.areaSf ?? 0), 0);
    sheet.addRow(['Grand Total', null, total + 1_000]);
    // Tenant name merged over the two rows of one tenant is covered by reader tests.
    void twoSuite;
  });
  return { filename: 'broker-stacking-plan.xlsx', omits: ['noticeMonths', 'rentSteps'], defects, bytes };
}

const csvCell = (c: string | number | null) => {
  if (c === null) return '';
  const s = String(c);
  return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
};

/** Accounting extract: CSV, abbreviated headers, Excel serial dates, units in the numbers. */
async function accountingCsv(key: KeyLease[]): Promise<SampleFile> {
  const defects: PlantedDefect[] = [
    { suite: '150', code: 'invalid_number', expected: { annualRentCents: null } },
    { suite: '240', code: 'rent_out_of_range', expected: { annualRentCents: 1_200 } },
    { suite: '320', code: 'ambiguous_date', expected: { expirationDate: null } },
    { suite: '330', code: 'unparsed_notice', expected: { noticeMonths: null } },
  ];
  const lines = [['Suite #', 'Occupant', 'RSF', 'Ann. Base Rent', 'Comm. Date', 'Lease Exp', 'Notice Mos']];
  for (const l of key) {
    const row: (string | number | null)[] = [
      l.suite,
      l.status === 'vacant' ? 'Vacant' : l.tenantName,
      l.areaSf === null ? null : `${l.areaSf.toLocaleString('en-US')} SF`,
      l.annualRentCents === null ? null : dollars(l.annualRentCents),
      l.commencementDate && serial(l.commencementDate),
      l.isMonthToMonth ? 'Holdover' : l.expirationDate && serial(l.expirationDate),
      l.noticeMonths === null ? null : `${l.noticeMonths} months`,
    ];
    if (l.suite === '150') row[3] = '(1,234.00)';
    if (l.suite === '240') row[3] = '$12.00';
    if (l.suite === '320') row[5] = 'Mar 2028';
    if (l.suite === '330') row[6] = '180 days';
    lines.push(row.map((c) => (c === null ? '' : String(c))));
  }
  const text = `${lines.map((r) => r.map(csvCell).join(',')).join('\r\n')}\r\n`;
  return { filename: 'accounting-extract.csv', omits: ['rentSteps'], defects, bytes: Buffer.from(text) };
}

export async function generateSamples(seed = 20261): Promise<{ key: KeyLease[]; files: SampleFile[] }> {
  const key = generateAnswerKey(seed);
  return {
    key,
    files: [await clean(key), await propertyManager(key), await brokerStack(key), await accountingCsv(key)],
  };
}
