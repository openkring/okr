import { describe, expect, it } from 'vitest';

import { isPublicIp, trustedClientIp } from './client-ip';

describe('trustedClientIp', () => {
  it('takes the address the front end appended, not one the caller wrote in front of it', () => {
    expect(trustedClientIp('1.2.3.4, 203.0.113.7')).toBe('203.0.113.7');
    expect(trustedClientIp('1.2.3.4, 5.6.7.8, 203.0.113.7')).toBe('203.0.113.7');
  });

  it('skips a Google front-end hop after the client', () => {
    expect(trustedClientIp('1.2.3.4, 203.0.113.7, 35.191.12.3')).toBe('203.0.113.7');
    expect(trustedClientIp('203.0.113.7, 130.211.0.9')).toBe('203.0.113.7');
  });

  it('skips private, loopback, link-local and CGNAT hops', () => {
    expect(trustedClientIp('203.0.113.7, 10.0.0.1, 172.20.1.1, 192.168.1.1, 127.0.0.1, 169.254.1.1, 100.64.0.1')).toBe('203.0.113.7');
  });

  it('skips garbage the caller wrote', () => {
    expect(trustedClientIp('203.0.113.7, not-an-ip')).toBe('203.0.113.7');
  });

  it('handles IPv6, including v4-mapped addresses', () => {
    expect(trustedClientIp('2001:db8::1')).toBe('2001:db8::1');
    expect(trustedClientIp('2001:db8::1, fe80::1, fd00::2, ::1')).toBe('2001:db8::1');
    expect(trustedClientIp('203.0.113.7, ::ffff:10.0.0.1')).toBe('203.0.113.7');
  });

  it('reads a repeated header in order', () => {
    expect(trustedClientIp(['1.2.3.4', '203.0.113.7'])).toBe('203.0.113.7');
  });

  it('falls back to the socket address, then to unknown', () => {
    expect(trustedClientIp(undefined, '198.51.100.2')).toBe('198.51.100.2');
    expect(trustedClientIp('10.0.0.1', '198.51.100.2')).toBe('198.51.100.2');
    expect(trustedClientIp('', '')).toBe('unknown');
    expect(trustedClientIp(undefined)).toBe('unknown');
  });
});

describe('isPublicIp', () => {
  it('keeps the edges of the skipped ranges right', () => {
    expect(isPublicIp('172.15.255.255')).toBe(true);
    expect(isPublicIp('172.16.0.0')).toBe(false);
    expect(isPublicIp('172.31.255.255')).toBe(false);
    expect(isPublicIp('172.32.0.0')).toBe(true);
    expect(isPublicIp('130.211.3.255')).toBe(false);
    expect(isPublicIp('130.211.4.0')).toBe(true);
    expect(isPublicIp('35.190.255.255')).toBe(true);
  });
});
