import { describe, expect, it } from 'vitest';

import { billingPeriod, chooseBand, isBillable, isIndividuallyPriced, monthlyPositions } from './monthly-invoice.logic';

const sub = (extra: Record<string, unknown> = {}) => ({ billing: 'stripe' as const, state: 'active' as const, billingStart: '20260101', lastRunPeriod: '', ...extra });

describe('billingPeriod', () => {
  it('is the month of the run date', () => {
    expect(billingPeriod('20261201')).toBe('202612');
  });
});

describe('isBillable', () => {
  it('bills an active stripe tenant', () => {
    expect(isBillable(sub(), '202612')).toBe(true);
  });
  it('bills a pastDue tenant', () => {
    expect(isBillable(sub({ state: 'pastDue' }), '202612')).toBe(true);
  });
  it('coalesces a missing state to active', () => {
    expect(isBillable(sub({ state: undefined }), '202612')).toBe(true);
  });
  it('skips exempt, closing, closed and cancelled tenants', () => {
    expect(isBillable(sub({ billing: 'exempt' }), '202612')).toBe(false);
    expect(isBillable(sub({ state: 'closing' }), '202612')).toBe(false);
    expect(isBillable(sub({ state: 'closed' }), '202612')).toBe(false);
    expect(isBillable(sub({ state: 'cancelled' }), '202612')).toBe(false);
  });
  it('skips a period that already ran', () => {
    expect(isBillable(sub({ lastRunPeriod: '202612' }), '202612')).toBe(false);
  });
  it('skips when billingStart is in the run month after the 1st', () => {
    expect(isBillable(sub({ billingStart: '20261215' }), '202612')).toBe(false);
  });
  it('bills the month after a mid-month billingStart', () => {
    expect(isBillable(sub({ billingStart: '20261215' }), '202701')).toBe(true);
  });
  it('bills when billingStart is the 1st of the run month', () => {
    expect(isBillable(sub({ billingStart: '20261201' }), '202612')).toBe(true);
  });
  it('rolls over the year boundary', () => {
    expect(isBillable(sub({ billingStart: '20261220' }), '202612')).toBe(false);
    expect(isBillable(sub({ billingStart: '20261220' }), '202701')).toBe(true);
  });
});

describe('chooseBand', () => {
  it('has nothing to hold in the first month', () => {
    expect(chooseBand(60, [])).toEqual({ band: 'KringS', history: ['KringS'] });
  });
  it('moves up immediately', () => {
    expect(chooseBand(300, ['KringM', 'KringM']).band).toBe('KringL');
  });
  it('holds the band in the first month below', () => {
    const r = chooseBand(60, ['KringM', 'KringM']);
    expect(r.band).toBe('KringM');
    expect(r.history).toEqual(['KringS', 'KringM', 'KringM']);
  });
  it('drops in the second consecutive month below', () => {
    expect(chooseBand(60, ['KringS', 'KringM', 'KringM']).band).toBe('KringS');
  });
  it('keeps at most three history entries, newest first', () => {
    expect(chooseBand(60, ['KringS', 'KringS', 'KringS']).history).toEqual(['KringS', 'KringS', 'KringS']);
  });
});

describe('isIndividuallyPriced', () => {
  it('is true from 1000 weighted users (1.32)', () => {
    expect(isIndividuallyPriced(999)).toBe(false);
    expect(isIndividuallyPriced(1000)).toBe(true);
    expect(isIndividuallyPriced(5000)).toBe(true);
  });
});

describe('monthlyPositions', () => {
  const accounts = { subscription: '6000', transaction: '6100' };
  it('lists band, options and the settled transaction cost', () => {
    const { positions, skipped } = monthlyPositions({
      period: '202612', band: 'KringM', options: ['buchhaltung', 'crm'],
      credit: [{ product: 'pingen-letter', units: 12, pages: 20, amount: 840 }], accounts,
    });
    expect(skipped).toEqual([]);
    expect(positions).toHaveLength(4);
    expect(positions[0]).toEqual({ title: 'Kring M — Dezember 2026', amount: 1900, accountKey: '6000' });
    expect(positions[1].amount).toBe(2000);
    expect(positions[2].amount).toBe(1000);
    expect(positions[3].amount).toBe(0);
    expect(positions[3].accountKey).toBe('6100');
    expect(positions[3].title).toContain('12 Briefe, 20 Seiten');
    expect(positions[3].title).toContain('CHF 8.40');
  });
  it('skips unknown options and reports them', () => {
    const { positions, skipped } = monthlyPositions({ period: '202612', band: 'KringXXS', options: ['crm', 'bogus'], credit: [], accounts });
    expect(skipped).toEqual(['bogus']);
    expect(positions).toHaveLength(2);
  });
});
