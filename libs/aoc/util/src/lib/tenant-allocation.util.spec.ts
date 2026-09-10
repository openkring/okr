import { describe, expect, it } from 'vitest';
import { AddressModel } from '@okr/shared-models';

import {
  buildEmailOptions, eligibleAddresses, eligibleLoginEmails, groupAddressesForConsent, isDropAllowed, resolveLoginEmail,
  splitTenants, SENSITIVE_ALLOCATION_CHANNELS,
} from './tenant-allocation.util';

const cfg = new Map([
  ['scs', { appName: 'Seeclub Stäfa' }],
  ['gss', { appName: 'Gönnerverein' }],
  ['p13', {}],
]);

function address(okey: string, channel: string, over: Partial<AddressModel> = {}): AddressModel {
  return { ...new AddressModel('scs'), okey, addressChannel: channel, ...over } as AddressModel;
}

describe('splitTenants', () => {
  it('puts the person tenants left and everything else right', () => {
    const { current, available } = splitTenants(['scs', 'gss'], ['scs', 'gss', 'p13'], 'scs', cfg);
    expect(current.map(t => t.tenantId)).toEqual(['scs', 'gss']);
    expect(available.map(t => t.tenantId)).toEqual(['p13']);
  });

  it('sorts the own tenant first and marks it undraggable (D-TA-4)', () => {
    const { current } = splitTenants(['gss', 'scs'], ['scs', 'gss'], 'scs', cfg);
    expect(current[0].tenantId).toBe('scs');
    expect(current[0].isCurrent).toBe(true);
    expect(current[0].draggable).toBe(false);
    expect(current[1].draggable).toBe(true);
  });

  it('falls back to the tenantId when the config has no appName', () => {
    const { available } = splitTenants(['scs'], ['scs', 'p13'], 'scs', cfg);
    expect(available[0].label).toBe('p13');
  });

  it('ignores a person tenant that has no app-config document', () => {
    const { current } = splitTenants(['scs', 'ghost'], ['scs'], 'scs', cfg);
    expect(current.map(t => t.tenantId)).toEqual(['scs', 'ghost']);
    expect(current[1].label).toBe('ghost');
  });
});

describe('groupAddressesForConsent', () => {
  it('splits by SENSITIVE_ALLOCATION_CHANNELS, not by the privacy floor', () => {
    const groups = groupAddressesForConsent([
      address('a1', 'email', { email: 'a@b.ch', isFavorite: true }),
      address('a2', 'dob', { dob: '19850101' }),
      address('a3', 'bankaccount', { iban: 'CH00' }),
    ]);
    expect(groups.contact.map(i => i.okey)).toEqual(['a1']);
    expect(groups.sensitive.map(i => i.okey)).toEqual(['a2', 'a3']);
  });

  it('keeps dob sensitive even though its floor is registered (D-P4-8)', () => {
    expect(SENSITIVE_ALLOCATION_CHANNELS).toContain('dob');
    const groups = groupAddressesForConsent([address('a2', 'dob', { dob: '19850101' })]);
    expect(groups.contact).toHaveLength(0);
  });

  it('drops archived addresses', () => {
    const groups = groupAddressesForConsent([address('a1', 'email', { isArchived: true })]);
    expect(groups.contact).toHaveLength(0);
    expect(groups.sensitive).toHaveLength(0);
  });

  it('marks the favourite address', () => {
    const groups = groupAddressesForConsent([address('a1', 'email', { isFavorite: true })]);
    expect(groups.contact[0].isFavorite).toBe(true);
  });
});

describe('isDropAllowed', () => {
  const own = { tenantId: 'scs', label: 'Seeclub', logoUrl: '', isCurrent: true, draggable: false };
  const other = { tenantId: 'gss', label: 'Gönnerverein', logoUrl: '', isCurrent: false, draggable: true };

  it('refuses to move the own tenant out (D-TA-4)', () => {
    expect(isDropAllowed(own, 'revoke')).toBe(false);
  });

  it('allows revoking another tenant', () => {
    expect(isDropAllowed(other, 'revoke')).toBe(true);
  });

  it('allows granting', () => {
    expect(isDropAllowed(other, 'grant')).toBe(true);
  });
});

describe('buildEmailOptions', () => {
  const mail = (okey: string, email: string, over: Partial<AddressModel> = {}) =>
    address(okey, 'email', { email, ...over });

  it('keeps only live email addresses', () => {
    const options = buildEmailOptions([
      mail('a', 'a@x.ch'),
      address('p', 'phone', { phone: '079' }),
      mail('b', 'b@x.ch', { isArchived: true }),
      mail('c', '   '),
    ], []);
    expect(options.map(o => o.okey)).toEqual(['a']);
  });

  it('sorts the favorite first, then alphabetically', () => {
    const options = buildEmailOptions([
      mail('a', 'zeta@x.ch'),
      mail('b', 'alpha@x.ch'),
      mail('c', 'fav@x.ch', { isFavorite: true }),
    ], []);
    expect(options.map(o => o.email)).toEqual(['fav@x.ch', 'alpha@x.ch', 'zeta@x.ch']);
  });

  it('marks an email that already has an account, ignoring case and padding', () => {
    const options = buildEmailOptions([mail('a', 'Eva@x.ch'), mail('b', 'b@x.ch')], ['  eva@X.CH ']);
    expect(options.find(o => o.okey === 'a')?.hasAccount).toBe(true);
    expect(options.find(o => o.okey === 'b')?.hasAccount).toBe(false);
  });
});

describe('eligibleLoginEmails', () => {
  const options = buildEmailOptions(
    [address('a', 'email', { email: 'a@x.ch' }), address('b', 'email', { email: 'b@x.ch' })],
    ['a@x.ch'],
  );

  it('offers only addresses that travel AND have no account yet', () => {
    expect(eligibleLoginEmails(['a', 'b'], options).map(o => o.email)).toEqual(['b@x.ch']);
  });

  it('offers nothing when no email address is selected', () => {
    expect(eligibleLoginEmails([], options)).toEqual([]);
  });

  it('offers nothing when every selected email already has an account', () => {
    expect(eligibleLoginEmails(['a'], options)).toEqual([]);
  });
});

describe('resolveLoginEmail', () => {
  const options = buildEmailOptions(
    [address('a', 'email', { email: 'a@x.ch' }), address('b', 'email', { email: 'b@x.ch' })],
    [],
  );

  it('keeps a pick that is still eligible', () => {
    expect(resolveLoginEmail('b@x.ch', options)).toBe('b@x.ch');
  });

  it('falls back to the first candidate when the pick dropped out', () => {
    expect(resolveLoginEmail('gone@x.ch', options)).toBe('a@x.ch');
  });

  it('returns empty when nothing is eligible', () => {
    expect(resolveLoginEmail('a@x.ch', [])).toBe('');
  });
});

describe('eligibleAddresses', () => {
  const carried = address('a1', 'email', { email: 'a@b.ch', tenants: ['scs', 'bka'] });
  const missing = address('a2', 'phone', { phone: '+41', tenants: ['scs'] });

  it('offers on a grant only what the target does not carry yet (top-up)', () => {
    expect(eligibleAddresses([carried, missing], 'bka', 'grant').map(a => a.okey)).toEqual(['a2']);
  });

  it('offers every address on a first grant, because the target carries none', () => {
    expect(eligibleAddresses([carried, missing], 'kring', 'grant').map(a => a.okey)).toEqual(['a1', 'a2']);
  });

  it('offers on a revoke only what the target does carry (D-TA-3)', () => {
    expect(eligibleAddresses([carried, missing], 'bka', 'revoke').map(a => a.okey)).toEqual(['a1']);
  });

  it('offers nothing when a top-up has no gap left', () => {
    expect(eligibleAddresses([carried], 'bka', 'grant')).toEqual([]);
  });
});
