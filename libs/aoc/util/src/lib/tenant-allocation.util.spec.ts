import { describe, expect, it } from 'vitest';
import { AddressModel } from '@okr/shared-models';

import { groupAddressesForConsent, isDropAllowed, splitTenants, SENSITIVE_ALLOCATION_CHANNELS } from './tenant-allocation.util';

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
