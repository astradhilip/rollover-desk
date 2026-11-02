import { generateSamples } from '@rollover-desk/synthetic';
import ExcelJS from 'exceljs';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { DEMO_USERS } from '../../src/infrastructure/db/seed';
import { buildTestApp } from './harness';

const [ANALYST, VIEWER, OTHER] = DEMO_USERS;
let ctx: Awaited<ReturnType<typeof buildTestApp>>;
let auth: Record<string, { Authorization: string }>;
let pid: string;

const binary = (res: request.Response, done: (e: Error | null, body: Buffer) => void) => {
  const parts: Buffer[] = [];
  res.on('data', (c: Buffer) => parts.push(c));
  res.on('end', () => done(null, Buffer.concat(parts)));
};
const download = (who: string) =>
  request(ctx.app)
    .get(`/properties/${pid}/export`)
    .set(auth[who]!)
    .buffer(true)
    .parse(binary as never);

async function loadClean() {
  const { files } = await generateSamples();
  const clean = files.find((f) => f.filename.startsWith('clean'))!;
  const up = await request(ctx.app)
    .post(`/properties/${pid}/imports`)
    .set(auth[ANALYST!.email]!)
    .attach('file', clean.bytes, clean.filename)
    .expect(201);
  await request(ctx.app)
    .post(`/properties/${pid}/imports/${up.body.import.id}/confirm`)
    .set(auth[ANALYST!.email]!)
    .send({ acknowledgeWarnings: true })
    .expect(200);
}

beforeEach(async () => {
  ctx = await buildTestApp();
  auth = {};
  for (const u of DEMO_USERS) {
    const { body } = await request(ctx.app)
      .post('/auth/login')
      .send({ email: u.email, password: u.password })
      .expect(200);
    auth[u.email] = { Authorization: `Bearer ${body.token}` };
  }
  pid = (await request(ctx.app).get('/properties').set(auth[ANALYST!.email]!)).body.properties[0].id;
});

describe('GET /properties/:id/export', () => {
  it('sends a workbook whose totals match the API', async () => {
    await loadClean();
    const res = await download(ANALYST!.email).expect(200);
    expect(res.headers['content-type']).toContain('spreadsheetml');
    expect(res.headers['content-disposition']).toMatch(
      /^attachment; filename="rollover-desk-[a-z0-9-]+-\d{4}-\d{2}-\d{2}\.xlsx"$/,
    );
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(res.body);
    const roll = (await request(ctx.app).get(`/properties/${pid}/rollover`).set(auth[ANALYST!.email]!)).body;
    const sched = book.getWorksheet('Rollover Schedule')!;
    let total: { result?: number } | undefined;
    sched.eachRow((row) => {
      if (row.getCell(1).value === 'Total leased') total = row.getCell(4).value as { result: number };
    });
    expect(total?.result).toBeCloseTo(roll.schedule.totals.annualRentCents / 100, 2);
  });

  it("carries the confirmed roll's mapping and warnings, and follows a revert", async () => {
    const analyst = auth[ANALYST!.email]!;
    const made = await request(ctx.app)
      .post('/properties')
      .set(analyst)
      .send({ name: '=1+1 "Tower"\r\nX-Bad: 1', loanMaturityDate: null, marketRentPsfCents: null })
      .expect(201);
    pid = made.body.id ?? made.body.property.id;
    // No notice column is a warning, and the ambiguous rent column needs the analyst's mapping.
    const csv = Buffer.from('Suite,Tenant,SF,Rent,Expiration\n100,=HYPERLINK("x"),1000,2500,1/1/2030\n');
    const up = await request(ctx.app)
      .post(`/properties/${pid}/imports`)
      .set(analyst)
      .attach('file', csv, 'mapped.csv')
      .expect(201);
    const first = up.body.import.id as string;
    await request(ctx.app)
      .put(`/properties/${pid}/imports/${first}/mapping`)
      .set(analyst)
      .send({ overrides: [{ column: 3, field: 'monthlyRent' }] })
      .expect(200);
    await request(ctx.app)
      .post(`/properties/${pid}/imports/${first}/confirm`)
      .set(analyst)
      .send({ acknowledgeWarnings: true })
      .expect(200);
    await loadClean();
    const imports = (await request(ctx.app).get(`/properties/${pid}/imports`).set(analyst)).body.imports;
    const second = imports.find((i: { status: string }) => i.status === 'confirmed').id;
    await request(ctx.app).post(`/properties/${pid}/imports/${second}/revert`).set(analyst).expect(200);

    const res = await download(ANALYST!.email).expect(200);
    expect(res.headers['content-disposition']).toMatch(
      /^attachment; filename="rollover-desk-1-1-tower-x-bad-1-/,
    );
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(res.body);
    expect(book.getWorksheet('Assumptions')!.getCell('B6').value).toBe('mapped.csv');
    const roll = book.getWorksheet('Rent Roll')!;
    expect(roll.getCell('B2').value).toBe('=HYPERLINK("x")');
    expect(roll.getCell('E2').value).toBe(30_000);
    expect(roll.rowCount).toBe(2);
    const issues: unknown[] = [];
    book.getWorksheet('Data Issues')!.eachRow((row, r) => r > 1 && issues.push(row.getCell(1).value));
    expect(issues).toContain('Warning');

    await request(ctx.app).post(`/properties/${pid}/imports/${first}/revert`).set(analyst).expect(200);
    await download(ANALYST!.email).expect(400);
  });

  it('lists the issues accepted at confirm, not ones re-derived later', async () => {
    const analyst = auth[ANALYST!.email]!;
    // No notice column: a warning the analyst accepts.
    const csv = Buffer.from('Suite,Tenant,SF,Annual Rent,Expiration\n100,Acme,1000,25000,2030-01-31\n');
    const up = await request(ctx.app)
      .post(`/properties/${pid}/imports`)
      .set(analyst)
      .attach('file', csv, 'accepted.csv')
      .expect(201);
    const id = up.body.import.id as string;
    await request(ctx.app)
      .post(`/properties/${pid}/imports/${id}/confirm`)
      .set(analyst)
      .send({ acknowledgeWarnings: true })
      .expect(200);
    const issueMessages = async () => {
      const book = new ExcelJS.Workbook();
      await book.xlsx.load((await download(ANALYST!.email).expect(200)).body);
      const messages: unknown[] = [];
      book.getWorksheet('Data Issues')!.eachRow((row, r) => r > 1 && messages.push(row.getCell(3).value));
      return messages;
    };
    const accepted = await issueMessages();
    expect(
      accepted.some((m) => /notice/i.test(String(m))),
      String(accepted),
    ).toBe(true);

    // Stand in for an intake change after confirm: the stored rows now parse with no notice warning.
    const rows = [
      ['Suite', 'Tenant', 'SF', 'Annual Rent', 'Expiration', 'Notice Months'],
      ['100', 'Acme', 1000, 25000, { date: '2030-01-31' }, 6],
    ];
    await ctx.db
      .updateTable('rent_roll_imports')
      .set({ rows_json: JSON.stringify(rows) })
      .where('id', '=', id)
      .execute();
    expect(await issueMessages()).toEqual(accepted);

    // An import confirmed before findings were stored has none recorded, so they are rebuilt from its rows.
    await ctx.db
      .updateTable('rent_roll_imports')
      .set({ confirmed_issues_json: null })
      .where('id', '=', id)
      .execute();
    const rebuilt = await issueMessages();
    expect(
      rebuilt.some((m) => /notice/i.test(String(m))),
      String(rebuilt),
    ).toBe(false);
  });

  it('refuses with nothing to export', async () => {
    await download(ANALYST!.email).expect(400);
  });

  it('is for analysts, and only within their organization', async () => {
    await loadClean();
    await download(VIEWER!.email).expect(403);
    await download(OTHER!.email).expect(404);
    await request(ctx.app).get(`/properties/${pid}/export`).expect(401);
  });
});
