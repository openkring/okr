import { describe, expect, it } from 'vitest';
import { CHANNEL_PRIVACY_INPUTS, CHANNEL_SENSITIVITY_FLOOR, getChannelFloor, getEffectiveAccessor, getEffectiveAccessorForAddress, isSensitiveScalarChannel, SENSITIVE_SCALAR_CHANNELS } from './privacy.model';
import { PrivacyUsage } from './enums/privacy-usage.enum';
import { getAddressDirectoryKey } from './address-directory.model';

describe('CHANNEL_SENSITIVITY_FLOOR / getChannelFloor', () => {
  it('floors the sensitive channels at privileged', () => {
    expect(CHANNEL_SENSITIVITY_FLOOR['ssn']).toBe('privileged');
    expect(CHANNEL_SENSITIVITY_FLOOR['dob']).toBe('privileged');
    expect(CHANNEL_SENSITIVITY_FLOOR['bankaccount']).toBe('privileged');
  });

  it('returns public (no floor) for non-sensitive and unknown channels', () => {
    expect(getChannelFloor('email')).toBe('public');
    expect(getChannelFloor('phone')).toBe('public');
    expect(getChannelFloor('postal')).toBe('public');
    expect(getChannelFloor('web')).toBe('public');
    expect(getChannelFloor('twint')).toBe('public');
    expect(getChannelFloor('some-future-channel')).toBe('public');
  });
});

describe('SENSITIVE_SCALAR_CHANNELS / isSensitiveScalarChannel', () => {
  it('flags ssn and dob as sensitive scalar (non-contact) channels', () => {
    expect(SENSITIVE_SCALAR_CHANNELS).toEqual(['ssn', 'dob']);
    expect(isSensitiveScalarChannel('ssn')).toBe(true);
    expect(isSensitiveScalarChannel('dob')).toBe(true);
  });
  it('treats real contact channels (incl. bankaccount) as not sensitive-scalar', () => {
    expect(isSensitiveScalarChannel('email')).toBe(false);
    expect(isSensitiveScalarChannel('phone')).toBe(false);
    expect(isSensitiveScalarChannel('postal')).toBe(false);
    expect(isSensitiveScalarChannel('bankaccount')).toBe(false);
  });
});

describe('getEffectiveAccessor (spec 1.19 §A3: stricterAccessor(channelFloor, preference, tenantFloor))', () => {
  // -------- person preference decides on non-sensitive channels --------
  it('person Public email -> public', () => {
    expect(getEffectiveAccessor('email', 'person', PrivacyUsage.Public)).toBe('public');
  });
  it('person Restricted email -> registered', () => {
    expect(getEffectiveAccessor('email', 'person', PrivacyUsage.Restricted)).toBe('registered');
  });
  it('person Protected phone -> privileged', () => {
    expect(getEffectiveAccessor('phone', 'person', PrivacyUsage.Protected)).toBe('privileged');
  });

  // -------- legacy person docs: missing usage* coalesces to Restricted --------
  it('person with undefined preference -> registered (Restricted default, privacy-safe)', () => {
    expect(getEffectiveAccessor('email', 'person', undefined)).toBe('registered');
  });

  // -------- channel floor can never be lowered --------
  it('person Public dob is still privileged (floor wins)', () => {
    expect(getEffectiveAccessor('dob', 'person', PrivacyUsage.Public)).toBe('privileged');
  });
  it('person ssn is privileged regardless of preference', () => {
    expect(getEffectiveAccessor('ssn', 'person', PrivacyUsage.Public)).toBe('privileged');
    expect(getEffectiveAccessor('ssn', 'person', undefined)).toBe('privileged');
  });

  // -------- org: no person preference, contact data intentionally public --------
  it('org email -> public (publicApi org card)', () => {
    expect(getEffectiveAccessor('email', 'org')).toBe('public');
  });
  it('org bankaccount -> privileged (floor wins)', () => {
    expect(getEffectiveAccessor('bankaccount', 'org')).toBe('privileged');
  });

  // -------- tenant floor composes, strictest wins --------
  it('tenant floor privileged beats person Public', () => {
    expect(getEffectiveAccessor('email', 'person', PrivacyUsage.Public, 'privileged')).toBe('privileged');
  });
  it('tenant floor registered beats org public', () => {
    expect(getEffectiveAccessor('email', 'org', undefined, 'registered')).toBe('registered');
  });
  it('tenant floor public does not loosen person Protected', () => {
    expect(getEffectiveAccessor('email', 'person', PrivacyUsage.Protected, 'public')).toBe('privileged');
  });
  it('admin tenant floor is the strictest possible outcome', () => {
    expect(getEffectiveAccessor('email', 'person', PrivacyUsage.Public, 'admin')).toBe('admin');
  });
});

describe('getEffectiveAccessorForAddress (spec 1.19 Phase 4: channel → usage*/tenant-floor mapping)', () => {
  it('maps every mapped channel to its usage flag and tenant floor', () => {
    expect(CHANNEL_PRIVACY_INPUTS['email']).toEqual({ usageFlag: 'usageEmail', tenantFloor: 'showEmail' });
    expect(CHANNEL_PRIVACY_INPUTS['phone']).toEqual({ usageFlag: 'usagePhone', tenantFloor: 'showPhone' });
    expect(CHANNEL_PRIVACY_INPUTS['postal']).toEqual({ usageFlag: 'usagePostalAddress', tenantFloor: 'showPostalAddress' });
    expect(CHANNEL_PRIVACY_INPUTS['dob']).toEqual({ usageFlag: 'usageDateOfBirth', tenantFloor: 'showDateOfBirth' });
    expect(CHANNEL_PRIVACY_INPUTS['ssn']).toEqual({ tenantFloor: 'showTaxId' });
    expect(CHANNEL_PRIVACY_INPUTS['bankaccount']).toEqual({ tenantFloor: 'showIban' });
    expect(CHANNEL_PRIVACY_INPUTS['web']).toBeUndefined();
  });

  it('person email with usageEmail=Public and tenant floor registered -> registered', () => {
    expect(getEffectiveAccessorForAddress(
      { addressChannel: 'email' }, 'person',
      { usageEmail: PrivacyUsage.Public },
      { showEmail: 'registered' },
    )).toBe('registered');
  });

  it('person phone with Protected preference -> privileged', () => {
    expect(getEffectiveAccessorForAddress(
      { addressChannel: 'phone' }, 'person',
      { usagePhone: PrivacyUsage.Protected }, {},
    )).toBe('privileged');
  });

  it('dob is privileged even for a Public preference (channel floor wins)', () => {
    expect(getEffectiveAccessorForAddress(
      { addressChannel: 'dob' }, 'person',
      { usageDateOfBirth: PrivacyUsage.Public }, {},
    )).toBe('privileged');
  });

  it('legacy person docs without usage* flags coalesce to Restricted -> registered', () => {
    expect(getEffectiveAccessorForAddress({ addressChannel: 'email' }, 'person', {}, {})).toBe('registered');
    expect(getEffectiveAccessorForAddress({ addressChannel: 'email' }, 'person')).toBe('registered');
  });

  it('web has no usage flag and no tenant floor: person -> registered (Restricted default)', () => {
    expect(getEffectiveAccessorForAddress({ addressChannel: 'web' }, 'person')).toBe('registered');
  });

  it('org contact channels are public', () => {
    expect(getEffectiveAccessorForAddress({ addressChannel: 'email' }, 'org')).toBe('public');
    expect(getEffectiveAccessorForAddress({ addressChannel: 'web' }, 'org')).toBe('public');
  });

  it('org bankaccount stays privileged (floor wins)', () => {
    expect(getEffectiveAccessorForAddress({ addressChannel: 'bankaccount' }, 'org')).toBe('privileged');
  });

  it('tenant floor from AppConfig-shaped settings composes (showPhone privileged beats Public)', () => {
    expect(getEffectiveAccessorForAddress(
      { addressChannel: 'phone' }, 'person',
      { usagePhone: PrivacyUsage.Public },
      { showPhone: 'privileged' },
    )).toBe('privileged');
  });
});

describe('getAddressDirectoryKey', () => {
  it('builds the deterministic per-tenant projection doc id', () => {
    expect(getAddressDirectoryKey('scs', 'person.abc123')).toBe('scs_person.abc123');
    expect(getAddressDirectoryKey('p13', 'org.xyz')).toBe('p13_org.xyz');
  });
});
