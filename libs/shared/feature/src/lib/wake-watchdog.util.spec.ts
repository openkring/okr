import { describe, expect, it } from 'vitest';

import { isStuck } from './wake-watchdog.util';

const error = (code: unknown) => ({ kind: 'error' as const, error: { code } });

describe('isStuck', () => {
  it('a successful read is healthy', () => {
    expect(isStuck({ kind: 'ok' })).toBe(false);
  });

  it('a read that never settles is stuck', () => {
    expect(isStuck({ kind: 'timeout' })).toBe(true);
  });

  it('client-side give-ups are stuck', () => {
    for (const code of ['unavailable', 'deadline-exceeded', 'cancelled', 'unknown']) {
      expect(isStuck(error(code))).toBe(true);
    }
  });

  // SCS-CS: App Check denial on an unattested device — a reload cannot heal it.
  it('a server refusal is not stuck', () => {
    for (const code of ['permission-denied', 'unauthenticated', 'not-found', 'failed-precondition', 'resource-exhausted']) {
      expect(isStuck(error(code))).toBe(false);
    }
  });

  it('an error without a Firestore code is stuck', () => {
    expect(isStuck({ kind: 'error', error: new Error('boom') })).toBe(true);
    expect(isStuck({ kind: 'error', error: null })).toBe(true);
    expect(isStuck(error(42))).toBe(true);
  });
});
