import { describe, expect, it } from 'vitest';

import { mayReadBankAccount, type BankAccountCaller } from './index';

const OWNER_KEY = 'kaiser';

function addr(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    tenants: ['scs'],
    addressChannel: 'bankaccount',
    parentKey: 'org.seeclub',
    iban: 'CH9300762011623852957',
    ...over,
  };
}

function caller(over: Partial<BankAccountCaller> = {}): BankAccountCaller {
  return { tenantId: 'scs', personKey: '', roles: {}, ...over };
}

describe('mayReadBankAccount', () => {
  it('allows a privileged member of the owning tenant', () => {
    expect(mayReadBankAccount(addr(), caller({ roles: { privileged: true } }))).toBe('allow');
  });

  it('allows admin and memberAdmin — the same tier canReadVault grants', () => {
    expect(mayReadBankAccount(addr(), caller({ roles: { admin: true } }))).toBe('allow');
    expect(mayReadBankAccount(addr(), caller({ roles: { memberAdmin: true } }))).toBe('allow');
  });

  it('allows the owner of a personal bank account without any role', () => {
    const own = addr({ parentKey: `person.${OWNER_KEY}` });
    expect(mayReadBankAccount(own, caller({ personKey: OWNER_KEY }))).toBe('allow');
  });

  it('refuses a plain member of the owning tenant', () => {
    expect(mayReadBankAccount(addr(), caller({ roles: { registered: true } }))).toBe('forbidden');
  });

  it('reports a foreign tenant as not-found, never as forbidden', () => {
    // Confirming that an okey exists in another tenant is itself a disclosure — this is
    // the leak the gate was added for (an elab admin reading an scs IBAN).
    expect(mayReadBankAccount(addr(), caller({ tenantId: 'elab', roles: { admin: true } }))).toBe('not-found');
  });

  it('refuses a document with no tenants array at all', () => {
    expect(mayReadBankAccount(addr({ tenants: undefined }), caller({ roles: { admin: true } }))).toBe('not-found');
  });

  it('refuses any channel other than bankaccount', () => {
    for (const channel of ['email', 'phone', 'postal', 'web', 'ssn', 'dob']) {
      expect(mayReadBankAccount(addr({ addressChannel: channel }), caller({ roles: { admin: true } })))
        .toBe('wrong-channel');
    }
  });

  it('does not treat an empty personKey as owning a malformed parentKey', () => {
    const orphan = addr({ parentKey: 'person.' });
    expect(mayReadBankAccount(orphan, caller({ personKey: '' }))).toBe('forbidden');
  });

  it('checks the tenant before the channel, so a foreign doc never reveals its channel', () => {
    expect(mayReadBankAccount(addr({ tenants: ['elab'], addressChannel: 'email' }), caller()))
      .toBe('not-found');
  });
});
