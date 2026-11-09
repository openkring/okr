import { describe, expect, it, vi } from 'vitest';
import { canPayInvoice, pickReusableAttempt, stripeCustomerEmail, type OpenAttempt } from './collection-access.logic';

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
  const att: OpenAttempt = { id: 'a1', state: 'open', createdBy: 'u1', offerSave: true, amount: 5000, checkoutUrl: 'https://x/1', stripeCheckoutSessionId: 'cs_1' };
  const want = { uid: 'u1', offerSave: true, amount: 5000 };
  it('reuses for the same uid, save choice and amount', () => expect(pickReusableAttempt([att], want)).toEqual({ reuse: att, stale: [] }));
  it('expires the old one when the amount changed', () => expect(pickReusableAttempt([att], { ...want, amount: 4000 })).toEqual({ reuse: undefined, stale: [att] }));
  it('does not reuse another uid\'s session', () => expect(pickReusableAttempt([att], { ...want, uid: 'u2' })).toEqual({ reuse: undefined, stale: [att] }));
  it('does not reuse when the save choice differs', () => expect(pickReusableAttempt([att], { ...want, offerSave: false }).reuse).toBeUndefined());
  it('does not reuse an attempt without a url', () => expect(pickReusableAttempt([{ ...att, checkoutUrl: '' }], want).reuse).toBeUndefined());
  it('never reuses a failed attempt, but expires its still-live Checkout session', () => {
    const failed = { ...att, id: 'f1', state: 'failed' };
    expect(pickReusableAttempt([failed], want)).toEqual({ reuse: undefined, stale: [failed] });
  });
  it('reuses the open one and expires a failed one beside it', () => {
    const failed = { ...att, id: 'f1', state: 'failed', stripeCheckoutSessionId: 'cs_f' };
    expect(pickReusableAttempt([failed, att], want)).toEqual({ reuse: att, stale: [failed] });
  });
  it('leaves a failed attempt without a Checkout session alone', () => {
    expect(pickReusableAttempt([{ ...att, state: 'failed', stripeCheckoutSessionId: '' }], want)).toEqual({ reuse: undefined, stale: [] });
  });
});

describe('stripeCustomerEmail', () => {
  const callerEmail = () => vi.fn(async () => 'caller@x.ch');
  it('an existing customer gets billingEmail, never the caller\'s address', async () => {
    const read = callerEmail();
    expect(await stripeCustomerEmail({ existingId: 'cus_1', billingEmail: 'bill@x.ch', callerIsReceiverAdmin: true, callerEmail: read })).toBe('bill@x.ch');
    expect(await stripeCustomerEmail({ existingId: 'cus_1', billingEmail: '', callerIsReceiverAdmin: true, callerEmail: read })).toBe('');
    expect(read).not.toHaveBeenCalled();
  });
  it('a new customer gets billingEmail first', async () => {
    expect(await stripeCustomerEmail({ existingId: '', billingEmail: 'bill@x.ch', callerIsReceiverAdmin: false, callerEmail: callerEmail() })).toBe('bill@x.ch');
  });
  it('a new customer gets the caller\'s address only from an admin of that tenant', async () => {
    expect(await stripeCustomerEmail({ existingId: '', billingEmail: '', callerIsReceiverAdmin: true, callerEmail: callerEmail() })).toBe('caller@x.ch');
    const read = callerEmail();
    expect(await stripeCustomerEmail({ existingId: '', billingEmail: '', callerIsReceiverAdmin: false, callerEmail: read })).toBe('');
    expect(read).not.toHaveBeenCalled();
  });
});
