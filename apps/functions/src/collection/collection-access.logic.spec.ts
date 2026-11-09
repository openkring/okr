import { describe, expect, it } from 'vitest';
import { canPayInvoice } from './collection-access.logic';

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
