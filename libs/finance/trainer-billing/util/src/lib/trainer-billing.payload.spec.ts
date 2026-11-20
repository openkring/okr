import { describe, expect, it } from 'vitest';

import { AvatarInfo, MoneyModel, TrainerAgreementModel, TrainerProfileModel, WorkEntryModel } from '@okr/shared-models';

import {
  TRAINER_PROFILE_EDITABLE_FIELDS,
  trainerAgreementIndex,
  trainerAgreementPayload,
  trainerProfileCreatePayload,
  trainerProfileUpdateFields,
  WORK_ENTRY_WRITE_FIELDS,
  workEntryCreatePayload,
  workEntryUpdateFields,
} from './trainer-billing.util';

const PERSON = { key: 'p1', name1: 'Anna', name2: 'Jucker', modelType: 'person', type: '', subType: '', label: '' } as AvatarInfo;

function agreement(p: Partial<TrainerAgreementModel> = {}): TrainerAgreementModel {
  return {
    ...new TrainerAgreementModel('scs'), okey: 'a1', accountingTenantId: 'gss', person: PERSON, personKey: 'p1',
    services: [{
      key: 'training', name: 'Training', unit: 'hour', accountKey: '', costCenterKey: '', vatCodeKey: '', isArchived: false,
      rates: [{ validFrom: '20260801', amount: new MoneyModel(9000, 'CHF') }, { validFrom: '20260101', amount: new MoneyModel(8000, 'CHF') }],
    }],
    ...p,
  };
}

describe('trainerAgreementPayload', () => {
  it('mirrors personKey from the person, rebuilds the index and sorts the rates', () => {
    const payload = trainerAgreementPayload(agreement({ personKey: '' }));
    expect(payload.personKey).toBe('p1');
    expect(payload.index).toBe('n:Anna Jucker s:Training');
    expect(payload.services[0].rates.map(r => r.validFrom)).toEqual(['20260101', '20260801']);
  });

  it('leaves the input unchanged', () => {
    const a = agreement();
    trainerAgreementPayload(a);
    expect(a.services[0].rates[0].validFrom).toBe('20260801');
  });

  it('builds an index without a person', () => {
    expect(trainerAgreementIndex({ person: undefined, services: [] })).toBe('n: s:');
  });
});

describe('trainer profile payloads', () => {
  const stored = { ...new TrainerProfileModel('scs'), okey: 'p1', tenants: ['scs', 'kring'], nextNumber: 7, companyName: 'Jucker Sport' };

  it('never puts nextNumber or tenants into an update', () => {
    const fields = trainerProfileUpdateFields(stored);
    expect(Object.keys(fields).sort()).toEqual([...TRAINER_PROFILE_EDITABLE_FIELDS].sort());
    expect(fields).not.toHaveProperty('nextNumber');
    expect(fields).not.toHaveProperty('tenants');
    expect(fields).not.toHaveProperty('okey');
    expect(fields.companyName).toBe('Jucker Sport');
  });

  it('fills a field missing on a legacy profile with its default', () => {
    const legacy = { ...stored, showQrSlip: undefined as never };
    expect(trainerProfileUpdateFields(legacy).showQrSlip).toBe(true);
  });

  it('creates with tenants [] and nextNumber 1, whatever the model says', () => {
    const payload = trainerProfileCreatePayload(stored);
    expect(payload.tenants).toEqual([]);
    expect(payload.nextNumber).toBe(1);
    expect(payload).not.toHaveProperty('okey');
  });
});

describe('work entry payloads', () => {
  const draft = { ...new WorkEntryModel('xyz'), okey: '', tenants: ['other'], accountingTenantId: 'other', state: 'invoiced' as const,
    invoiceKey: 'x', date: '20260310', serviceKey: 'training', quantity: 1.5, label: 'Seeclub', calEventKey: 'ev1' };

  it('writes exactly the twelve allowed keys, tenants and books from the agreement, open', () => {
    const payload = workEntryCreatePayload(draft, agreement({ tenants: ['scs'] }));
    expect(Object.keys(payload).sort()).toEqual([...WORK_ENTRY_WRITE_FIELDS].sort());
    expect(payload).toMatchObject({
      tenants: ['scs'], accountingTenantId: 'gss', personKey: 'p1', agreementKey: 'a1', state: 'open', invoiceKey: '', isArchived: false,
      date: '20260310', serviceKey: 'training', quantity: 1.5, label: 'Seeclub', calEventKey: 'ev1',
    });
  });

  it('updates only the editable fields', () => {
    expect(workEntryUpdateFields({ ...draft, okey: 'w1' })).toEqual({
      date: '20260310', calEventKey: 'ev1', label: 'Seeclub', serviceKey: 'training', quantity: 1.5,
    });
  });
});
