import {
  answerKeyTotals,
  AS_OF,
  generateAnswerKey,
  generateSamples,
  type KeyLease,
  PROPERTY,
  type SampleFile,
} from '@rollover-desk/synthetic';
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  chooseSheet,
  type IntakeResult,
  parseRentRoll,
  type ParsedLease,
} from '../../src/domain/entities/rentRollIntake';
import { rolloverSchedule } from '../../src/domain/entities/rollover';
import { SpreadsheetReader } from '../../src/infrastructure/excel/SpreadsheetReader';

let key: KeyLease[];
let files: SampleFile[];
const results = new Map<string, IntakeResult>();

beforeAll(async () => {
  ({ key, files } = await generateSamples());
  const reader = new SpreadsheetReader();
  for (const f of files) {
    const { sheet } = chooseSheet(await reader.read(f.bytes, f.filename));
    results.set(f.filename, parseRentRoll(sheet!.rows, AS_OF));
  }
});

const project = (l: ParsedLease | KeyLease) => ({
  suite: l.suite,
  tenantName: l.tenantName,
  status: l.status,
  areaSf: l.areaSf,
  annualRentCents: l.annualRentCents,
  commencementDate: l.commencementDate,
  expirationDate: l.expirationDate,
  isMonthToMonth: l.isMonthToMonth,
  noticeMonths: l.noticeMonths,
  rentSteps: l.rentSteps,
});

describe('the clean file', () => {
  it('reproduces the answer key exactly, with no issues', () => {
    const r = results.get('clean.xlsx')!;
    expect(r.issues).toEqual([]);
    expect(r.canConfirm).toBe(true);
    expect(r.leases.map(project)).toEqual(key.map(project));
  });
  it('gives the same totals through the domain engine as the separately computed key', () => {
    const r = results.get('clean.xlsx')!;
    const totals = answerKeyTotals(key);
    const schedule = rolloverSchedule(r.leases, AS_OF);
    expect(schedule.totals).toEqual({
      leases: totals.occupiedLeases,
      areaSf: totals.leasedAreaSf,
      annualRentCents: totals.annualRentCents,
    });
  });
});

describe.each(['property-manager-export.xlsx', 'broker-stacking-plan.xlsx', 'accounting-extract.csv'])(
  '%s',
  (filename) => {
    const file = () => files.find((f) => f.filename === filename)!;
    const result = () => results.get(filename)!;

    it('finds every planted defect', () => {
      expect(file().defects.length).toBeGreaterThan(0);
      for (const d of file().defects) {
        const hit = result().issues.find(
          (i) => i.code === d.code && (d.suite === null || i.suite === d.suite),
        );
        expect(hit, `${d.code} on ${d.suite}`).toBeTruthy();
      }
    });

    it('matches the answer key on everything not deliberately changed', () => {
      const f = file();
      const parsed = result().leases;
      const seen = new Set<string>();
      for (const lease of parsed) {
        if (seen.has(lease.suite)) continue;
        seen.add(lease.suite);
        const want = key.find((k) => k.suite === lease.suite)!;
        const expected: Record<string, unknown> = { ...project(want) };
        for (const field of f.omits) expected[field] = field === 'rentSteps' ? [] : null;
        if (lease.status === 'vacant' || want.isMonthToMonth) expected.noticeMonths = null;
        Object.assign(expected, f.defects.find((d) => d.suite === lease.suite)?.expected);
        expect(project(lease), lease.suite).toEqual(expected);
      }
      expect(seen.size).toBe(key.length);
    });

    it('raises nothing beyond what was planted or flagged by design', () => {
      const planted = new Set(file().defects.map((d) => d.code));
      const byDesign = new Set([
        'low_confidence_mapping',
        'no_notice_column',
        'expired_lease',
        'date_out_of_range',
      ]);
      const unexpected = result().issues.filter(
        (i) => !planted.has(i.code) && !byDesign.has(i.code) && i.code !== 'missing_value',
      );
      expect(unexpected).toEqual([]);
      const blanks = result().issues.filter(
        (i) => i.code === 'missing_value' && !file().defects.some((d) => d.suite === i.suite),
      );
      expect(blanks.every((i) => /Notice|Tenant/.test(i.message))).toBe(true);
    });

    it('keeps blocked files from being confirmed, and accounts for rows', () => {
      const r = result();
      expect(r.canConfirm).toBe(!r.issues.some((i) => i.severity === 'blocking'));
      expect(r.leases.length).toBeGreaterThanOrEqual(key.length);
    });
  },
);

describe('committed samples', () => {
  it('match the generator, so the answer key cannot drift', () => {
    const committed = JSON.parse(
      readFileSync(new URL('../../../../data/synthetic/samples/answer-key.json', import.meta.url), 'utf8'),
    );
    expect(committed.leases).toEqual(generateAnswerKey());
    expect(committed.totals).toEqual(answerKeyTotals(key));
    expect(committed.property).toEqual(PROPERTY);
    expect(committed.asOf).toBe(AS_OF);
  });
});
