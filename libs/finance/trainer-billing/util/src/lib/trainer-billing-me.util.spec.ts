import { TrainerAgreementModel, WorkEntryModel } from '@okr/shared-models';
import { describe, expect, it } from 'vitest';

import {
  agreementOfMonth, agreementsInMonth, defaultMonth, entryDefaultDate, monthOf, openEntriesOf, shiftMonth,
} from './trainer-billing-me.util';

function agreement(patch: Partial<TrainerAgreementModel> = {}): TrainerAgreementModel {
  return {
    ...new TrainerAgreementModel('scs'), okey: 'a1', personKey: 'p1', accountingTenantId: 'scs',
    validFrom: '20260101', validTo: '', selfEmployedConfirmed: true, ...patch,
  };
}

function entry(patch: Partial<WorkEntryModel> = {}): WorkEntryModel {
  return { ...new WorkEntryModel('scs'), okey: 'e1', agreementKey: 'a1', date: '20261105', state: 'open', ...patch };
}

describe('defaultMonth', () => {
  it('is the previous month before the 10th', () => {
    expect(defaultMonth('20261105')).toBe('2026-10');
    expect(defaultMonth('20261109')).toBe('2026-10');
  });
  it('is the current month from the 10th on', () => {
    expect(defaultMonth('20261110')).toBe('2026-11');
    expect(defaultMonth('20261130')).toBe('2026-11');
  });
  it('crosses the year in January', () => {
    expect(defaultMonth('20270103')).toBe('2026-12');
  });
});

describe('monthOf / shiftMonth', () => {
  it('takes the month of a StoreDate', () => {
    expect(monthOf('20261105')).toBe('2026-11');
  });
  it('moves by whole months across years', () => {
    expect(shiftMonth('2026-11', 1)).toBe('2026-12');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-03', -14)).toBe('2025-01');
  });
});

describe('agreementsInMonth', () => {
  it('keeps confirmed, live agreements whose validity touches the month', () => {
    const a = [
      agreement({ okey: 'open' }),
      agreement({ okey: 'endsMid', validTo: '20261115' }),
      agreement({ okey: 'startsMid', validFrom: '20261120' }),
      agreement({ okey: 'ended', validTo: '20261031' }),
      agreement({ okey: 'later', validFrom: '20261201' }),
      agreement({ okey: 'unconfirmed', selfEmployedConfirmed: false }),
      agreement({ okey: 'archived', isArchived: true }),
    ];
    expect(agreementsInMonth(a, '2026-11').map(x => x.okey)).toEqual(['open', 'endsMid', 'startsMid']);
  });
});

describe('agreementOfMonth', () => {
  it('picks the agreement of the books, the latest start winning', () => {
    const a = [
      agreement({ okey: 'old', validTo: '20261115' }),
      agreement({ okey: 'new', validFrom: '20261116' }),
      agreement({ okey: 'gss', accountingTenantId: 'gss' }),
    ];
    expect(agreementOfMonth(a, 'scs', '2026-11')?.okey).toBe('new');
    expect(agreementOfMonth(a, 'gss', '2026-11')?.okey).toBe('gss');
    expect(agreementOfMonth(a, 'other', '2026-11')).toBeUndefined();
  });
});

describe('openEntriesOf', () => {
  it('counts only the open entries of the agreement', () => {
    const e = [entry(), entry({ okey: 'e2', state: 'invoiced' }), entry({ okey: 'e3', agreementKey: 'a2' }), entry({ okey: 'e4' })];
    expect(openEntriesOf(e, 'a1').map(x => x.okey)).toEqual(['e1', 'e4']);
    expect(openEntriesOf(e, '')).toEqual([]);
  });
});

describe('entryDefaultDate', () => {
  it('is today inside the month, else the first day of the month', () => {
    expect(entryDefaultDate('2026-11', '20261120')).toBe('20261120');
    expect(entryDefaultDate('2026-10', '20261120')).toBe('20261001');
  });
});
