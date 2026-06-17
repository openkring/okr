import { describe, expect, it } from 'vitest';
import { redactSensitive, stripPii } from './sentry-redact.util';

describe('redactSensitive', () => {
  it('redacts a Swiss AHV number', () => {
    expect(redactSensitive('user 756.1234.5678.90 failed')).toBe('user [AHV] failed');
  });

  it('redacts an IBAN', () => {
    expect(redactSensitive('iban CH93 0076 2011 6238 5295 7 here')).toBe('iban [IBAN] here');
  });

  it('redacts an email address', () => {
    expect(redactSensitive('contact john.doe@example.com now')).toBe('contact [EMAIL] now');
  });

  it('redacts multiple kinds in one string', () => {
    const out = redactSensitive('756.1234.5678.90 / a@b.ch');
    expect(out).toContain('[AHV]');
    expect(out).toContain('[EMAIL]');
  });

  it('returns undefined unchanged', () => {
    expect(redactSensitive(undefined)).toBeUndefined();
  });

  it('leaves clean text untouched', () => {
    expect(redactSensitive('nothing sensitive here')).toBe('nothing sensitive here');
  });
});

describe('stripPii', () => {
  it('removes the query string from a URL', () => {
    expect(stripPii('/api/persons/abc?token=secret&id=42')).toBe('/api/persons/abc');
  });

  it('returns a URL without query unchanged', () => {
    expect(stripPii('/api/persons/abc')).toBe('/api/persons/abc');
  });

  it('handles empty input', () => {
    expect(stripPii('')).toBe('');
  });
});
