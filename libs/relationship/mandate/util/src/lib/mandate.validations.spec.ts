import { describe, expect, it } from 'vitest';

import { MandateModel } from '@okr/shared-models';

import { MANDATE_VALIDATION_KEYS as V } from './mandate-i18n';
import { mandateValidations } from './mandate.validations';

const TODAY = '20261126';

function family(patch: Partial<MandateModel> = {}): MandateModel {
  return { ...new MandateModel('scs'), kind: 'family', grantorKey: 'g1', granteeKey: 'h1', actions: ['calevent.attend'], validTo: '', ...patch };
}

function proxy(patch: Partial<MandateModel> = {}): MandateModel {
  return { ...new MandateModel('scs'), kind: 'proxy', grantorKey: 'g1', granteeKey: 'h1', actions: ['meeting.represent'], meetingKey: 'mt1', ...patch };
}

describe('mandateValidations', () => {
  it('accepts a complete family mandate and a complete proxy', () => {
    expect(mandateValidations(family(), [], TODAY).isValid()).toBe(true);
    expect(mandateValidations(proxy(), [], TODAY).isValid()).toBe(true);
  });

  it('requires a grantee', () => {
    const r = mandateValidations(family({ granteeKey: '' }), [], TODAY);
    expect(r.getErrors('grantee')).toContain(V.grantee_required);
  });

  it('refuses grantee = grantor', () => {
    const r = mandateValidations(family({ granteeKey: 'g1' }), [], TODAY);
    expect(r.getErrors('grantee')).toContain(V.grantee_is_grantor);
  });

  it('refuses a second active family mandate for the same pair', () => {
    const existing = [family({ okey: 'm1' })];
    const r = mandateValidations(family(), existing, TODAY);
    expect(r.getErrors('grantee')).toContain(V.duplicate_family);
  });

  it('does not count the mandate being edited as its own duplicate', () => {
    const existing = [family({ okey: 'm1' })];
    expect(mandateValidations(family({ okey: 'm1' }), existing, TODAY).isValid()).toBe(true);
  });

  it('ignores revoked or expired family mandates as duplicates', () => {
    const existing = [family({ okey: 'm1', revokedAt: '20261101120000' }), family({ okey: 'm2', validTo: '20261101' })];
    expect(mandateValidations(family(), existing, TODAY).isValid()).toBe(true);
  });

  it('requires an action for a family mandate', () => {
    const r = mandateValidations(family({ actions: [] }), [], TODAY);
    expect(r.getErrors('actions')).toContain(V.actions_required);
  });

  it('requires a meeting for a proxy', () => {
    const r = mandateValidations(proxy({ meetingKey: '' }), [], TODAY);
    expect(r.getErrors('meetingKey')).toContain(V.meeting_required);
  });

  it('refuses validTo before validFrom', () => {
    const r = mandateValidations(family({ validFrom: '20261201', validTo: '20261101' }), [], TODAY);
    expect(r.getErrors('validTo')).toContain(V.validTo_before_validFrom);
  });
});
