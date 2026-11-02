import { describe, expect, it } from 'vitest';

import {
  isRegasoftTestSystem,
  marksTestEmails,
  REGASOFT_TEST_EMAIL_MARK,
  REGASOFT_HOST,
  REGASOFT_PRODUCTION_BASE,
  REGASOFT_SYSTEM,
  REGASOFT_TEST_BASE,
  regasoftBaseUrl,
} from './shared';

describe('Regasoft system setting', () => {
  it('talks to the test system until the production cutover', () => {
    expect(REGASOFT_SYSTEM).toBe('test');
    expect(isRegasoftTestSystem()).toBe(true);
    expect(regasoftBaseUrl()).toBe('https://regasoft.swissrowing.ch/PortalTest');
  });

  it('names both systems on the Regasoft host', () => {
    expect(REGASOFT_HOST).toBe('https://regasoft.swissrowing.ch');
    expect(REGASOFT_TEST_BASE).toBe('https://regasoft.swissrowing.ch/PortalTest');
    expect(REGASOFT_PRODUCTION_BASE).toBe('https://regasoft.swissrowing.ch/Portal');
  });
});

describe('test-system email mark (D11)', () => {
  it('is off since PortalTest stopped marking emails on 2026-11-02', () => {
    expect(REGASOFT_TEST_EMAIL_MARK).toBe(false);
    expect(marksTestEmails()).toBe(false);
  });
});
