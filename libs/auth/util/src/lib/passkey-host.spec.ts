import { describe, expect, it } from 'vitest';

import { offersPasskeys } from './passkey-host';

describe('offersPasskeys', () => {
  it('offers passkeys on the app domain', () => {
    expect(offersPasskeys('app.example.org', 'app.example.org')).toBe(true);
  });
  it('offers nothing on any other host of the app', () => {
    expect(offersPasskeys('example.org', 'app.example.org')).toBe(false);
    expect(offersPasskeys('example-app.web.app', 'app.example.org')).toBe(false);
  });
  it('offers nothing while the app domain is unknown', () => {
    expect(offersPasskeys('app.example.org', '')).toBe(false);
  });
  it('keeps localhost for development', () => {
    expect(offersPasskeys('localhost', 'app.example.org')).toBe(true);
  });
});
