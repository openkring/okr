import { describe, expect, it } from 'vitest';
import { needsPolicyAcceptance, acceptPolicyPatch } from './policy-acceptance.util';

describe('needsPolicyAcceptance', () => {
  it('is false when the tenant declares no policy version', () => {
    expect(needsPolicyAcceptance({ policyAcceptedVersion: '' }, { privacyPolicyVersion: '' })).toBe(false);
  });
  it('is true when the user never accepted anything', () => {
    expect(needsPolicyAcceptance({ policyAcceptedVersion: '' }, { privacyPolicyVersion: '2026-07' })).toBe(true);
  });
  it('is true when the user accepted an older version', () => {
    expect(needsPolicyAcceptance({ policyAcceptedVersion: '2025-01' }, { privacyPolicyVersion: '2026-07' })).toBe(true);
  });
  it('is false when versions match', () => {
    expect(needsPolicyAcceptance({ policyAcceptedVersion: '2026-07' }, { privacyPolicyVersion: '2026-07' })).toBe(false);
  });
  it('tolerates a legacy user doc with the field missing entirely', () => {
    expect(needsPolicyAcceptance({} as never, { privacyPolicyVersion: '2026-07' })).toBe(true);
  });
});

describe('acceptPolicyPatch', () => {
  it('stamps both version and timestamp', () => {
    expect(acceptPolicyPatch('2026-07', '20260728')).toEqual({
      policyAcceptedVersion: '2026-07', policyAcceptedAt: '20260728',
    });
  });
});
