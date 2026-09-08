import { describe, expect, it } from 'vitest';
import { signal } from '@angular/core';

import { resourceParams } from './resource-params';

describe('resourceParams', () => {
  it('returns the same params object while the derived key is unchanged', () => {
    const user = signal<{ okey: string } | undefined>({ okey: 'a' });
    const params = resourceParams(() => ({ userKey: user()?.okey ?? '', tenantId: 'scs' }));
    const first = params();
    user.set({ okey: 'a' }); // new reference, same key
    expect(params()).toBe(first);
  });

  it('yields a new params object when the derived key changes', () => {
    const user = signal<{ okey: string } | undefined>({ okey: 'a' });
    const params = resourceParams(() => ({ userKey: user()?.okey ?? '' }));
    const first = params();
    user.set({ okey: 'b' });
    expect(params()).not.toBe(first);
    expect(params().userKey).toBe('b');
  });

  it('works for primitive keys', () => {
    const user = signal<{ okey: string } | undefined>(undefined);
    const params = resourceParams(() => user()?.okey ?? '');
    expect(params()).toBe('');
    user.set({ okey: 'a' });
    expect(params()).toBe('a');
  });
});
