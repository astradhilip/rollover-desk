import { describe, expect, it } from 'vitest';
import { attentionQueue } from '../../src/domain/entities/attention';
import { renewalPipeline, validateMove } from '../../src/domain/entities/renewal';
import { lease, property } from './fixtures';

const AS_OF = '2026-01-01';
const prop = property({ loanMaturityDate: null });
const kinds = (l: Parameters<typeof attentionQueue>[0], stages = new Map()) =>
  attentionQueue(l, prop, AS_OF, new Map(), stages).map((i) => i.kind);

describe('attentionQueue', () => {
  it('flags a passed notice date only while nobody has acted', () => {
    const l = lease({ expirationDate: '2026-06-30', noticeMonths: 9 });
    expect(kinds([l])).toContain('notice_passed');
    expect(kinds([l], new Map([[l.id, 'contacted']]))).not.toContain('notice_passed');
  });
  it('flags notice at exactly 90 days, not at 91', () => {
    // 2026-04-01 is 90 days after 2026-01-01.
    expect(kinds([lease({ expirationDate: '2026-04-01', noticeMonths: 0 })])).toContain('notice_soon');
    expect(kinds([lease({ expirationDate: '2026-04-02', noticeMonths: 0 })])).not.toContain('notice_soon');
  });
  it('runs the cracks check: close to expiry with no activity', () => {
    const l = lease({ expirationDate: '2026-12-31', noticeMonths: null });
    expect(kinds([l])).toEqual(['no_renewal_activity']);
    expect(kinds([l], new Map([[l.id, 'proposal']]))).toEqual([]);
  });
  it('stays quiet about a closed outcome, and about a vacant suite', () => {
    const l = lease({ expirationDate: '2026-02-01', noticeMonths: 1 });
    expect(kinds([l], new Map([[l.id, 'renewed']]))).toEqual([]);
    expect(kinds([lease({ status: 'vacant', expirationDate: '2026-02-01' })])).toEqual([]);
  });
  it('flags expired and month-to-month', () => {
    expect(kinds([lease({ expirationDate: '2025-06-30' })])).toEqual(['expired']);
    expect(kinds([lease({ isMonthToMonth: true, expirationDate: null, noticeMonths: null })])).toEqual([
      'month_to_month',
    ]);
  });
  it('flags the largest tenant leaving before loan maturity', () => {
    const r = attentionQueue(
      [lease({ expirationDate: '2027-06-30' })],
      property(),
      AS_OF,
      new Map(),
      new Map(),
    );
    expect(r.map((i) => i.kind)).toContain('largest_tenant_expires_first');
  });
  it('surfaces a lease that could not be scored', () => {
    const l = lease({ expirationDate: '2035-01-01' });
    const r = attentionQueue(
      [l],
      prop,
      AS_OF,
      new Map([[l.id, { scored: false, reasons: ['No rent.'] }]]),
      new Map(),
    );
    expect(r[0]).toMatchObject({ kind: 'not_scored', severity: 'low' });
  });
  it('ranks by severity then urgency, with stable keys that carry the date', () => {
    const a = lease({ id: 'a', suite: 'A', expirationDate: '2026-12-31', noticeMonths: null });
    const b = lease({ id: 'b', suite: 'B', expirationDate: '2026-02-01', noticeMonths: 0 });
    const r = attentionQueue([a, b], prop, AS_OF, new Map(), new Map());
    expect(r[0]!.kind).toBe('notice_soon');
    expect(r.map((i) => i.key)).toEqual(
      attentionQueue([b, a], prop, AS_OF, new Map(), new Map()).map((i) => i.key),
    );
    const moved = attentionQueue([{ ...a, expirationDate: '2026-11-30' }], prop, AS_OF, new Map(), new Map());
    expect(moved[0]!.key).not.toBe(attentionQueue([a], prop, AS_OF, new Map(), new Map())[0]!.key);
  });
});

describe('attention wording', () => {
  it('says a near expiry once: as no activity until someone acts, then as the expiry', () => {
    const l = lease({ expirationDate: '2026-03-01', noticeMonths: null });
    expect(kinds([l])).toEqual(['no_renewal_activity']);
    expect(kinds([l], new Map([[l.id, 'contacted']]))).toEqual(['expires_soon']);
  });
});

describe('attention keys', () => {
  const key = (
    l: Parameters<typeof attentionQueue>[0][number],
    risk?: { scored: false; reasons: string[] },
  ) => attentionQueue([l], prop, AS_OF, new Map(risk ? [[l.id, risk]] : []), new Map()).at(-1)!.key;
  const mtm = { isMonthToMonth: true, expirationDate: null, noticeMonths: null };
  it('bring an item back for a new tenant in the suite', () => {
    expect(key(lease({ ...mtm, tenantName: 'A Co' }))).not.toBe(key(lease({ ...mtm, tenantName: 'B Co' })));
  });
  it('bring an item back when the data gap changes', () => {
    const l = lease({ expirationDate: '2035-01-01' });
    expect(key(l, { scored: false, reasons: ['No rent.'] })).not.toBe(
      key(l, { scored: false, reasons: ['No expiry.'] }),
    );
  });
  it('carry no readable tenant name', () => {
    expect(key(lease({ ...mtm, tenantName: 'Acme' }))).not.toMatch(/acme/i);
  });
});

describe('renewalPipeline', () => {
  it('includes near-term and month-to-month leases, and any with a deal', () => {
    const near = lease({ id: 'n', suite: 'N', tenantName: 'N', expirationDate: '2027-06-30' });
    const far = lease({ id: 'f', suite: 'F', tenantName: 'F', expirationDate: '2035-06-30' });
    const mtm = lease({ id: 'm', suite: 'M', tenantName: 'M', isMonthToMonth: true, expirationDate: null });
    expect(
      renewalPipeline([near, far, mtm], [], AS_OF)
        .map((e) => e.lease.id)
        .sort(),
    ).toEqual(['m', 'n']);
    const deal = { suite: 'F', tenantKey: 'f', stage: 'proposal' as const, vacatingReason: null, note: null };
    expect(renewalPipeline([far], [deal], AS_OF)[0]!.stage).toBe('proposal');
  });
  it("doesn't give a new tenant the old tenant's deal", () => {
    const l = lease({ suite: 'F', tenantName: 'New Tenant', expirationDate: '2027-01-01' });
    const deal = {
      suite: 'F',
      tenantKey: 'old tenant',
      stage: 'proposal' as const,
      vacatingReason: null,
      note: null,
    };
    expect(renewalPipeline([l], [deal], AS_OF)[0]!.stage).toBe('identified');
  });
});

describe('validateMove', () => {
  it('requires a reason for vacating, and a real occupied lease', () => {
    expect(validateMove(lease(), 'vacating', null)).toMatch(/why/);
    expect(validateMove(lease(), 'vacating', 'Downsizing')).toBeNull();
    expect(validateMove(undefined, 'contacted', null)).toMatch(/No such/);
    expect(validateMove(lease({ status: 'vacant' }), 'contacted', null)).toMatch(/vacant/);
    expect(validateMove(lease({ tenantName: null }), 'contacted', null)).toMatch(/tenant/);
  });
});
