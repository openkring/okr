import { afterEach, describe, expect, it } from 'vitest';

import { isRegasoftTestSystem, REGASOFT_HOST, regasoftBaseUrl } from './shared';

const saved = process.env['REGASOFT_BASE'];
afterEach(() => {
  if (saved === undefined) delete process.env['REGASOFT_BASE'];
  else process.env['REGASOFT_BASE'] = saved;
});

describe('Regasoft system setting', () => {
  it('falls back to the test system when the setting is empty', () => {
    delete process.env['REGASOFT_BASE'];
    expect(regasoftBaseUrl()).toBe('https://regasoft.swissrowing.ch/PortalTest');
    expect(isRegasoftTestSystem()).toBe(true);
  });

  it('reads the setting at call time', () => {
    process.env['REGASOFT_BASE'] = 'https://regasoft.swissrowing.ch/Portal';
    expect(regasoftBaseUrl()).toBe('https://regasoft.swissrowing.ch/Portal');
    expect(isRegasoftTestSystem()).toBe(false);
  });

  it('ignores a trailing slash', () => {
    process.env['REGASOFT_BASE'] = 'https://regasoft.swissrowing.ch/PortalTest/';
    expect(regasoftBaseUrl()).toBe('https://regasoft.swissrowing.ch/PortalTest');
    expect(isRegasoftTestSystem()).toBe(true);
  });

  it('never sends the credentials to another host', () => {
    process.env['REGASOFT_BASE'] = 'https://evil.example.com/PortalTest';
    expect(() => regasoftBaseUrl()).toThrow();
    process.env['REGASOFT_BASE'] = 'https://regasoft.swissrowing.ch.evil.example.com/Portal';
    expect(() => regasoftBaseUrl()).toThrow();
  });

  it('names the host for the adapters', () => {
    expect(REGASOFT_HOST).toBe('https://regasoft.swissrowing.ch');
  });
});
