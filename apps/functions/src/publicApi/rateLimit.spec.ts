import { describe, it, expect } from 'vitest';
import type { Request } from 'express';
import { clientIp } from './rateLimit';

function reqWith(headers: Record<string, unknown>, ip?: string): Request {
  return { headers, ip } as unknown as Request;
}

describe('clientIp', () => {
  it('takes the first token of x-forwarded-for', () => {
    expect(clientIp(reqWith({ 'x-forwarded-for': '1.2.3.4, 5.6.7.8' }))).toBe('1.2.3.4');
  });

  it('trims whitespace', () => {
    expect(clientIp(reqWith({ 'x-forwarded-for': '  9.9.9.9 , 1.1.1.1' }))).toBe('9.9.9.9');
  });

  it('handles an array-valued header', () => {
    expect(clientIp(reqWith({ 'x-forwarded-for': ['2.2.2.2, 3.3.3.3'] }))).toBe('2.2.2.2');
  });

  it('falls back to req.ip when no forwarded header', () => {
    expect(clientIp(reqWith({}, '4.4.4.4'))).toBe('4.4.4.4');
  });

  it('falls back to "unknown" when nothing is available', () => {
    expect(clientIp(reqWith({}))).toBe('unknown');
  });
});
