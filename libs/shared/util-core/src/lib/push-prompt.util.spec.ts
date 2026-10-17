import { describe, expect, it } from 'vitest';
import { PUSH_PROMPT_SNOOZE_MS, shouldAskForPush } from './push-prompt.util';

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
