import { describe, it, expect, beforeEach } from 'vitest';
import { PersonModel, PrivacyUsage } from '@bk2/shared-models';

import { mirrorPrivacyUsageToPerson } from './person-privacy.util';

describe('mirrorPrivacyUsageToPerson', () => {
  const tenantId = 'tenant-1';
  let person: PersonModel;

  beforeEach(() => {
    person = new PersonModel(tenantId);
  });

  it('returns the person unchanged when no source is given', () => {
    expect(mirrorPrivacyUsageToPerson(person, undefined)).toBe(person);
  });

  it('copies usage* values from the source onto a new person object', () => {
    const source = {
      usageImages: PrivacyUsage.Protected,
      usageDateOfBirth: PrivacyUsage.Public,
      usagePostalAddress: PrivacyUsage.Protected,
      usageEmail: PrivacyUsage.Public,
      usagePhone: PrivacyUsage.Protected,
      usageName: PrivacyUsage.Public,
    };
    const result = mirrorPrivacyUsageToPerson(person, source);
    expect(result).not.toBe(person); // new object
    expect(result.usageImages).toBe(PrivacyUsage.Protected);
    expect(result.usageDateOfBirth).toBe(PrivacyUsage.Public);
    expect(result.usagePostalAddress).toBe(PrivacyUsage.Protected);
    expect(result.usageEmail).toBe(PrivacyUsage.Public);
    expect(result.usagePhone).toBe(PrivacyUsage.Protected);
    expect(result.usageName).toBe(PrivacyUsage.Public);
  });

  it('keeps the person value when a source field is undefined', () => {
    person.usageEmail = PrivacyUsage.Protected;
    const result = mirrorPrivacyUsageToPerson(person, { usageName: PrivacyUsage.Public });
    expect(result.usageEmail).toBe(PrivacyUsage.Protected); // untouched
    expect(result.usageName).toBe(PrivacyUsage.Public);     // applied
  });

  it('does not mutate the original person', () => {
    const before = person.usageImages;
    mirrorPrivacyUsageToPerson(person, { usageImages: PrivacyUsage.Protected });
    expect(person.usageImages).toBe(before);
  });
});
