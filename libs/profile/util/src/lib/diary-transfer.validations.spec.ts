import { describe, expect, it } from 'vitest';
import type { DiarySourceModel } from '@okr/shared-models';
import { diarySourcesValidations, diaryTransferValidations, mergeDiaryTargets } from './diary-transfer.validations';

describe('diaryTransferValidations', () => {
  it('accepts no targets', () => expect(diaryTransferValidations([]).isValid()).toBe(true));
  it('accepts open bounds', () =>
    expect(diaryTransferValidations([{ tenantId: 'bka', sources: ['jasstafel'], from: '', to: '' }]).isValid()).toBe(true));
  it('rejects from after to on that column', () => {
    const r = diaryTransferValidations([{ tenantId: 'jp', sources: [], from: '20261020', to: '20261001' }]);
    expect(r.hasErrors('jp.period')).toBe(true);
  });
  it('accepts a single-day period', () =>
    expect(diaryTransferValidations([{ tenantId: 'jp', sources: [], from: '20261001', to: '20261001' }]).isValid()).toBe(true));
  it('accepts any tenant id length (selector value, no cap)', () =>
    expect(diaryTransferValidations([{ tenantId: 'x'.repeat(80), sources: [], from: '', to: '' }]).isValid()).toBe(true));
});

describe('mergeDiaryTargets', () => {
  it('appends an empty opt-in target for each offered diary without one', () =>
    expect(mergeDiaryTargets([], ['bka', 'jp'])).toEqual([
      { tenantId: 'bka', sources: [], from: '', to: '' },
      { tenantId: 'jp', sources: [], from: '', to: '' },
    ]));
  it('keeps stored targets and orders them like the offered diaries', () => {
    const stored = { tenantId: 'jp', sources: ['taskDone' as const], from: '20261001', to: '' };
    expect(mergeDiaryTargets([stored], ['bka', 'jp'])).toEqual([
      { tenantId: 'bka', sources: [], from: '', to: '' },
      stored,
    ]);
  });
  it('drops stored targets whose diary is no longer offered', () =>
    expect(mergeDiaryTargets([{ tenantId: 'old', sources: ['jasstafel'], from: '', to: '' }], ['bka'])).toEqual([
      { tenantId: 'bka', sources: [], from: '', to: '' },
    ]));
  it('coalesces legacy stored fields', () =>
    expect(mergeDiaryTargets([{ tenantId: 'bka' } as never], ['bka'])).toEqual([
      { tenantId: 'bka', sources: [], from: '', to: '' },
    ]));
});

describe('diarySourcesValidations', () => {
  const doc = (from: string, to: string, tenantId = 'scs'): DiarySourceModel =>
    ({ okey: 'u', tenants: ['bka'], authorKey: 'u', from, to, pulls: [{ tenantId, sources: ['taskDone'] }] });
  it('fails when von is after bis', () => expect(diarySourcesValidations(doc('20261020', '20261001')).hasErrors('period')).toBe(true));
  it('passes equal bounds', () => expect(diarySourcesValidations(doc('20261001', '20261001')).hasErrors()).toBe(false));
  it('passes empty bounds', () => expect(diarySourcesValidations(doc('', '')).hasErrors()).toBe(false));
  it('passes one open bound', () => expect(diarySourcesValidations(doc('20261001', '')).hasErrors()).toBe(false));
  it('has no length cap on a tenant id', () => expect(diarySourcesValidations(doc('', '', 'x'.repeat(200))).hasErrors()).toBe(false));
  it('passes a diary without any pull', () => {
    expect(diarySourcesValidations({ okey: 'u', tenants: ['bka'], authorKey: 'u', from: '', to: '', pulls: [] }).isValid()).toBe(true);
  });
});
