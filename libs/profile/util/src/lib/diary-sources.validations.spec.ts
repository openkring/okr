import { describe, expect, it } from 'vitest';
import type { DiarySourceModel } from '@okr/shared-models';
import { diarySourcesValidations } from './diary-sources.validations';

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
