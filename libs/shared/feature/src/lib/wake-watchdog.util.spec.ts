import { describe, expect, it } from 'vitest';

import { isStuck, sleptDuringCheck } from './wake-watchdog.util';

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

describe('sleptDuringCheck', () => {
  const BUDGET_MS = 60_000;

  it('a check within its budget ran awake', () => {
    expect(sleptDuringCheck(1_000, 41_000, BUDGET_MS)).toBe(false);
    expect(sleptDuringCheck(1_000, 61_000, BUDGET_MS)).toBe(false);
  });

  // SCS-CS: the probe answered at 17:08:37, the check ended at 17:22:29.
  it('a check far over its budget was interrupted by sleep', () => {
    expect(sleptDuringCheck(1_000, 1_000 + 14 * 60_000, BUDGET_MS)).toBe(true);
    expect(sleptDuringCheck(1_000, 61_001, BUDGET_MS)).toBe(true);
  });
});
