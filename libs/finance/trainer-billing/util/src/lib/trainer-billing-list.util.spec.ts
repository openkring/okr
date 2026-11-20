import { TrainerAgreementModel, TrainerInvoiceModel } from '@okr/shared-models';
import { describe, expect, it } from 'vitest';

import { rejectReasonOf, TRAINER_REJECT_REASON_MAX, trainerInvoiceActions, trainerInvoiceStateColor, trainerNameOf } from './trainer-billing-list.util';

function invoice(patch: Partial<TrainerInvoiceModel> = {}): TrainerInvoiceModel {
  return { ...new TrainerInvoiceModel('scs'), okey: 'ti-1', agreementKey: 'a1', personKey: 'p1', documentKey: 'doc1', billKey: 'ti-ti-1', state: 'sent', ...patch };
}

function agreement(patch: Partial<TrainerAgreementModel> = {}): TrainerAgreementModel {
  return {
    ...new TrainerAgreementModel('scs'), okey: 'a1', personKey: 'p1',
    person: { key: 'p1', name1: 'Anna', name2: 'Jucker', modelType: 'person', type: '', subType: '', label: '' },
    ...patch,
  };
}

describe('trainerInvoiceActions', () => {
  it('offers download, the bill, reject on a sent invoice in native books — but not «paid»', () => {
    expect(trainerInvoiceActions(invoice(), 'native')).toEqual(['download', 'toBill', 'reject']);
  });

  it('offers download, reject and «paid» on a sent invoice in bexio books — there is no bill', () => {
    expect(trainerInvoiceActions(invoice({ billKey: '' }), 'bexio')).toEqual(['download', 'reject', 'markPaid']);
  });

  it('a booked or paid invoice can only be downloaded and, in native books, its bill opened', () => {
    expect(trainerInvoiceActions(invoice({ state: 'booked' }), 'native')).toEqual(['download', 'toBill']);
    expect(trainerInvoiceActions(invoice({ state: 'paid' }), 'native')).toEqual(['download', 'toBill']);
    expect(trainerInvoiceActions(invoice({ state: 'paid', billKey: '' }), 'bexio')).toEqual(['download']);
  });

  it('a rejected invoice keeps only its PDF (its draft bill is gone)', () => {
    expect(trainerInvoiceActions(invoice({ state: 'rejected', billKey: '' }), 'native')).toEqual(['download']);
  });

  it('a missing backend counts as native (legacy config docs lack the field)', () => {
    expect(trainerInvoiceActions(invoice(), undefined)).toEqual(['download', 'toBill', 'reject']);
  });

  it('coalesces fields a raw document may lack', () => {
    const raw = { okey: 'ti-2', state: 'sent' } as unknown as TrainerInvoiceModel;
    expect(trainerInvoiceActions(raw, 'native')).toEqual(['reject']);
  });
});

describe('trainerInvoiceStateColor', () => {
  it('maps each state to an ionic color', () => {
    expect(trainerInvoiceStateColor('sent')).toBe('warning');
    expect(trainerInvoiceStateColor('booked')).toBe('primary');
    expect(trainerInvoiceStateColor('paid')).toBe('success');
    expect(trainerInvoiceStateColor('rejected')).toBe('danger');
  });
});

describe('trainerNameOf', () => {
  it('names the trainer of the invoice\'s agreement', () => {
    expect(trainerNameOf(invoice(), [agreement()])).toBe('Anna Jucker');
  });

  it('falls back to another agreement of the same person, then to ""', () => {
    expect(trainerNameOf(invoice({ agreementKey: 'gone' }), [agreement({ okey: 'a2' })])).toBe('Anna Jucker');
    expect(trainerNameOf(invoice({ agreementKey: 'gone', personKey: 'p9' }), [agreement()])).toBe('');
  });

  it('names the trainer of an archived agreement (not in the list) through the person resolver', () => {
    const names: Record<string, string> = { p1: 'Anna Jucker' };
    const resolver = (key: string): string => names[key] ?? '';
    expect(trainerNameOf(invoice({ agreementKey: 'archived' }), [], resolver)).toBe('Anna Jucker');
    expect(trainerNameOf(invoice({ agreementKey: 'archived', personKey: 'p9' }), [], resolver)).toBe('');
  });

  it('never asks the resolver for an empty personKey (anonymised invoice)', () => {
    const asked: string[] = [];
    expect(trainerNameOf(invoice({ agreementKey: 'gone', personKey: '' }), [], k => { asked.push(k); return 'X'; })).toBe('');
    expect(asked).toEqual([]);
  });

  it('never matches an anonymised agreement by its empty personKey', () => {
    const anonymised = agreement({ okey: 'a3', personKey: '', person: undefined });
    expect(trainerNameOf(invoice({ agreementKey: 'gone', personKey: '' }), [anonymised, agreement({ okey: 'a4' })])).toBe('');
  });
});

describe('rejectReasonOf', () => {
  it('trims the reason the treasurer typed', () => {
    expect(rejectReasonOf('  Stunden vom 3. fehlen  ')).toBe('Stunden vom 3. fehlen');
  });

  it('refuses an empty, blank or too long reason with "" (the callable takes 1–500 characters)', () => {
    expect(rejectReasonOf(undefined)).toBe('');
    expect(rejectReasonOf('   ')).toBe('');
    expect(rejectReasonOf('x'.repeat(TRAINER_REJECT_REASON_MAX))).toBe('x'.repeat(TRAINER_REJECT_REASON_MAX));
    expect(rejectReasonOf('x'.repeat(TRAINER_REJECT_REASON_MAX + 1))).toBe('');
  });
});
