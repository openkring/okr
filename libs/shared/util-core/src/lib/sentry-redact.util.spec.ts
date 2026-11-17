import { describe, expect, it } from 'vitest';
import { redactSensitive, stripPii, stripUrlQueriesInText, stripUrlQuery } from './sentry-redact.util';

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

describe('stripUrlQuery', () => {
  it('removes query string and fragment', () => {
    expect(stripUrlQuery('https://maps.googleapis.com/maps/api/geocode/json?address=Seestrasse%201,%208000%20Z%C3%BCrich&key=k'))
      .toBe('https://maps.googleapis.com/maps/api/geocode/json');
    expect(stripUrlQuery('/page#section?x=1')).toBe('/page');
    expect(stripUrlQuery('/api/x?a=1#f')).toBe('/api/x');
  });

  it('leaves a URL without query or fragment and empty input unchanged', () => {
    expect(stripUrlQuery('/api/persons/abc')).toBe('/api/persons/abc');
    expect(stripUrlQuery('')).toBe('');
  });
});

describe('stripUrlQueriesInText', () => {
  it('strips the query of every URL inside a text', () => {
    expect(stripUrlQueriesInText('GET https://h/geocode/json?address=Seestrasse%201&key=k'))
      .toBe('GET https://h/geocode/json');
    expect(stripUrlQueriesInText('GET /assets/i18n/de.json?v=2 and https://a/b#frag'))
      .toBe('GET /assets/i18n/de.json and https://a/b');
  });

  it('leaves text without a URL query alone', () => {
    expect(stripUrlQueriesInText('pageload /private/home')).toBe('pageload /private/home');
    expect(stripUrlQueriesInText('Really? yes')).toBe('Really? yes');
    expect(stripUrlQueriesInText(undefined)).toBeUndefined();
  });
});
