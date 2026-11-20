import { CalEventModel, TrainerAgreementModel, TrainerService, WorkEntryModel } from '@okr/shared-models';
import { describe, expect, it } from 'vitest';

import { canRecordWork, eventDateRange, lastServiceKeyOf, recordableAgreements, workEntryForEvent } from './trainer-billing-event.util';

function svc(patch: Partial<TrainerService> = {}): TrainerService {
  return { key: 'training', name: 'Training', unit: 'hour', rates: [], accountKey: '', costCenterKey: '', vatCodeKey: '', isArchived: false, ...patch };
}

function agreement(patch: Partial<TrainerAgreementModel> = {}): TrainerAgreementModel {
  const a = new TrainerAgreementModel('scs');
  a.okey = 'agr1';
  a.tenants = ['scs'];
  a.accountingTenantId = 'gss';
  a.personKey = 'p1';
  a.validFrom = '20260101';
  a.validTo = '';
  a.selfEmployedConfirmed = true;
  a.services = [svc(), svc({ key: 'regatta', name: 'Regatta', unit: 'day' })];
  return Object.assign(a, patch);
}

function event(patch: Partial<CalEventModel> = {}): CalEventModel {
  const e = new CalEventModel('scs');
  e.okey = 'ev1';
  e.tenants = ['scs'];
  e.name = 'Training Junioren';
  e.startDate = '20260310';
  e.endDate = '20260310';
  e.fullDay = false;
  e.durationMinutes = 120;
  e.locations = [];
  return Object.assign(e, patch);
}

describe('recordableAgreements / canRecordWork', () => {
  it('returns the agreement active on the event date in a tenant of the event', () => {
    expect(canRecordWork([agreement()], event())?.okey).toBe('agr1');
  });

  it('refuses an archived or unconfirmed agreement', () => {
    expect(canRecordWork([agreement({ isArchived: true })], event())).toBeUndefined();
    expect(canRecordWork([agreement({ selfEmployedConfirmed: false })], event())).toBeUndefined();
  });

  it('refuses an agreement of another tenant', () => {
    expect(canRecordWork([agreement({ tenants: ['p13'] })], event())).toBeUndefined();
  });

  it('refuses an event before validFrom or after validTo', () => {
    expect(canRecordWork([agreement({ validFrom: '20260311' })], event())).toBeUndefined();
    expect(canRecordWork([agreement({ validTo: '20260309' })], event())).toBeUndefined();
  });

  it('refuses without agreements or without an event date', () => {
    expect(canRecordWork([], event())).toBeUndefined();
    expect(canRecordWork([agreement()], event({ startDate: '' }))).toBeUndefined();
  });

  it('lists every matching agreement (several books)', () => {
    const other = agreement({ okey: 'agr2', accountingTenantId: 'scs' });
    expect(recordableAgreements([agreement(), other, agreement({ okey: 'agr3', tenants: ['p13'] })], event()).map(a => a.okey)).toEqual(['agr1', 'agr2']);
  });
});

describe('workEntryForEvent', () => {
  it('prefills a new open entry from the event and the agreement', () => {
    const e = workEntryForEvent(event({ locations: [{ key: 'l1', name1: 'Bootshaus', name2: '', modelType: 'location', type: '', subType: '', label: '' }] }), agreement(), 'training', 'p1');
    expect(e).toMatchObject({
      okey: '',
      tenants: ['scs'],
      accountingTenantId: 'gss',
      personKey: 'p1',
      agreementKey: 'agr1',
      date: '20260310',
      calEventKey: 'ev1',
      label: 'Bootshaus',
      serviceKey: 'training',
      quantity: 2,
      state: 'open',
      invoiceKey: '',
    });
  });

  it('falls back to the event name when the event has no location', () => {
    expect(workEntryForEvent(event(), agreement(), 'training', 'p1').label).toBe('Training Junioren');
  });

  it('proposes the quantity in the unit of the last used service', () => {
    const e = workEntryForEvent(event({ fullDay: true }), agreement(), 'regatta', 'p1');
    expect([e.serviceKey, e.quantity]).toEqual(['regatta', 1]);
  });

  it('takes the first live service when the last used one is unknown or archived', () => {
    const a = agreement({ services: [svc({ key: 'old', isArchived: true }), svc({ key: 'coach' })] });
    expect(workEntryForEvent(event(), a, 'old', 'p1').serviceKey).toBe('coach');
    expect(workEntryForEvent(event(), a, '', 'p1').serviceKey).toBe('coach');
  });

  it('caps the text at the label length', () => {
    expect(workEntryForEvent(event({ name: 'x'.repeat(300) }), agreement(), 'training', 'p1').label).toHaveLength(200);
  });
});

describe('lastServiceKeyOf', () => {
  const entry = (date: string, serviceKey: string, agreementKey = 'agr1'): WorkEntryModel => ({ ...new WorkEntryModel('scs'), date, serviceKey, agreementKey });

  it('returns the service of the latest entry under the agreement', () => {
    expect(lastServiceKeyOf([entry('20260305', 'regatta'), entry('20260301', 'training'), entry('20260309', 'coach', 'agr2')], 'agr1')).toBe('regatta');
  });

  it('returns an empty key without entries', () => {
    expect(lastServiceKeyOf([], 'agr1')).toBe('');
  });
});

describe('eventDateRange', () => {
  it('spans the days of a multi-day event', () => {
    expect(eventDateRange(event({ startDate: '20260310', endDate: '20260312' }))).toEqual({ from: '20260310', to: '20260312' });
  });

  it('is the start day when the end is missing or earlier', () => {
    expect(eventDateRange(event({ endDate: '' }))).toEqual({ from: '20260310', to: '20260310' });
    expect(eventDateRange(event({ endDate: '20260301' }))).toEqual({ from: '20260310', to: '20260310' });
  });
});
