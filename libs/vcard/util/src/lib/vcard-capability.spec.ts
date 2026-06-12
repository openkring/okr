import { describe, expect, it } from 'vitest';
import { Roles } from '@bk2/shared-models';

import { resolveVcardCapability, vcardTier } from './vcard-capability';

describe('vcardTier', () => {
  it('returns none for empty/undefined roles', () => {
    expect(vcardTier(undefined)).toBe('none');
    expect(vcardTier({})).toBe('none');
    expect(vcardTier({ anonymous: true })).toBe('none');
  });

  it('maps registered-equivalent roles to registered', () => {
    expect(vcardTier({ registered: true })).toBe('registered');
    expect(vcardTier({ contentAdmin: true })).toBe('registered');
    expect(vcardTier({ treasurer: true })).toBe('registered');
  });

  it('maps privileged to privileged', () => {
    expect(vcardTier({ privileged: true })).toBe('privileged');
  });

  it('maps memberAdmin and admin to memberAdmin (admin satisfies all)', () => {
    expect(vcardTier({ memberAdmin: true })).toBe('memberAdmin');
    expect(vcardTier({ admin: true })).toBe('memberAdmin');
  });
});

describe('resolveVcardCapability', () => {
  it('denies an anonymous caller', () => {
    const cap = resolveVcardCapability({}, 1);
    expect(cap.allowed).toBe(false);
    expect(cap.maxTargets).toBe(0);
  });

  it('tier 1 (registered): single target, favorites, no prompt', () => {
    const cap = resolveVcardCapability({ registered: true }, 1);
    expect(cap).toEqual({ allowed: true, maxTargets: 1, scope: 'favorites', promptForScope: false });
  });

  it('tier 1 rejects more than one target', () => {
    expect(resolveVcardCapability({ registered: true }, 2).allowed).toBe(false);
  });

  it('tier 2 (privileged): single target, full scope, prompt', () => {
    const cap = resolveVcardCapability({ privileged: true }, 1);
    expect(cap).toEqual({ allowed: true, maxTargets: 1, scope: 'full', promptForScope: true });
  });

  it('tier 3 (memberAdmin): up to 100 targets, full scope, prompt', () => {
    expect(resolveVcardCapability({ memberAdmin: true }, 100).allowed).toBe(true);
    expect(resolveVcardCapability({ memberAdmin: true }, 101).allowed).toBe(false);
    const cap = resolveVcardCapability({ admin: true } as Roles, 5);
    expect(cap).toEqual({ allowed: true, maxTargets: 100, scope: 'full', promptForScope: true });
  });

  it('rejects an empty selection', () => {
    expect(resolveVcardCapability({ memberAdmin: true }, 0).allowed).toBe(false);
  });
});
