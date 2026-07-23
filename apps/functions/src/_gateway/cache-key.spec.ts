// apps/functions/src/_gateway/cache-key.spec.ts
import { describe, it, expect } from 'vitest';
import { cacheKey } from './cache-key';

const ctx = { tenantId: 'scs', uid: 'user-1', isAdmin: false };

describe('cacheKey', () => {
  it('is stable regardless of param key order', () => {
    const a = cacheKey('oecd', 'shared', ctx, { b: 2, a: 1 });
    const b = cacheKey('oecd', 'shared', ctx, { a: 1, b: 2 });
    expect(a).toBe(b);
  });

  it('changes when params change', () => {
    expect(cacheKey('oecd', 'shared', ctx, { a: 1 }))
      .not.toBe(cacheKey('oecd', 'shared', ctx, { a: 2 }));
  });

  it('shared scope does not embed tenant or uid', () => {
    const other = { tenantId: 'p13', uid: 'user-9', isAdmin: false };
    expect(cacheKey('oecd', 'shared', ctx, { a: 1 }))
      .toBe(cacheKey('oecd', 'shared', other, { a: 1 }));
  });

  it('tenant scope isolates per tenant', () => {
    const other = { tenantId: 'p13', uid: 'user-1', isAdmin: false };
    expect(cacheKey('x', 'tenant', ctx, { a: 1 }))
      .not.toBe(cacheKey('x', 'tenant', other, { a: 1 }));
  });

  it('user scope isolates per uid', () => {
    const other = { tenantId: 'scs', uid: 'user-2', isAdmin: false };
    expect(cacheKey('x', 'user', ctx, { a: 1 }))
      .not.toBe(cacheKey('x', 'user', other, { a: 1 }));
  });

  it('starts with the provider id (readable prefix)', () => {
    expect(cacheKey('oecd', 'shared', ctx, { a: 1 })).toMatch(/^oecd:/);
  });
});
