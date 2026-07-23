// apps/functions/src/_gateway/ssrf.spec.ts
import { describe, it, expect } from 'vitest';
import { assertPublicHttpsUrl } from './ssrf';

describe('assertPublicHttpsUrl', () => {
  it('accepts a normal https URL', () => {
    expect(() => assertPublicHttpsUrl('https://example.com/feed.xml')).not.toThrow();
  });

  it('rejects http (non-TLS)', () => {
    expect(() => assertPublicHttpsUrl('http://example.com')).toThrow(/https/i);
  });

  it('rejects non-http schemes', () => {
    expect(() => assertPublicHttpsUrl('file:///etc/passwd')).toThrow();
    expect(() => assertPublicHttpsUrl('ftp://example.com')).toThrow();
  });

  it('rejects localhost and loopback', () => {
    expect(() => assertPublicHttpsUrl('https://localhost/x')).toThrow(/private|not allowed/i);
    expect(() => assertPublicHttpsUrl('https://127.0.0.1/x')).toThrow();
  });

  it('rejects private IPv4 ranges', () => {
    expect(() => assertPublicHttpsUrl('https://10.0.0.5/x')).toThrow();
    expect(() => assertPublicHttpsUrl('https://192.168.1.1/x')).toThrow();
    expect(() => assertPublicHttpsUrl('https://172.16.0.1/x')).toThrow();
    expect(() => assertPublicHttpsUrl('https://169.254.169.254/latest/meta-data')).toThrow();
  });

  it('rejects garbage', () => {
    expect(() => assertPublicHttpsUrl('not a url')).toThrow();
  });
});
