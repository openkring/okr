import { describe, expect, it } from 'vitest';
import { CHANNEL_SENSITIVITY_FLOOR, getChannelFloor, getEffectiveAccessor, isSensitiveScalarChannel, SENSITIVE_SCALAR_CHANNELS } from './privacy.model';
import { PrivacyUsage } from './enums/privacy-usage.enum';

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
