import { describe, expect, it } from 'vitest';
import { isRegistrationStale, PUSH_PROMPT_SNOOZE_MS, PUSH_REGISTRATION_REFRESH_MS, shouldAskForPush } from './push-prompt.util';

const NOW = Date.parse('2026-10-17T12:00:00Z');
const base = { state: 'prompt' as const, isNative: true, isStandalone: false, now: NOW };

describe('shouldAskForPush', () => {
  it('asks in the native app while the permission is undecided', () => {
    expect(shouldAskForPush(base)).toBe(true);
  });

  it('asks in an installed PWA', () => {
    expect(shouldAskForPush({ ...base, isNative: false, isStandalone: true })).toBe(true);
  });

  // The desktop browser keeps the profile button; a prompt after every login there would nag.
  it('never asks in a plain browser tab', () => {
    expect(shouldAskForPush({ ...base, isNative: false, isStandalone: false })).toBe(false);
  });

  it('never asks once the member decided — granted or denied', () => {
    expect(shouldAskForPush({ ...base, state: 'granted' })).toBe(false);
    expect(shouldAskForPush({ ...base, state: 'denied' })).toBe(false);
    expect(shouldAskForPush({ ...base, state: 'unsupported' })).toBe(false);
  });

  it('stays quiet while a «Später» snooze runs, and asks again after it', () => {
    expect(shouldAskForPush({ ...base, snoozedUntil: NOW + 1 })).toBe(false);
    expect(shouldAskForPush({ ...base, snoozedUntil: NOW })).toBe(true);
    expect(shouldAskForPush({ ...base, snoozedUntil: NOW - PUSH_PROMPT_SNOOZE_MS })).toBe(true);
  });

  it('snoozes for 30 days', () => {
    expect(PUSH_PROMPT_SNOOZE_MS).toBe(30 * 24 * 60 * 60 * 1000);
  });
});

describe('isRegistrationStale', () => {
  it('is stale when this session never registered successfully', () => {
    expect(isRegistrationStale(undefined, NOW)).toBe(true);
  });

  it('is fresh within 24 hours of the last registration', () => {
    expect(PUSH_REGISTRATION_REFRESH_MS).toBe(24 * 60 * 60 * 1000);
    expect(isRegistrationStale(NOW, NOW)).toBe(false);
    expect(isRegistrationStale(NOW - PUSH_REGISTRATION_REFRESH_MS + 1, NOW)).toBe(false);
  });

  // A kiosk iPad or an always-open desktop PWA: the token doc must be refreshed long before the
  // 60-day prune job removes it (and its Matrix pusher).
  it('is stale once 24 hours have passed', () => {
    expect(isRegistrationStale(NOW - PUSH_REGISTRATION_REFRESH_MS, NOW)).toBe(true);
    expect(isRegistrationStale(NOW - 3 * PUSH_REGISTRATION_REFRESH_MS, NOW)).toBe(true);
  });

  // The clock was set back: a registration "in the future" is treated as stale, never as fresh forever.
  it('is stale when the last registration lies in the future', () => {
    expect(isRegistrationStale(NOW + 60_000, NOW)).toBe(true);
  });
});
