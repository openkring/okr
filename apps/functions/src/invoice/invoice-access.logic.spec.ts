import { describe, expect, it } from 'vitest';
import { mayReadInvoice } from './invoice-access.logic';

describe('mayReadInvoice', () => {
  it('admits the legacy admin claim and the admin, treasurer and privileged roles', () => {
    expect(mayReadInvoice({ adminClaim: true, roles: undefined, personKey: '', receiverKey: 'p1' })).toBe(true);
    for (const role of ['admin', 'treasurer', 'privileged']) {
      expect(mayReadInvoice({ adminClaim: false, roles: { registered: true, [role]: true }, personKey: '', receiverKey: 'p1' })).toBe(true);
    }
  });
  it('admits the receiver of the invoice', () => {
    expect(mayReadInvoice({ adminClaim: false, roles: { registered: true }, personKey: 'p1', receiverKey: 'p1' })).toBe(true);
  });
  it('refuses another member, a user without a person and an invoice without a receiver', () => {
    expect(mayReadInvoice({ adminClaim: false, roles: { registered: true }, personKey: 'p2', receiverKey: 'p1' })).toBe(false);
    expect(mayReadInvoice({ adminClaim: false, roles: { registered: true }, personKey: '', receiverKey: '' })).toBe(false);
    expect(mayReadInvoice({ adminClaim: false, roles: { registered: true }, personKey: 'p1', receiverKey: '' })).toBe(false);
  });
});
