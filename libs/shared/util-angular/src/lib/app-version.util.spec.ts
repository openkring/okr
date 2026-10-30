import { describe, expect, it } from 'vitest';
import { compareAppVersions } from './app-version.util';

describe('compareAppVersions', () => {
  it('orders by the first differing part', () => {
    expect(compareAppVersions('7.52.0', '7.53.0')).toBeLessThan(0);
    expect(compareAppVersions('8.0.0', '7.99.99')).toBeGreaterThan(0);
  });
  it('compares numerically, not as text', () => {
    expect(compareAppVersions('7.9.0', '7.10.0')).toBeLessThan(0);
  });
  it('returns 0 for equal versions and treats missing parts as 0', () => {
    expect(compareAppVersions('7.52.1', '7.52.1')).toBe(0);
    expect(compareAppVersions('7.52', '7.52.0')).toBe(0);
  });
});
