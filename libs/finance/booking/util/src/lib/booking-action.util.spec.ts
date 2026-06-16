import { describe, expect, it } from 'vitest';
import { matchActions } from './booking-action.util';
import { BookingAction } from './booking-action.model';

const RECEIPT: BookingAction = {
  id: 'gss-spende-receipt',
  type: 'generateDocument',
  trigger: { accountingTenantId: 'gss', accountId: '3407' },
  templateId: 'gss-spendenbestaetigung',
  labelKey: '@finance/booking/feature.action.createReceipt',
  icon: 'document',
};
const ACTIONS = [RECEIPT];

describe('matchActions', () => {
  it('returns the action when tenant and account both match', () => {
    expect(matchActions('gss', ['1020', '3407'], ACTIONS)).toEqual([RECEIPT]);
  });
  it('returns nothing when the account is absent', () => {
    expect(matchActions('gss', ['1020', '3400'], ACTIONS)).toEqual([]);
  });
  it('returns nothing when the tenant differs', () => {
    expect(matchActions('scs', ['3407'], ACTIONS)).toEqual([]);
  });
  it('returns nothing for an empty account list', () => {
    expect(matchActions('gss', [], ACTIONS)).toEqual([]);
  });
});
