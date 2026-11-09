import { describe, expect, it } from 'vitest';
import { canPayInvoice, pickReusableAttempt, type OpenAttempt } from './collection-access.logic';

const open = { receiverKey: 't1', receiverIsTenant: true, state: 'pending', openAmount: 5000 };
const admin = { tenantId: 't1', isAdmin: true, isTreasurerOfBooks: false };

describe('canPayInvoice', () => {
  it('lets the admin of the receiver tenant pay', () => expect(canPayInvoice(admin, open)).toBe('ok'));
  it('denies the admin of another tenant', () => expect(canPayInvoice({ ...admin, tenantId: 't2' }, open)).toBe('denied'));
  it('denies a non-admin of the receiver tenant', () => expect(canPayInvoice({ ...admin, isAdmin: false }, open)).toBe('denied'));
  it('lets the treasurer of the books pay', () =>
    expect(canPayInvoice({ tenantId: 'op', isAdmin: false, isTreasurerOfBooks: true }, open)).toBe('ok'));
  it.each(['paid', 'cancelled'])('is not-open for state %s', (state) => expect(canPayInvoice(admin, { ...open, state })).toBe('not-open'));
  it('is not-open when nothing is owed', () => expect(canPayInvoice(admin, { ...open, openAmount: 0 })).toBe('not-open'));
  it('denies before reporting not-open', () => expect(canPayInvoice({ ...admin, isAdmin: false }, { ...open, state: 'paid' })).toBe('denied'));
  it('refuses a receiver that is empty or not a tenant', () => {
    expect(canPayInvoice(admin, { ...open, receiverIsTenant: false })).toBe('receiver-not-a-tenant');
    expect(canPayInvoice({ tenantId: 'op', isAdmin: false, isTreasurerOfBooks: true }, { ...open, receiverKey: '' })).toBe('receiver-not-a-tenant');
  });
});

describe('pickReusableAttempt', () => {
  const att: OpenAttempt = { id: 'a1', createdBy: 'u1', offerSave: true, amount: 5000, checkoutUrl: 'https://x/1', stripeCheckoutSessionId: 'cs_1' };
  const want = { uid: 'u1', offerSave: true, amount: 5000 };
  it('reuses for the same uid, save choice and amount', () => expect(pickReusableAttempt([att], want)).toEqual({ reuse: att, stale: [] }));
  it('expires the old one when the amount changed', () => expect(pickReusableAttempt([att], { ...want, amount: 4000 })).toEqual({ reuse: undefined, stale: [att] }));
  it('does not reuse another uid\'s session', () => expect(pickReusableAttempt([att], { ...want, uid: 'u2' })).toEqual({ reuse: undefined, stale: [att] }));
  it('does not reuse when the save choice differs', () => expect(pickReusableAttempt([att], { ...want, offerSave: false }).reuse).toBeUndefined());
  it('does not reuse an attempt without a url', () => expect(pickReusableAttempt([{ ...att, checkoutUrl: '' }], want).reuse).toBeUndefined());
});
