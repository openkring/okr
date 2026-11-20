import { describe, expect, it } from 'vitest';

import { AvatarInfo, MoneyModel, TrainerAgreementModel, TrainerProfileModel, TrainerService, WorkEntryModel } from '@okr/shared-models';

import {
  overlapsOtherAgreement,
  TRAINER_MAX_SERVICES,
  trainerAgreementValidations,
  trainerProfileValidations,
  WORK_ENTRY_LABEL_LENGTH,
  workEntryValidations,
} from './trainer-billing.validations';
import { isStoredServiceRow, renameServiceRow, serviceKeyOf, storedRateCount } from './trainer-billing.util';

const V = '@finance/trainer-billing/util.validation.';
const PERSON = { key: 'p1', name1: 'Anna', name2: 'Jucker', modelType: 'person', type: '', subType: '', label: '' } as AvatarInfo;

function service(p: Partial<TrainerService> = {}): TrainerService {
  return {
    key: 'training', name: 'Training', unit: 'hour',
    rates: [{ validFrom: '20260101', amount: new MoneyModel(8000, 'CHF') }],
    accountKey: 'acc1', costCenterKey: '', vatCodeKey: '', isArchived: false, ...p,
  };
}

function agreement(p: Partial<TrainerAgreementModel> = {}): TrainerAgreementModel {
  return {
    ...new TrainerAgreementModel('scs'),
    okey: 'a1', accountingTenantId: 'scs', person: PERSON, personKey: 'p1',
    validFrom: '20260101', validTo: '', selfEmployedConfirmed: true, services: [service()], ...p,
  };
}

const NO_CONTEXT = { defaultAccountKey: '', otherAgreements: [] };

describe('trainerAgreementValidations', () => {
  it('accepts a complete agreement', () => {
    expect(trainerAgreementValidations(agreement(), NO_CONTEXT).isValid()).toBe(true);
  });

  it('requires the person', () => {
    const result = trainerAgreementValidations(agreement({ personKey: '', person: undefined }), NO_CONTEXT);
    expect(result.getErrors('personKey')).toContain(V + 'personRequired');
  });

  it('requires validFrom', () => {
    expect(trainerAgreementValidations(agreement({ validFrom: '' }), NO_CONTEXT).hasErrors('validFrom')).toBe(true);
  });

  it('accepts an open end and an end on the start day, rejects an end before the start', () => {
    expect(trainerAgreementValidations(agreement({ validTo: '' }), NO_CONTEXT).isValid()).toBe(true);
    expect(trainerAgreementValidations(agreement({ validTo: '20260101' }), NO_CONTEXT).isValid()).toBe(true);
    const result = trainerAgreementValidations(agreement({ validTo: '20251231' }), NO_CONTEXT);
    expect(result.getErrors('validTo')).toContain(V + 'validToBeforeFrom');
  });

  it('requires at least one service and at most ten (R4)', () => {
    expect(trainerAgreementValidations(agreement({ services: [] }), NO_CONTEXT).getErrors('services')).toContain(V + 'serviceRequired');
    const eleven = Array.from({ length: TRAINER_MAX_SERVICES + 1 }, (_, i) => service({ key: `s${i}`, name: `S${i}` }));
    expect(trainerAgreementValidations(agreement({ services: eleven }), NO_CONTEXT).getErrors('services')).toContain(V + 'tooManyServices');
    const ten = eleven.slice(0, TRAINER_MAX_SERVICES);
    expect(trainerAgreementValidations(agreement({ services: ten }), NO_CONTEXT).isValid()).toBe(true);
  });

  it('requires a name per service', () => {
    expect(trainerAgreementValidations(agreement({ services: [service({ name: '' })] }), NO_CONTEXT).hasErrors('services[0].name')).toBe(true);
  });

  it('requires a unique key per service', () => {
    const result = trainerAgreementValidations(agreement({ services: [service(), service({ name: 'Training 2' })] }), NO_CONTEXT);
    expect(result.getErrors('services[1].key')).toContain(V + 'serviceKeyDuplicate');
    expect(trainerAgreementValidations(agreement({ services: [service({ key: '' })] }), NO_CONTEXT).getErrors('services[0].key'))
      .toContain(V + 'serviceKeyRequired');
  });

  it('requires at least one rate above zero, each with a date, no two on one day', () => {
    const none = trainerAgreementValidations(agreement({ services: [service({ rates: [] })] }), NO_CONTEXT);
    expect(none.getErrors('services[0].rates')).toContain(V + 'rateRequired');
    const zero = trainerAgreementValidations(agreement({ services: [service({ rates: [{ validFrom: '20260101', amount: new MoneyModel(0, 'CHF') }] })] }), NO_CONTEXT);
    expect(zero.getErrors('services[0].rates')).toContain(V + 'rateAmountInvalid');
    const noDate = trainerAgreementValidations(agreement({ services: [service({ rates: [{ validFrom: '', amount: new MoneyModel(8000, 'CHF') }] })] }), NO_CONTEXT);
    expect(noDate.getErrors('services[0].rates')).toContain(V + 'rateDateInvalid');
    const twice = trainerAgreementValidations(agreement({ services: [service({ rates: [
      { validFrom: '20260101', amount: new MoneyModel(8000, 'CHF') }, { validFrom: '20260101', amount: new MoneyModel(9000, 'CHF') },
    ] })] }), NO_CONTEXT);
    expect(twice.getErrors('services[0].rates')).toContain(V + 'rateDateDuplicate');
  });

  it('accepts a rate history with a later rate', () => {
    const history = service({ rates: [
      { validFrom: '20260101', amount: new MoneyModel(8000, 'CHF') }, { validFrom: '20260801', amount: new MoneyModel(9000, 'CHF') },
    ] });
    expect(trainerAgreementValidations(agreement({ services: [history] }), NO_CONTEXT).isValid()).toBe(true);
  });

  it('requires an account per service unless the books have a default', () => {
    const noAccount = agreement({ services: [service({ accountKey: '' })] });
    expect(trainerAgreementValidations(noAccount, NO_CONTEXT).getErrors('services[0].accountKey')).toContain(V + 'accountRequired');
    expect(trainerAgreementValidations(noAccount, { defaultAccountKey: 'comp', otherAgreements: [] }).isValid()).toBe(true);
  });

  it('rejects an overlap with another agreement of the person in the same books', () => {
    const other = agreement({ okey: 'a2', validFrom: '20250101', validTo: '20260630' });
    const result = trainerAgreementValidations(agreement(), { defaultAccountKey: '', otherAgreements: [other] });
    expect(result.getErrors('validFrom')).toContain(V + 'agreementOverlap');
  });

  it('ignores itself, archived agreements, other persons, other books and adjacent validities', () => {
    const others = [
      agreement(),                                                    // itself (same okey)
      agreement({ okey: 'a2', isArchived: true }),
      agreement({ okey: 'a3', personKey: 'p2' }),
      agreement({ okey: 'a4', accountingTenantId: 'gss' }),
      agreement({ okey: 'a5', validFrom: '20250101', validTo: '20251231' }),
    ];
    expect(trainerAgreementValidations(agreement(), { defaultAccountKey: '', otherAgreements: others }).isValid()).toBe(true);
  });
});

describe('overlapsOtherAgreement', () => {
  it('treats an open end as open', () => {
    const open = agreement({ okey: 'a2', validFrom: '20200101', validTo: '' });
    expect(overlapsOtherAgreement(agreement({ validFrom: '20300101' }), [open])).toBe(true);
  });
  it('is false without a person', () => {
    expect(overlapsOtherAgreement(agreement({ personKey: '' }), [agreement({ okey: 'a2', personKey: '' })])).toBe(false);
  });
});

describe('serviceKeyOf', () => {
  it('derives a stable key from the name', () => {
    expect(serviceKeyOf('Regattabetreuung')).toBe('regattabetreuung');
    expect(serviceKeyOf(' Training Ü30 ')).toBe('training-ue30');
    expect(serviceKeyOf('Kurs (Jugend) – Leitung')).toBe('kurs-jugend-leitung');
    expect(serviceKeyOf('Élan')).toBe('elan');
    expect(serviceKeyOf('')).toBe('');
  });
});

function profile(p: Partial<TrainerProfileModel> = {}): TrainerProfileModel {
  return { ...new TrainerProfileModel('scs'), okey: 'p1', postalAddressKey: 'ad1', bankAddressKey: 'ad2', ...p };
}

describe('trainerProfileValidations', () => {
  it('accepts a complete profile', () => {
    expect(trainerProfileValidations(profile()).isValid()).toBe(true);
  });

  it('requires {mm} or {n} in the number template', () => {
    expect(trainerProfileValidations(profile({ numberTemplate: '{yy}{mm}' })).isValid()).toBe(true);
    expect(trainerProfileValidations(profile({ numberTemplate: 'TR-{n}' })).isValid()).toBe(true);
    expect(trainerProfileValidations(profile({ numberTemplate: '{yyyy}' })).getErrors('numberTemplate')).toContain(V + 'templateNeedsVariable');
    expect(trainerProfileValidations(profile({ numberTemplate: '' })).hasErrors('numberTemplate')).toBe(true);
  });

  it('accepts a payment term of 0 to 120 days', () => {
    expect(trainerProfileValidations(profile({ paymentTermDays: 0 })).isValid()).toBe(true);
    expect(trainerProfileValidations(profile({ paymentTermDays: 120 })).isValid()).toBe(true);
    for (const days of [-1, 121, 10.5]) {
      expect(trainerProfileValidations(profile({ paymentTermDays: days })).getErrors('paymentTermDays')).toContain(V + 'paymentTermInvalid');
    }
  });

  it('requires the VAT number only when VAT-registered', () => {
    expect(trainerProfileValidations(profile({ vatRegistered: false, vatNumber: '' })).isValid()).toBe(true);
    expect(trainerProfileValidations(profile({ vatRegistered: true, vatNumber: '' })).hasErrors('vatNumber')).toBe(true);
    expect(trainerProfileValidations(profile({ vatRegistered: true, vatNumber: 'CHE-123.456.789 MWST' })).isValid()).toBe(true);
  });

  it('requires a bank and a postal address', () => {
    expect(trainerProfileValidations(profile({ bankAddressKey: '' })).hasErrors('bankAddressKey')).toBe(true);
    expect(trainerProfileValidations(profile({ postalAddressKey: '' })).hasErrors('postalAddressKey')).toBe(true);
  });

  it('accepts a legacy profile without optional texts', () => {
    expect(trainerProfileValidations(profile({ vatNote: undefined as never, closingText: undefined as never })).isValid()).toBe(true);
  });
});

function entry(p: Partial<WorkEntryModel> = {}): WorkEntryModel {
  return { ...new WorkEntryModel('scs'), okey: 'w1', agreementKey: 'a1', personKey: 'p1', date: '20260310', serviceKey: 'training', quantity: 1.5, ...p };
}

const SERVICES = [service(), service({ key: 'regatta', name: 'Regatta', unit: 'day' }), service({ key: 'old', name: 'Alt', isArchived: true })];

describe('workEntryValidations', () => {
  it('accepts a complete entry', () => {
    expect(workEntryValidations(entry(), SERVICES).isValid()).toBe(true);
  });

  it('keeps the date within the days of its event', () => {
    const range = { from: '20260309', to: '20260311' };
    expect(workEntryValidations(entry({ date: '20260309' }), SERVICES, range).isValid()).toBe(true);
    expect(workEntryValidations(entry({ date: '20260311' }), SERVICES, range).isValid()).toBe(true);
    expect(workEntryValidations(entry({ date: '20260308' }), SERVICES, range).getErrors('date')).toContain(V + 'dateOutsideEvent');
    expect(workEntryValidations(entry({ date: '20260312' }), SERVICES, range).getErrors('date')).toContain(V + 'dateOutsideEvent');
    expect(workEntryValidations(entry({ date: '20260401' }), SERVICES).isValid()).toBe(true);   // no event: any day
  });

  it('requires date and service', () => {
    expect(workEntryValidations(entry({ date: '' }), SERVICES).hasErrors('date')).toBe(true);
    expect(workEntryValidations(entry({ serviceKey: '' }), SERVICES).hasErrors('serviceKey')).toBe(true);
  });

  it('rejects an archived or unknown service', () => {
    expect(workEntryValidations(entry({ serviceKey: 'old' }), SERVICES).getErrors('serviceKey')).toContain(V + 'serviceUnavailable');
    expect(workEntryValidations(entry({ serviceKey: 'nope' }), SERVICES).getErrors('serviceKey')).toContain(V + 'serviceUnavailable');
  });

  it('requires a positive quantity', () => {
    for (const quantity of [0, -1, Number.NaN]) {
      expect(workEntryValidations(entry({ quantity }), SERVICES).getErrors('quantity')).toContain(V + 'quantityPositive');
    }
  });

  it('caps hours at 24 and days at 1 per entry', () => {
    expect(workEntryValidations(entry({ quantity: 24 }), SERVICES).isValid()).toBe(true);
    expect(workEntryValidations(entry({ quantity: 24.25 }), SERVICES).getErrors('quantity')).toContain(V + 'quantityMaxHours');
    expect(workEntryValidations(entry({ serviceKey: 'regatta', quantity: 1 }), SERVICES).isValid()).toBe(true);
    expect(workEntryValidations(entry({ serviceKey: 'regatta', quantity: 1.5 }), SERVICES).getErrors('quantity')).toContain(V + 'quantityMaxDay');
  });

  it('takes hours in quarter hours and days in half days', () => {
    expect(workEntryValidations(entry({ quantity: 1.75 }), SERVICES).isValid()).toBe(true);
    expect(workEntryValidations(entry({ quantity: 1.1 }), SERVICES).getErrors('quantity')).toContain(V + 'quantityStepHours');
    expect(workEntryValidations(entry({ serviceKey: 'regatta', quantity: 0.5 }), SERVICES).isValid()).toBe(true);
    expect(workEntryValidations(entry({ serviceKey: 'regatta', quantity: 0.25 }), SERVICES).getErrors('quantity')).toContain(V + 'quantityStepDay');
  });

  it('applies the hour limits when the agreement and its services are not known', () => {
    expect(workEntryValidations(entry({ quantity: 8 })).isValid()).toBe(true);
    expect(workEntryValidations(entry({ quantity: 30 })).getErrors('quantity')).toContain(V + 'quantityMaxHours');
    expect(workEntryValidations(entry({ quantity: 1.1 })).getErrors('quantity')).toContain(V + 'quantityStepHours');
    expect(workEntryValidations(entry({ serviceKey: 'nope', quantity: 30 }), SERVICES).getErrors('quantity')).toContain(V + 'quantityMaxHours');
  });

  it('caps the label at 200 characters', () => {
    expect(workEntryValidations(entry({ label: 'x'.repeat(WORK_ENTRY_LABEL_LENGTH) }), SERVICES).isValid()).toBe(true);
    expect(workEntryValidations(entry({ label: 'x'.repeat(WORK_ENTRY_LABEL_LENGTH + 1) }), SERVICES).hasErrors('label')).toBe(true);
  });
});

describe('agreement editor rows', () => {
  const stored = [service()];   // stored 'Training', key 'training'

  it('identifies stored rows by position, not by key', () => {
    expect(isStoredServiceRow(0, 1)).toBe(true);
    expect(isStoredServiceRow(1, 1)).toBe(false);
  });

  it('keeps a new row new when its name passes through a stored key', () => {
    let rows = [...stored, service({ key: '', name: '', rates: [] })];
    for (const name of ['T', 'Training', 'Training Ü30']) rows = renameServiceRow(rows, 1, name, stored.length);
    expect(rows[1].key).toBe('training-ue30');
    expect(isStoredServiceRow(1, stored.length)).toBe(false);
    expect(storedRateCount(1, stored)).toBe(0);
    expect(rows[0]).toBe(stored[0]);
  });

  it('keeps the key of a stored row on rename', () => {
    const rows = renameServiceRow(stored, 0, 'Training Jugend', stored.length);
    expect(rows[0]).toMatchObject({ key: 'training', name: 'Training Jugend' });
  });

  it('counts the stored rates of a stored row only', () => {
    expect(storedRateCount(0, stored)).toBe(1);
    expect(storedRateCount(3, stored)).toBe(0);
  });
});
